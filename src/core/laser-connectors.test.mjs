import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSenaAsciiFrame,
  parseLeicaDistoFrame,
  createDeviceRegistry,
  createSimulatorAdapter,
  assertAdapterShape,
  encodeFrame,
  COMPATIBILITY_STATUSES,
} from './laser-connectors.mjs';

test('SENA-style ASCII frames parse with original unit preserved', () => {
  assert.deepEqual(parseSenaAsciiFrame(encodeFrame('3,45 m\r\n')), { value: 3.45, unit: 'm', raw: '3,45 m', format: 'sena-ascii-v1' });
  assert.equal(parseSenaAsciiFrame(encodeFrame('120 cm')).value, 120);
  assert.equal(parseSenaAsciiFrame(encodeFrame('120 cm')).unit, 'cm');
  assert.equal(parseSenaAsciiFrame(encodeFrame('98.2 in')).unit, 'in');
});

test('malformed or non-positive frames are rejected without throwing', () => {
  for (const bad of ['', 'abc', '-1 m', '0 m', '12..3 m', 'NaN m']) {
    const r = parseSenaAsciiFrame(encodeFrame(bad));
    assert.ok(r.error, `expected rejection for "${bad}"`);
  }
  // Binary garbage (non-printable) is rejected as malformed, not parsed.
  const r = parseSenaAsciiFrame(new Uint8Array([0x00, 0x01, 0xff]));
  assert.match(r.error, /Non-ASCII/);
});

test('Leica DISTO Transfer frames parse millimetres only when documented', () => {
  assert.deepEqual(parseLeicaDistoFrame(encodeFrame('DDistMm;3450\r\n')), { value: 3450, unit: 'mm', raw: 'DDistMm;3450', format: 'leica-disto-transfer-v1' });
  assert.ok(parseLeicaDistoFrame(encodeFrame('DDistMm;abc')).error);
  assert.ok(parseLeicaDistoFrame(encodeFrame('3,45 m')).error);
});

test('registry enforces explicit compatibility statuses and never claims universality', () => {
  const reg = createDeviceRegistry([
    { manufacturer: 'GenericBLE', model: 'XLS-100', protocol: 'bluetooth_le', status: 'documented', supportLevel: 'measurement_receipt' },
    { manufacturer: 'ImobiScan', model: 'sim-lab-rig', protocol: 'simulated', status: 'tested', testedVersions: ['v1'] },
    { manufacturer: 'SomeBrand', model: 'Z9', protocol: 'unknown', status: 'unverified' },
  ]);
  assert.throws(() => reg.register({ manufacturer: 'A', model: 'B', protocol: 'ble', status: 'magic' }), TypeError);
  assert.throws(() => reg.register({ model: 'no-manufacturer', protocol: 'ble', status: 'tested' }), TypeError);

  const m = reg.matrix();
  assert.equal(m.tested.length, 1);
  assert.equal(m.partiallySupported.length, 1);
  assert.equal(m.unverified.length, 1);
  assert.match(m.disclaimer, /No universal compatibility/);
  assert.deepEqual(COMPATIBILITY_STATUSES, ['unverified', 'documented', 'tested', 'unsupported']);
});

test('simulator adapter is explicitly labelled and drives the full receive pipeline', async () => {
  const sim = createSimulatorAdapter();
  const info = sim.describe();
  assert.equal(info.isSimulator, true);
  assert.match(info.limitations.join(' '), /Simulation only/);
  assert.doesNotThrow(() => assertAdapterShape(sim));

  const devices = await sim.discover();
  assert.equal(devices[0].simulator, true);

  const conn = await sim.connect(devices[0]);
  const received = [];
  sim.onReading(conn, (reading) => received.push(reading));
  sim.injectFrame(encodeFrame('2,50 m'));
  sim.injectFrame(encodeFrame('garbage'));
  assert.equal(received.length, 2);
  assert.equal(received[0].value, 2.5);
  assert.ok(received[1].error);
  await sim.disconnect(conn);

  // An adapter missing required operations is rejected.
  assert.throws(() => assertAdapterShape({ discover: () => {} }), TypeError);
});
