const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const jobsApi = require('./index');
const mail = require('./enviar');

const STATES = 'ALABAMA|ALASKA|ARIZONA|ARKANSAS|CALIFORNIA|COLORADO|CONNECTICUT|DELAWARE|DISTRICT OF COLUMBIA|FLORIDA|GEORGIA|HAWAII|IDAHO|ILLINOIS|INDIANA|IOWA|KANSAS|KENTUCKY|LOUISIANA|MAINE|MARYLAND|MASSACHUSETTS|MICHIGAN|MINNESOTA|MISSISSIPPI|MISSOURI|MONTANA|NEBRASKA|NEVADA|NEW HAMPSHIRE|NEW JERSEY|NEW MEXICO|NEW YORK|NORTH CAROLINA|NORTH DAKOTA|OHIO|OKLAHOMA|OREGON|PENNSYLVANIA|PUERTO RICO|RHODE ISLAND|SOUTH CAROLINA|SOUTH DAKOTA|TENNESSEE|TEXAS|UTAH|VERMONT|VIRGINIA|WASHINGTON|WEST VIRGINIA|WISCONSIN|WYOMING'.split('|');
const validEmail = value => typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
function searchConfig(input) {
  if (!STATES.includes(input.state) || !['H-2A', 'H-2B'].includes(input.visaClass) || typeof input.experienceRequired !== 'boolean') throw new Error('Filtros inválidos.');
  return { state: input.state, visaClass: input.visaClass, experienceRequired: input.experienceRequired, top: 50 };
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) throw new Error('Mensagem muito grande.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function createApp({ api = jobsApi, email = mail, root = process.env.DATA_DIR || __dirname, publicOrigin = '', appPassword = '' } = {}) {
  fs.mkdirSync(root, { recursive: true });
  if (publicOrigin) {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== publicOrigin || origin.username || origin.password) throw new Error('PUBLIC_ORIGIN deve ser uma origem HTTPS sem barra final ou caminho.');
    if (appPassword.length < 16) throw new Error('APP_PASSWORD deve ter pelo menos 16 caracteres para acesso pelo celular.');
  }
  const sessions = new Map();
  let attempts = 0, attemptWindow = Date.now();
  const passwordHash = crypto.createHash('sha256').update(appPassword).digest();
  const token = crypto.randomBytes(32).toString('hex');
  let current = { jobs: [], updatedAt: null, cached: true };
  let searching = false;
  let sending = false;
  const historyPath = path.join(root, 'enviados.json');
  const journalPath = path.join(root, '.web-send-journal.json');
  const cachePath = path.join(root, '.web-cache.json');
  const readArray = file => {
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Arquivo de dados inválido.');
    return data;
  };
  const atomicWrite = (file, data) => { fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2)); fs.renameSync(file + '.tmp', file); };
  const history = () => readArray(historyPath);
  const snapshot = () => ({ ...current, authenticatedMode: Boolean(publicOrigin), history: history(), pending: readArray(journalPath), states: STATES, templates: email.carregarTemplates(), resume: path.basename(email.CURRICULO_PATH), resumeReady: fs.existsSync(email.CURRICULO_PATH), smtpReady: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) });
  try {
    if (fs.existsSync(cachePath)) {
      const saved = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (!Array.isArray(saved.jobs)) throw new Error('Cache inválido.');
      current = { ...saved, cached: true };
    } else {
      current.jobs = readArray(path.join(root, 'TEXAS.json')).filter(j => j.caseStatus === 'FULL CERTIFICATION');
      if (current.jobs.length) current.updatedAt = fs.statSync(path.join(root, 'TEXAS.json')).mtime.toISOString();
    }
  } catch { current.warning = 'Não foi possível ler TEXAS.json. Faça uma nova consulta.'; }

  return http.createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const expected = `127.0.0.1:${req.socket.localPort}`;
      const externalHost = publicOrigin && req.headers.host === new URL(publicOrigin).host;
      if (!externalHost && req.headers.host !== expected && req.headers.host !== `localhost:${req.socket.localPort}`) return json(403, { error: 'Host não permitido.' });
      if (req.headers.origin && req.headers.origin !== (externalHost ? publicOrigin : `http://${req.headers.host}`)) return json(403, { error: 'Origem não permitida.' });
      const url = new URL(req.url, `http://${expected}`);
      const cookie = /(?:^|;\s*)seasonal_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const authenticated = !publicOrigin || (sessions.get(cookie) || 0) > Date.now();
      if (publicOrigin && req.method === 'POST' && url.pathname === '/api/login') {
        if (Date.now() - attemptWindow > 60000) { attempts = 0; attemptWindow = Date.now(); }
        if (++attempts > 10) return json(429, { error: 'Muitas tentativas. Aguarde um minuto.' });
        const input = await readBody(req);
        const candidate = crypto.createHash('sha256').update(typeof input.password === 'string' ? input.password : '').digest();
        if (!crypto.timingSafeEqual(candidate, passwordHash)) return json(401, { error: 'Senha incorreta.' });
        for (const [id, expiration] of sessions) if (expiration <= Date.now()) sessions.delete(id);
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        const id = crypto.randomBytes(32).toString('hex');
        sessions.set(id, Date.now() + 12 * 60 * 60 * 1000);
        res.setHeader('Set-Cookie', `seasonal_session=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
        return json(200, { ok: true });
      }
      if (url.pathname.startsWith('/api/') && !authenticated) return json(401, { error: 'Entre novamente para continuar.' });
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') return json(200, { ...snapshot(), token });
      if (req.method === 'POST' && req.headers['x-session-token'] !== token) return json(403, { error: 'Recarregue a página para continuar.' });
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        sessions.delete(cookie);
        res.setHeader('Set-Cookie', 'seasonal_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
        return json(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/search') {
        if (searching || sending) return json(409, { error: 'Aguarde a operação em andamento.' });
        const config = searchConfig(await readBody(req));
        if (searching || sending) return json(409, { error: 'Aguarde a operação em andamento.' });
        searching = true;
        try {
          const { jobs } = await api.fetchAllJobs({ top: config.top, filter: api.buildFilter(config) });
          const statuses = await api.fetchAllCaseStatuses([...new Set(jobs.map(j => j.caseNumber))]);
          current = { jobs: [...new Map(jobs.filter(j => j.active === true && statuses.get(j.caseNumber) === 'FULL CERTIFICATION').map(j => [j.caseNumber, { ...j, caseStatus: 'FULL CERTIFICATION' }])).values()], cached: false, updatedAt: new Date().toISOString(), config };
          atomicWrite(cachePath, current);
          return json(200, snapshot());
        } finally { searching = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/send') {
        if (sending || searching) return json(409, { error: 'Aguarde a operação em andamento.' });
        const body = await readBody(req);
        if (sending || searching) return json(409, { error: 'Aguarde a operação em andamento.' });
        if (body.confirmed !== true) throw new Error('Confirme o envio na prévia.');
        const job = current.jobs.find(j => j.caseNumber === body.caseNumber);
        if (!job || !/^H-\d{3}-\d{5}-\d{6}$/.test(job.caseNumber) || !validEmail(job.email)) throw new Error('Vaga ou e-mail inválido.');
        if (typeof body.subject !== 'string' || !body.subject.trim() || body.subject.length > 300 || /[\r\n]/.test(body.subject) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 30000) throw new Error('Preencha assunto e mensagem válidos.');
        sending = true;
        try {
          if (history().some(h => h.caseNumber === job.caseNumber) || readArray(journalPath).some(h => h.caseNumber === job.caseNumber)) throw new Error('Candidatura já enviada ou com envio incerto. Confira o histórico e o servidor de e-mail.');
          const live = await api.fetchJobs({ top: 1, skip: 0, filter: `active eq true and display eq true and case_number eq '${job.caseNumber}'` });
          const status = await api.fetchAllCaseStatuses([job.caseNumber]);
          const fresh = live.value?.find(j => j.case_number === job.caseNumber && j.active === true);
          if (!fresh || status.get(job.caseNumber) !== 'FULL CERTIFICATION') throw new Error('A vaga não está mais ativa e certificada. Atualize a consulta.');
          if (fresh.employer_email !== job.email) throw new Error('O contato mudou. Atualize a consulta e revise a mensagem.');
          if (!fs.existsSync(email.CURRICULO_PATH)) throw new Error('Currículo não encontrado. Ajuste CURRICULO_FILE no .env.');
          const transporter = email.criarTransporter();
          const record = { caseNumber: job.caseNumber, empresa: job.empresa, email: job.email, titulo: job.titulo, template: String(body.template || 'personalizado'), enviadoEm: new Date().toISOString() };
          atomicWrite(journalPath, [...readArray(journalPath), record]);
          // Keep the journal on SMTP errors: delivery may have succeeded before a timeout.
          await transporter.sendMail({ from: { name: process.env.FROM_NAME || '', address: process.env.SMTP_USER }, to: job.email, subject: body.subject.trim(), text: body.text, attachments: [{ filename: path.basename(email.CURRICULO_PATH), path: email.CURRICULO_PATH }] });
          atomicWrite(historyPath, [...history(), record]);
          atomicWrite(journalPath, readArray(journalPath).filter(h => h.caseNumber !== job.caseNumber));
          return json(200, { history: history(), pending: readArray(journalPath) });
        } finally { sending = false; }
      }
      const files = { '/': [authenticated ? 'index.html' : 'login.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/mobile.js': ['mobile.js', 'text/javascript'], '/login.js': ['login.js', 'text/javascript'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/sw.js': ['sw.js', 'text/javascript'], '/offline.html': ['offline.html', 'text/html'], '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'], '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'], '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png'] };
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
        return res.end(fs.readFileSync(path.join(__dirname, 'public', file)));
      }
      json(404, { error: 'Não encontrado.' });
    } catch (err) { json(400, { error: err.message }); }
  });
}
if (require.main === module) {
  const host = process.env.HOST || '127.0.0.1';
  const publicOrigin = process.env.PUBLIC_ORIGIN || '';
  if (host !== '127.0.0.1' && !publicOrigin) throw new Error('Configure PUBLIC_ORIGIN HTTPS e APP_PASSWORD antes de habilitar acesso de rede.');
  const app = createApp({ publicOrigin, appPassword: process.env.APP_PASSWORD || '' });
  app.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'A porta já está em uso. Feche a outra instância do Seasonal ou ajuste PORT no .env.' : error.message); process.exitCode = 1; });
  app.listen(Number(process.env.PORT || 3000), host, () => console.log(`Painel: ${publicOrigin || `http://127.0.0.1:${process.env.PORT || 3000}`}`));
}
module.exports = { createApp, validEmail, searchConfig, STATES };
