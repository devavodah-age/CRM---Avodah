# CRM Avodah (Pulso CRM)

CRM próprio inspirado na Kommo, com pipeline visual, automações e integração
com WhatsApp (em progresso).

## Estrutura do repositório

```
/frontend   -> protótipo visual em React (interface, ainda com dados de exemplo)
/backend    -> servidor Node.js + banco de dados (dados reais, API)
```

## Estado atual do projeto

- ✅ Interface visual funcionando (pipeline arrastável, chat, automações) — ver `/frontend`
- ✅ Backend com banco de dados real, login multi-empresa e automações — ver `/backend`
- ⬜ Frontend ainda não está conectado ao backend (usa dados de exemplo fixos)
- ⬜ Integração real com WhatsApp (Cloud API / BSP) ainda não implementada
- ⬜ Hospedagem em produção ainda não configurada
- ⬜ Cobrança/planos ainda não implementados

Veja o `README.md` dentro de `/backend` para instruções de como rodar o
servidor localmente.
