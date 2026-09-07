# Seasonal Jobs Finder

Script Node.js que consome a API do [seasonaljobs.dol.gov](https://seasonaljobs.dol.gov) e filtra vagas H-2A na Flórida que **não exigem experiência prévia**.

## Requisitos

- Node.js 18+ (usa `fetch` nativo, sem dependências externas)
- Yarn

## Como usar

```bash
yarn start
```

Isso vai:
1. Buscar as vagas na API do `seasonaljobs.dol.gov` filtrando por `emp_experience_reqd eq false`
2. Consultar o status de cada vaga na API do `flag.dol.gov` (em lotes de até 30 case numbers por vez)
3. Filtrar mantendo só as vagas com status **"FULL CERTIFICATION"**
4. Exibir uma tabela no terminal com: título, empresa, ETA Case Number, pagamento por hora, cidade/estado, link direto para a vaga e o status
5. Salvar um arquivo `vagas.csv` na raiz do projeto com os mesmos dados (já filtrados)

## Ajustando a busca

Edite o objeto `config` no topo do `index.js`:

```js
const config = {
  visaClass: 'H-2A',       // tipo de visto
  state: 'FLORIDA',        // estado
  experienceRequired: false, // false = sem experiência exigida
  top: 50,                 // quantos resultados por página
  skip: 0,                 // paginação (skip: 50 pega a próxima leva)
};
```

## Paginação

A API retorna no máximo `top` resultados por chamada. Para pegar mais vagas além das primeiras 50, rode de novo ajustando `skip` (ex: `skip: 50`, depois `skip: 100`), ou adapte o script para fazer um loop automático somando `skip` até cobrir o total retornado em `@odata.count`.