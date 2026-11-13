// Ponte com o Plano da Família (Worker "plano-familia", app de dieta/saúde da família).
// Ligação interna entre Workers (service binding FAMILIA → classe Ponte de lá), sem rota pública.
//
// - Peso único, e o do Pulse é o oficial (pedido do Rafael, 29/10): o Plano da Família espelha o peso de cada dia
//   do Pulse (uma linha por dia; com dois pesos no mesmo dia, vale o mais novo). Peso registrado lá vem para o
//   Pulse (registro "pf-<dia>") e, dali, volta como o oficial. Lá diferente do Pulse e o Pulse mais novo → corrige lá.
// - "Treinou hoje?": treino finalizado no Pulse responde "sim"; dia pulado responde "não".
// - Pessoa = o id da pessoa no Plano da Família ("rafael", "marina"): o login da conta, ou o de `PESSOA` quando difere.
//
// Nada aqui pode atrapalhar a sincronização: sem a ligação (testes, dev) ou com erro do outro lado,
// só registra no log e segue.

import { addDays, blockStatus, scheduledDay } from "../src/lib/calendar.ts";

// shortcut: login → pessoa escrito à mão (o Rafael entra como "rafa"); se entrar outra conta com login diferente, acrescentar aqui
const PESSOA = { rafa: "rafael" };
/** Id da pessoa no Plano da Família para uma conta do Pulse (sem o ajuste "Você na Mesa"). */
export const personOf = (login) => PESSOA[login] ?? login;

/** Pessoa na Mesa: o ajuste "familyPerson" da conta (Ajustes → Família), ou `personOf(login)`. */
export async function personFor(DB, user) {
  const r = await DB.prepare(`SELECT v FROM records WHERE user_id = ? AND t = 'settings' AND k = 'familyPerson'`).bind(user.id).first();
  const v = r?.v ? JSON.parse(r.v).value : null;
  return typeof v === "string" && /^[a-z0-9_-]{1,24}$/.test(v) ? v : personOf(user.login);
}

/** De quanto em quanto tempo (no máximo) o Pulse pergunta os pesos novos ao Plano da Família. */
export const IMPORT_EVERY_MS = 2 * 60_000;
const PF = "pf-";

const peso = (v) => v && v.type === "peso" && /^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "") && Number.isFinite(v.value);

/**
 * O que repassar ao Plano da Família por causa de mudanças aceitas na sincronização.
 * `before`: valor anterior de cada registro (para saber o que uma lápide apagou).
 */
export function opsFor(person, changes, before) {
  const ops = [];
  for (const c of changes) {
    const v = c.v == null ? null : JSON.parse(c.v);
    const old = before.get(`${c.t}\u0000${c.k}`) ?? null;
    if (c.t === "measures") {
      if (peso(v)) ops.push({ kind: "weight", person, day: v.date, v: String(v.value) });
      // apagou (ou mudou a data de) um peso: apaga o dia antigo lá
      if (peso(old) && (!peso(v) || old.date !== v.date)) ops.push({ kind: "weight", person, day: old.date, deleted: 1 });
    } else if (c.t === "sessions") {
      if (v?.status === "done" && /^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "")) ops.push({ kind: "trained", person, day: v.date, v: "1" });
    } else if (c.t === "skips" && /^\d{4}-\d{2}-\d{2}$/.test(c.k)) {
      ops.push(v ? { kind: "trained", person, day: c.k, v: "0" } : { kind: "trained", person, day: c.k, deleted: 1 });
    }
  }
  return ops;
}

/** Valores atuais (antes de gravar) dos registros que vão mudar. */
export async function snapshot(DB, userId, changes) {
  const relevant = changes.filter((c) => c.t === "measures");
  if (!relevant.length) return new Map();
  const { results } = await DB.prepare(
    `SELECT r.t, r.k, r.v FROM json_each(?2) AS j CROSS JOIN records r
     ON r.user_id = ?1 AND r.t = json_extract(j.value, '$.t') AND r.k = json_extract(j.value, '$.k')`,
  )
    .bind(userId, JSON.stringify(relevant.map((c) => ({ t: c.t, k: c.k }))))
    .all();
  return new Map(results.map((r) => [`${r.t}\u0000${r.k}`, r.v == null ? null : JSON.parse(r.v)]));
}

const weightOp = (person, day, w) => (w ? { kind: "weight", person, day, v: String(w.v.value) } : { kind: "weight", person, day, deleted: 1 });

/** Troca cada op de peso pelo peso oficial do dia no Pulse (já gravado), para lá ficar igual ao Pulse. */
export async function settleWeights(DB, userId, person, ops) {
  const days = new Set(ops.filter((o) => o.kind === "weight").map((o) => o.day));
  if (!days.size) return ops;
  const mine = await pulsoWeights(DB, userId);
  return [...ops.filter((o) => o.kind !== "weight"), ...[...days].map((d) => weightOp(person, d, mine.get(d)))];
}

/** Treino finalizado num dia → também o gasto do cardio daquele dia (soma das kcal registradas), para a Mesa mostrar. */
export async function burnOps(DB, userId, person, ops) {
  const days = [...new Set(ops.filter((o) => o.kind === "trained" && o.v === "1").map((o) => o.day))];
  if (!days.length) return ops;
  const { results } = await DB.prepare(
    `SELECT json_extract(x.v, '$.cardio.kcal') AS kcal, json_extract(s.v, '$.date') AS day FROM records s
     JOIN records x ON x.user_id = s.user_id AND x.t = 'sets' AND x.v IS NOT NULL AND json_extract(x.v, '$.sessionId') = s.k
     WHERE s.user_id = ?1 AND s.t = 'sessions' AND s.v IS NOT NULL AND json_extract(s.v, '$.status') = 'done'
       AND json_extract(s.v, '$.date') IN (SELECT value FROM json_each(?2))
       AND json_extract(x.v, '$.mode') = 'cardio' AND json_extract(x.v, '$.done') = 1`,
  )
    .bind(userId, JSON.stringify(days))
    .all();
  const kcal = new Map();
  for (const r of results) if (Number(r.kcal) > 0) kcal.set(r.day, (kcal.get(r.day) ?? 0) + Number(r.kcal));
  return [...ops, ...[...kcal].map(([day, v]) => ({ kind: "burn", person, day, v: String(Math.round(v)) }))];
}

// ---------- agenda de treino para a Mesa (item 4.1 do roadmap da Mesa) ----------
// Próximos 21 dias do plano ativo: "1|HH:MM|Nome do treino" (dia de treino; HH:MM = horário do lembrete de treino, se houver)
// ou "0" (descanso). A Mesa usa para treino/descanso do dia e o horário do pré/pós-treino.
// Manda quando muda o plano, o plano ativo, o horário ou a pessoa, e no máximo uma vez por dia no resto.
const AGENDA_DIAS = 21;
const MEXE_NA_AGENDA = new Set(["activePlanId", "remindTime", "familyPerson"]);

/** Os dias da agenda (função pura, testada). */
export function agendaDoPlano(plan, hoje, hora) {
  const ops = [];
  for (let i = 0; i < AGENDA_DIAS; i++) {
    const day = addDays(hoje, i);
    if (blockStatus(plan, day) !== "live") continue;
    const d = scheduledDay(plan, day);
    ops.push({ kind: "pulse", day, v: d ? `1|${hora}|${d.name ?? d.key}` : "0" });
  }
  return ops;
}

export async function agendaOps(env, DB, userId, person, changes, now = Date.now()) {
  if (!env.KV) return [];
  const hoje = new Date(now - 3 * 3600_000).toISOString().slice(0, 10); // dia em São Paulo
  const chave = `ponte-agenda:${userId}`;
  const mexeu = changes.some((c) => c.t === "plans" || (c.t === "settings" && MEXE_NA_AGENDA.has(c.k)));
  if (!mexeu && (await env.KV.get(chave)) === hoje) return [];
  await env.KV.put(chave, hoje, { expirationTtl: 3 * 86_400 });
  const { results } = await DB.prepare(`SELECT k, v FROM records WHERE user_id = ? AND t = 'settings' AND k IN ('activePlanId', 'remindTime') AND v IS NOT NULL`).bind(userId).all();
  const s = Object.fromEntries(results.map((r) => [r.k, JSON.parse(r.v).value]));
  if (!s.activePlanId) return [];
  const r = await DB.prepare(`SELECT v FROM records WHERE user_id = ? AND t = 'plans' AND k = ? AND v IS NOT NULL`).bind(userId, s.activePlanId).first();
  const plan = r && JSON.parse(r.v).plan;
  if (!plan) return [];
  return agendaDoPlano(plan, hoje, /^\d{2}:\d{2}$/.test(s.remindTime ?? "") ? s.remindTime : "").map((o) => ({ ...o, person }));
}

export async function forward(env, person, ops) {
  if (!env.FAMILIA || !ops.length) return;
  try {
    for (let i = 0; i < ops.length; i += 200) await env.FAMILIA.gravar(ops.slice(i, i + 200));
  } catch (e) {
    console.error("ponte: gravar no Plano da Família falhou", e);
  }
}

/** Pesos do Pulse de cada dia (o mais recente quando há mais de um no dia). */
async function pulsoWeights(DB, userId) {
  const { results } = await DB.prepare(
    `SELECT k, u, v FROM records WHERE user_id = ? AND t = 'measures' AND v IS NOT NULL AND json_extract(v, '$.type') = 'peso'`,
  )
    .bind(userId)
    .all();
  const byDay = new Map();
  for (const r of results) {
    const v = JSON.parse(r.v);
    if (!peso(v)) continue;
    const cur = byDay.get(v.date);
    if (!cur || r.u > cur.u) byDay.set(v.date, { k: r.k, u: r.u, v });
  }
  return byDay;
}

/**
 * Traz os pesos novos do Plano da Família para os registros do Pulse (no máximo a cada 2 min por pessoa).
 * Na primeira vez também manda ao Plano da Família o histórico de peso que só existe no Pulse.
 * `write(records)`: grava registros { t, k, u, v } pelo mesmo caminho da sincronização.
 */
export async function importWeights(env, DB, user, write, now = Date.now()) {
  if (!env.FAMILIA) return 0;
  const person = user.person ?? personOf(user.login);
  try {
    const state = await DB.prepare(`SELECT since, last_at FROM bridge_state WHERE user_id = ?`).bind(user.id).first();
    if (state && now - state.last_at < IMPORT_EVERY_MS) return 0;
    const since = state?.since ?? 0;
    const { rows } = await env.FAMILIA.pesos(person, since);
    const mine = await pulsoWeights(DB, user.id);
    const recs = [];
    const fix = [];
    for (const row of rows) {
      const cur = mine.get(row.day);
      if (cur && cur.u >= row.updated) {
        // o Pulse tem algo mais novo nesse dia e é o oficial: lá diferente (ou apagado) → corrige lá
        if (row.deleted || row.kg !== cur.v.value) fix.push(weightOp(person, row.day, cur));
        continue;
      }
      if (row.deleted) {
        if (cur) recs.push({ t: "measures", k: cur.k, u: row.updated, v: null });
        continue;
      }
      if (!Number.isFinite(row.kg)) continue;
      if (cur) {
        if (cur.v.value !== row.kg) recs.push({ t: "measures", k: cur.k, u: row.updated, v: JSON.stringify({ ...cur.v, value: row.kg }) });
      } else {
        const id = `${PF}${row.day}`;
        recs.push({ t: "measures", k: id, u: row.updated, v: JSON.stringify({ id, date: row.day, type: "peso", value: row.kg, note: "Plano da Família" }) });
      }
    }
    if (recs.length) await write(recs);
    // 1ª vez (ou conferência completa, que zera o bridge_state): o histórico que só o Pulse tem vai para lá
    if (!state) {
      const there = new Set(rows.map((r) => r.day));
      for (const w of mine.values()) if (!there.has(w.v.date)) fix.push(weightOp(person, w.v.date, w));
    }
    await forward(env, person, fix);
    const next = Math.max(since, ...rows.map((r) => r.updated));
    await DB.prepare(`INSERT INTO bridge_state (user_id, since, last_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET since = ?2, last_at = ?3`)
      .bind(user.id, next, now)
      .run();
    return recs.length;
  } catch (e) {
    console.error("ponte: ler pesos do Plano da Família falhou", e);
    return 0;
  }
}
