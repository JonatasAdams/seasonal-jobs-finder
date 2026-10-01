const crypto = require('node:crypto');
function createCloudStore(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Configure DATABASE_URL do Neon.');
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(connectionString);
  return {
    async initialize() { await sql.query('CREATE TABLE IF NOT EXISTS seasonal_data (key TEXT PRIMARY KEY, value JSONB NOT NULL, expires_at TIMESTAMPTZ)'); },
    async get(key, fallback = null) { const rows = await sql.query('SELECT value FROM seasonal_data WHERE key=$1 AND (expires_at IS NULL OR expires_at > NOW())', [key]); return rows[0]?.value ?? fallback; },
    async set(key, value) { await sql.query('INSERT INTO seasonal_data(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, expires_at=NULL', [key, JSON.stringify(value)]); },
    async insert(key, value, seconds = null) { const rows = await sql.query("INSERT INTO seasonal_data(key,value,expires_at) VALUES($1,$2::jsonb,CASE WHEN $3::int IS NULL THEN NULL ELSE NOW()+$3::int*INTERVAL '1 second' END) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at WHERE seasonal_data.expires_at <= NOW() RETURNING key", [key, JSON.stringify(value), seconds]); return rows.length > 0; },
    async remove(key) { await sql.query('DELETE FROM seasonal_data WHERE key=$1', [key]); },
    async cleanup() { await sql.query('DELETE FROM seasonal_data WHERE expires_at < NOW()'); },
    async list(prefix) { const rows = await sql.query("SELECT key,value FROM seasonal_data WHERE STARTS_WITH(key,$1) AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY key", [prefix]); return rows; },
    async lock(name, seconds = 330) { const owner = crypto.randomUUID(); return await this.insert('lock:' + name, { owner }, seconds) ? owner : null; },
    async unlock(name, owner) { await sql.query("DELETE FROM seasonal_data WHERE key=$1 AND value->>'owner'=$2", ['lock:' + name, owner]); },
  };
}
module.exports = { createCloudStore };
