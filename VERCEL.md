# Publicação na Vercel com Neon

O código inclui duas formas de execução: `npm run web` mantém o uso local; `api/index.js` atende a versão Vercel sem usar arquivos locais para dados mutáveis. Consulte `MOBILE.md` para instalar o app na tela inicial.

## Estado desta entrega

O código, os assets móveis e os testes estão preparados. Nenhum recurso Vercel/Neon foi criado, nenhum dado pessoal foi transferido e nenhuma publicação foi feita. O banco real, o SMTP na hospedagem e a instalação em telefone físico ainda precisam ser validados.

## Configurar

1. Use um projeto **Vercel Hobby** para uso pessoal elegível e conecte um banco **Neon Free** pelo Marketplace/Storage. Confira os limites e o plano antes de confirmar; não selecione um trial Pro ou plano pago por engano.
2. Importe o repositório na Vercel como **Other**. O arquivo `vercel.json` define instalação, build, função e rotas. Use Node.js 24. O build gera `dist` somente com assets públicos; a raiz é servida pela função com tela de login.
3. Defina as variáveis privadas:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Conexão Postgres do Neon, fornecida pela integração |
| `PUBLIC_ORIGIN` | URL HTTPS estável do projeto, sem barra final, ex.: `https://seu-projeto.vercel.app` |
| `APP_PASSWORD` | Senha exclusiva de pelo menos 16 caracteres |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Configurações SMTP já utilizadas |
| `FROM_NAME` | Nome do remetente |

Configure em Production. URLs de preview diferentes são recusadas por padrão; isso evita abrir a mesma conta em origens não previstas. Não use `HOST`, `DATA_DIR` ou `CURRICULO_FILE` na função Vercel; o currículo fica no banco privado.

4. Inicialize o banco e importe os dados antes de usar o app. No computador, configure `DATABASE_URL` somente em `.env` (não em código), confirme que aponta para o banco correto e rode:

```powershell
npm run cloud:import -- --confirm
```

Esse comando transfere seus templates, currículo, cache, histórico e tentativas pendentes para o Neon. Não envia e-mails e não sobrescreve registros de configuração já existentes. Aceita currículo até 3 MB. O SMTP permanece nas variáveis de ambiente da Vercel. O comando deve ser executado conscientemente pois contém seus dados pessoais.

5. Publique/republique. Abra o endereço HTTPS no navegador, entre, confira templates e histórico, faça uma consulta e valide o envio para um destinatário de teste autorizado antes de usar em candidaturas reais.
6. No celular, abra o mesmo endereço. Android/Chrome: **Instalar app**; iPhone/Safari: **Compartilhar → Adicionar à Tela de Início**.

## Dados e confiabilidade

- Cache, sessões, currículo, templates, histórico e flags do WhatsApp ficam na tabela privada `seasonal_data`.
- A API exige login e token da sessão para alterações. Cookies usam HTTPS, HttpOnly e SameSite.
- Reserva única por candidatura evita duplicação entre execuções. Se o SMTP retornar erro ou a função for interrompida, a candidatura fica pendente até conferir o provedor; não apague uma reserva sem verificar se o e-mail foi entregue.
- Não execute o fluxo antigo de envio local simultaneamente com o fluxo em nuvem: eles mantêm históricos separados após a importação. Para computador e telefone compartilharem o histórico, use a URL publicada em ambos.
- As flags anteriores de `localStorage` não migram pelo script do terminal. Na nuvem, novas marcações são compartilhadas por telefone. Recarregue o outro dispositivo para buscar alterações.
- As consultas têm limite de execução de 300 segundos. Uma consulta que exceda o limite falha; a última consulta salva continua disponível. Volumes maiores poderão exigir paginação em etapas ou tarefas assíncronas.
- O banco é acessado somente pela função e pelo script privado, nunca pelo navegador. O currículo não tem link público.
- A imagem Docker é uma alternativa para VPS, não é usada no deploy Vercel.

## Custos

É possível começar nos planos gratuitos, sujeito à elegibilidade e às cotas. Não há garantia de capacidade ilimitada. Domínio próprio é opcional. As condições do seu provedor SMTP continuam valendo.

- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/marketplace-storage
- https://neon.com/pricing
- https://vercel.com/docs/functions/limitations

## Testes

`npm test` executa os testes locais e a simulação de persistência entre instâncias. Esses testes não substituem a validação real do Neon, da Vercel ou do SMTP. `npm run build` gera os arquivos públicos sem dados privados.
