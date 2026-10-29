const LENGTH_TO_METERS = Object.freeze({ mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048 });
const AREA_TO_SQUARE_METERS = Object.freeze({ mm2: 1e-6, cm2: 1e-4, m2: 1, ha: 10000, km2: 1e6, ft2: 0.09290304, acre: 4046.8564224 });
const VOLUME_TO_CUBIC_METERS = Object.freeze({ ml: 1e-6, l: 0.001, m3: 1, cm3: 1e-6, ft3: 0.028316846592 });
const ANGLE_TO_RADIANS = Object.freeze({ rad: 1, deg: Math.PI / 180 });

const TABLES = Object.freeze({
  length: LENGTH_TO_METERS,
  area: AREA_TO_SQUARE_METERS,
  volume: VOLUME_TO_CUBIC_METERS,
  angle: ANGLE_TO_RADIANS,
});

export function convertMeasurement(value, fromUnit, toUnit, quantity) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Measurement must be a finite non-negative number.');
  const units = TABLES[quantity];
  if (!units) throw new TypeError(`Unsupported quantity: ${quantity}`);
  if (!(fromUnit in units) || !(toUnit in units)) throw new TypeError(`Unsupported unit for ${quantity}: ${fromUnit} -> ${toUnit}`);
  return value * units[fromUnit] / units[toUnit];
}

export function normalizeMeasurement(value, unit, quantity) {
  const canonicalUnit = { length: 'm', area: 'm2', volume: 'm3', angle: 'rad' }[quantity];
  return { value: convertMeasurement(value, unit, canonicalUnit, quantity), unit: canonicalUnit };
}

export const supportedUnits = Object.freeze({
  length: Object.keys(LENGTH_TO_METERS),
  area: Object.keys(AREA_TO_SQUARE_METERS),
  volume: Object.keys(VOLUME_TO_CUBIC_METERS),
  angle: Object.keys(ANGLE_TO_RADIANS),
});
