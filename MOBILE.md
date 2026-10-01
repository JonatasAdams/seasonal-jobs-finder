# Seasonal no celular

O projeto agora inclui um PWA: o mesmo aplicativo pode ser instalado na tela inicial de Android e iPhone, mantendo a versão web. Não é um APK nem uma publicação na App Store.

## O que já está incluído

- Manifesto, ícones Android/iOS e abertura em janela de aplicativo.
- Botão de instalação ou instruções específicas do navegador.
- Layout para telas pequenas, navegação inferior, campos e botões de toque.
- Página de falta de conexão, sem colocar envios de e-mail em fila.
- Acesso remoto opcional com senha, sessão de 12 horas e HTTPS obrigatório na origem pública.

## Acesso pelo telefone

`http://127.0.0.1:3000` aponta para o próprio dispositivo. No telefone, não aponta para o PC.
Para instalar o app no celular, é necessário disponibilizar o servidor em um endereço HTTPS com certificado confiável.

Existem duas formas de disponibilizar o backend:

1. **PC ligado:** proxy HTTPS ou rede privada com HTTPS apontando para o Node no computador. O PC e o processo Node precisam ficar ligados.
2. **Independente do PC:** hospedar o Node e os arquivos privados em um servidor com disco persistente e proxy HTTPS. Uma hospedagem apenas estática não executa a API nem envia e-mail.

A hospedagem, domínio, serviço de acesso e instalação no dispositivo ainda precisam ser configurados. Nenhum acesso público é habilitado automaticamente pelo código.

## Configuração do servidor

No ambiente que executará o backend:

```dotenv
PUBLIC_ORIGIN=https://seu-endereco-exato.example.com
APP_PASSWORD=uma-senha-longa-exclusiva-com-16-ou-mais-caracteres
HOST=127.0.0.1
PORT=3000
```

Use uma senha real e exclusiva. Não copie a senha ilustrativa. Preserve as variáveis SMTP e o caminho do currículo.
`DATA_DIR` define a pasta persistente para templates, currículo, histórico e cache. Sem essa variável, a pasta do projeto continua sendo usada.
O proxy precisa terminar TLS com certificado válido, encaminhar o cabeçalho `Host` original e alcançar a porta do Node.
O serviço Node usa HTTP somente atrás do proxy; não exponha sua porta HTTP diretamente à internet.
`HOST=0.0.0.0` só é necessário quando a infraestrutura exige uma interface de rede, por exemplo dentro de um container isolado atrás do proxy. O programa recusa esse modo sem origem HTTPS e senha.
Sem `PUBLIC_ORIGIN`, o modo local no computador continua funcionando sem login.
Reinicie `npm run web` após mudar essas opções ou atualizar `server.js`.

No modo remoto, todos os dados e operações da API exigem login. Os arquivos estáticos do aplicativo são públicos, mas `.env`, currículo e dados não têm rota de download. A senha nunca fica no JavaScript do cliente.

## Instalar

1. Abra o endereço HTTPS configurado no telefone e entre com a senha.
2. Android/Chrome: use **Instalar app** ou o menu **Instalar aplicativo / Adicionar à tela inicial**.
3. iPhone/Safari: **Compartilhar → Adicionar à Tela de Início → Abrir como App → Adicionar** (os nomes podem variar conforme a versão).

## Container para hospedagem independente do PC

O `Dockerfile` empacota somente código e assets públicos. O `.dockerignore` exclui credenciais, currículo, templates privados e históricos.
Monte um volume persistente em `/data` e copie os dados privados separadamente por um canal autenticado da hospedagem. Antes de abrir o app, a pasta `/data/templates` deve conter os seus modelos e `CURRICULO_FILE` deve indicar o currículo dentro de `/data` (ou um caminho absoluto).
Configure as variáveis SMTP, `PUBLIC_ORIGIN` e `APP_PASSWORD` como segredos da hospedagem; não como arquivos públicos ou argumentos de build.
O container executa como usuário `node` (UID 1000). O volume precisa permitir escrita por esse usuário. Use uma única instância com disco persistente, pois o histórico usa arquivos JSON e a trava de envio é por processo.
O Dockerfile foi preparado, mas o build e a publicação precisam ser verificados no ambiente de hospedagem escolhido.

## Dados e limitações

- Consultas, histórico de e-mail e envios usam o backend. O backend precisa estar online.
- O app não faz envios em segundo plano nem reenvia automaticamente após falhas de conexão.
- O service worker guarda apenas a página pública de falta de conexão e seu ícone; não guarda respostas da API nem credenciais.
- No servidor local (`npm run web`), as flags de WhatsApp continuam salvas no navegador/dispositivo. Na versão Vercel, são guardadas no Postgres e compartilhadas entre os dispositivos ao carregar o painel. Marcações antigas do navegador local não são transferidas automaticamente para a nuvem.
- Os rascunhos continuam temporários e são descartados ao recarregar.
- Abrir o WhatsApp no telefone usa o aplicativo associado aos links naquele dispositivo. O usuário escolhe a conta e envia manualmente.
- Preserve `.web-cache.json`, `.web-send-journal.json`, `enviados.json`, `templates/`, currículo e `.env` em disco persistente se hospedar fora do PC. Não publique arquivos privados em repositórios ou pastas estáticas.

## Verificação

`npm test` inclui verificações de manifesto/ícones, bloqueio de API remota, senha, sessão e origem. A instalação real depende do navegador e do endereço HTTPS escolhido.

Referências: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable e https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios
