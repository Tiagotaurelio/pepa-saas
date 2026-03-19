# PEPA SaaS

Plataforma de cotacao, validacao de compra e exportacao de pedido final com trilha de auditoria por rodada.

## Rodando localmente

```bash
npm install
npm run dev
```

Por padrao o app sobe em `http://localhost:3001`.

## Credenciais demo

- Email: `admin@pepa.local`
- Senha: `demo123`

## Comandos uteis

```bash
npm run lint
npm test
npm run build
APP_URL=http://127.0.0.1:3001 npm run smoke:deploy
```

## Rotas principais

- `/login`
- `/cotacoes-pepa`
- `/validacao-compra-pepa`
- `/pedido-final-pepa`
- `/logs-pepa`

## Healthcheck

Use `GET /api/health` para validar que a aplicacao esta respondendo.

Exemplo de resposta:

```json
{
  "ok": true,
  "app": "pepa-saas",
  "storage": "sqlite",
  "timestamp": "2026-03-18T00:00:00.000Z"
}
```

## Persistencia

- O app usa SQLite em `data/pepa.db`
- Uploads e anexos ficam no diretorio `data`
- Em testes, `PEPA_DATA_DIR` isola banco e arquivos
- Com `PEPA_DATABASE_URL`, o app passa a usar Postgres para sessoes e rodadas
- `PEPA_DATABASE_SCHEMA` permite isolar o PEPA em um schema proprio, como `pepa`

## Fluxo demo

1. Abrir `/login` e entrar com o usuario demo.
2. Subir um espelho do Flex e anexos de fornecedor em `/cotacoes-pepa`.
3. Revisar consolidacao e overrides em `/validacao-compra-pepa`.
4. Fechar a rodada e exportar em `/pedido-final-pepa`.
5. Conferir eventos em `/logs-pepa`.

## Smoke test rapido

1. Confirmar `200` em `/api/auth/session`.
2. Validar `/api/pepa/snapshot` e `/api/pepa/history`.
3. Validar as paginas autenticadas do fluxo.
4. Confirmar exportacao `csv` ou `xlsx` ao final.

## Smoke automatizado

Use:

```bash
APP_URL=https://seu-ambiente.example.com npm run smoke:deploy
```

Variaveis opcionais:

- `PEPA_SMOKE_EMAIL`
- `PEPA_SMOKE_PASSWORD`

## Backup do PEPA

- Backup versionado no VPS: `/opt/apps/backups/pepa`
- Script de backup: [backup-pepa-data.sh](/Users/tiagotavares/homologation/backup-pepa-data.sh)
- Script de restauracao: [restore-pepa-data.sh](/Users/tiagotavares/homologation/restore-pepa-data.sh)

Exemplo manual no servidor:

```bash
sh /opt/apps/homologation/backup-pepa-data.sh
```

Exemplo de restauracao:

```bash
CONFIRM_RESTORE=yes sh /opt/apps/homologation/restore-pepa-data.sh /opt/apps/backups/pepa/pepa-data-YYYYMMDD-HHMMSS.tar.gz
```

## Monitoramento

- Healthcheck publico: `https://pepa.tavarestech.cloud/api/health`
- Workflow agendado de healthcheck: [public-healthcheck.yml](/Users/tiagotavares/pepa-saas/.github/workflows/public-healthcheck.yml)
- Workflow agendado de smoke funcional: [public-smoke.yml](/Users/tiagotavares/pepa-saas/.github/workflows/public-smoke.yml)

## Observacoes

- O app esta em `Next 16`
- `lint`, `test` e `build` ja foram validados localmente
- Existe cobertura automatizada de API, upload, exportacao e UI operacional
- Em Hostinger/Supabase, prefira string `pooler` e `PEPA_DATABASE_SSL=require`
