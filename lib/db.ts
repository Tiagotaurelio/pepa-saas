import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
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

function getSqlite() {
  if (sqliteDb) {
    return sqliteDb;
  }

  const dataDirectory = getPepaDataDirectory();
  const sqlitePath = path.join(dataDirectory, "pepa.db");
  mkdirSync(dataDirectory, { recursive: true });
  sqliteDb = new Database(sqlitePath);
  sqliteDb.pragma("journal_mode = WAL");
  initializeSchema(sqliteDb);
  seed(sqliteDb);
  return sqliteDb;
}

function getPepaDataDirectory() {
  return process.env.PEPA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

function initializeSchema(db: Database.Database) {
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

function seed(db: Database.Database) {
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
  getSqlite().prepare("delete from sessions where token = ?").run(token);
}

export function getDemoCredentials() {
  return {
    email: demoEmail,
    password: demoPassword
  };
}

export function loadLatestPepaSnapshot(tenantId: string): PepaSnapshot | null {
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

export function loadPepaSnapshotByRoundId(tenantId: string, roundId: string): PepaSnapshot | null {
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

export function listPepaRounds(tenantId: string) {
  const db = getSqlite();
  return db
    .prepare(
      `select id, created_at, mirror_file_name, supplier_files_count, snapshot_json
       from pepa_rounds
       where tenant_id = ?
       order by created_at desc`
    )
    .all(tenantId) as Array<{
    id: string;
    created_at: string;
    mirror_file_name: string;
    supplier_files_count: number;
    snapshot_json: string;
  }>;
}

export function savePepaSnapshot(params: {
  id: string;
  tenantId: string;
  createdAt: string;
  mirrorFileName: string;
  supplierFilesCount: number;
  snapshot: PepaSnapshot;
}) {
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

export function updatePepaSnapshot(params: {
  roundId: string;
  tenantId: string;
  snapshot: PepaSnapshot;
}) {
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

export function resetSqliteForTests() {
  sqliteDb?.close();
  sqliteDb = null;
}
