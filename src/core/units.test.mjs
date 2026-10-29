import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMeasurement, normalizeMeasurement } from './units.mjs';

test('converts metric length units', () => {
  assert.equal(convertMeasurement(100, 'cm', 'm', 'length'), 1);
  assert.equal(convertMeasurement(1.5, 'km', 'm', 'length'), 1500);
});
test('converts area without confusing hectares and square metres', () => {
  assert.equal(convertMeasurement(1, 'ha', 'm2', 'area'), 10000);
  assert.equal(convertMeasurement(2, 'm2', 'ha', 'area'), 0.0002);
});
test('converts volume and angle', () => {
  assert.equal(convertMeasurement(1000, 'l', 'm3', 'volume'), 1);
  assert.equal(convertMeasurement(180, 'deg', 'rad', 'angle'), Math.PI);
});
test('normalizes a measurement with canonical unit', () => {
  assert.deepEqual(normalizeMeasurement(250, 'cm', 'length'), { value: 2.5, unit: 'm' });
});
test('rejects invalid values and cross-quantity units', () => {
  assert.throws(() => convertMeasurement(-1, 'm', 'cm', 'length'), RangeError);
  assert.throws(() => convertMeasurement(1, 'm', 'm2', 'length'), TypeError);
  assert.throws(() => convertMeasurement(Number.NaN, 'm', 'cm', 'length'), RangeError);
});
