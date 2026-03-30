# User Management + Performance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user CRUD with Admin/Buyer roles in Configurações, and a performance dashboard at /painel-performance visible only to Admins.

**Architecture:** Extend the existing users table with role/active/created_at columns. Add user_id to pepa_rounds for tracking. New API routes for user management and dashboard data. Frontend uses existing patterns (client components, fetch, Tailwind). Dashboard uses Recharts (already installed) + Framer Motion.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, Recharts, Framer Motion, SQLite/PostgreSQL (dual support via lib/db.ts)

**Spec:** `docs/superpowers/specs/2026-03-30-user-management-dashboard-design.md`

---

## File Structure

```
lib/
├── db.ts                         (MODIFY: add role/active/created_at to users, user_id to pepa_rounds, new user CRUD functions)
├── auth.ts                       (MODIFY: add role to session, check active on login)
├── navigation.ts                 (MODIFY: add role-based nav items)
├── pepa-store.ts                 (MODIFY: accept userId in persistPepaUploadRound)
├── dashboard-store.ts            (CREATE: dashboard data queries)

app/
├── layout.tsx                    (MODIFY: pass userRole to AppShell)
├── api/auth/
│   ├── login/route.ts            (MODIFY: return error if user inactive)
│   ├── session/route.ts          (MODIFY: include role in session response)
│   ├── users/route.ts            (CREATE: GET list + POST create)
│   └── users/toggle-status/route.ts (CREATE: POST toggle active)
├── api/pepa/
│   ├── upload/route.ts           (MODIFY: pass userId to persistPepaUploadRound)
│   └── dashboard/route.ts        (CREATE: GET dashboard data)
├── configuracoes/page.tsx        (MODIFY: add tabs + users tab)
├── painel-performance/page.tsx   (CREATE: dashboard page)

components/
├── app-shell.tsx                 (MODIFY: accept userRole, filter nav items)
├── user-form.tsx                 (CREATE: inline user create/edit form)
├── dashboard-cards.tsx           (CREATE: summary cards with animations)
├── dashboard-charts.tsx          (CREATE: Recharts area + bar charts)
├── performance-table.tsx         (CREATE: user performance table)
```

---

### Task 1: Database schema changes (role, active, created_at, user_id)

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Add columns to SQLite schema**

In `initializeSqliteSchema()`, after the existing CREATE TABLE users statement, add ALTER TABLE statements that add the new columns. Use `ALTER TABLE ... ADD COLUMN` with IF NOT EXISTS pattern (catch errors for existing columns).

Add after the existing schema creation (around line 131):

```typescript
// Add new columns for user management (idempotent - ignores if already exist)
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'buyer'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE pepa_rounds ADD COLUMN user_id TEXT DEFAULT NULL"); } catch {}

// Set demo user as admin
db.exec("UPDATE users SET role = 'admin' WHERE email = 'admin@pepa.local'");
```

- [ ] **Step 2: Add columns to PostgreSQL schema**

In `ensurePostgresReady()`, after the existing CREATE TABLE statements, add ALTER TABLE statements:

```sql
ALTER TABLE ${schema}.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'buyer';
ALTER TABLE ${schema}.users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ${schema}.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ${schema}.pepa_rounds ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT NULL;
UPDATE ${schema}.users SET role = 'admin' WHERE email = 'admin@pepa.local' AND role = 'buyer';
```

- [ ] **Step 3: Update seedSqlite to set admin role on demo user**

In `seedSqlite()`, after the INSERT INTO users statement, ensure the demo user has `role = 'admin'`.

The existing INSERT already creates the user. Add after it:

```typescript
db.exec("UPDATE users SET role = 'admin', active = 1, created_at = datetime('now') WHERE email = 'admin@pepa.local'");
```

- [ ] **Step 4: Update AuthSession type to include role**

Change the `AuthSession` type (around line 35) to add role:

```typescript
export type AuthSession = {
  token: string;
  userId: string;
  tenantId: string;
  userName: string;
  userEmail: string;
  tenantName: string;
  expiresAt: string;
  role: "admin" | "buyer";
};
```

- [ ] **Step 5: Update createSession to check active and return role**

In `createSession()`, add check for `active` column and include `role` in the query and returned session.

For SQLite path, change the user query to:
```sql
SELECT u.id, u.name, u.email, u.password_hash, u.tenant_id, t.name as tenant_name, u.role, u.active
FROM users u JOIN tenants t ON u.tenant_id = t.id
WHERE u.email = ?
```

Add after password check:
```typescript
if (!userRow.active) return null; // Inactive user cannot login
```

Add `role` to the returned AuthSession object:
```typescript
role: (userRow.role as "admin" | "buyer") ?? "buyer"
```

Do the same for the PostgreSQL path.

- [ ] **Step 6: Update getSession to return role**

In `getSession()`, add `u.role` to the SELECT query and include it in the returned AuthSession.

SQLite query becomes:
```sql
SELECT s.token, s.user_id, s.tenant_id, s.expires_at, u.name as user_name, u.email as user_email, t.name as tenant_name, u.role
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN tenants t ON s.tenant_id = t.id
WHERE s.token = ?
```

Add `role: row.role ?? "buyer"` to the returned session object.

Do the same for PostgreSQL path.

- [ ] **Step 7: Add user CRUD functions**

Add these new exported functions to `lib/db.ts`:

```typescript
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "buyer";
  active: boolean;
  createdAt: string;
};

export async function listUsers(tenantId: string): Promise<UserRow[]> {
  // Query users table filtered by tenant_id, ordered by created_at desc
  // Return array of UserRow
}

export async function createUser(params: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "buyer";
}): Promise<UserRow> {
  // INSERT into users with hashed password, return new UserRow
  // Throw if email already exists
}

export async function updateUser(params: {
  userId: string;
  tenantId: string;
  name?: string;
  email?: string;
  password?: string;
  role?: "admin" | "buyer";
}): Promise<void> {
  // UPDATE users SET only provided fields WHERE id = ? AND tenant_id = ?
}

export async function toggleUserActive(params: {
  userId: string;
  tenantId: string;
}): Promise<{ active: boolean }> {
  // Toggle active column, return new value
  // Delete all sessions for user if deactivating
}
```

Implement each function with dual SQLite/PostgreSQL support following the existing pattern in db.ts.

- [ ] **Step 8: Update savePepaSnapshot to accept userId**

Add optional `userId` parameter to `savePepaSnapshot()`:

```typescript
export async function savePepaSnapshot(params: {
  id: string;
  tenantId: string;
  createdAt: string;
  mirrorFileName: string;
  supplierFilesCount: number;
  snapshot: PepaSnapshot;
  userId?: string;
}): Promise<void> {
  // Add user_id to INSERT statement
}
```

- [ ] **Step 9: Run tests to verify nothing breaks**

```bash
npx vitest run
```

Expected: All existing tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add role/active columns to users, user_id to pepa_rounds, user CRUD functions"
```

---

### Task 2: Auth layer changes

**Files:**
- Modify: `lib/auth.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/session/route.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Auth.ts already works** — `getCurrentSession()` returns the updated AuthSession with role from Task 1. No changes needed to auth.ts.

- [ ] **Step 2: Update login route to handle inactive users**

In `app/api/auth/login/route.ts`, the `signIn()` function already returns null for inactive users (from Task 1). But we should give a specific error message. Change the login handler:

```typescript
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; password?: string };

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Credenciais invalidas." }, { status: 400 });
  }

  const session = await signIn(body.email, body.password);
  if (!session) {
    return NextResponse.json({ error: "Email ou senha invalidos. Caso sua conta esteja desativada, contate o administrador." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt)
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Update session route to include role**

`app/api/auth/session/route.ts` already returns the full session object which now includes role. No changes needed.

- [ ] **Step 4: Update layout.tsx to pass role to AppShell**

```typescript
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();

  return (
    <html lang="pt-BR">
      <body>
        <AppShell
          tenantName={session?.tenantName ?? null}
          userName={session?.userName ?? null}
          userRole={session?.role ?? null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts app/api/auth/login/route.ts app/layout.tsx
git commit -m "feat: pass user role to AppShell, improve inactive user login message"
```

---

### Task 3: Navigation and AppShell role filtering

**Files:**
- Modify: `lib/navigation.ts`
- Modify: `components/app-shell.tsx`

- [ ] **Step 1: Update navigation.ts with role-based items**

```typescript
export type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
};

export const navigation: NavItem[] = [
  { href: "/painel-performance", label: "Painel Performance", adminOnly: true },
  { href: "/cotacoes-pepa", label: "Cotacoes" },
  { href: "/validacao-compra-pepa", label: "Validacao de Compra" },
  { href: "/pedido-final-pepa", label: "Pedido Final" },
  { href: "/logs-pepa", label: "Auditoria" },
  { href: "/configuracoes", label: "Configuracoes" }
];
```

- [ ] **Step 2: Update AppShell to accept userRole and filter navigation**

Add `userRole` to AppShellProps:

```typescript
type AppShellProps = {
  children: ReactNode;
  tenantName: string | null;
  userName: string | null;
  userRole: "admin" | "buyer" | null;
};
```

Update the component to filter nav items:

```typescript
export function AppShell({ children, tenantName, userName, userRole }: AppShellProps) {
  // ... existing code ...

  const visibleNavigation = navigation.filter(
    (item) => !item.adminOnly || userRole === "admin"
  );

  // In the nav section, replace `navigation.map` with `visibleNavigation.map`
```

- [ ] **Step 3: Commit**

```bash
git add lib/navigation.ts components/app-shell.tsx
git commit -m "feat: role-based navigation, Painel Performance visible only to admin"
```

---

### Task 4: User management API routes

**Files:**
- Create: `app/api/auth/users/route.ts`
- Create: `app/api/auth/users/toggle-status/route.ts`

- [ ] **Step 1: Create GET + POST users route**

```typescript
// app/api/auth/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { listUsers, createUser } from "@/lib/db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const users = await listUsers(session.tenantId);
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json()) as { name?: string; email?: string; password?: string; role?: string };
  if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 6) {
    return NextResponse.json({ error: "Nome, email e senha (min. 6 caracteres) sao obrigatorios." }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "buyer";

  try {
    const user = await createUser({
      tenantId: session.tenantId,
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password,
      role
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar usuario." },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json()) as { userId?: string; name?: string; email?: string; password?: string; role?: string };
  if (!body.userId) return NextResponse.json({ error: "userId obrigatorio." }, { status: 400 });

  try {
    const { updateUser } = await import("@/lib/db");
    await updateUser({
      userId: body.userId,
      tenantId: session.tenantId,
      name: body.name?.trim() || undefined,
      email: body.email?.trim().toLowerCase() || undefined,
      password: body.password && body.password.length >= 6 ? body.password : undefined,
      role: body.role === "admin" || body.role === "buyer" ? body.role : undefined
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar usuario." },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: Create toggle-status route**

```typescript
// app/api/auth/users/toggle-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { toggleUserActive } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json()) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId obrigatorio." }, { status: 400 });
  if (body.userId === session.userId) return NextResponse.json({ error: "Voce nao pode desativar sua propria conta." }, { status: 400 });

  try {
    const result = await toggleUserActive({ userId: body.userId, tenantId: session.tenantId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao alterar status." },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/users/
git commit -m "feat: add user management API routes (CRUD + toggle status)"
```

---

### Task 5: Configurações page with tabs + Users tab

**Files:**
- Modify: `app/configuracoes/page.tsx`
- Create: `components/user-form.tsx`

- [ ] **Step 1: Create user-form.tsx component**

Inline form component for creating/editing users. Fields: name, email, password, role (select). Shows save/cancel buttons.

```typescript
// components/user-form.tsx
"use client";

import { useState } from "react";

type UserFormProps = {
  mode: "create" | "edit";
  initial?: { userId: string; name: string; email: string; role: string };
  onSave: () => void;
  onCancel: () => void;
};

export function UserForm({ mode, initial, onSave, onCancel }: UserFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initial?.role ?? "buyer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = "/api/auth/users";
    const method = mode === "create" ? "POST" : "PUT";
    const body = mode === "create"
      ? { name, email, password, role }
      : { userId: initial?.userId, name, email, password: password || undefined, role };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar."); return; }
      onSave();
    } catch { setError("Erro ao salvar."); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue" placeholder="Nome completo" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue" placeholder="email@empresa.com" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Senha {mode === "edit" && <span className="text-slate-400">(deixe vazio para manter)</span>}
          </label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "create" ? 6 : undefined} required={mode === "create"}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue" placeholder="Min. 6 caracteres" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Perfil</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue">
            <option value="buyer">Comprador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {saving ? "Salvando..." : mode === "create" ? "Criar usuario" : "Salvar alteracoes"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-full bg-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-300">
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Rewrite configuracoes/page.tsx with tabs**

Full rewrite of the page to support Empresa + Usuários tabs. The Usuários tab is only visible if the current user is admin (check via `/api/auth/session`).

```typescript
// app/configuracoes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserForm } from "@/components/user-form";

type UserRow = { id: string; name: string; email: string; role: string; active: boolean; createdAt: string };

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"empresa" | "usuarios">("empresa");
  const [userRole, setUserRole] = useState<string | null>(null);

  // Empresa state
  const [companyName, setCompanyName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showForm, setShowForm] = useState<null | "create" | UserRow>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch session to check role
    fetch("/api/auth/session").then(r => r.json()).then(d => {
      setUserRole(d.session?.role ?? null);
    });
    // Fetch company name
    fetch("/api/pepa/settings").then(r => r.json()).then(d => {
      setCompanyName(d.name ?? "");
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function loadUsers() {
    setUsersLoading(true);
    const res = await fetch("/api/auth/users");
    if (res.ok) { const d = await res.json(); setUsers(d.users ?? []); }
    setUsersLoading(false);
  }

  useEffect(() => { if (activeTab === "usuarios" && userRole === "admin") loadUsers(); }, [activeTab, userRole]);

  async function handleSaveEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/pepa/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: companyName }) });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? "Erro ao salvar."); }
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); window.dispatchEvent(new CustomEvent("company-name-updated", { detail: { name: companyName.trim() } })); router.refresh(); }
    } catch { setError("Erro ao salvar."); }
    finally { setSaving(false); }
  }

  async function handleToggleStatus(userId: string) {
    setTogglingId(userId);
    await fetch("/api/auth/users/toggle-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    await loadUsers();
    setTogglingId(null);
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-sm text-slate-400">Carregando...</div>;

  const tabs = [
    { key: "empresa" as const, label: "Empresa" },
    ...(userRole === "admin" ? [{ key: "usuarios" as const, label: "Usuarios" }] : [])
  ];

  return (
    <div className="max-w-4xl">
      <h2 className="mb-1 text-xl font-semibold">Configuracoes</h2>
      <p className="mb-6 text-sm text-slate-500">Gerencie as informacoes da sua empresa e usuarios.</p>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-2xl bg-slate-100 p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${activeTab === t.key ? "bg-white text-brand-ink shadow-sm" : "text-slate-500 hover:text-brand-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Empresa Tab */}
      {activeTab === "empresa" && (
        <form onSubmit={handleSaveEmpresa} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Empresa</h3>
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="companyName">Nome da empresa</label>
            <input id="companyName" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" placeholder="Nome da empresa" />
          </div>
          {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
          {saved && <p className="mb-4 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">Salvo com sucesso.</p>}
          <button type="submit" disabled={saving || !companyName.trim()}
            className="rounded-full bg-brand-blue px-6 py-2.5 text-sm font-medium text-white shadow-panel hover:opacity-90 disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}

      {/* Usuarios Tab */}
      {activeTab === "usuarios" && userRole === "admin" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Usuarios</h3>
            {!showForm && (
              <button onClick={() => setShowForm("create")}
                className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white hover:opacity-90">
                Novo usuario
              </button>
            )}
          </div>

          {showForm && (
            <UserForm
              mode={showForm === "create" ? "create" : "edit"}
              initial={showForm !== "create" ? { userId: showForm.id, name: showForm.name, email: showForm.email, role: showForm.role } : undefined}
              onSave={() => { setShowForm(null); loadUsers(); }}
              onCancel={() => setShowForm(null)}
            />
          )}

          {usersLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">Carregando...</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Perfil</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-slate-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {u.role === "admin" ? "Admin" : "Comprador"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {u.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setShowForm(u)} className="text-xs text-brand-blue hover:underline">Editar</button>
                          <button onClick={() => handleToggleStatus(u.id)} disabled={togglingId === u.id}
                            className={`text-xs hover:underline ${u.active ? "text-red-500" : "text-green-600"}`}>
                            {togglingId === u.id ? "..." : u.active ? "Desativar" : "Reativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/configuracoes/page.tsx components/user-form.tsx
git commit -m "feat: add Users tab to Configurações with create/edit/toggle status"
```

---

### Task 6: Wire userId into upload flow

**Files:**
- Modify: `app/api/pepa/upload/route.ts`
- Modify: `lib/pepa-store.ts`

- [ ] **Step 1: Pass userId from upload route to persistPepaUploadRound**

In `app/api/pepa/upload/route.ts`, pass `session.userId`:

```typescript
const snapshot = await persistPepaUploadRound({
  tenantId: session.tenantId,
  userId: session.userId,
  mirrorFile: { ... },
  supplierFiles: [ ... ]
});
```

- [ ] **Step 2: Update persistPepaUploadRound signature and pass to savePepaSnapshot**

In `lib/pepa-store.ts`, add `userId` to the params type and pass it through:

```typescript
export async function persistPepaUploadRound(params: {
  tenantId: string;
  userId?: string;
  mirrorFile: UploadFileInput;
  supplierFiles: UploadFileInput[];
}): Promise<PepaSnapshot> {
  // ... existing code ...

  await savePepaSnapshot({
    id: roundId,
    tenantId: params.tenantId,
    createdAt,
    mirrorFileName: params.mirrorFile.name,
    supplierFilesCount: params.supplierFiles.length,
    snapshot,
    userId: params.userId
  });
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add app/api/pepa/upload/route.ts lib/pepa-store.ts
git commit -m "feat: track userId on uploaded rounds for performance dashboard"
```

---

### Task 7: Dashboard data API

**Files:**
- Create: `lib/dashboard-store.ts`
- Create: `app/api/pepa/dashboard/route.ts`

- [ ] **Step 1: Create dashboard-store.ts**

```typescript
// lib/dashboard-store.ts
import "server-only";
import { getPepaStorageMode } from "@/lib/db";

export type DashboardSummary = {
  totalRounds: number;
  totalItemsValidated: number;
  totalSavings: number;
  avgSavingsPercent: number;
  previousPeriodComparison: {
    roundsDiff: string;
    savingsDiff: string;
  };
};

export type UserPerformance = {
  userId: string;
  userName: string;
  rounds: number;
  itemsValidated: number;
  closedRounds: number;
  savings: number;
  savingsPercent: number;
  trend: number[];
};

export type TimelinePoint = {
  date: string;
  savings: number;
  rounds: number;
};

export type DashboardData = {
  summary: DashboardSummary;
  byUser: UserPerformance[];
  timeline: TimelinePoint[];
};

export async function getDashboardData(params: {
  tenantId: string;
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<DashboardData> {
  // Query pepa_rounds for the given tenant and date range
  // For each round, parse snapshot_json to extract:
  // - comparisonRows count (items validated)
  // - round status (open/closed)
  // - savings: sum of (baseUnitPrice - bestUnitPrice) * requestedQuantity where bestUnitPrice < baseUnitPrice
  // Group by user_id for per-user metrics
  // Calculate timeline by week
  // Compare with previous period for diff percentages

  // Implementation uses the same dual SQLite/PostgreSQL pattern as db.ts
  // Queries pepa_rounds table and parses snapshot_json in JS
}
```

Full implementation: query all rounds in date range, parse snapshots, aggregate metrics. The function should handle both database backends.

- [ ] **Step 2: Create dashboard API route**

```typescript
// app/api/pepa/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-store";

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate") ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const endDate = url.searchParams.get("endDate") ?? new Date().toISOString();
  const userId = url.searchParams.get("userId") ?? undefined;

  const data = await getDashboardData({
    tenantId: session.tenantId,
    startDate,
    endDate,
    userId
  });

  return NextResponse.json(data);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard-store.ts app/api/pepa/dashboard/route.ts
git commit -m "feat: add dashboard data API with savings and performance metrics"
```

---

### Task 8: Dashboard frontend — cards and charts

**Files:**
- Create: `components/dashboard-cards.tsx`
- Create: `components/dashboard-charts.tsx`
- Create: `components/performance-table.tsx`
- Create: `app/painel-performance/page.tsx`

- [ ] **Step 1: Create dashboard-cards.tsx**

Four summary cards with Framer Motion animations, large numbers, colored icons, and comparison indicators.

```typescript
// components/dashboard-cards.tsx
"use client";
import { motion } from "framer-motion";
import type { DashboardSummary } from "@/lib/dashboard-store";

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  const cards = [
    { label: "Cotacoes", value: summary.totalRounds, color: "blue", diff: summary.previousPeriodComparison.roundsDiff },
    { label: "Itens validados", value: summary.totalItemsValidated, color: "indigo" },
    { label: "Economia total", value: `R$ ${summary.totalSavings.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "green", diff: summary.previousPeriodComparison.savingsDiff },
    { label: "Media economia", value: `${summary.avgSavingsPercent.toFixed(1)}%`, color: "emerald" }
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
          className="rounded-[24px] bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
          <p className="mt-2 text-3xl font-bold text-brand-ink">{card.value}</p>
          {card.diff && (
            <p className={`mt-1 text-sm font-medium ${card.diff.startsWith("+") ? "text-green-600" : card.diff.startsWith("-") ? "text-red-500" : "text-slate-400"}`}>
              {card.diff} vs periodo anterior
            </p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create dashboard-charts.tsx**

Area chart (savings over time) and horizontal bar chart (ranking by user) using Recharts.

```typescript
// components/dashboard-charts.tsx
"use client";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { TimelinePoint, UserPerformance } from "@/lib/dashboard-store";

export function SavingsTimeline({ data }: { data: TimelinePoint[] }) {
  return (
    <div className="rounded-[24px] bg-white p-6 shadow-panel">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Evolucao da economia</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
          <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR")}`, "Economia"]} />
          <Area type="monotone" dataKey="savings" stroke="#10b981" fill="url(#savingsGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UserRankingChart({ data }: { data: UserPerformance[] }) {
  const sorted = [...data].sort((a, b) => b.savings - a.savings);
  return (
    <div className="rounded-[24px] bg-white p-6 shadow-panel">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Ranking por economia</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 50)}>
        <BarChart data={sorted} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
          <YAxis type="category" dataKey="userName" tick={{ fontSize: 12 }} width={120} />
          <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR")}`, "Economia"]} />
          <Bar dataKey="savings" fill="#1e3a5f" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create performance-table.tsx**

```typescript
// components/performance-table.tsx
"use client";
import type { UserPerformance } from "@/lib/dashboard-store";

export function PerformanceTable({ data, avgSavings }: { data: UserPerformance[]; avgSavings: number }) {
  return (
    <div className="rounded-[24px] bg-white p-6 shadow-panel">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Performance por comprador</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Comprador</th>
              <th className="px-4 py-3">Cotacoes</th>
              <th className="px-4 py-3">Itens</th>
              <th className="px-4 py-3">Fechadas</th>
              <th className="px-4 py-3">Economia (R$)</th>
              <th className="px-4 py-3">Economia (%)</th>
            </tr>
          </thead>
          <tbody>
            {data.map(u => {
              const level = u.savingsPercent > avgSavings * 1.1 ? "high" : u.savingsPercent < avgSavings * 0.9 ? "low" : "mid";
              const badge = { high: "bg-green-100 text-green-700", mid: "bg-amber-100 text-amber-700", low: "bg-red-100 text-red-600" }[level];
              return (
                <tr key={u.userId} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3 font-medium">{u.userName}</td>
                  <td className="px-4 py-3">{u.rounds}</td>
                  <td className="px-4 py-3">{u.itemsValidated}</td>
                  <td className="px-4 py-3">{u.closedRounds}</td>
                  <td className="px-4 py-3 font-semibold">R$ {u.savings.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>{u.savingsPercent.toFixed(1)}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create painel-performance page**

```typescript
// app/painel-performance/page.tsx
"use client";
import { useEffect, useState } from "react";
import { DashboardCards } from "@/components/dashboard-cards";
import { SavingsTimeline, UserRankingChart } from "@/components/dashboard-charts";
import { PerformanceTable } from "@/components/performance-table";
import type { DashboardData } from "@/lib/dashboard-store";

const QUICK_FILTERS = [
  { label: "Hoje", days: 0 },
  { label: "Esta semana", days: 7 },
  { label: "Este mes", days: 30 },
  { label: "3 meses", days: 90 },
  { label: "Este ano", days: 365 }
];

export default function PainelPerformancePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(30);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUser, setSelectedUser] = useState("");

  useEffect(() => {
    fetch("/api/auth/users").then(r => r.json()).then(d => setUsers(d.users ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const start = customStart || new Date(Date.now() - activeFilter * 86400000).toISOString();
    const end = customEnd || new Date().toISOString();
    const params = new URLSearchParams({ startDate: start, endDate: end });
    if (selectedUser) params.set("userId", selectedUser);

    fetch(`/api/pepa/dashboard?${params}`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [activeFilter, customStart, customEnd, selectedUser]);

  if (loading && !data) return <div className="flex items-center justify-center py-20 text-sm text-slate-400">Carregando...</div>;
  if (!data) return <div className="py-20 text-center text-sm text-slate-400">Sem dados para o periodo.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Painel de Performance</h2>
        <p className="text-sm text-slate-500">Acompanhe a produtividade e economia dos compradores.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-[24px] bg-white p-4 shadow-panel">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {QUICK_FILTERS.map(f => (
            <button key={f.days} onClick={() => { setActiveFilter(f.days); setCustomStart(""); setCustomEnd(""); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${activeFilter === f.days && !customStart ? "bg-white shadow-sm text-brand-ink" : "text-slate-500 hover:text-brand-ink"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); setCustomEnd(customEnd || new Date().toISOString().slice(0, 10)); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
          <span className="text-xs text-slate-400">ate</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
        </div>
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
          <option value="">Todos os compradores</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      <DashboardCards summary={data.summary} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SavingsTimeline data={data.timeline} />
        <UserRankingChart data={data.byUser} />
      </div>

      <PerformanceTable data={data.byUser} avgSavings={data.summary.avgSavingsPercent} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard-cards.tsx components/dashboard-charts.tsx components/performance-table.tsx app/painel-performance/page.tsx
git commit -m "feat: add performance dashboard with cards, charts, filters and table"
```

---

### Task 9: Run all tests + final verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All existing tests pass.

- [ ] **Step 2: Manual verification checklist**

1. Login as admin → see "Painel Performance" in menu
2. Go to Configurações → see Empresa + Usuarios tabs
3. Create a new user (Comprador)
4. Logout, login as Comprador → "Painel Performance" NOT in menu, Configurações has no Usuarios tab
5. Logout, login as admin again → see dashboard with (likely empty) data
6. Upload a quotation round → dashboard should reflect new data

- [ ] **Step 3: Final commit + push**

```bash
git push origin main
```
