const $ = id => document.getElementById(id);
let data = { jobs: [], history: [], pending: [], templates: [] }, selected, token, busy = false;
const drafts = new Map();
const whatsappDrafts = new Map();
const WA_STORAGE = 'seasonal.whatsapp.v1';
let waSaved = { numbers: {}, overrides: {} }, waStorageError = false;
try {
  const saved = JSON.parse(localStorage.getItem(WA_STORAGE) || 'null');
  if (saved && (!saved.numbers || !saved.overrides || typeof saved.numbers !== 'object' || typeof saved.overrides !== 'object')) throw new Error('Invalid WhatsApp data');
  if (saved) waSaved = saved;
} catch { waStorageError = true; }
function waPhone(job) { return whatsappDrafts.get(job.caseNumber)?.phone ?? waSaved.overrides[job.caseNumber] ?? job.telefone ?? ''; }
function waFlags(job) { return waSaved.numbers[whatsappNumber(waPhone(job))] || { availability: 'unknown', contacted: false }; }
function waMatches(job) {
  const flags = waFlags(job), number = whatsappNumber(waPhone(job));
  const availability = $('wa-availability-filter').value, contact = $('wa-contact-filter').value;
  return (availability === 'all' || (number && flags.availability === availability)) && (contact === 'all' || (number && flags.contacted === (contact === 'yes')));
}
function waBadges(job) {
  if (!whatsappNumber(waPhone(job))) return '<div class="wa-badges"><span class="tag neutral">WhatsApp: sem telefone válido</span></div>';
  const flags = waFlags(job);
  return `<div class="wa-badges"><span class="tag neutral">${{unknown:'WhatsApp não verificado',yes:'Tem WhatsApp',no:'Não tem WhatsApp'}[flags.availability] || 'WhatsApp não verificado'}</span><span class="tag">${flags.contacted ? 'Contatado via WhatsApp' : 'Não contatado via WhatsApp'}</span></div>`;
}
function whatsappNumber(value) {
  const base = String(value || '').trim().replace(/\s*(?:ext\.?|extension|ramal|x|#)\s*\d+\s*$/i, '').trim();
  if (!/^[+\d\s().-]+$/.test(base)) return '';
  let digits = base.replace(/\D/g, '');
  if (!base.startsWith('+') && digits.length === 10) digits = '1' + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}
function renderWhatsApp(job) {
  if (!whatsappDrafts.has(job.caseNumber)) whatsappDrafts.set(job.caseNumber, {
    phone: waSaved.overrides[job.caseNumber] ?? job.telefone ?? '',
    text: `Hello! I am interested in the ${job.titulo} position at ${job.empresa} in ${job.cidade}, listed on Seasonal Jobs (case ${job.caseNumber}). Are you accepting applications? I would be happy to share my resume. Thank you!`,
  });
  const draft = whatsappDrafts.get(job.caseNumber);
  $('detail').insertAdjacentHTML('beforeend', `<section class="compose whatsapp-compose"><h3>Contato pelo WhatsApp</h3><p>Revise a mensagem e abra a conversa na conta do WhatsApp Business que você utiliza.</p><label>Telefone do WhatsApp<input id="whatsapp-phone" type="tel" autocomplete="off" value="${esc(draft.phone)}" placeholder="+1 (555) 123-4567"></label><label>Mensagem do WhatsApp<textarea id="whatsapp-message" maxlength="3000">${esc(draft.text)}</textarea></label><p id="whatsapp-hint" role="status"></p><a id="whatsapp-open" class="primary whatsapp-link" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Abrir no WhatsApp ↗</a><p>Você envia a mensagem no WhatsApp. O currículo não é anexado automaticamente e abrir a conversa não registra um envio no histórico.</p></section>`);
  const updateLink = () => {
    const number = whatsappNumber(draft.phone);
    const enabled = Boolean(number && draft.text.trim());
    const link = $('whatsapp-open');
    if (enabled) link.href = `https://wa.me/${number}?text=${encodeURIComponent(draft.text.trim())}`;
    else link.removeAttribute('href');
    link.setAttribute('aria-disabled', String(!enabled));
    link.tabIndex = enabled ? 0 : -1;
    $('whatsapp-hint').textContent = !number ? 'Informe um telefone válido com código do país. Números dos EUA com 10 dígitos recebem +1; ramais são removidos.' : !draft.text.trim() ? 'Escreva a mensagem para abrir a conversa.' : `Destino: +${number}. Confira o número; não verificamos se ele possui WhatsApp.`;
    const flags = waFlags(job);
    $('wa-availability').value = flags.availability;
    $('wa-contacted').checked = flags.contacted === true;
    $('wa-availability').disabled = $('wa-contacted').disabled = !number || waStorageError;
    $('wa-saved-note').textContent = waStorageError ? 'Não foi possível ler as marcações salvas. Verifique o armazenamento do navegador antes de alterar.' : flags.updatedAt ? `Marcação manual salva em ${date(flags.updatedAt)}. Compartilhada pelas vagas deste telefone.` : data.cloudMode ? 'Marcação manual por telefone, salva na sua conta. Abrir a conversa não marca contato realizado.' : 'Marcação manual por telefone, salva somente neste navegador. Abrir a conversa não marca contato realizado.';
  };
  $('whatsapp-phone').closest('label').insertAdjacentHTML('afterend', `<div class="wa-flags"><label>Este número tem WhatsApp?<select id="wa-availability"><option value="unknown">Não verificado</option><option value="yes">Sim, tem WhatsApp</option><option value="no">Não tem WhatsApp</option></select></label><label class="wa-checkbox"><input type="checkbox" id="wa-contacted"> Já contatado pelo WhatsApp</label><p id="wa-saved-note" role="status"></p></div>`);
  const saveFlags = async () => {
    const number = whatsappNumber(draft.phone);
    if (!number || waStorageError) return;
    const next = { numbers: { ...waSaved.numbers, [number]: { availability: $('wa-availability').value, contacted: $('wa-contacted').checked, updatedAt: new Date().toISOString() } }, overrides: { ...waSaved.overrides, [job.caseNumber]: draft.phone } };
    try {
      if (data.cloudMode) {
        $('wa-availability').disabled = $('wa-contacted').disabled = true;
        const result = await request('/api/whatsapp', { number, ...next.numbers[number], caseNumber: job.caseNumber, phone: draft.phone });
        next.numbers[number] = result.value;
      } else localStorage.setItem(WA_STORAGE, JSON.stringify(next));
      waSaved = next; renderList();
    }
    catch (error) { notice(`Não foi possível salvar a marcação: ${error.message}`); renderDetail(); }
  };
  $('wa-availability').onchange = saveFlags;
  $('wa-contacted').onchange = saveFlags;
  $('whatsapp-phone').oninput = event => { draft.phone = event.target.value; updateLink(); };
  $('whatsapp-message').oninput = event => { draft.text = event.target.value; updateLink(); };
  updateLink();
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validEmail = value => typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
const date = value => value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
const sent = job => data.history.some(h => h.caseNumber === job.caseNumber);
const pending = job => data.pending.some(h => h.caseNumber === job.caseNumber);
function notice(text) { $('notice').textContent = text; $('notice').hidden = !text; }
async function request(url, body) {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': token }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (response.status === 401) { $('logout-app').hidden = false; $('logout-app').textContent = 'Entrar'; $('logout-app').onclick = () => location.assign('/'); }
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir.');
  return result;
}
function filtered() {
  const query = $('query').value.toLocaleLowerCase('pt-BR');
  return data.jobs.filter(j => waMatches(j) && `${j.titulo} ${j.empresa} ${j.cidade} ${j.caseNumber}`.toLocaleLowerCase('pt-BR').includes(query) && ($('contact-filter').value === 'all' || validEmail(j.email)) && ($('contact-filter').value !== 'pending' || (!sent(j) && !pending(j))));
}
function fill(text, job) { return text.replace(/\{\{(titulo|empresa|caseNumber|cidade|pagamento|link)\}\}/g, (_, key) => job[key] || ''); }
function draft(job) {
  if (!drafts.has(job.caseNumber)) { const t = data.templates.find(t => t.nome === 'generic.txt') || data.templates[0]; drafts.set(job.caseNumber, { template: t?.nome || '', subject: fill(t?.assunto || 'Job Application', job), text: fill(t?.corpo || '', job) }); }
  return drafts.get(job.caseNumber);
}
function renderList() {
  const jobs = filtered();
  $('result-count').textContent = `${jobs.length} vagas`;
  if (!jobs.some(j => j.caseNumber === selected)) selected = jobs[0]?.caseNumber;
  $('job-list').innerHTML = jobs.length ? jobs.map(j => `<button class="job ${selected === j.caseNumber ? 'selected' : ''}" data-case="${esc(j.caseNumber)}" aria-pressed="${selected === j.caseNumber}"><div class="job-top"><span class="tag">FULL CERTIFICATION</span><span class="tag neutral">${sent(j) ? 'Já contatada' : pending(j) ? 'Verificar envio' : validEmail(j.email) ? 'E-mail disponível' : 'Sem e-mail'}</span></div><h3>${esc(j.titulo)}</h3><div class="company">${esc(j.empresa)}</div><div class="job-meta"><span>${esc(j.cidade)}</span><b>${esc(j.pagamento)}</b></div></button>`).join('') : '<div class="empty">Nenhuma vaga encontrada.<br>Altere os filtros ou faça uma nova consulta.</div>';
  document.querySelectorAll('[data-case]').forEach(button => button.onclick = () => { selected = button.dataset.case; renderList(); });
  document.querySelectorAll('[data-case]').forEach(button => { const job = data.jobs.find(j => j.caseNumber === button.dataset.case); button.insertAdjacentHTML('beforeend', waBadges(job)); });
  renderDetail();
}
function renderDetail() {
  const job = data.jobs.find(j => j.caseNumber === selected);
  if (!job) { $('detail').innerHTML = '<div class="empty">Selecione uma oportunidade<br>para preparar sua candidatura.</div>'; return; }
  const d = draft(job);
  const blocked = busy || sent(job) || pending(job) || !validEmail(job.email) || !data.resumeReady || !data.smtpReady;
  const link = `https://seasonaljobs.dol.gov/jobs/${encodeURIComponent(job.caseNumber)}`;
  $('detail').innerHTML = `<span class="eyebrow">DETALHES DA OPORTUNIDADE</span><h2>${esc(job.titulo)}</h2><div class="company">${esc(job.empresa)}</div><div class="detail-grid"><div><small>LOCALIZAÇÃO</small><span>${esc(job.cidade)}</span></div><div><small>REMUNERAÇÃO</small><span>${esc(job.pagamento)} ${esc(job.payUnit || '· unidade não informada')}</span></div><div><small>E-MAIL</small><span>${esc(validEmail(job.email) ? job.email : 'Não disponível')}</span></div><div><small>TELEFONE</small><span>${esc(job.telefone || 'Não informado')}</span></div><div><small>INÍCIO DO CONTRATO</small><span>${esc(job.beginDate?.slice(0,10) || 'Não informado')}</span></div><div><small>FIM DO CONTRATO</small><span>${esc(job.endDate?.slice(0,10) || 'Não informado')}</span></div></div><a href="${link}" target="_blank" rel="noopener noreferrer">Ver vaga no Seasonal Jobs ↗</a><p class="muted">Case ${esc(job.caseNumber)}</p><div class="compose"><h3>Sua candidatura</h3><p>Escolha um modelo e ajuste a mensagem antes de enviar.</p><label>Modelo de e-mail<select id="template">${data.templates.map(t => `<option value="${esc(t.nome)}" ${d.template === t.nome ? 'selected' : ''}>${esc(t.nome.replace(/\.(txt|md)$/, '').replace(/_/g, ' '))}</option>`).join('')}</select></label><label>Assunto<input id="subject" maxlength="300" value="${esc(d.subject)}"></label><label>Mensagem<textarea id="body" maxlength="30000">${esc(d.text)}</textarea></label><div class="attachment">↳ ${esc(data.resume)} · ${data.resumeReady ? 'currículo anexado ao enviar' : 'arquivo não encontrado'}</div><p>${sent(job) ? 'Candidatura já registrada no histórico.' : pending(job) ? 'Envio incerto: confira o SMTP antes de tentar novamente.' : !validEmail(job.email) ? 'Esta vaga não possui e-mail válido. Você ainda pode copiar a mensagem.' : !data.smtpReady ? 'Configure o SMTP no arquivo .env para habilitar o envio.' : 'O envio só acontece após sua confirmação.'}</p><div class="actions"><button class="secondary" id="copy">Copiar mensagem</button><button class="primary" id="send" ${blocked ? 'disabled' : ''}>Revisar e enviar ↗</button></div></div>`;
  $('subject').oninput = () => { d.subject = $('subject').value; };
  $('body').oninput = () => { d.text = $('body').value; };
  renderWhatsApp(job);
  $('template').onchange = () => {
    const t = data.templates.find(t => t.nome === $('template').value);
    if (!t) return;
    Object.assign(d, { template: t.nome, subject: fill(t.assunto, job), text: fill(t.corpo, job) }); renderDetail();
  };
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.text}`); notice('Mensagem copiada.'); } catch { notice('Não foi possível copiar. Selecione o texto da mensagem e copie manualmente.'); } };
  $('send').onclick = () => { if (!d.subject.trim() || !d.text.trim()) { notice('Preencha o assunto e a mensagem.'); return; } $('confirm-summary').textContent = `Para: ${job.email} · Assunto: ${d.subject} · Anexo: ${data.resume}`; $('confirm-dialog').showModal(); };
}
function render() {
  $('logout-app').hidden = !data.authenticatedMode;
  $('total').textContent = data.jobs.length;
  $('contacts').textContent = data.jobs.filter(j => validEmail(j.email)).length;
  $('sent').textContent = data.history.length;
  $('history-count').textContent = data.history.length;
  $('freshness').textContent = `${data.cached ? 'Arquivo local — atividade atual não verificada' : 'Verificadas nesta consulta'}${data.updatedAt ? ` · ${date(data.updatedAt)}` : ''}`;
  $('history-list').innerHTML = data.history.length ? [...data.history].reverse().map(h => `<article class="history-row"><span class="tag">ENVIADA · ${esc(date(h.enviadoEm))}</span><h3>${esc(h.titulo)}</h3><p>${esc(h.empresa)} · ${esc(h.email)}</p><p>${esc(h.caseNumber)} · ${esc(h.template)}</p></article>`).join('') : '<div class="empty">Nenhuma candidatura enviada ainda.</div>';
  renderList();
}
$('search-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  busy = true; $('search-button').disabled = true; $('search-button').textContent = 'Consultando…'; renderDetail(); notice('Buscando vagas e verificando a certificação. A consulta pode levar alguns minutos.');
  try { const result = await request('/api/search', { state: $('state').value, visaClass: $('visa').value, experienceRequired: $('experience').value === 'true' }); data = { ...data, ...result }; selected = null; render(); notice(`${data.jobs.length} vagas ativas com certificação completa encontradas.`); }
  catch (error) { notice(`A consulta falhou: ${error.message} Os resultados anteriores foram mantidos.`); }
  finally { busy = false; $('search-button').disabled = false; $('search-button').textContent = '↻ Consultar vagas'; renderDetail(); }
};
$('confirm-dialog').addEventListener('close', async () => {
  if ($('confirm-dialog').returnValue !== 'send' || busy) return;
  const job = data.jobs.find(j => j.caseNumber === selected), d = draft(job);
  busy = true; $('search-button').disabled = true; renderDetail(); notice('Verificando a vaga e enviando a candidatura…');
  try { Object.assign(data, await request('/api/send', { caseNumber: job.caseNumber, ...d, confirmed: true })); notice('Candidatura enviada e registrada no histórico.'); }
  catch (error) { notice(`Não foi possível confirmar o envio: ${error.message}`); try { Object.assign(data, await request('/api/bootstrap')); } catch {} }
  finally { busy = false; $('search-button').disabled = false; render(); }
});
$('query').oninput = renderList; $('contact-filter').onchange = renderList;
$('wa-availability-filter').onchange = renderList;
$('wa-contact-filter').onchange = renderList;
window.addEventListener('storage', event => { if (!data.cloudMode && event.key === WA_STORAGE) { try { const saved = JSON.parse(event.newValue || '{"numbers":{},"overrides":{}}'); if (!saved.numbers || !saved.overrides) throw new Error(); waSaved = saved; waStorageError = false; renderList(); } catch { notice('As marcações do WhatsApp foram alteradas em outra aba e não puderam ser lidas. Recarregue a página.'); } } });
for (const view of ['jobs', 'history']) $(`${view}-tab`).onclick = () => { $('jobs-view').hidden = view !== 'jobs'; $('history-view').hidden = view !== 'history'; $('jobs-tab').classList.toggle('active', view === 'jobs'); $('history-tab').classList.toggle('active', view === 'history'); $('breadcrumb').textContent = view === 'jobs' ? 'Explorar vagas' : 'Candidaturas'; };
$('export').onclick = () => {
  const columns = ['titulo', 'empresa', 'caseNumber', 'pagamento', 'cidade', 'email', 'telefone', 'link', 'caseStatus'];
  const cell = value => { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = '\uFEFF' + [columns.join(','), ...filtered().map(j => columns.map(c => cell(j[c])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'seasonal-vagas.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('logout-app').onclick = async () => { try { await request('/api/logout', {}); location.assign('/'); } catch (error) { notice(error.message); } };
request('/api/bootstrap').then(result => { data = result; token = result.token; if (result.cloudMode) { waSaved = result.whatsapp; waStorageError = false; } $('state').innerHTML = data.states.map(s => `<option ${s === (data.config?.state || 'TEXAS') ? 'selected' : ''}>${esc(s)}</option>`).join(''); if (data.config) { $('visa').value = data.config.visaClass; $('experience').value = String(data.config.experienceRequired); } render(); if (data.warning) notice(data.warning); }).catch(error => { notice(`Falha ao carregar: ${error.message}. Confira o servidor e recarregue a página.`); $('search-button').disabled = true; });
