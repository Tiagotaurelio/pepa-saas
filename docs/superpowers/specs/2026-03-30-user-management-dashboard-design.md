# Design: Cadastro de Usuários + Dashboard de Performance

**Data:** 2026-03-30
**Status:** Aprovado

## Contexto

O sistema PEPA tem apenas um usuário demo e sem diferenciação de perfil. Para uso em produção com múltiplos compradores, é necessário:
1. Gestão de usuários com perfis de acesso (Admin / Comprador)
2. Dashboard para acompanhar performance e economia de cada comprador

## Sub-projeto 1: Perfis de Acesso e Cadastro de Usuários

### Perfis

- **Admin**: acesso total — cria/edita/desativa/reativa usuários, vê dashboard, faz cotações, validações, tudo
- **Comprador (buyer)**: faz cotações, validações, pedido final — não acessa cadastro de usuários nem dashboard de performance

### Alterações no banco de dados

**Tabela `users` — novas colunas:**
- `role` TEXT NOT NULL DEFAULT 'buyer' — valores: `admin` ou `buyer`
- `active` BOOLEAN NOT NULL DEFAULT true — desativado = não consegue fazer login
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

**Tabela `pepa_rounds` — nova coluna:**
- `user_id` TEXT — referência ao usuário que criou a rodada (para rastreio de performance)

**Migração:**
- Usuário `admin@pepa.local` existente recebe `role = 'admin'`, `active = true`
- Coluna `user_id` em `pepa_rounds` aceita NULL (rodadas antigas não têm usuário associado)

### Tela de Configurações — Aba Usuários

**Rota:** `/configuracoes` (página existente, ganha sistema de abas)

**Abas:**
- **Empresa** — editar nome da empresa (já existe)
- **Usuários** — gestão de usuários (nova, visível só para Admin)

**Aba Usuários — conteúdo:**
- Tabela: Nome, Email, Perfil (Admin/Comprador), Status (Ativo/Inativo), Data de criação
- Botão "Novo usuário" abre formulário inline
- Cada linha: botões Editar, Desativar/Reativar

**Formulário de criação/edição:**
- Campos: Nome, Email, Senha (obrigatória na criação, opcional na edição = redefinir), Perfil (select: Admin/Comprador)
- Validações: email único dentro do tenant, senha mínima 6 caracteres
- Admin não pode desativar a si mesmo

### APIs

**`POST /api/auth/users`** — criar usuário (Admin only)
- Body: `{ name, email, password, role }`
- Retorna: `{ user: { id, name, email, role, active, createdAt } }`

**`PUT /api/auth/users`** — editar usuário (Admin only)
- Body: `{ userId, name?, email?, password?, role? }`

**`POST /api/auth/users/toggle-status`** — desativar/reativar (Admin only)
- Body: `{ userId }`
- Alterna `active` true/false
- Impede desativar a si mesmo

**`GET /api/auth/users`** — listar usuários do tenant (Admin only)
- Retorna: `{ users: [...] }`

### Alteração no login

- `signIn()` verifica se `active = true` antes de criar sessão
- Se inativo, retorna erro "Conta desativada. Contate o administrador."

### Menu lateral dinâmico

- Componente de layout verifica `role` da sessão
- Admin vê: Painel Performance, Cotações, Validação, Pedido Final, Auditoria, Configurações (com aba Usuários)
- Comprador vê: Cotações, Validação, Pedido Final, Auditoria, Configurações (sem aba Usuários)

## Sub-projeto 2: Dashboard de Performance

### Rota

**`/painel-performance`** — primeiro item no menu lateral, visível só para Admin.

### Filtros (topo da página)

- Filtros rápidos: Hoje, Esta semana, Este mês, Últimos 3 meses, Este ano
- Seletor personalizado: data início + data fim
- Filtro por comprador: dropdown com todos os usuários do tenant

### Cards de resumo (4 cards em linha)

1. **Total de cotações** no período
2. **Total de itens validados** (rodadas fechadas)
3. **Economia total (R$)** — soma de (preço Flex - preço cotado aceito) × quantidade, quando preço cotado < preço Flex
4. **Média de economia por cotação (%)** — média das diferenças percentuais

Cada card:
- Fundo branco, sombra suave, cantos arredondados (`rounded-[32px]`)
- Ícone colorido (azul/verde)
- Número grande em destaque
- Indicador de variação vs período anterior ("+12% vs mês passado")

### Gráficos (Recharts)

1. **Gráfico de área com gradiente** — evolução da economia ao longo do tempo (eixo X = datas, Y = economia R$)
2. **Gráfico de barras horizontal** — ranking de compradores por economia total

Estilo:
- Cores da paleta do sistema (azul marinho brand-blue + verde positivo + vermelho negativo)
- Tooltips interativos
- Transições com Framer Motion

### Tabela de performance por comprador

| Comprador | Cotações | Itens validados | Rodadas fechadas | Economia (R$) | Economia (%) |
|-----------|----------|-----------------|------------------|---------------|--------------|

- Linhas com hover suave
- Badges coloridos: verde (acima da média), amarelo (na média), vermelho (abaixo)
- Sparklines mini mostrando tendência

### API

**`GET /api/pepa/dashboard?startDate=&endDate=&userId=`** — dados do dashboard (Admin only)

Retorna:
```json
{
  "summary": {
    "totalRounds": 15,
    "totalItemsValidated": 342,
    "totalSavings": 4521.30,
    "avgSavingsPercent": 8.2,
    "previousPeriodComparison": {
      "roundsDiff": "+20%",
      "savingsDiff": "+15%"
    }
  },
  "byUser": [
    {
      "userId": "...",
      "userName": "Comprador A",
      "rounds": 8,
      "itemsValidated": 180,
      "closedRounds": 6,
      "savings": 2800.50,
      "savingsPercent": 9.1,
      "trend": [100, 200, 450, 800, 1200, 2800]
    }
  ],
  "timeline": [
    { "date": "2026-03-01", "savings": 500, "rounds": 3 },
    { "date": "2026-03-08", "savings": 1200, "rounds": 5 }
  ]
}
```

### De onde vêm os dados

- `pepa_rounds.created_at` + `pepa_rounds.user_id` → cotações por usuário/período
- `snapshot_json.comparisonRows` → preço Flex vs cotado → cálculo de economia
- `snapshot_json.comparisonRows[].itemStatus` → itens validados
- `pepa_rounds.snapshot_json.latestRound.status` → rodadas fechadas

## Estrutura de arquivos

```
lib/
├── db.ts                    (MODIFY: add role, active, created_at to users; user_id to pepa_rounds)
├── auth.ts                  (MODIFY: check active on login; expose role in session)
├── user-management.ts       (CREATE: CRUD de usuários)
├── dashboard-store.ts       (CREATE: queries de performance)

app/
├── api/auth/
│   ├── users/route.ts       (CREATE: GET + POST)
│   └── users/toggle-status/route.ts (CREATE: POST)
├── api/pepa/
│   └── dashboard/route.ts   (CREATE: GET)
├── configuracoes/page.tsx   (MODIFY: adicionar abas + aba Usuários)
├── painel-performance/page.tsx (CREATE: dashboard)
├── layout.tsx               (MODIFY: menu dinâmico por role)

components/
├── user-form.tsx            (CREATE: formulário criar/editar usuário)
├── dashboard-cards.tsx      (CREATE: cards de resumo)
├── dashboard-charts.tsx     (CREATE: gráficos Recharts)
├── performance-table.tsx    (CREATE: tabela de performance)
```

## O que NÃO muda

- Fluxo de cotações, validação, pedido final
- Parser de PDF
- Sistema de login/logout (só adiciona verificação de active)
- Lógica de matching e comparação
