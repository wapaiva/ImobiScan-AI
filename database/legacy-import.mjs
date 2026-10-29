import { randomUUID } from 'node:crypto';
import { DatabaseSync } from './sqlite-driver.mjs';

export const LEGACY_STORAGE_KEY = 'imobiscanai.properties.v1';

const TYPE_MAP = Object.freeze({
  Residencial: 'residential',
  Comercial: 'commercial',
  Rural: 'rural',
  Terreno: 'land',
  Misto: 'mixed',
  Outro: 'other',
});
const STATUS_LABELS = new Set(['Em análise', 'Documentação pendente', 'Concluído']);

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parses and validates a legacy localStorage export without modifying the source.
 * Unknown area units remain unknown and require review; no unit is inferred.
 */
export function previewLegacyImport(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { validJson: false, total: 0, importable: [], rejected: [], needsReview: [], message: 'O conteúdo não é JSON válido.' };
  }
  if (!Array.isArray(parsed)) {
    return { validJson: true, total: 0, importable: [], rejected: [{ index: null, reason: 'A raiz do JSON deve ser uma lista de imóveis.' }], needsReview: [], message: 'Formato legado inesperado.' };
  }

  const importable = [];
  const rejected = [];
  const needsReview = [];
  const seenIds = new Set();

  parsed.forEach((item, index) => {
    const id = cleanText(item?.id);
    const name = cleanText(item?.name);
    const type = TYPE_MAP[cleanText(item?.type)] ?? 'other';
    const city = cleanText(item?.city);
    const state = cleanText(item?.state).toUpperCase();
    const area = item?.area;
    const value = item?.value;
    const errors = [];
    if (!id) errors.push('Código ausente.');
    if (!name) errors.push('Nome do imóvel ausente.');
    if (!city) errors.push('Cidade ausente.');
    if (!state) errors.push('UF ausente.');
    if (!Number.isFinite(area) || area < 0) errors.push('Área inválida.');
    if (!Number.isFinite(value) || value < 0) errors.push('Valor inválido.');
    if (id && seenIds.has(id)) errors.push('Código duplicado no arquivo.');
    if (errors.length) {
      rejected.push({ index, id: id || null, reason: errors.join(' ') });
      return;
    }
    seenIds.add(id);
    const explicitUnit = cleanText(item.areaUnit ?? item.area_unit);
    const knownAreaUnit = ['m2', 'ha', 'ft2'].includes(explicitUnit) ? explicitUnit : null;
    const row = {
      id, name, type, city, state, area, areaUnit: knownAreaUnit,
      value, status: STATUS_LABELS.has(item.status) ? item.status : 'Em análise',
      notes: cleanText(item.notes),
      updatedAt: cleanText(item.updatedAt),
      needsAreaReview: !knownAreaUnit,
      sourceIndex: index,
    };
    (row.needsAreaReview ? needsReview : importable).push(row);
  });

  return {
    validJson: true,
    total: parsed.length,
    importable,
    rejected,
    needsReview,
    message: 'Prévia concluída. Nenhum dado foi gravado ou removido.',
  };
}

/**
 * Imports validated records in a single transaction. Records whose area unit is
 * unknown are intentionally not imported until reviewed. The original localStorage
 * key is outside this module and is never deleted or modified.
 */
export function importLegacyProperties(databasePath, preview, options = {}) {
  if (options.confirm !== true) throw new Error('Confirmação explícita obrigatória para importar.');
  if (!preview?.validJson || !Array.isArray(preview.importable) || !Array.isArray(preview.needsReview)) {
    throw new TypeError('Prévia de importação inválida.');
  }
  const records = [...preview.importable, ...(options.includeNeedsReview === true ? preview.needsReview : [])];
  if (options.includeNeedsReview === true && preview.needsReview.length) {
    throw new Error('Registros com unidade de área desconhecida não podem ser importados antes da revisão.');
  }
  const db = new DatabaseSync(databasePath);
  let imported = 0;
  const skippedExisting = [];
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('BEGIN IMMEDIATE');
    const exists = db.prepare('SELECT id FROM properties WHERE id = ?');
    const insertProperty = db.prepare(`INSERT INTO properties
      (id, name, property_type, city, state, country, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const now = new Date().toISOString();
    for (const row of records) {
      if (exists.get(row.id)) {
        skippedExisting.push({ id: row.id, reason: 'Código já existe no banco.' });
        continue;
      }
      const notes = [row.notes, row.areaUnit ? `Área legada: ${row.area} ${row.areaUnit}` : null,
        `Valor legado informado: ${row.value}`, row.status ? `Status legado: ${row.status}` : null]
        .filter(Boolean).join(' | ');
      insertProperty.run(row.id, row.name, row.type, row.city, row.state, 'BR', notes, now, now);
      imported += 1;
    }
    db.exec('COMMIT');
    return {
      imported,
      rejected: preview.rejected.length,
      needsReview: preview.needsReview.length,
      skippedExisting,
      sourcePreserved: true,
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
}
