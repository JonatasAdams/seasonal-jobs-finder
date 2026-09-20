// index.js
// Consome a API do SeasonalJobs.dol.gov, filtra vagas que não exigem experiência
// e mantém apenas as que estão com status FULL CERTIFICATION no flag.dol.gov.

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30';
const CASE_STATUS_URL = 'https://flag.dol.gov/recaptcha/caseStatus';
const CASE_STATUS_BATCH_SIZE = 30; // limite da própria busca do flag.dol.gov
const REQUIRED_CASE_STATUS = 'FULL CERTIFICATION';

// ----- Parâmetros de busca (ajuste aqui conforme necessário) -----
const config = {
  visaClass: 'H-2A',
  state: 'FLORIDA',
  experienceRequired: false, // false = sem experiência exigida
  top: 50,                   // tamanho de cada página buscada (o loop soma isso automaticamente)
};

function buildFilter({ visaClass, state, experienceRequired }) {
  return (
    `active eq true and display eq true and ` +
    `search.in(visa_class, '${visaClass}') and ` +
    `worksite_state eq '${state}' and ` +
    `emp_experience_reqd eq ${experienceRequired}`
  );
}

async function fetchJobs({ top, skip, filter }) {
  const body = {
    search: '',
    count: true,
    facets: ['job_title, count:4, sort:count'],
    filter,
    orderby: 'search.score() desc',
    searchFields:
      'job_title, job_duties, soc_code_id, soc_title, case_number, worksite_city, worksite_state, employer_business_name, employer_trade_name',
    select:
      'active,case_number,job_title,begin_date,end_date,basic_rate_from,basic_rate_to,pay_range_desc,employer_trade_name,employer_business_name,employer_phone,employer_phone_ext,employer_email,worksite_city,worksite_state,emp_experience_reqd',
    skip,
    top,
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Erro na requisição: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function formatPay(job) {
  if (job.basic_rate_to && job.basic_rate_to !== job.basic_rate_from) {
    return `$${job.basic_rate_from} - $${job.basic_rate_to}`;
  }
  return `$${job.basic_rate_from}`;
}

function formatPhone(job) {
  if (!job.employer_phone) return '';
  return job.employer_phone_ext
    ? `${job.employer_phone} ext. ${job.employer_phone_ext}`
    : job.employer_phone;
}

function mapJob(job) {
  return {
    titulo: job.job_title,
    empresa: job.employer_business_name,
    caseNumber: job.case_number,
    pagamento: formatPay(job),
    telefone: formatPhone(job),
    email: job.employer_email || '',
    cidade: `${job.worksite_city}, ${job.worksite_state}`,
    link: `https://seasonaljobs.dol.gov/jobs/${job.case_number}`,
    caseStatus: null, // preenchido depois, na etapa de checagem no flag.dol.gov
  };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function fetchCaseStatuses(caseNumbers) {
  const res = await fetch(CASE_STATUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(caseNumbers),
  });

  if (!res.ok) {
    throw new Error(`Erro ao consultar case status: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.value || [];
}

async function fetchAllCaseStatuses(caseNumbers) {
  const batches = chunk(caseNumbers, CASE_STATUS_BATCH_SIZE);
  const statusMap = new Map();

  for (let i = 0; i < batches.length; i++) {
    console.log(`Consultando status: lote ${i + 1}/${batches.length}`);
    const results = await fetchCaseStatuses(batches[i]);
    for (const r of results) {
      statusMap.set(r.caseNumber, r.caseStatus);
    }
  }

  return statusMap;
}

async function fetchAllJobs({ top, filter }) {
  let skip = 0;
  let total = Infinity;
  const allJobs = [];

  while (skip < total) {
    const data = await fetchJobs({ top, skip, filter });

    total = data['@odata.count'];
    const page = (data.value || []).map(mapJob);
    allJobs.push(...page);

    console.log(`Página buscada: ${allJobs.length}/${total}`);

    // Se a página veio vazia antes de bater o total, evita loop infinito
    if (page.length === 0) break;

    skip += top;
  }

  return { total, jobs: allJobs };
}

function toCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

async function main() {
  const filter = buildFilter(config);

  console.log('Buscando vagas...');
  const { total, jobs } = await fetchAllJobs({ top: config.top, filter });

  console.log(`\nTotal encontrado (sem experiência exigida): ${total}`);
  console.log(`Total coletado: ${jobs.length} vaga(s)\n`);

  console.log('Consultando status das vagas no flag.dol.gov...');
  const caseNumbers = jobs.map((job) => job.caseNumber);
  const statusMap = await fetchAllCaseStatuses(caseNumbers);

  for (const job of jobs) {
    job.caseStatus = statusMap.get(job.caseNumber) || 'NÃO ENCONTRADO';
  }

  const approved = jobs.filter((job) => job.caseStatus === REQUIRED_CASE_STATUS);
  const comEmail = approved.filter((job) => job.email);

  console.log(`\nVagas com status "${REQUIRED_CASE_STATUS}": ${approved.length}/${jobs.length}`);
  console.log(`Dessas, com e-mail cadastrado: ${comEmail.length}\n`);
  console.table(approved);

  fs.writeFileSync(path.join(__dirname, `${config.state}.csv`), toCSV(approved), 'utf-8');
  fs.writeFileSync(path.join(__dirname, `${config.state}.json`), JSON.stringify(approved, null, 2), 'utf-8');

  console.log('\nArquivos salvos: vagas.csv e vagas.json');
  console.log('Para enviar os e-mails, rode: yarn enviar');
}

main().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
