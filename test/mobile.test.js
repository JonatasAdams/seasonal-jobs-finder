const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function start(t, options = {}) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('manifest, service worker e ícones são servidos corretamente', async t => {
  const base = await start(t);
  const manifestResponse = await fetch(base + '/manifest.webmanifest');
  assert.match(manifestResponse.headers.get('content-type'), /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const response = await fetch(base + icon.src);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    assert.equal(response.status, 200);
  }
  assert.equal((await fetch(base + '/sw.js')).status, 200);
  assert.equal((await fetch(base + '/offline.html')).status, 200);
});
test('modo remoto exige HTTPS e senha forte', () => {
  assert.throws(() => createApp({ publicOrigin: 'http://example.com', appPassword: 'a'.repeat(20) }));
  assert.throws(() => createApp({ publicOrigin: 'https://example.com', appPassword: 'short' }));
});
test('modo remoto bloqueia dados e envios sem autenticação', async t => {
  const base = await start(t, { publicOrigin: 'https://seasonal.example.com', appPassword: 'test-password-only-1234' });
  assert.equal((await fetch(base + '/api/bootstrap')).status, 401);
  assert.equal((await fetch(base + '/api/send', { method: 'POST' })).status, 401);
  assert.match(await (await fetch(base)).text(), /login-form/);
  const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-password-only-1234' }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  const page = await fetch(base, { headers: { Cookie: cookie.split(';')[0] } });
  assert.match(await page.text(), /jobs-view/);
});
test('login rejeita senha incorreta e origem externa', async t => {
  const base = await start(t, { publicOrigin: 'https://seasonal.example.com', appPassword: 'test-password-only-1234' });
  assert.equal((await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"wrong"}' })).status, 401);
  assert.equal((await fetch(base + '/api/login', { method: 'POST', headers: { Origin: 'https://other.example.com' }, body: '{}' })).status, 403);
});
