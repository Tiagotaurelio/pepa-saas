import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { Pool } from "pg";

import { PepaSnapshot } from "@/lib/pepa-quotation-domain";

type SessionRow = {
  token: string;
  user_id: string;
  tenant_id: string;
  expires_at: string;
  user_name: string;
  user_email: string;
  tenant_name: string;
  role: string;
};

type PepaRoundRow = {
  id: string;
  created_at: string;
  mirror_file_name: string;
  supplier_files_count: number;
  snapshot_json: string;
};

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

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "buyer";
  active: boolean;
  createdAt: string;
};

const demoTenantId = "tenant-demo";
const demoUserId = "user-demo";
const demoEmail = "admin@pepa.local";
const demoPassword = "demo123";

let sqliteDb: Database.Database | null = null;
let postgresPool: Pool | null = null;
let postgresReady = false;

function hasPostgresConfig() {
  return Boolean(process.env.PEPA_DATABASE_URL);
}

function getPepaDataDirectory() {
  return process.env.PEPA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

function getSqlite() {
  if (sqliteDb) {
    return sqliteDb;
  }

  const dataDirectory = getPepaDataDirectory();
  const sqlitePath = path.join(dataDirectory, "pepa.db");
  mkdirSync(dataDirectory, { recursive: true });
  sqliteDb = new Database(sqlitePath);
  sqliteDb.pragma("journal_mode = WAL");
  initializeSqliteSchema(sqliteDb);
  seedSqlite(sqliteDb);
  return sqliteDb;
}

function getPostgresPool() {
  if (postgresPool) {
    return postgresPool;
  }

  if (!process.env.PEPA_DATABASE_URL) {
    throw new Error("PEPA_DATABASE_URL is not configured.");
  }

  postgresPool = new Pool({
    connectionString: process.env.PEPA_DATABASE_URL,
    ssl: process.env.PEPA_DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined
  });
  return postgresPool;
}

function getPepaDatabaseSchema() {
  const schema = process.env.PEPA_DATABASE_SCHEMA?.trim() || "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("PEPA_DATABASE_SCHEMA contains invalid characters.");
  }
  return schema;
}

function pgTable(name: string) {
  return `${getPepaDatabaseSchema()}.${name}`;
}

function initializeSqliteSchema(db: Database.Database) {
  db.exec(`
    create table if not exists tenants (
      id text primary key,
      name text not null
    );

    create table if not exists users (
      id text primary key,
      tenant_id text not null,
      name text not null,
      email text not null unique,
      password_hash text not null,
      role text not null default 'buyer',
      active integer not null default 1,
      created_at text not null default ''
    );

    create table if not exists sessions (
      token text primary key,
      user_id text not null,
      tenant_id text not null,
      expires_at text not null
    );

    create table if not exists pepa_rounds (
      id text primary key,
      tenant_id text not null,
      created_at text not null,
      mirror_file_name text not null,
      supplier_files_count integer not null,
      snapshot_json text not null,
      user_id text default null
    );
  `);

  // Idempotent ALTER TABLE for existing databases
  try { db.exec("alter table users add column role text not null default 'buyer'"); } catch (_) { /* column exists */ }
  try { db.exec("alter table users add column active integer not null default 1"); } catch (_) { /* column exists */ }
  try { db.exec("alter table users add column created_at text not null default ''"); } catch (_) { /* column exists */ }
  try { db.exec("alter table pepa_rounds add column user_id text default null"); } catch (_) { /* column exists */ }

  // Ensure demo user is always admin
  db.exec(`update users set role = 'admin' where id = 'user-demo'`);
}

async function ensurePostgresReady() {
  if (!hasPostgresConfig() || postgresReady) {
    return;
  }

  const pool = getPostgresPool();
  const schema = getPepaDatabaseSchema();
  await pool.query(`create schema if not exists ${schema}`);
  await pool.query(`
    create table if not exists ${pgTable("tenants")} (
      id text primary key,
      name text not null
    );

    create table if not exists ${pgTable("users")} (
      id text primary key,
      tenant_id text not null,
      name text not null,
      email text not null unique,
      password_hash text not null,
      role text not null default 'buyer',
      active boolean not null default true,
      created_at text not null default ''
    );

    create table if not exists ${pgTable("sessions")} (
      token text primary key,
      user_id text not null,
      tenant_id text not null,
      expires_at text not null
    );

    create table if not exists ${pgTable("pepa_rounds")} (
      id text primary key,
      tenant_id text not null,
      created_at text not null,
      mirror_file_name text not null,
      supplier_files_count integer not null,
      snapshot_json text not null,
      user_id text default null
    );
  `);

  // Idempotent ALTER TABLE for existing databases
  await pool.query(`ALTER TABLE ${pgTable("users")} ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'buyer'`);
  await pool.query(`ALTER TABLE ${pgTable("users")} ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE ${pgTable("users")} ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE ${pgTable("pepa_rounds")} ADD COLUMN IF NOT EXISTS user_id text DEFAULT NULL`);

  const countResult = await pool.query<{ count: string }>(`select count(*)::text as count from ${pgTable("tenants")}`);
  if (Number(countResult.rows[0]?.count ?? "0") === 0) {
    await pool.query(`insert into ${pgTable("tenants")} (id, name) values ($1, $2)`, [demoTenantId, "PEPA Demo"]);
    await pool.query(
      `insert into ${pgTable("users")} (id, tenant_id, name, email, password_hash, role, active, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [demoUserId, demoTenantId, "Operador PEPA", demoEmail, hashPassword(demoPassword), "admin", true, new Date().toISOString()]
    );
  }

  // Ensure demo user is always admin
  await pool.query(`update ${pgTable("users")} set role = 'admin' where id = $1`, [demoUserId]);

  postgresReady = true;
}

function seedSqlite(db: Database.Database) {
  const tenantExists = db.prepare("select count(*) as count from tenants").get() as { count: number };
  if (tenantExists.count > 0) {
    return;
  }

  db.prepare("insert into tenants (id, name) values (?, ?)").run(demoTenantId, "PEPA Demo");
  db.prepare(
    "insert into users (id, tenant_id, name, email, password_hash, role, active, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(demoUserId, demoTenantId, "Operador PEPA", demoEmail, hashPassword(demoPassword), "admin", 1, new Date().toISOString());
}

export async function createSession(email: string, password: string): Promise<AuthSession | null> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const pool = getPostgresPool();
    const userResult = await pool.query<{
      user_id: string;
      tenant_id: string;
      user_name: string;
      user_email: string;
      password_hash: string;
      tenant_name: string;
      role: string;
      active: boolean;
    }>(
      `select users.id as user_id, users.tenant_id as tenant_id, users.name as user_name, users.email as user_email,
              users.password_hash as password_hash, tenants.name as tenant_name, users.role, users.active
       from ${pgTable("users")} as users
       join ${pgTable("tenants")} as tenants on tenants.id = users.tenant_id
       where users.email = $1`,
      [email]
    );
    const user = userResult.rows[0];
    if (!user || user.password_hash !== hashPassword(password)) {
      return null;
    }
    if (!user.active) {
      return null;
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await pool.query(
      `insert into ${pgTable("sessions")} (token, user_id, tenant_id, expires_at) values ($1, $2, $3, $4)`,
      [token, user.user_id, user.tenant_id, expiresAt]
    );

    return {
      token,
      userId: user.user_id,
      tenantId: user.tenant_id,
      userName: user.user_name,
      userEmail: user.user_email,
      tenantName: user.tenant_name,
      expiresAt,
      role: user.role as "admin" | "buyer"
    };
  }

  const db = getSqlite();
  const user = db
    .prepare(
      `select users.id as user_id, users.tenant_id as tenant_id, users.name as user_name, users.email as user_email,
              users.password_hash as password_hash, tenants.name as tenant_name, users.role, users.active
       from users
       join tenants on tenants.id = users.tenant_id
       where users.email = ?`
    )
    .get(email) as
    | {
        user_id: string;
        tenant_id: string;
        user_name: string;
        user_email: string;
        password_hash: string;
        tenant_name: string;
        role: string;
        active: number;
      }
    | undefined;

  if (!user || user.password_hash !== hashPassword(password)) {
    return null;
  }
  if (!user.active) {
    return null;
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.prepare("insert into sessions (token, user_id, tenant_id, expires_at) values (?, ?, ?, ?)").run(
    token,
    user.user_id,
    user.tenant_id,
    expiresAt
  );

  return {
    token,
    userId: user.user_id,
    tenantId: user.tenant_id,
    userName: user.user_name,
    userEmail: user.user_email,
    tenantName: user.tenant_name,
    expiresAt,
    role: user.role as "admin" | "buyer"
  };
}

export async function getSession(token: string | undefined): Promise<AuthSession | null> {
  if (!token) {
    return null;
  }

  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const pool = getPostgresPool();
    const result = await pool.query<SessionRow>(
      `select sessions.token, sessions.user_id, sessions.tenant_id, sessions.expires_at,
              users.name as user_name, users.email as user_email, tenants.name as tenant_name, users.role
       from ${pgTable("sessions")} as sessions
       join ${pgTable("users")} as users on users.id = sessions.user_id
       join ${pgTable("tenants")} as tenants on tenants.id = sessions.tenant_id
       where sessions.token = $1`,
      [token]
    );
    const row = result.rows[0];

    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      if (row) {
        await pool.query(`delete from ${pgTable("sessions")} where token = $1`, [token]);
      }
      return null;
    }

    return {
      token: row.token,
      userId: row.user_id,
      tenantId: row.tenant_id,
      userName: row.user_name,
      userEmail: row.user_email,
      tenantName: row.tenant_name,
      expiresAt: row.expires_at,
      role: row.role as "admin" | "buyer"
    };
  }

  const db = getSqlite();
  const row = db
    .prepare(
      `select sessions.token, sessions.user_id, sessions.tenant_id, sessions.expires_at,
              users.name as user_name, users.email as user_email, tenants.name as tenant_name, users.role
       from sessions
       join users on users.id = sessions.user_id
       join tenants on tenants.id = sessions.tenant_id
       where sessions.token = ?`
    )
    .get(token) as SessionRow | undefined;

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    if (row) {
      db.prepare("delete from sessions where token = ?").run(token);
    }
    return null;
  }

  return {
    token: row.token,
    userId: row.user_id,
    tenantId: row.tenant_id,
    userName: row.user_name,
    userEmail: row.user_email,
    tenantName: row.tenant_name,
    expiresAt: row.expires_at,
    role: row.role as "admin" | "buyer"
  };
}

export async function deleteSession(token: string | undefined) {
  if (!token) {
    return;
  }

  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    await getPostgresPool().query(`delete from ${pgTable("sessions")} where token = $1`, [token]);
    return;
  }

  getSqlite().prepare("delete from sessions where token = ?").run(token);
}

export function getDemoCredentials() {
  return {
    email: demoEmail,
    password: demoPassword
  };
}

export async function loadLatestPepaSnapshot(tenantId: string): Promise<PepaSnapshot | null> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const result = await getPostgresPool().query<{ snapshot_json: string }>(
      `select snapshot_json
       from ${pgTable("pepa_rounds")}
       where tenant_id = $1
       order by created_at desc
       limit 1`,
      [tenantId]
    );

    if (!result.rows[0]) {
      return null;
    }

    return JSON.parse(result.rows[0].snapshot_json) as PepaSnapshot;
  }

  const db = getSqlite();
  const row = db
    .prepare(
      `select snapshot_json
       from pepa_rounds
       where tenant_id = ?
       order by created_at desc
       limit 1`
    )
    .get(tenantId) as { snapshot_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.snapshot_json) as PepaSnapshot;
}

export async function loadPepaSnapshotByRoundId(tenantId: string, roundId: string): Promise<PepaSnapshot | null> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const result = await getPostgresPool().query<{ snapshot_json: string }>(
      `select snapshot_json
       from ${pgTable("pepa_rounds")}
       where tenant_id = $1 and id = $2
       limit 1`,
      [tenantId, roundId]
    );

    if (!result.rows[0]) {
      return null;
    }

    return JSON.parse(result.rows[0].snapshot_json) as PepaSnapshot;
  }

  const db = getSqlite();
  const row = db
    .prepare(
      `select snapshot_json
       from pepa_rounds
       where tenant_id = ? and id = ?
       limit 1`
    )
    .get(tenantId, roundId) as { snapshot_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.snapshot_json) as PepaSnapshot;
}

export async function listPepaRounds(tenantId: string): Promise<PepaRoundRow[]> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const result = await getPostgresPool().query<PepaRoundRow>(
      `select id, created_at, mirror_file_name, supplier_files_count, snapshot_json
       from ${pgTable("pepa_rounds")}
       where tenant_id = $1
       order by created_at desc`,
      [tenantId]
    );
    return result.rows;
  }

  const db = getSqlite();
  return db
    .prepare(
      `select id, created_at, mirror_file_name, supplier_files_count, snapshot_json
       from pepa_rounds
       where tenant_id = ?
       order by created_at desc`
    )
    .all(tenantId) as PepaRoundRow[];
}

export async function savePepaSnapshot(params: {
  id: string;
  tenantId: string;
  createdAt: string;
  mirrorFileName: string;
  supplierFilesCount: number;
  snapshot: PepaSnapshot;
  userId?: string;
}) {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    await getPostgresPool().query(
      `insert into ${pgTable("pepa_rounds")} (id, tenant_id, created_at, mirror_file_name, supplier_files_count, snapshot_json, user_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.id,
        params.tenantId,
        params.createdAt,
        params.mirrorFileName,
        params.supplierFilesCount,
        JSON.stringify(params.snapshot),
        params.userId ?? null
      ]
    );
    return;
  }

  const db = getSqlite();
  db.prepare(
    `insert into pepa_rounds (id, tenant_id, created_at, mirror_file_name, supplier_files_count, snapshot_json, user_id)
     values (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.tenantId,
    params.createdAt,
    params.mirrorFileName,
    params.supplierFilesCount,
    JSON.stringify(params.snapshot),
    params.userId ?? null
  );
}

export async function updatePepaSnapshot(params: {
  roundId: string;
  tenantId: string;
  snapshot: PepaSnapshot;
}) {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    await getPostgresPool().query(
      `update ${pgTable("pepa_rounds")}
       set snapshot_json = $1
       where id = $2 and tenant_id = $3`,
      [JSON.stringify(params.snapshot), params.roundId, params.tenantId]
    );
    return;
  }

  const db = getSqlite();
  db.prepare(
    `update pepa_rounds
     set snapshot_json = ?
     where id = ? and tenant_id = ?`
  ).run(JSON.stringify(params.snapshot), params.roundId, params.tenantId);
}

export async function getTenantName(tenantId: string): Promise<string | null> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const result = await getPostgresPool().query<{ name: string }>(
      `select name from ${pgTable("tenants")} where id = $1`,
      [tenantId]
    );
    return result.rows[0]?.name ?? null;
  }

  const db = getSqlite();
  const row = db.prepare("select name from tenants where id = ?").get(tenantId) as { name: string } | undefined;
  return row?.name ?? null;
}

export async function updateTenantName(tenantId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Nome da empresa nao pode ser vazio.");
  }

  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    await getPostgresPool().query(`update ${pgTable("tenants")} set name = $1 where id = $2`, [trimmed, tenantId]);
    return;
  }

  getSqlite().prepare("update tenants set name = ? where id = ?").run(trimmed, tenantId);
}

export async function listUsers(tenantId: string): Promise<UserRow[]> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const result = await getPostgresPool().query<{
      id: string;
      name: string;
      email: string;
      role: string;
      active: boolean;
      created_at: string;
    }>(
      `select id, name, email, role, active, created_at
       from ${pgTable("users")}
       where tenant_id = $1
       order by created_at asc`,
      [tenantId]
    );
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as "admin" | "buyer",
      active: r.active,
      createdAt: r.created_at
    }));
  }

  const db = getSqlite();
  const rows = db
    .prepare(
      `select id, name, email, role, active, created_at
       from users
       where tenant_id = ?
       order by created_at asc`
    )
    .all(tenantId) as {
    id: string;
    name: string;
    email: string;
    role: string;
    active: number;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as "admin" | "buyer",
    active: r.active === 1,
    createdAt: r.created_at
  }));
}

export async function createUser(params: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "buyer";
}): Promise<UserRow> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const passwordHash = hashPassword(params.password);

  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    await getPostgresPool().query(
      `insert into ${pgTable("users")} (id, tenant_id, name, email, password_hash, role, active, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, params.tenantId, params.name, params.email, passwordHash, params.role, true, createdAt]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `insert into users (id, tenant_id, name, email, password_hash, role, active, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.tenantId, params.name, params.email, passwordHash, params.role, 1, createdAt);
  }

  return {
    id,
    name: params.name,
    email: params.email,
    role: params.role,
    active: true,
    createdAt
  };
}

export async function updateUser(params: {
  userId: string;
  tenantId: string;
  name?: string;
  email?: string;
  password?: string;
  role?: "admin" | "buyer";
}): Promise<void> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const pool = getPostgresPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(params.name);
    }
    if (params.email !== undefined) {
      sets.push(`email = $${idx++}`);
      values.push(params.email);
    }
    if (params.password !== undefined) {
      sets.push(`password_hash = $${idx++}`);
      values.push(hashPassword(params.password));
    }
    if (params.role !== undefined) {
      sets.push(`role = $${idx++}`);
      values.push(params.role);
    }

    if (sets.length === 0) return;

    values.push(params.userId, params.tenantId);
    await pool.query(
      `update ${pgTable("users")} set ${sets.join(", ")} where id = $${idx++} and tenant_id = $${idx}`,
      values
    );
    return;
  }

  const db = getSqlite();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (params.name !== undefined) {
    sets.push("name = ?");
    values.push(params.name);
  }
  if (params.email !== undefined) {
    sets.push("email = ?");
    values.push(params.email);
  }
  if (params.password !== undefined) {
    sets.push("password_hash = ?");
    values.push(hashPassword(params.password));
  }
  if (params.role !== undefined) {
    sets.push("role = ?");
    values.push(params.role);
  }

  if (sets.length === 0) return;

  values.push(params.userId, params.tenantId);
  db.prepare(`update users set ${sets.join(", ")} where id = ? and tenant_id = ?`).run(...values);
}

export async function toggleUserActive(params: {
  userId: string;
  tenantId: string;
}): Promise<{ active: boolean }> {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    const pool = getPostgresPool();
    const result = await pool.query<{ active: boolean }>(
      `update ${pgTable("users")} set active = not active where id = $1 and tenant_id = $2 returning active`,
      [params.userId, params.tenantId]
    );
    return { active: result.rows[0]?.active ?? true };
  }

  const db = getSqlite();
  db.prepare("update users set active = case when active = 1 then 0 else 1 end where id = ? and tenant_id = ?").run(
    params.userId,
    params.tenantId
  );
  const row = db.prepare("select active from users where id = ? and tenant_id = ?").get(params.userId, params.tenantId) as
    | { active: number }
    | undefined;
  return { active: row?.active === 1 };
}

function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getPepaStorageMode() {
  return hasPostgresConfig() ? "postgres" : "sqlite";
}

export function resetSqliteForTests() {
  sqliteDb?.close();
  sqliteDb = null;
  postgresPool?.end().catch(() => undefined);
  postgresPool = null;
  postgresReady = false;
}
