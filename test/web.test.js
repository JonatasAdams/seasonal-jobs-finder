const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, validEmail, searchConfig } = require('../server');

test('contatos inválidos e filtros injetados são rejeitados', () => {
  assert.equal(validEmail('N/A'), false);
  assert.equal(validEmail('a@example.com,b@example.com'), false);
  assert.equal(validEmail('a@example.com'), true);
  assert.throws(() => searchConfig({ state: "TEXAS' or true", visaClass: 'H-2A', experienceRequired: false }));
});
async function setup(t, { failSend = false, active = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seasonal-test-'));
  fs.writeFileSync(path.join(root, 'resume.pdf'), 'fake');
  const job = { caseNumber: 'H-300-26198-106374', email: 'test@example.com', titulo: '<script>alert(1)</script>', empresa: 'Example', active: true, caseStatus: 'FULL CERTIFICATION' };
  fs.writeFileSync(path.join(root, 'TEXAS.json'), JSON.stringify([job]));
  let deliveries = 0;
  const app = createApp({ root, api: { buildFilter: () => '', fetchAllJobs: async () => ({ jobs: [job, { ...job, caseNumber: 'H-300-26198-106375', active: false }] }), fetchAllCaseStatuses: async () => new Map([[job.caseNumber, 'FULL CERTIFICATION']]), fetchJobs: async () => ({ value: [{ case_number: job.caseNumber, active, employer_email: job.email }] }) }, email: { CURRICULO_PATH: path.join(root, 'resume.pdf'), carregarTemplates: () => [], criarTransporter: () => ({ sendMail: async () => { deliveries++; if (failSend) throw new Error('SMTP timeout'); } }) } });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json();
  const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': bootstrap.token, ...headers }, body: JSON.stringify(body) });
  return { base, post, root, deliveries: () => deliveries, body: { caseNumber: job.caseNumber, confirmed: true, subject: 'Test application', text: 'Test only' } };
}
test('arquivos privados e requisições externas não são expostos', async t => {
  const s = await setup(t);
  assert.equal((await fetch(s.base + '/.env')).status, 404);
  assert.equal((await s.post('/api/send', s.body, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await s.post('/api/send', s.body, { 'X-Session-Token': 'invalid' })).status, 403);
  assert.equal(s.deliveries(), 0);
});
test('consulta mantém apenas vagas ativas certificadas', async t => {
  const s = await setup(t);
  const response = await s.post('/api/search', { state: 'TEXAS', visaClass: 'H-2A', experienceRequired: false });
  const data = await response.json();
  assert.equal(data.jobs.length, 1); assert.equal(data.cached, false);
});
test('envio exige confirmação e impede duplicação', async t => {
  const s = await setup(t);
  assert.equal((await s.post('/api/send', { ...s.body, confirmed: false })).status, 400);
  assert.equal((await s.post('/api/send', s.body)).status, 200);
  assert.equal((await s.post('/api/send', s.body)).status, 400);
  assert.equal(s.deliveries(), 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.root, 'enviados.json'))).length, 1);
});
test('vaga inativa bloqueia envio', async t => {
  const s = await setup(t, { active: false });
  assert.equal((await s.post('/api/send', s.body)).status, 400);
  assert.equal(s.deliveries(), 0);
});
test('timeout SMTP preserva bloqueio para evitar envio repetido', async t => {
  const s = await setup(t, { failSend: true });
  assert.equal((await s.post('/api/send', s.body)).status, 400);
  assert.equal((await s.post('/api/send', s.body)).status, 400);
  assert.equal(s.deliveries(), 1);
});
test('histórico corrompido bloqueia o envio', async t => {
  const s = await setup(t);
  fs.writeFileSync(path.join(s.root, 'enviados.json'), 'broken');
  assert.equal((await s.post('/api/send', s.body)).status, 400);
  assert.equal(s.deliveries(), 0);
});
