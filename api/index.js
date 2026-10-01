const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const api = require('../index');
const mail = require('../enviar');
const { searchConfig, validEmail, STATES } = require('../server');
const { createCloudStore } = require('../lib/cloud-store');

async function body(req) {
  if (req.body !== undefined) {
    const result = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(result).length > 100000) throw new Error('Requisição muito grande.');
    return result;
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 100000) throw new Error('Requisição muito grande.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
const hash = value => crypto.createHash('sha256').update(value).digest();
function createHandler({ store, jobsApi = api, email = mail, env = process.env } = {}) {
  const snapshot = async (db, sessionId) => {
    const [cache, imported, sends, templates, resume, whatsapp] = await Promise.all([
      db.get('cache', { jobs: [], updatedAt: null, cached: true }), db.get('history', []), db.list('send:'), db.get('templates', []), db.get('resume-info'), db.list('wa:'),
    ]);
    const history = [...new Map([...imported, ...sends.filter(r => r.value.status === 'sent').map(r => r.value.record)].map(r => [r.caseNumber, r])).values()];
    return { ...cache, cached: true, token: sessionId, authenticatedMode: true, cloudMode: true, history, pending: sends.filter(r => r.value.status !== 'sent').map(r => r.value.record), states: STATES, templates, resume: resume?.filename || 'Currículo não configurado', resumeReady: Boolean(resume), smtpReady: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS), whatsapp: { numbers: Object.fromEntries(whatsapp.map(r => [r.key.slice(3), r.value])), overrides: Object.fromEntries((await db.list('wa-override:')).map(r => [r.key.slice(12), r.value])) }, warning: templates.length ? undefined : 'Importe seus modelos e currículo para concluir a configuração do app.' };
  };
  return async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }); res.end(JSON.stringify(data)); };
    let lockOwner;
    let db;
    try {
      const origin = env.PUBLIC_ORIGIN;
      if (!origin || !origin.startsWith('https://') || new URL(origin).origin !== origin || (env.APP_PASSWORD || '').length < 16) return json(503, { error: 'Configure PUBLIC_ORIGIN HTTPS e APP_PASSWORD (mínimo de 16 caracteres).' });
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return json(403, { error: 'Origem não permitida.' });
      db = store || createCloudStore(env.DATABASE_URL);
      const url = new URL(req.url, origin);
      const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '') || 'home';
      const sessionId = /(?:^|;\s*)seasonal_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = sessionId ? await db.get('session:' + sessionId) : null;
      if (route === 'login' && req.method === 'POST') {
        if (db.cleanup) await db.cleanup();
        // Ten login attempts per minute across all instances, even after cold starts.
        const minute = Math.floor(Date.now() / 60000);
        let allowed = false;
        for (let slot = 0; slot < 10; slot++) if (await db.insert(`login-rate:${minute}:${slot}`, true, 120)) { allowed = true; break; }
        if (!allowed) return json(429, { error: 'Muitas tentativas. Aguarde um minuto.' });
        const input = await body(req);
        if (!crypto.timingSafeEqual(hash(typeof input.password === 'string' ? input.password : ''), hash(env.APP_PASSWORD))) return json(401, { error: 'Senha incorreta.' });
        const id = crypto.randomBytes(32).toString('hex');
        await db.insert('session:' + id, { passwordVersion: hash(env.APP_PASSWORD).toString('hex') }, 43200);
        res.setHeader('Set-Cookie', `seasonal_session=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
        return json(200, { ok: true });
      }
      const authenticated = session?.passwordVersion === hash(env.APP_PASSWORD).toString('hex');
      if (route === 'home' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
        return res.end(fs.readFileSync(path.join(__dirname, '../public', authenticated ? 'index.html' : 'login.html')));
      }
      if (!authenticated) return json(401, { error: 'Entre novamente para continuar.' });
      if (req.method === 'POST' && req.headers['x-session-token'] !== sessionId) return json(403, { error: 'Recarregue a página para continuar.' });
      if (route === 'bootstrap' && req.method === 'GET') return json(200, await snapshot(db, sessionId));
      if (route === 'logout' && req.method === 'POST') {
        await db.remove('session:' + sessionId);
        res.setHeader('Set-Cookie', 'seasonal_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
        return json(200, { ok: true });
      }
      if (route === 'whatsapp' && req.method === 'POST') {
        const input = await body(req);
        if (!/^[1-9]\d{7,14}$/.test(input.number) || !['unknown', 'yes', 'no'].includes(input.availability) || typeof input.contacted !== 'boolean') throw new Error('Marcação inválida.');
        const value = { availability: input.availability, contacted: input.contacted, updatedAt: new Date().toISOString() };
        await db.set('wa:' + input.number, value);
        if (/^H-\d{3}-\d{5}-\d{6}$/.test(input.caseNumber) && typeof input.phone === 'string' && input.phone.length <= 80) await db.set('wa-override:' + input.caseNumber, input.phone);
        return json(200, { value });
      }
      if (route === 'search' && req.method === 'POST') {
        const config = searchConfig(await body(req));
        lockOwner = await db.lock('operations');
        if (!lockOwner) return json(409, { error: 'Aguarde a operação em andamento.' });
        const { jobs } = await jobsApi.fetchAllJobs({ top: 50, filter: jobsApi.buildFilter(config) });
        const statuses = await jobsApi.fetchAllCaseStatuses([...new Set(jobs.map(j => j.caseNumber))]);
        const approved = [...new Map(jobs.filter(j => j.active === true && statuses.get(j.caseNumber) === 'FULL CERTIFICATION').map(j => [j.caseNumber, { ...j, caseStatus: 'FULL CERTIFICATION' }])).values()];
        await db.set('cache', { jobs: approved, updatedAt: new Date().toISOString(), cached: false, config });
        return json(200, { ...await snapshot(db, sessionId), cached: false });
      }
      if (route === 'send' && req.method === 'POST') {
        const input = await body(req);
        if (input.confirmed !== true || !/^H-\d{3}-\d{5}-\d{6}$/.test(input.caseNumber)) throw new Error('Confirme a candidatura.');
        if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 300 || /[\r\n]/.test(input.subject) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 30000) throw new Error('Assunto ou mensagem inválidos.');
        lockOwner = await db.lock('operations');
        if (!lockOwner) return json(409, { error: 'Aguarde a operação em andamento.' });
        const cache = await db.get('cache', { jobs: [] });
        const job = cache.jobs.find(j => j.caseNumber === input.caseNumber);
        if (!job || !validEmail(job.email)) throw new Error('Vaga ou e-mail inválido.');
        if ((await db.get('history', [])).some(h => h.caseNumber === job.caseNumber)) throw new Error('Candidatura já enviada.');
        const live = await jobsApi.fetchJobs({ top: 1, skip: 0, filter: `active eq true and display eq true and case_number eq '${job.caseNumber}'` });
        const statuses = await jobsApi.fetchAllCaseStatuses([job.caseNumber]);
        const fresh = live.value?.find(j => j.case_number === job.caseNumber && j.active === true);
        if (!fresh || statuses.get(job.caseNumber) !== 'FULL CERTIFICATION' || fresh.employer_email !== job.email) throw new Error('A vaga ou o contato mudou. Atualize a consulta.');
        const resume = await db.get('resume');
        if (!resume?.base64 || !resume.filename) throw new Error('Importe o currículo antes de enviar.');
        const transporter = email.criarTransporter();
        const record = { caseNumber: job.caseNumber, empresa: job.empresa, titulo: job.titulo, email: job.email, template: String(input.template || 'personalizado'), enviadoEm: new Date().toISOString() };
        // A permanent unique reservation survives timeouts and parallel invocations.
        if (!await db.insert('send:' + job.caseNumber, { status: 'pending', record })) throw new Error('Candidatura enviada ou com resultado incerto. Confira o histórico.');
        await transporter.sendMail({ from: { name: env.FROM_NAME || '', address: env.SMTP_USER }, to: job.email, subject: input.subject.trim(), text: input.text, attachments: [{ filename: resume.filename, content: Buffer.from(resume.base64, 'base64') }] });
        await db.set('send:' + job.caseNumber, { status: 'sent', record });
        const result = await snapshot(db, sessionId);
        return json(200, { history: result.history, pending: result.pending });
      }
      json(404, { error: 'Não encontrado.' });
    } catch (error) {
      // Never return raw database/connection errors that can contain credentials.
      const message = error.message || '';
      const publicMessage = /^(Confirme|Assunto|Vaga|Candidatura|A vaga|Importe|Marcação|Filtros|Requisição)/.test(message) ? message : 'Não foi possível concluir. Confira os logs privados do servidor. Em caso de envio, confira o histórico antes de tentar novamente.';
      console.error('Cloud request failed:', error.code || error.name);
      json(400, { error: publicMessage });
    } finally { if (lockOwner) await db.unlock('operations', lockOwner).catch(() => {}); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
