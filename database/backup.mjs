import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from './sqlite-driver.mjs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const CURRENT_SCHEMA_VERSION = 2;
const REQUIRED_TABLES = [
  'clients', 'responsibles', 'properties', 'property_units', 'surveys',
  'survey_versions', 'rooms', 'building_elements', 'laser_devices',
  'device_sessions', 'measurements', 'measurement_revisions', 'media_assets',
  'audit_log', 'backup_records', 'schema_migrations',
];
// Tables introduced by later migrations are only required once the schema has
// reached that version, so v1 backups remain valid while newer ones are checked
// against the full expected surface.
const VERSIONED_REQUIRED_TABLES = {
  2: [
    'object_categories', 'object_definitions', 'object_instances',
    'plan_versions', 'detected_objects',
  ],
};

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** Opens a candidate backup read-only and validates SQLite integrity and schema before use. */
export async function validateBackup(filePath, options = {}) {
  const absolute = resolve(filePath);
  const fileStat = await stat(absolute);
  if (!fileStat.isFile() || fileStat.size === 0) throw new Error('Arquivo de backup vazio ou inválido.');
  const db = new DatabaseSync(absolute, { readOnly: true });
  try {
    const integrityRows = db.prepare('PRAGMA integrity_check').all();
    if (integrityRows.length !== 1 || integrityRows[0].integrity_check !== 'ok') {
      throw new Error('Falha na integridade do banco SQLite.');
    }
    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    if (fkViolations.length) throw new Error('Backup contém violações de chaves estrangeiras.');
    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const names = new Set(tableRows.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Backup sem tabelas obrigatórias: ${missing.join(', ')}`);
    const migration = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    const version = migration?.version ?? 0;
    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(`Versão do esquema incompatível: ${version}; suportada no máximo: ${CURRENT_SCHEMA_VERSION}.`);
    }
    const versionedRequired = [];
    for (const [minVersion, tables] of Object.entries(VERSIONED_REQUIRED_TABLES)) {
      if (version >= Number(minVersion)) versionedRequired.push(...tables);
    }
    const missingVersioned = versionedRequired.filter((name) => !names.has(name));
    if (missingVersioned.length) {
      throw new Error(`Backup na versão ${version} sem tabelas obrigatórias dessa versão: ${missingVersioned.join(', ')}`);
    }
    const checksum = await sha256File(absolute);
    if (options.expectedSha256 && options.expectedSha256 !== checksum) {
      throw new Error('O checksum do arquivo não corresponde ao esperado.');
    }
    return { valid: true, path: absolute, sizeBytes: fileStat.size, schemaVersion: version, checksumSha256: checksum };
  } finally {
    db.close();
  }
}

/**
 * Creates a consistent SQLite backup via VACUUM INTO, then validates it.
 * Never overwrites an existing backup path and never alters the source database.
 */
export async function createVerifiedBackup(databasePath, backupPath) {
  const source = resolve(databasePath);
  const destination = resolve(backupPath);
  if (source === destination) throw new Error('O backup não pode sobrescrever o banco de origem.');
  try {
    await stat(destination);
    throw new Error('O arquivo de destino já existe; escolha outro nome para preservar backups anteriores.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const db = new DatabaseSync(source);
  try {
    db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
  try {
    return await validateBackup(destination);
  } catch (error) {
    throw new Error(`Backup criado, mas a validação falhou: ${error.message}`);
  }
}

/**
 * Copies a pre-validated backup to a new destination without overwriting it.
 * This is deliberately not an in-place restore. A desktop integration must
 * close all database handles and implement recovery/atomic replacement separately.
 */
export async function copyValidatedBackup(backupPath, destinationPath) {
  const validation = await validateBackup(backupPath);
  const destination = resolve(destinationPath);
  try {
    await stat(destination);
    throw new Error('O destino já existe; não será sobrescrito.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(validation.path, destination);
  const copied = await validateBackup(destination, { expectedSha256: validation.checksumSha256 });
  return { ...copied, sourceChecksumSha256: validation.checksumSha256 };
}
