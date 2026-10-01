const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHandler } = require('../api/index');
const env = { PUBLIC_ORIGIN: 'https://seasonal.example.com', APP_PASSWORD: 'test-password-only-1234', SMTP_USER: 'sender@example.com', SMTP_HOST: 'example.com', SMTP_PASS: 'test' };
function memoryStore() {
  const values = new Map();
  return { async get(key, fallback = null) { return values.get(key) ?? fallback; }, async set(key, value) { values.set(key, value); }, async insert(key, value) { if (values.has(key)) return false; values.set(key, value); return true; }, async remove(key) { values.delete(key); }, async list(prefix) { return [...values].filter(([key]) => key.startsWith(prefix)).map(([key,value]) => ({key,value})); }, async lock(key) { return await this.insert('lock:'+key,true) ? 'owner' : null; }, async unlock(key) { values.delete('lock:'+key); } };
}
async function setup(t, fail = false) {
  const store = memoryStore();
  const job = { caseNumber: 'H-300-26198-106374', active: true, email: 'test@example.com', titulo: 'Worker' };
  await store.set('cache', { jobs: [job] });
  await store.set('resume', { filename: 'resume.pdf', base64: Buffer.from('fake').toString('base64') });
  let sent = 0;
  const options = { store, env: { ...env }, jobsApi: { fetchJobs: async () => ({ value: [{case_number:job.caseNumber, active:true, employer_email:job.email}] }), fetchAllCaseStatuses: async () => new Map([[job.caseNumber,'FULL CERTIFICATION']]) }, email: { criarTransporter: () => ({ sendMail: async () => { sent++; if(fail) throw new Error('timeout'); } }) } };
  let handler = createHandler(options);
  const server = http.createServer((req,res) => handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  options.env.PUBLIC_ORIGIN = base.replace('http:', 'https:');
  const call = (route, body, cookie) => fetch(base+'/?route='+route,{method:body ? 'POST':'GET', headers:{Origin:options.env.PUBLIC_ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie,'X-Session-Token':cookie.split('=')[1]}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const response=await call('login',{password:env.APP_PASSWORD});
  const cookie=response.headers.get('set-cookie').split(';')[0];
  return { store, call, cookie, sent:()=>sent, restart:()=>{handler=createHandler(options);}, message:{caseNumber:job.caseNumber,confirmed:true,subject:'Test',text:'Test'} };
}
test('sessão funciona após uma nova instância e logout a revoga',async t=>{
  const s=await setup(t); s.restart();
  assert.equal((await s.call('bootstrap',null,s.cookie)).status,200);
  assert.equal((await s.call('bootstrap')).status,401);
  await s.call('logout',{},s.cookie);
  assert.equal((await s.call('bootstrap',null,s.cookie)).status,401);
});
test('flags são compartilhadas entre sessões',async t=>{
  const s=await setup(t);
  assert.equal((await s.call('whatsapp',{number:'12025550123',availability:'yes',contacted:true},s.cookie)).status,200);
  s.restart();
  const result=await (await s.call('bootstrap',null,s.cookie)).json();
  assert.equal(result.whatsapp.numbers['12025550123'].contacted,true);
});
test('reserva persistente impede reenvio após reinício',async t=>{
  const s=await setup(t);
  assert.equal((await s.call('send',s.message,s.cookie)).status,200);
  s.restart();
  assert.equal((await s.call('send',s.message,s.cookie)).status,400);
  assert.equal(s.sent(),1);
});
test('erro SMTP deixa envio pendente sem repetição',async t=>{
  const s=await setup(t,true);
  assert.equal((await s.call('send',s.message,s.cookie)).status,400);
  s.restart();
  assert.equal((await s.call('send',s.message,s.cookie)).status,400);
  assert.equal(s.sent(),1);
  const result=await (await s.call('bootstrap',null,s.cookie)).json();
  assert.equal(result.pending.length,1);
});
test('mensagem e anexo podem ser gerados sem SMTP real',async()=>{
  const transporter=require('nodemailer').createTransport({streamTransport:true,buffer:true});
  const result=await transporter.sendMail({from:'sender@example.com',to:'recipient@example.com',subject:'Test',text:'Test only',attachments:[{filename:'resume.pdf',content:Buffer.from('test')}]});
  assert.match(result.message.toString(),/resume.pdf/);
});
