# Deploy PEPA SaaS

## Checklist

- Node.js 20+
- `npm install`
- `npm run lint`
- `npm test`
- `npm run build`

## Variaveis de ambiente

- `PEPA_DATA_DIR`
  - opcional
  - diretorio de banco SQLite e uploads
- `PEPA_DATABASE_URL`
  - opcional
  - quando presente, ativa Postgres para sessoes e snapshots
- `PEPA_DATABASE_SSL`
  - opcional
  - use `require` quando o provedor exigir SSL
- `PEPA_DATABASE_SCHEMA`
  - opcional
  - default `public`
  - use `pepa` para separar as tabelas do app em um schema proprio

## Persistencia

- SQLite em `data/pepa.db`
- anexos e arquivos da rodada no mesmo data root
- Com `PEPA_DATABASE_URL`: Postgres para sessoes e rodadas, mantendo uploads em `data`

## Hostinger + GitHub

Recomendacao para o seu caso:

- Hostinger VPS para executar o container
- Supabase Postgres para sessoes e snapshots
- volume persistente local para anexos e arquivos da rodada
- GitHub Actions para publicar por push

Arquivo base:

- [.env.hostinger.example](/Users/tiagotavares/pepa-saas/.env.hostinger.example)

Workflow pronto:

- [deploy-hostinger.yml](/Users/tiagotavares/pepa-saas/.github/workflows/deploy-hostinger.yml)
- [public-healthcheck.yml](/Users/tiagotavares/pepa-saas/.github/workflows/public-healthcheck.yml)
- [public-smoke.yml](/Users/tiagotavares/pepa-saas/.github/workflows/public-smoke.yml)

Secrets esperados no GitHub:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `PEPA_DEPLOY_PATH`
- `PEPA_DATABASE_URL`
- `PEPA_DATABASE_SSL`
- `PEPA_DATABASE_SCHEMA`

## Healthcheck

- `GET /api/health`

## Validacao pos-deploy

1. Confirmar `200` em `/api/health`.
2. Abrir `/demo` e `/login`.
3. Entrar com `admin@pepa.local / demo123`.
4. Confirmar `/api/auth/session`, `/api/pepa/snapshot` e `/api/pepa/history`.
5. Validar `/cotacoes-pepa`, `/validacao-compra-pepa`, `/pedido-final-pepa` e `/logs-pepa`.
6. Fazer uma rodada de smoke com espelho e dois anexos.

## Smoke automatizado

```bash
APP_URL=https://seu-ambiente.example.com npm run smoke:deploy
```

Se o ambiente usar credenciais diferentes, sobrescreva:

```bash
PEPA_SMOKE_EMAIL=operacao@example.com PEPA_SMOKE_PASSWORD=segredo APP_URL=https://seu-ambiente.example.com npm run smoke:deploy
```

## Backup e restauracao

Scripts operacionais:

- [backup-pepa-data.sh](/Users/tiagotavares/homologation/backup-pepa-data.sh)
- [restore-pepa-data.sh](/Users/tiagotavares/homologation/restore-pepa-data.sh)

Sugestao de rotina no VPS:

- backup diario do diretorio `data`
- retencao inicial de 14 dias
- restauracao com snapshot previo para rollback

## Inicio em producao

```bash
npm run build
npm run start
```
