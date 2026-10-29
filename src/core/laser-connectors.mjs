/**
 * Laser device connector layer (master prompt section 7).
 *
 * Design rules:
 * - One common interface (LaserDeviceAdapter) with independent adapters.
 * - Compatibility claims come ONLY from the registry, which distinguishes
 *   'unverified', 'documented' and 'tested' — never "universal support".
 * - Parsers accept only documented frame formats; malformed frames are
 *   rejected explicitly. Received values keep original unit + device origin.
 * - If a device transmits only a distance, no coordinates/angles/positions
 *   are invented.
 */

export const SUPPORT_LEVELS = Object.freeze({
  NONE: 'unsupported',
  DISCOVERY_ONLY: 'discovery_only',
  MEASUREMENT_RECEIPT: 'measurement_receipt',
  TRIGGER_MEASUREMENT: 'trigger_measurement',
});

export const COMPATIBILITY_STATUSES = Object.freeze(['unverified', 'documented', 'tested', 'unsupported']);

/**
 * Contract every adapter must implement:
 *   discover()            -> Promise<DiscoveredDevice[]>
 *   connect(device)       -> Promise<Connection>
 *   disconnect(connection)-> Promise<void>
 *   requestMeasurement(c) -> Promise<Reading>      (when supported)
 *   onReading(connection, cb)                       (device-pushed readings)
 *   parseFrame(bytes)     -> Reading|null|ErrorInfo (documented formats only)
 *   describe()            -> { manufacturer, model, protocol, supportLevel, testedVersions, limitations }
 */
export function assertAdapterShape(adapter) {
  const required = ['discover', 'connect', 'disconnect', 'parseFrame', 'describe'];
  for (const fn of required) {
    if (typeof adapter?.[fn] !== 'function') {
      throw new TypeError(`Adapter does not implement ${fn}()`);
    }
  }
  return true;
}

/** Decode ASCII bytes; return null when the buffer is not printable ASCII. */
function asciiPayload(bytes) {
  let out = '';
  for (const b of bytes) {
    if (b < 0x20 && b !== 0x0d && b !== 0x0a) return null;
    out += String.fromCharCode(b);
  }
  return out.replace(/\r?\n$/, '');
}

/**
 * Parser for the documented SENA / DEXLAN-compatible ASCII string protocol
 * used by several generic BLE laser meters ("X,xx m" / "xx cm" / "xx in").
 * Values are kept exactly as received; normalization happens downstream in
 * the measurement engine. Returns { error } for malformed frames instead of
 * throwing, so transports can log without secrets.
 */
export function parseSenaAsciiFrame(bytes) {
  const text = asciiPayload(bytes);
  if (text === null) return { error: 'Non-ASCII frame rejected.' };
  const match = /^([\d]+([.,]\d+)?)\s*(m|cm|mm|in|ft)?$/i.exec(text.trim());
  if (!match) return { error: `Malformed measurement frame: "${text}"` };
  const value = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return { error: 'Non-positive or non-finite reading rejected.' };
  const unit = (match[3] ?? 'm').toLowerCase();
  return { value, unit, raw: text, format: 'sena-ascii-v1' };
}

/**
 * Parser for the documented Leica DISTO Transfer serial protocol frame:
 * "DDistMm;<value>" terminated by \r\n, value in millimetres.
 */
export function parseLeicaDistoFrame(bytes) {
  const text = asciiPayload(bytes);
  if (text === null) return { error: 'Non-ASCII frame rejected.' };
  const match = /^DDistMm;(\d+)$/i.exec(text.trim());
  if (!match) return { error: `Malformed Leica DISTO frame: "${text}"` };
  const mm = Number.parseInt(match[1], 10);
  if (!Number.isFinite(mm) || mm <= 0) return { error: 'Non-positive distance rejected.' };
  return { value: mm, unit: 'mm', raw: text, format: 'leica-disto-transfer-v1' };
}

/**
 * Device compatibility registry. Entries record manufacturer, model,
 * protocol, implemented features, tested firmware/app versions and known
 * limitations. Manufacturer names alone are investigation targets — entries
 * without an explicit 'tested' status are never presented as verified.
 */
export function createDeviceRegistry(initialEntries = []) {
  const entries = new Map();
  const key = (manufacturer, model) => `${manufacturer.toLowerCase()}::${model.toLowerCase()}`;

  function register(entry) {
    if (!entry.manufacturer || !entry.model) throw new TypeError('Registry entry requires manufacturer and model.');
    if (!COMPATIBILITY_STATUSES.includes(entry.status)) {
      throw new TypeError(`Invalid compatibility status: ${entry.status}. Use one of ${COMPATIBILITY_STATUSES.join(', ')}.`);
    }
    entries.set(key(entry.manufacturer, entry.model), {
      supportLevel: SUPPORT_LEVELS.NONE,
      testedVersions: [],
      limitations: [],
      ...entry,
    });
    return entry;
  }

  function lookup(manufacturer, model) {
    return entries.get(key(manufacturer, model)) ?? null;
  }

  /** Public compatibility matrix, clearly split by verification status. */
  function matrix() {
    const all = [...entries.values()];
    return {
      tested: all.filter((e) => e.status === 'tested'),
      partiallySupported: all.filter((e) => e.status === 'documented'),
      unverified: all.filter((e) => e.status === 'unverified'),
      unsupported: all.filter((e) => e.status === 'unsupported'),
      disclaimer: 'Statuses reflect implementation state only. No universal compatibility is claimed; devices without direct integration fall back to manual entry, file import or camera estimation.',
    };
  }

  for (const e of initialEntries) register(e);
  return { register, lookup, matrix, size: () => entries.size };
}

/**
 * Simulator adapter — EXPLICITLY labelled as simulation. It exercises the
 * full receive pipeline (frames -> parsing -> normalized reading) without
 * any physical hardware and must never be reported as real device support.
 */
export function createSimulatorAdapter({ frames = [], deviceName = 'SIMULATOR (no physical device)' } = {}) {
  let listeners = [];
  const adapter = {
    describe: () => ({
      manufacturer: 'ImobiScan',
      model: 'protocol-simulator',
      protocol: 'simulated',
      supportLevel: SUPPORT_LEVELS.MEASUREMENT_RECEIPT,
      testedVersions: ['internal'],
      limitations: ['Simulation only. Not evidence of compatibility with any physical device.'],
      isSimulator: true,
    }),
    discover: async () => [{ id: 'sim-1', name: deviceName, simulator: true, rssi: null }],
    connect: async () => ({ id: 'sim-1', connected: true, simulator: true }),
    disconnect: async () => {},
    parseFrame: parseSenaAsciiFrame,
    onReading: (_connection, cb) => {
      listeners.push(cb);
      return () => { listeners = listeners.filter((l) => l !== cb); };
    },
    /** Feed a documented frame through the same validation path a device would use. */
    injectFrame: (bytes) => {
      const parsed = adapter.parseFrame(bytes);
      for (const l of listeners) l(parsed);
      return parsed;
    },
    startAutoFeed: () => {
      for (const f of frames) adapter.injectFrame(f);
    },
  };
  assertAdapterShape(adapter);
  return adapter;
}

/** Text encoder helper so tests can build byte frames like a BLE stack would. */
export function encodeFrame(text) {
  return new TextEncoder().encode(text);
}
