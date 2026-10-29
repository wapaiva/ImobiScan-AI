import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from './sqlite-driver.mjs';

export async function applyInitialMigration(databasePath, migrationPath) {
  const sql = await readFile(migrationPath, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum_sha256 TEXT NOT NULL, applied_at TEXT NOT NULL
    );`);
    const existing = db.prepare('SELECT checksum_sha256 FROM schema_migrations WHERE version = ?').get(1);
    if (existing) {
      if (existing.checksum_sha256 !== checksum) throw new Error('Migration 1 checksum differs from the applied migration.');
      return { applied: false, version: 1 };
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, name, checksum_sha256, applied_at) VALUES(1, ?, ?, ?)')
        .run('initial_schema', checksum, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { applied: true, version: 1 };
  } finally {
    db.close();
  }
}
