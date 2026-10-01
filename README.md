# Seasonal Jobs Finder

## Aplicativo para celular e hospedagem

O painel também é um PWA instalável. Consulte `MOBILE.md` para uso no celular e `VERCEL.md` para hospedar na Vercel com Neon, funcionando mesmo com o PC desligado.
Esta versão usa Node.js 24 e `npm install`/`package-lock.json`. `npm run build` gera os assets públicos; `npm test` verifica os fluxos sem enviar e-mails reais.
Após atualizar o backend, encerre o processo antigo com Ctrl+C e execute `npm run web` novamente.

## Painel web

Na pasta do projeto, execute `npm run web` (ou `yarn web`) e abra http://127.0.0.1:3000.
Não há build nem novas dependências. Os comandos `npm start` e `npm run enviar` continuam disponíveis.

O painel permite consultar por estado, visto e exigência de experiência; pesquisar nos resultados;
filtrar contatos válidos e vagas ainda não contatadas; exportar CSV; consultar o histórico;
selecionar um template; editar assunto e corpo; copiar ou confirmar o envio com currículo.
Os rascunhos são mantidos enquanto a página está aberta. Recarregar a página descarta as edições.

Na primeira abertura, carrega `TEXAS.json`. Depois, usa a última consulta salva em `.web-cache.json`.
Dados carregados do disco são identificados como antigos. O botão **Consultar vagas** consulta as duas APIs,
mantendo apenas vagas ativas, visíveis e com `FULL CERTIFICATION`. O cache do painel não altera os arquivos
JSON/CSV usados pelo console. Use **Exportar CSV** para baixar os resultados filtrados do painel.

O envio usa os templates existentes, `CURRICULO_FILE` e as configurações SMTP do `.env`.
Antes de enviar, o servidor confere novamente atividade, certificação e contato da vaga.
O destinatário vem da vaga e não pode ser substituído pelo navegador. E-mails como `N/A` são rejeitados.
Credenciais, currículo e arquivos privados não são servidos pelo HTTP. O servidor escuta apenas em loopback.

O histórico `enviados.json` é compartilhado com o console. Use somente um processo de envio por vez
(painel ou console). Não execute várias instâncias do painel em portas diferentes para enviar simultaneamente.
Um histórico inválido bloqueia os envios. O painel registra a tentativa em `.web-send-journal.json`
antes de chamar o SMTP; após sucesso, grava o histórico e remove a tentativa pendente.
Em caso de timeout ou interrupção, a vaga permanece bloqueada para evitar duplicação.
Confira o provedor de e-mail e, com o servidor parado, reconcilie o registro pendente com `enviados.json`;
remova a entrada pendente apenas após confirmar o resultado. Aceitação pelo SMTP não garante entrega na caixa de entrada.

### Verificação

Execute `npm test`: testes HTTP com APIs e SMTP simulados, sem envio de mensagens reais.
Cobrem filtros, confirmação, duplicação, vaga inativa, timeout, histórico corrompido e acesso indevido.

### Arquitetura

- `server.js`: servidor HTTP local e integração com consulta, templates e SMTP.
- `public/`: interface responsiva em HTML, CSS e JavaScript, sem framework.
- `index.js`: funções de consulta reutilizáveis, com timeout por requisição.
- `enviar.js`: utilitários de templates e SMTP reutilizáveis; o terminal só abre quando executado diretamente.

## Uso pelo console

Script Node.js que consome a API do [seasonaljobs.dol.gov](https://seasonaljobs.dol.gov), filtra vagas H-2A na Flórida que **não exigem experiência prévia**, mantém apenas as que estão com status **FULL CERTIFICATION** no `flag.dol.gov`, e permite enviar a candidatura por e-mail com o currículo anexo.

## Requisitos

- Node.js 18+ (usa `fetch` nativo)
- Yarn

## Instalação

```bash
yarn install
```

Depois:

1. Copie `.env.example` para `.env` e preencha suas credenciais SMTP
2. Coloque seu currículo em PDF na raiz do projeto com o nome `curriculo.pdf` (ou ajuste `CURRICULO_FILE` no `.env`)
3. Ajuste os modelos de e-mail na pasta `templates/`

## Uso

### 1. Buscar as vagas

```bash
yarn start
```

Isso vai:
1. Buscar as vagas na API do `seasonaljobs.dol.gov` filtrando por `emp_experience_reqd eq false`
2. Consultar o status de cada vaga na API do `flag.dol.gov` (em lotes de até 30 case numbers por vez)
3. Filtrar mantendo só as vagas com status **"FULL CERTIFICATION"**
4. Exibir a tabela no terminal e salvar `vagas.csv` (para conferência) e `vagas.json` (usado na etapa de envio)

### 2. Enviar os e-mails

```bash
yarn enviar
```

Para **cada vaga**, o script mostra os dados do empregador, lista os modelos disponíveis em `templates/` e pergunta qual usar. Você pode:

- digitar o **número** do modelo → mostra uma prévia e pede confirmação antes de enviar
- `p` → pula a vaga
- `s` → encerra o envio

Vagas sem e-mail cadastrado são ignoradas automaticamente. Vagas já contatadas ficam registradas em `enviados.json` e não aparecem de novo nas próximas execuções.

## Modelos de e-mail

Cada arquivo `.txt` ou `.md` dentro de `templates/` é um modelo. A primeira linha pode definir o assunto:

```
Assunto: Application for {{titulo}} - Case {{caseNumber}}

Dear Hiring Manager,
...
```

Placeholders disponíveis (substituídos automaticamente com os dados da vaga):

| Placeholder | Conteúdo |
|---|---|
| `{{titulo}}` | título da vaga |
| `{{empresa}}` | nome do empregador |
| `{{caseNumber}}` | ETA Case Number |
| `{{cidade}}` | cidade e estado |
| `{{pagamento}}` | faixa salarial |
| `{{link}}` | link da vaga no seasonaljobs.dol.gov |

Para criar um modelo novo, basta adicionar outro arquivo na pasta — ele aparece na lista automaticamente.

## Ajustando a busca

Edite o objeto `config` no topo do `index.js`:

```js
const config = {
  visaClass: 'H-2A',         // tipo de visto
  state: 'FLORIDA',          // estado
  experienceRequired: false, // false = sem experiência exigida
  top: 50,                   // tamanho de cada página buscada
};
```

## Observações sobre o SMTP

- **Gmail**: é necessário gerar uma *senha de app* (não use a senha normal da conta). Requer verificação em duas etapas ativada.
- Provedores costumam ter limite diário de envio (o Gmail gratuito fica em torno de 500/dia). Como o envio aqui é um por vez com confirmação manual, dificilmente você chega perto disso.
- `.env`, `curriculo.pdf`, `enviados.json`, `vagas.csv` e `vagas.json` estão no `.gitignore` — não vão para o repositório.
