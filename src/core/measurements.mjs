import { convertMeasurement, normalizeMeasurement } from './units.mjs';

/** Internal canonical unit per quantity. */
export const CANONICAL_UNITS = Object.freeze({
  length: 'm',
  area: 'm2',
  volume: 'm3',
  angle: 'rad',
});

/** Acquisition methods recognised by the hybrid survey module. */
export const MEASUREMENT_METHODS = Object.freeze([
  'laser',          // physical laser distance meter (real device)
  'simulator',      // protocol simulator — never presented as a real device
  'camera_ar',      // virtual tape measure via AR/camera
  'image_estimate', // estimate derived from photo/video analysis
  'manual',         // typed by the user
  'import',         // imported from a file or official interface
  'derived',        // computed from other measurements (area, perimeter…)
  'point_cloud',    // reconstruction / photogrammetry output
]);

export const VALIDATION_STATES = Object.freeze([
  'unreviewed',
  'needs_review',
  'confirmed',
  'rejected',
]);

/** Methods whose value is an estimate and must be flagged as such. */
const ESTIMATE_METHODS = new Set(['camera_ar', 'image_estimate', 'point_cloud']);

/**
 * Builds a complete measurement record with origin metadata, preserving the
 * original value/unit and adding the normalized canonical representation.
 * Estimates are always flagged; uncertainty is only kept when explicitly
 * provided with technical basis (never invented).
 */
export function createMeasurementRecord({
  value,
  unit,
  quantity = 'length',
  method,
  sourceLabel = null,
  deviceId = null,
  elementId = null,
  roomId = null,
  surveyId = null,
  validationState = 'unreviewed',
  uncertainty = null,
  notes = '',
  measuredAt = new Date().toISOString(),
  id = crypto.randomUUID(),
}) {
  if (!MEASUREMENT_METHODS.includes(method)) {
    throw new TypeError(`Unsupported measurement method: ${method}`);
  }
  if (!VALIDATION_STATES.includes(validationState)) {
    throw new TypeError(`Unsupported validation state: ${validationState}`);
  }
  const normalized = normalizeMeasurement(value, unit, quantity);
  let uncertaintyValue = null;
  let uncertaintyUnit = null;
  if (uncertainty !== null && uncertainty !== undefined) {
    if (!Number.isFinite(uncertainty.value) || uncertainty.value < 0) {
      throw new RangeError('Uncertainty requires a finite non-negative value.');
    }
    uncertaintyValue = convertMeasurement(uncertainty.value, uncertainty.unit, CANONICAL_UNITS[quantity], quantity);
    uncertaintyUnit = CANONICAL_UNITS[quantity];
  }
  return {
    id,
    surveyId,
    roomId,
    elementId,
    quantity,
    originalValue: value,
    originalUnit: unit,
    normalizedValue: normalized.value,
    normalizedUnit: normalized.unit,
    method,
    isEstimate: ESTIMATE_METHODS.has(method),
    sourceLabel,
    deviceId,
    measuredAt,
    validationState,
    uncertaintyValue,
    uncertaintyUnit,
    notes,
    revision: 1,
    history: [],
  };
}

/**
 * Applies a manual correction to a measurement while preserving history.
 * Confirmed measurements are protected: changing them requires an explicit
 * override so previously confirmed data is never silently destroyed.
 */
export function reviseMeasurement(record, { value, unit, reason, changedBy = null, allowConfirmedOverride = false }) {
  if (!reason || !reason.trim()) {
    throw new TypeError('A revision requires an explicit reason.');
  }
  if (record.validationState === 'confirmed' && !allowConfirmedOverride) {
    throw new Error('Confirmed measurements must be revised through an explicit override.');
  }
  const normalized = normalizeMeasurement(value, unit, record.quantity);
  const next = structuredClone(record);
  next.history.push({
    revision: record.revision,
    previousValue: record.originalValue,
    previousUnit: record.originalUnit,
    reason,
    changedAt: new Date().toISOString(),
    changedBy,
  });
  next.originalValue = value;
  next.originalUnit = unit;
  next.normalizedValue = normalized.value;
  next.normalizedUnit = normalized.unit;
  next.revision = record.revision + 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * When a visual estimate and a physical measurement disagree beyond the given
 * tolerance, both values are returned for side-by-side user decision. The
 * engine never picks a winner automatically and never adjusts values silently.
 */
export function detectDivergence(estimateRecord, physicalRecord, toleranceMeters = 0.05) {
  const diff = Math.abs(estimateRecord.normalizedValue - physicalRecord.normalizedValue);
  return {
    divergent: diff > toleranceMeters,
    difference: diff,
    tolerance: toleranceMeters,
    estimate: estimateRecord,
    physical: physicalRecord,
    resolution: 'pending_user_decision',
  };
}

/**
 * Chooses which record takes precedence for dependent geometry without
 * deleting the other one. Only confirmed records may take priority.
 */
export function prioritizeMeasurement(estimateRecord, physicalRecord) {
  if (physicalRecord.validationState !== 'confirmed') {
    return { primary: estimateRecord, secondary: physicalRecord, note: 'Physical measurement not yet confirmed.' };
  }
  return { primary: physicalRecord, secondary: estimateRecord, note: 'Confirmed physical measurement takes priority; estimate preserved.' };
}
