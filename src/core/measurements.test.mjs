import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMeasurementRecord,
  reviseMeasurement,
  detectDivergence,
  prioritizeMeasurement,
  CANONICAL_UNITS,
} from './measurements.mjs';

test('creates a laser record preserving original value/unit and normalizing', () => {
  const rec = createMeasurementRecord({ value: 350, unit: 'cm', method: 'laser', deviceId: 'dev-1' });
  assert.equal(rec.originalValue, 350);
  assert.equal(rec.originalUnit, 'cm');
  assert.ok(Math.abs(rec.normalizedValue - 3.5) < 1e-9);
  assert.equal(rec.normalizedUnit, CANONICAL_UNITS.length);
  assert.equal(rec.method, 'laser');
  assert.equal(rec.deviceId, 'dev-1');
  assert.equal(rec.isEstimate, false);
  assert.equal(rec.validationState, 'unreviewed');
});

test('flags camera estimates without inventing uncertainty', () => {
  const est = createMeasurementRecord({ value: 2.4, unit: 'm', method: 'camera_ar' });
  assert.equal(est.isEstimate, true);
  assert.equal(est.uncertaintyValue, null);
  const img = createMeasurementRecord({ value: 1.1, unit: 'm', method: 'image_estimate' });
  assert.equal(img.isEstimate, true);
});

test('keeps explicitly provided uncertainty in canonical unit', () => {
  const rec = createMeasurementRecord({
    value: 5, unit: 'm', method: 'laser',
    uncertainty: { value: 1.5, unit: 'mm' },
  });
  assert.ok(Math.abs(rec.uncertaintyValue - 0.0015) < 1e-12);
  assert.equal(rec.uncertaintyUnit, 'm');
});

test('rejects unknown methods, states and invalid uncertainty', () => {
  assert.throws(() => createMeasurementRecord({ value: 1, unit: 'm', method: 'telepathy' }), TypeError);
  assert.throws(() => createMeasurementRecord({ value: 1, unit: 'm', method: 'manual', validationState: 'magic' }), TypeError);
  assert.throws(() => createMeasurementRecord({ value: 1, unit: 'm', method: 'manual', uncertainty: { value: -2, unit: 'mm' } }), RangeError);
});

test('revision preserves history and refuses silent change of confirmed values', () => {
  let rec = createMeasurementRecord({ value: 3, unit: 'm', method: 'manual' });
  rec = reviseMeasurement(rec, { value: 3.05, unit: 'm', reason: 'Rechecked with tape' });
  assert.equal(rec.revision, 2);
  assert.equal(rec.history.length, 1);
  assert.equal(rec.history[0].previousValue, 3);
  assert.equal(rec.originalValue, 3.05);

  const confirmed = { ...rec, validationState: 'confirmed' };
  assert.throws(() => reviseMeasurement(confirmed, { value: 9, unit: 'm', reason: 'oops' }), /explicit override/);
  const forced = reviseMeasurement(confirmed, { value: 9, unit: 'm', reason: 'corrected after audit', allowConfirmedOverride: true });
  assert.equal(forced.revision, 3);
  assert.equal(forced.history.length, 2);
  assert.throws(() => reviseMeasurement(rec, { value: 4, unit: 'm', reason: '   ' }), TypeError);
});

test('divergence reports both values for user decision without auto-adjustment', () => {
  const est = createMeasurementRecord({ value: 3.1, unit: 'm', method: 'camera_ar' });
  const phys = createMeasurementRecord({ value: 3.0, unit: 'm', method: 'laser' });
  const d = detectDivergence(est, phys, 0.05);
  assert.equal(d.divergent, true);
  assert.equal(d.resolution, 'pending_user_decision');
  assert.ok(Math.abs(d.difference - 0.1) < 1e-9);
  // Values untouched:
  assert.equal(d.estimate.normalizedValue, est.normalizedValue);
  assert.equal(d.physical.normalizedValue, phys.normalizedValue);

  const close = detectDivergence(
    createMeasurementRecord({ value: 3.01, unit: 'm', method: 'camera_ar' }),
    phys, 0.05,
  );
  assert.equal(close.divergent, false);
});

test('prioritization keeps the estimate and never deletes data', () => {
  const est = createMeasurementRecord({ value: 3.1, unit: 'm', method: 'camera_ar' });
  const unconfirmed = createMeasurementRecord({ value: 3.0, unit: 'm', method: 'laser' });
  const p1 = prioritizeMeasurement(est, unconfirmed);
  assert.equal(p1.primary.id, est.id);

  const confirmed = { ...unconfirmed, validationState: 'confirmed' };
  const p2 = prioritizeMeasurement(est, confirmed);
  assert.equal(p2.primary.validationState, 'confirmed');
  assert.equal(p2.secondary.id, est.id); // estimate preserved, not deleted
});
