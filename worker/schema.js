// Tabelas do D1 do Pulse. O próprio Worker cria/atualiza na 1ª chamada (nada a rodar à mão).
// Regra: só acrescentar passos em STEPS (nunca editar um passo já publicado — ele já rodou no banco real).

export const STEPS = [
  // 1 — contas, aparelhos conectados, passkeys, convites, trava de tentativas, registros sincronizados
  [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
      pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, pass_iter INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS passkeys (
      cred_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL,
      transports TEXT, rp_id TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id)`,
    `CREATE TABLE IF NOT EXISTS logins (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, device TEXT,
      method TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS logins_user ON logins(user_id)`,
    `CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, challenge TEXT NOT NULL, rp_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS invites (
      code_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS records (
      user_id TEXT NOT NULL, t TEXT NOT NULL, k TEXT NOT NULL, u INTEGER NOT NULL, v TEXT,
      seq INTEGER NOT NULL, device TEXT, received_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, t, k))`,
    `CREATE INDEX IF NOT EXISTS records_seq ON records(seq)`,
    `CREATE INDEX IF NOT EXISTS records_user_seq ON records(user_id, seq)`,
  ],
  // 2 — ponte com o Plano da Família: até onde já trouxe os pesos de cada pessoa
  [`CREATE TABLE IF NOT EXISTS bridge_state (user_id TEXT PRIMARY KEY, since INTEGER NOT NULL, last_at INTEGER NOT NULL)`],
  // fotos de progresso (cópia das do aparelho; base64 do JPEG), por pessoa; apagada = lápide (deleted_at, sem a imagem)
  [`CREATE TABLE IF NOT EXISTS photos (
      user_id TEXT NOT NULL, id TEXT NOT NULL, date TEXT NOT NULL, pose TEXT NOT NULL, note TEXT,
      size INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, deleted_at INTEGER,
      PRIMARY KEY (user_id, id))`],
  // ponte: conferência completa do peso uma vez (o Pulse virou o oficial; zera o estado → próxima sincronização relê tudo)
  [`DELETE FROM bridge_state`],
  // de novo: a pessoa lá passou a ser "rafael" (antes ia como "rafa"); a conferência manda o histórico de peso para "rafael"
  [`DELETE FROM bridge_state`],
  // lixeira: o conteúdo de cada registro apagado fica 3 dias (a lápide em records não guarda o valor)
  [
    `CREATE TABLE IF NOT EXISTS trash (user_id TEXT NOT NULL, t TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, deleted_at INTEGER NOT NULL, device TEXT, PRIMARY KEY (user_id, t, k))`,
    `CREATE INDEX IF NOT EXISTS trash_when ON trash (user_id, deleted_at)`,
  ],
  // erros que apareceram na tela do app (os últimos 200 por pessoa), para corrigir sem precisar de print
  [`CREATE TABLE IF NOT EXISTS errors (user_id TEXT NOT NULL, at INTEGER NOT NULL, message TEXT NOT NULL, route TEXT, stack TEXT, version TEXT, device TEXT)`, `CREATE INDEX IF NOT EXISTS errors_user ON errors (user_id, at)`],
  // conector do Claude: endereço secreto por pessoa (só o sha256 do token)
  [`CREATE TABLE IF NOT EXISTS mcp_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)`, `CREATE INDEX IF NOT EXISTS mcp_tokens_user ON mcp_tokens (user_id)`],
  // anotações do Feedback do app (o Claude lê no começo de cada sessão; o que vira melhoria vai para src/data/feedback-done.ts)
  [`CREATE TABLE IF NOT EXISTS feedback (user_id TEXT NOT NULL, at INTEGER NOT NULL, text TEXT NOT NULL, route TEXT, version TEXT, received_at INTEGER NOT NULL, PRIMARY KEY (user_id, at))`],
];

export const SCHEMA_VERSION = STEPS.length;

const ready = new WeakMap(); // por banco: confere o esquema uma vez por instância do Worker

async function migrate(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)`).run();
  const row = await DB.prepare(`SELECT version FROM schema_version WHERE id = 1`).first();
  const current = row?.version ?? 0;
  for (let i = current; i < STEPS.length; i++) {
    await DB.batch([
      ...STEPS[i].map((sql) => DB.prepare(sql)),
      DB.prepare(`INSERT INTO schema_version (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version`).bind(i + 1),
    ]);
  }
}

/** Devolve o D1 com as tabelas prontas. */
export function database(env) {
  if (!env.DB) throw new Error("Banco D1 (DB) não ligado ao Worker.");
  if (!ready.has(env.DB)) ready.set(env.DB, migrate(env.DB).catch((e) => { ready.delete(env.DB); throw e; }));
  return ready.get(env.DB).then(() => env.DB);
}
