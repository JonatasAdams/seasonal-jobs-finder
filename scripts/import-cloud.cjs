require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { createCloudStore } = require('../lib/cloud-store');
const mail = require('../enviar');
async function main() {
  if (!process.argv.includes('--confirm')) throw new Error('Este comando transfere histórico, modelos e currículo para o DATABASE_URL configurado. Revise o destino e execute com --confirm.');
  const root = process.env.DATA_DIR || path.resolve(__dirname, '..');
  const db = createCloudStore();
  await db.initialize();
  const read = (name, fallback) => fs.existsSync(path.join(root, name)) ? JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')) : fallback;
  const history = read('enviados.json', []);
  if (!Array.isArray(history)) throw new Error('Histórico local inválido.');
  const resume = fs.readFileSync(mail.CURRICULO_PATH);
  if (resume.length > 3 * 1024 * 1024) throw new Error('Currículo acima de 3 MB; reduza o tamanho antes de importar.');
  const values = {
    history,
    templates: mail.carregarTemplates(),
    resume: { filename: path.basename(mail.CURRICULO_PATH), base64: resume.toString('base64') },
    'resume-info': { filename: path.basename(mail.CURRICULO_PATH) },
    cache: read('.web-cache.json', { jobs: read('TEXAS.json', []), cached: true, updatedAt: null }),
  };
  // Never replace data already populated in the cloud.
  for (const [key, value] of Object.entries(values)) console.log(`${key}: ${await db.insert(key, value) ? 'importado' : 'já existe, preservado'}`);
  for (const record of read('.web-send-journal.json', [])) await db.insert('send:' + record.caseNumber, { status: 'pending', record });
  console.log('Importação concluída. Nenhum e-mail enviado.');
}
main().catch(error => { console.error('Importação não concluída:', error.code || error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[conexão omitida]')); process.exitCode = 1; });
