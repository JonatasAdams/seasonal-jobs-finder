# Seasonal Jobs Finder

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
