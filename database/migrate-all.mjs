import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DatabaseSync } from './sqlite-driver.mjs';

/**
 * Versioned migration runner.
 * - Migrations are files named NNNN_name.sql inside the migrations folder;
 *   the leading number is the schema version.
 * - Every applied migration stores a SHA-256 checksum; re-running never
 *   modifies the database, and a changed checksum on an already-applied
 *   migration aborts with an explicit error (no silent drift).
 * - Each migration runs inside its own transaction.
 */

export function parseMigrationFileName(name) {
  const match = /^(\d{4})_([a-z0-9_]+)\.sql$/i.exec(name);
  if (!match) return null;
  return { version: Number.parseInt(match[1], 10), name: match[2] };
}

export async function listMigrations(migrationsDir) {
  const entries = await readdir(migrationsDir);
  const migrations = [];
  for (const entry of entries.sort()) {
    const parsed = parseMigrationFileName(entry);
    if (!parsed) continue;
    const sql = await readFile(join(migrationsDir, entry), 'utf8');
    migrations.push({ ...parsed, file: entry, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  const seen = new Set();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Versão de migração duplicada: ${m.version}`);
    seen.add(m.version);
  }
  return migrations;
}

export async function migrateDatabase(databasePath, migrationsDir) {
  const migrations = await listMigrations(migrationsDir);
  const db = new DatabaseSync(databasePath);
  const applied = [];
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum_sha256 TEXT NOT NULL, applied_at TEXT NOT NULL
    );`);
    for (const migration of migrations) {
      const existing = db
        .prepare('SELECT checksum_sha256 FROM schema_migrations WHERE version = ?')
        .get(migration.version);
      if (existing) {
        if (existing.checksum_sha256 !== migration.checksum) {
          throw new Error(
            `Migration ${migration.version} (${basename(migration.file)}) checksum differs from the applied migration.`,
          );
        }
        continue;
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(migration.sql);
        db.prepare(
          'INSERT INTO schema_migrations(version, name, checksum_sha256, applied_at) VALUES(?,?,?,?)',
        ).run(migration.version, migration.name, migration.checksum, new Date().toISOString());
        db.exec('COMMIT');
        applied.push(migration.version);
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw new Error(`Falha ao aplicar migração ${migration.version} (${migration.file}): ${error.message}`);
      }
    }
    const current = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    return { appliedVersions: applied, schemaVersion: current?.version ?? 0, totalMigrations: migrations.length };
  } finally {
    db.close();
  }
}
