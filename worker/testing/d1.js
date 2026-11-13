// D1 de mentira para os testes: a mesma API (prepare/bind/first/all/run/batch) sobre o SQLite do Node.
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Stmt(this.db, this.sql, params.map((p) => (p === undefined ? null : typeof p === "boolean" ? Number(p) : p)));
  }
  exec() {
    const s = this.db.prepare(this.sql);
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) return { results: s.all(...this.params).map((r) => ({ ...r })), meta: { changes: 0 } };
    const r = s.run(...this.params);
    return { results: [], meta: { changes: Number(r.changes) } };
  }
  async first(col) {
    const row = this.exec().results[0] ?? null;
    return col ? row?.[col] ?? null : row;
  }
  async all() {
    return this.exec();
  }
  async run() {
    return this.exec();
  }
}

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
