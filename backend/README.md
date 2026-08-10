# Pulso CRM — Backend

Esse é o servidor de verdade do seu CRM. Diferente do protótipo visual que
te mostrei antes, aqui os dados ficam salvos de verdade num banco de dados
(o arquivo `pulso.db`, que é criado automaticamente na primeira vez que
você roda o servidor).

## O que já funciona

- **Cadastro de empresas (multi-tenant)**: cada empresa que se cadastra vira
  uma conta separada. Uma empresa nunca vê os dados de outra.
- **Login** com email e senha (usando token JWT, o "crachá digital" que
  autentica cada requisição).
- **Leads**: criar, listar e mover entre etapas do funil (novo → qualificação
  → proposta → negociação → ganho/perdido).
- **Automações**: quando um lead muda de etapa, o sistema confere se existe
  uma automação ligada pra aquela etapa e, se sim, registra a mensagem
  automática — igual ao protótipo, só que agora fica gravado pra sempre.
- **Mensagens**: cada lead tem um histórico de conversa salvo no banco.

## O que AINDA NÃO faz (próximos passos)

- Não manda mensagem de WhatsApp de verdade ainda (fica só salvo no banco).
  Isso é o próximo passo: plugar a Cloud API da Meta ali no arquivo
  `src/routes/leads.js`, na rota que envia mensagem.
- Não tem cobrança/planos.
- Não está hospedado em lugar nenhum ainda — só roda no seu computador.
- Não tem interface visual conectada ainda (isso é o protótipo em React
  que te mandei antes; o próximo passo é fazer ele conversar com esse
  backend em vez de usar dados fixos).

## Como rodar no seu computador

Você vai precisar ter o **Node.js** instalado (baixe em nodejs.org, versão
18 ou mais nova).

1. Abra o terminal dentro da pasta `pulso-crm-backend`
2. Instale as dependências (só precisa fazer isso uma vez):
   ```
   npm install
   ```
3. Ligue o servidor:
   ```
   npm start
   ```
4. Você vai ver: `Pulso CRM backend rodando em http://localhost:3001`

## Como testar se está funcionando

Com o servidor ligado, abra outro terminal e teste o cadastro:

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Minha Empresa","userName":"Seu Nome","email":"[email protected]","password":"123456"}'
```

Isso devolve um `token`. Guarde ele — é o que você usa pra criar leads:

```bash
curl -X POST http://localhost:3001/api/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer COLE_O_TOKEN_AQUI" \
  -d '{"name":"Cliente Teste","company_name":"Empresa X","phone":"11999998888","value":5000}'
```

## Estrutura de pastas (o que cada arquivo faz)

```
pulso-crm-backend/
  src/
    server.js          -> liga o servidor e junta todas as rotas
    db.js               -> define as tabelas do banco de dados
    middleware/auth.js  -> confere se a pessoa está logada
    routes/auth.js      -> cadastro e login
    routes/leads.js     -> criar/listar/mover leads + disparo de automações
    routes/automations.js -> criar/listar/ligar/desligar automações
  pulso.db              -> o banco de dados em si (criado automaticamente)
```

## Próximo passo recomendado

Conectar esse backend ao protótipo visual (o arquivo `pulso-crm.jsx`), pra
você já enxergar tudo funcionando junto: interface bonita + dados salvos
de verdade. Depois disso entra a integração real com o WhatsApp e, por
último, a hospedagem pra outras pessoas acessarem pela internet.
