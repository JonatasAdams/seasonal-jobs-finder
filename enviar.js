// enviar.js
// Lê vagas.json (gerado pelo index.js) e envia o currículo por e-mail,
// perguntando a cada vaga qual modelo de corpo de e-mail usar.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const nodemailer = require('nodemailer');

const VAGAS_PATH = path.join(__dirname, 'FLORIDA.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const CURRICULO_PATH = path.join(__dirname, process.env.CURRICULO_FILE || 'curriculo.pdf');
const ENVIADOS_PATH = path.join(__dirname, 'enviados.json');

// ---------- utilidades de terminal ----------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function pergunta(texto) {
  return new Promise((resolve) => rl.question(texto, (resposta) => resolve(resposta.trim())));
}

// ---------- templates ----------

function carregarTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error(`Pasta de templates não encontrada: ${TEMPLATES_DIR}`);
  }

  const arquivos = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.txt') || f.endsWith('.md'));

  if (arquivos.length === 0) {
    throw new Error('Nenhum template encontrado na pasta templates/');
  }

  return arquivos.map((arquivo) => {
    const conteudo = fs.readFileSync(path.join(TEMPLATES_DIR, arquivo), 'utf-8');
    const linhas = conteudo.split('\n');

    // A primeira linha pode definir o assunto: "Assunto: ..." ou "Subject: ..."
    let assunto = null;
    let corpoInicio = 0;

    const match = linhas[0].match(/^(?:Assunto|Subject):\s*(.+)$/i);
    if (match) {
      assunto = match[1].trim();
      corpoInicio = 1;
      // pula uma linha em branco logo após o assunto, se houver
      if (linhas[1] !== undefined && linhas[1].trim() === '') corpoInicio = 2;
    }

    return {
      nome: arquivo,
      assunto: assunto || 'Job Application',
      corpo: linhas.slice(corpoInicio).join('\n').trim(),
    };
  });
}

function preencherPlaceholders(texto, vaga) {
  return texto
    .replace(/\{\{titulo\}\}/g, vaga.titulo || '')
    .replace(/\{\{empresa\}\}/g, vaga.empresa || '')
    .replace(/\{\{caseNumber\}\}/g, vaga.caseNumber || '')
    .replace(/\{\{cidade\}\}/g, vaga.cidade || '')
    .replace(/\{\{pagamento\}\}/g, vaga.pagamento || '')
    .replace(/\{\{link\}\}/g, vaga.link || '');
}

// ---------- controle de já enviados ----------

function carregarEnviados() {
  if (!fs.existsSync(ENVIADOS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(ENVIADOS_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function registrarEnvio(registro) {
  const enviados = carregarEnviados();
  enviados.push(registro);
  fs.writeFileSync(ENVIADOS_PATH, JSON.stringify(enviados, null, 2), 'utf-8');
}

// ---------- e-mail ----------

function criarTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Configure SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no arquivo .env (veja .env.example)'
    );
  }

  const port = Number(SMTP_PORT || 587);

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 usa SSL; 587 usa STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ---------- fluxo principal ----------

async function main() {
  if (!fs.existsSync(VAGAS_PATH)) {
    throw new Error('vagas.json não encontrado. Rode "yarn start" primeiro para gerar a lista.');
  }

  if (!fs.existsSync(CURRICULO_PATH)) {
    throw new Error(
      `Currículo não encontrado em: ${CURRICULO_PATH}\n` +
        'Coloque o arquivo na pasta do projeto ou ajuste CURRICULO_FILE no .env'
    );
  }

  const todasVagas = JSON.parse(fs.readFileSync(VAGAS_PATH, 'utf-8'));
  const templates = carregarTemplates();
  const enviados = carregarEnviados();
  const jaEnviados = new Set(enviados.map((e) => e.caseNumber));

  const vagas = todasVagas.filter((v) => v.email && !jaEnviados.has(v.caseNumber));
  const semEmail = todasVagas.filter((v) => !v.email).length;

  console.log(`\nVagas carregadas: ${todasVagas.length}`);
  console.log(`Sem e-mail cadastrado (ignoradas): ${semEmail}`);
  console.log(`Já contatadas anteriormente (ignoradas): ${todasVagas.length - vagas.length - semEmail}`);
  console.log(`A processar agora: ${vagas.length}\n`);

  if (vagas.length === 0) {
    console.log('Nada para enviar.');
    rl.close();
    return;
  }

  const transporter = criarTransporter();
  const remetente = process.env.FROM_NAME
    ? `"${process.env.FROM_NAME}" <${process.env.SMTP_USER}>`
    : process.env.SMTP_USER;

  let enviadosAgora = 0;

  for (let i = 0; i < vagas.length; i++) {
    const vaga = vagas[i];

    console.log('\n' + '='.repeat(70));
    console.log(`[${i + 1}/${vagas.length}] ${vaga.titulo}`);
    console.log(`Empresa:  ${vaga.empresa}`);
    console.log(`Cidade:   ${vaga.cidade}`);
    console.log(`Pagto:    ${vaga.pagamento}`);
    console.log(`E-mail:   ${vaga.email}`);
    console.log(`Case:     ${vaga.caseNumber}`);
    console.log(`Link:     ${vaga.link}`);
    console.log('='.repeat(70));

    console.log('\nModelos disponíveis:');
    templates.forEach((t, idx) => {
      console.log(`  ${idx + 1}) ${t.nome}  —  assunto: "${t.assunto}"`);
    });

    const escolha = await pergunta('\nQual modelo usar? (número | p=pular | s=sair) ');

    if (escolha.toLowerCase() === 's') {
      console.log('Encerrando por escolha do usuário.');
      break;
    }

    if (escolha.toLowerCase() === 'p' || escolha === '') {
      console.log('Vaga pulada.');
      continue;
    }

    const indice = Number(escolha) - 1;
    const template = templates[indice];

    if (!template) {
      console.log('Opção inválida. Vaga pulada.');
      continue;
    }

    const assunto = preencherPlaceholders(template.assunto, vaga);
    const corpo = preencherPlaceholders(template.corpo, vaga);

    console.log('\n--- PRÉVIA ---');
    console.log(`Para:    ${vaga.email}`);
    console.log(`Assunto: ${assunto}`);
    console.log(`Anexo:   ${path.basename(CURRICULO_PATH)}`);
    console.log('---');
    console.log(corpo);
    console.log('--- FIM DA PRÉVIA ---\n');

    const confirma = await pergunta('Enviar este e-mail? (s/N) ');

    if (confirma.toLowerCase() !== 's') {
      console.log('Não enviado.');
      continue;
    }

    try {
      await transporter.sendMail({
        from: remetente,
        to: vaga.email,
        subject: assunto,
        text: corpo,
        attachments: [
          {
            filename: path.basename(CURRICULO_PATH),
            path: CURRICULO_PATH,
          },
        ],
      });

      registrarEnvio({
        caseNumber: vaga.caseNumber,
        empresa: vaga.empresa,
        email: vaga.email,
        titulo: vaga.titulo,
        template: template.nome,
        enviadoEm: new Date().toISOString(),
      });

      enviadosAgora++;
      console.log('✓ Enviado com sucesso.');
    } catch (err) {
      console.error(`✗ Falha ao enviar: ${err.message}`);
    }
  }

  console.log(`\nConcluído. E-mails enviados nesta sessão: ${enviadosAgora}`);
  console.log(`Histórico completo em: ${ENVIADOS_PATH}`);
  rl.close();
}

main().catch((err) => {
  console.error('Falhou:', err.message);
  rl.close();
  process.exit(1);
});
