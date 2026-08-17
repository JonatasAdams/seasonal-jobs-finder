// index.js
// Consome a API do SeasonalJobs.dol.gov e filtra vagas H-2A na Flórida
// que não exigem experiência prévia.

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30';

// ----- Parâmetros de busca (ajuste aqui conforme necessário) -----
const config = {
  visaClass: 'H-2A',
  state: 'FLORIDA',
  experienceRequired: false, // false = sem experiência exigida
  top: 50,                   // quantos resultados trazer por página
  skip: 0,                   // paginação
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
      'active,case_number,job_title,begin_date,end_date,basic_rate_from,basic_rate_to,pay_range_desc,employer_trade_name,employer_business_name,worksite_city,worksite_state,emp_experience_reqd',
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

function mapJob(job) {
  return {
    titulo: job.job_title,
    empresa: job.employer_business_name,
    caseNumber: job.case_number,
    pagamento: formatPay(job),
    cidade: `${job.worksite_city}, ${job.worksite_state}`,
    link: `https://seasonaljobs.dol.gov/jobs/${job.case_number}`,
  };
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
  const data = await fetchJobs({ top: config.top, skip: config.skip, filter });

  const total = data['@odata.count'];
  const jobs = (data.value || []).map(mapJob);

  console.log(`\nTotal encontrado: ${total}`);
  console.log(`Exibindo ${jobs.length} resultado(s):\n`);
  console.table(jobs);

  const outPath = path.join(__dirname, 'vagas.csv');
  fs.writeFileSync(outPath, toCSV(jobs), 'utf-8');
  console.log(`\nArquivo CSV salvo em: ${outPath}`);
}

main().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});