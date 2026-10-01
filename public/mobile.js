let installPrompt;
const installButton = document.getElementById('install-app');
const installDialog = document.getElementById('install-dialog');
const installHelp = document.getElementById('install-help');
function installInstructions() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  installButton.hidden = standalone;
  if (!window.isSecureContext) installHelp.textContent = 'Para instalar no celular, acesse o endereço HTTPS configurado para o servidor. O endereço 127.0.0.1 só funciona no próprio computador.';
  else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) installHelp.textContent = 'No Safari, toque em Compartilhar → Adicionar à Tela de Início → Abrir como App → Adicionar. O servidor precisa estar disponível para consultar vagas e enviar e-mails.';
  else installHelp.textContent = 'No Chrome ou Edge, abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial. Se a opção ainda não aparecer, recarregue a página. O servidor precisa estar disponível para usar o app.';
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
window.addEventListener('appinstalled', () => { installPrompt = null; installButton.hidden = true; });
installButton.onclick = async () => {
  if (!installPrompt) { installInstructions(); installDialog.showModal(); return; }
  await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null;
};
installInstructions();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {
  installHelp.textContent = 'Não foi possível preparar a instalação. Recarregue o app com conexão ao servidor.';
});
const networkBanner = document.getElementById('network-banner');
function networkState() { networkBanner.hidden = navigator.onLine; }
window.addEventListener('online', networkState);
window.addEventListener('offline', networkState);
networkState();
// On a narrow screen, bring the selected vacancy into view without changing desktop navigation.
document.getElementById('job-list').addEventListener('click', event => {
  if (event.target.closest('[data-case]') && matchMedia('(max-width: 650px)').matches) document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
