/**
 * Portable SQLite driver for Node test/tooling environments.
 *
 * Resolution order:
 *  1. Built-in `node:sqlite` (Node >= 22.5) — preferred, used unchanged.
 *  2. `better-sqlite3` npm package — API-compatible fallback exposing the
 *     same `DatabaseSync` surface (exec / prepare.run/get/all / close).
 *
 * The fallback is clearly reported via `driverName` so tests and tools never
 * silently assume which engine validated a database. Production mobile/
 * desktop access still goes through the native shell layer; this module only
 * exists for Node-side migration runners, backup validation and tests.
 */

export let driverName = 'node:sqlite';
let DatabaseImpl = null;

try {
  const native = await import('node:sqlite');
  DatabaseImpl = native.DatabaseSync;
} catch {
  try {
    const { default: BetterSQLite3 } = await import('better-sqlite3');
    driverName = 'better-sqlite3';
    DatabaseImpl = class DatabaseSync {
      #db;
      constructor(path, options = {}) {
        // node:sqlite opens read-write-create by default; mirror that here.
        this.#db = new BetterSQLite3(path, { readonly: options.readOnly === true });
      }
      exec(sql) {
        // node:sqlite exec supports multiple statements; better-sqlite3 too.
        this.#db.exec(sql);
      }
      prepare(sql) {
        const stmt = this.#db.prepare(sql);
        return {
          run(...params) { return stmt.run(...params); },
          get(...params) {
            const row = stmt.get(...params);
            return row === undefined ? undefined : row;
          },
          all(...params) { return stmt.all(...params); },
        };
      }
      close() {
        this.#db.close();
      }
    };
  } catch {
    throw new Error(
      'Nenhum driver SQLite disponível: instale Node >= 22.5 (node:sqlite) ou adicione a dependência "better-sqlite3".',
    );
  }
}

export { DatabaseImpl as DatabaseSync };
