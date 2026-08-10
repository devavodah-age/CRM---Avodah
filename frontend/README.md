# Pulso CRM — Frontend

Projeto React (Vite + Tailwind) pronto pra rodar local ou publicar na Vercel.

## Rodar localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Por padrão ele tenta falar com o backend em
`http://localhost:3001/api` — então deixe o backend rodando também (veja
`/backend/README.md`).

## Publicar na Vercel

1. Entre em vercel.com → **Add New Project** → escolha esse repositório
2. Quando a Vercel perguntar a pasta raiz do projeto (**Root Directory**),
   selecione `frontend` (não a raiz do repositório, senão ela não vai achar
   o `package.json`)
3. Antes de publicar, adicione a variável de ambiente:
   - Nome: `VITE_API_URL`
   - Valor: a URL pública do seu backend em produção (ex:
     `https://seu-backend.up.railway.app/api`)

   **Sem essa variável, o app vai tentar falar com `localhost` e não vai
   funcionar pra ninguém além de você.**
4. Clique em Deploy

## Importante: o backend também precisa estar hospedado

A Vercel só publica o frontend (a parte visual). Ela **não hospeda** o
backend Node.js que está em `/backend`. Pra tudo funcionar de verdade em
produção, você precisa hospedar o backend em outro lugar (Railway, Render,
Fly.io são boas opções gratuitas/baratas pra começar) e apontar o
`VITE_API_URL` pra lá.
