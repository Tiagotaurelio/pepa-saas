#!/usr/bin/env node
/**
 * Cria um novo tenant + usuário admin no banco de dados.
 *
 * Uso:
 *   node scripts/create-tenant.js "Nome da Empresa" "email@empresa.com" "senha123"
 *
 * Com Postgres (defina PEPA_DATABASE_URL no ambiente):
 *   PEPA_DATABASE_URL=postgres://... node scripts/create-tenant.js ...
 *
 * Com SQLite (padrão, usa data/pepa.db):
 *   node scripts/create-tenant.js ...
 */

const { createHash, randomUUID } = require("node:crypto");
const path = require("node:path");

const [, , tenantName, email, password] = process.argv;

if (!tenantName || !email || !password) {
  console.error("Uso: node scripts/create-tenant.js <nome_empresa> <email> <senha>");
  process.exit(1);
}

function hashPassword(value) {
  return createHash("sha256").update(value).digest("hex");
}

const tenantId = randomUUID();
const userId = randomUUID();
const passwordHash = hashPassword(password);

async function main() {
  const databaseUrl = process.env.PEPA_DATABASE_URL;
  const schema = process.env.PEPA_DATABASE_SCHEMA ?? "public";

  if (databaseUrl) {
    const { Pool } = require("pg");
    const ssl = process.env.PEPA_DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined;
    const pool = new Pool({ connectionString: databaseUrl, ssl });

    await pool.query(
      `insert into ${schema}.tenants (id, name) values ($1, $2)`,
      [tenantId, tenantName.trim()]
    );
    await pool.query(
      `insert into ${schema}.users (id, tenant_id, name, email, password_hash) values ($1, $2, $3, $4, $5)`,
      [userId, tenantId, "Administrador", email.trim().toLowerCase(), passwordHash]
    );

    await pool.end();
  } else {
    const Database = require("better-sqlite3");
    const dataDir = process.env.PEPA_DATA_DIR ?? path.join(__dirname, "..", "data");
    const dbPath = path.join(dataDir, "pepa.db");
    const db = new Database(dbPath);

    db.prepare("insert into tenants (id, name) values (?, ?)").run(tenantId, tenantName.trim());
    db.prepare(
      "insert into users (id, tenant_id, name, email, password_hash) values (?, ?, ?, ?, ?)"
    ).run(userId, tenantId, "Administrador", email.trim().toLowerCase(), passwordHash);

    db.close();
  }

  console.log("Tenant criado com sucesso!");
  console.log(`  Empresa : ${tenantName.trim()}`);
  console.log(`  Email   : ${email.trim().toLowerCase()}`);
  console.log(`  Senha   : ${password}`);
  console.log(`  ID      : ${tenantId}`);
}

main().catch((err) => {
  console.error("Erro ao criar tenant:", err.message);
  process.exit(1);
});
