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
      password_hash text not null
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
      snapshot_json text not null
    );
  `);
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
      password_hash text not null
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
      snapshot_json text not null
    );
  `);

  const countResult = await pool.query<{ count: string }>(`select count(*)::text as count from ${pgTable("tenants")}`);
  if (Number(countResult.rows[0]?.count ?? "0") === 0) {
    await pool.query(`insert into ${pgTable("tenants")} (id, name) values ($1, $2)`, [demoTenantId, "PEPA Demo"]);
    await pool.query(
      `insert into ${pgTable("users")} (id, tenant_id, name, email, password_hash) values ($1, $2, $3, $4, $5)`,
      [demoUserId, demoTenantId, "Operador PEPA", demoEmail, hashPassword(demoPassword)]
    );
  }

  postgresReady = true;
}

function seedSqlite(db: Database.Database) {
  const tenantExists = db.prepare("select count(*) as count from tenants").get() as { count: number };
  if (tenantExists.count > 0) {
    return;
  }

  db.prepare("insert into tenants (id, name) values (?, ?)").run(demoTenantId, "PEPA Demo");
  db.prepare(
    "insert into users (id, tenant_id, name, email, password_hash) values (?, ?, ?, ?, ?)"
  ).run(demoUserId, demoTenantId, "Operador PEPA", demoEmail, hashPassword(demoPassword));
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
    }>(
      `select users.id as user_id, users.tenant_id as tenant_id, users.name as user_name, users.email as user_email,
              users.password_hash as password_hash, tenants.name as tenant_name
       from ${pgTable("users")} as users
       join ${pgTable("tenants")} as tenants on tenants.id = users.tenant_id
       where users.email = $1`,
      [email]
    );
    const user = userResult.rows[0];
    if (!user || user.password_hash !== hashPassword(password)) {
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
      expiresAt
    };
  }

  const db = getSqlite();
  const user = db
    .prepare(
      `select users.id as user_id, users.tenant_id as tenant_id, users.name as user_name, users.email as user_email,
              users.password_hash as password_hash, tenants.name as tenant_name
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
      }
    | undefined;

  if (!user || user.password_hash !== hashPassword(password)) {
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
    expiresAt
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
              users.name as user_name, users.email as user_email, tenants.name as tenant_name
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
      expiresAt: row.expires_at
    };
  }

  const db = getSqlite();
  const row = db
    .prepare(
      `select sessions.token, sessions.user_id, sessions.tenant_id, sessions.expires_at,
              users.name as user_name, users.email as user_email, tenants.name as tenant_name
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
    expiresAt: row.expires_at
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
}) {
  if (hasPostgresConfig()) {
    await ensurePostgresReady();
    await getPostgresPool().query(
      `insert into ${pgTable("pepa_rounds")} (id, tenant_id, created_at, mirror_file_name, supplier_files_count, snapshot_json)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        params.id,
        params.tenantId,
        params.createdAt,
        params.mirrorFileName,
        params.supplierFilesCount,
        JSON.stringify(params.snapshot)
      ]
    );
    return;
  }

  const db = getSqlite();
  db.prepare(
    `insert into pepa_rounds (id, tenant_id, created_at, mirror_file_name, supplier_files_count, snapshot_json)
     values (?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.tenantId,
    params.createdAt,
    params.mirrorFileName,
    params.supplierFilesCount,
    JSON.stringify(params.snapshot)
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
