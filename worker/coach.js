// Conector do Claude (claude.ai → Configurações → Conectores → Adicionar conector personalizado), no modelo da Mesa:
// endereço secreto por pessoa (/api/mcp/<token>; o servidor guarda só o sha256), transporte "Streamable HTTP" no modo
// simples (cada POST = uma mensagem JSON-RPC, resposta JSON, sem SSE nem sessão).
// O Claude lê treinos, cargas, peso e o plano, e publica o plano novo — sempre conferindo antes (so_validar) e só
// publicando depois que o Rafael confirmar: mudança de treino exige aprovação.
import { HttpError, json, requireUser } from "./auth.js";
import { randomToken, sha256 } from "./crypto.js";
import { libraryForPrompt, PROMPT_FOR_CLAUDE } from "../src/lib/claudePrompt.ts";
import { LIBRARY } from "../src/lib/library.ts";
import { parsePlan } from "../src/lib/plan.ts";
import { loadHistory, loadsForPrompt } from "../src/lib/analytics.ts";
import { planDiff } from "../src/lib/insights.ts";
import { weekOf } from "../src/lib/calendar.ts";

const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCOES = `Este conector é o Pulse, o app de treino do Rafael (os dados de uma pessoa só: a dona do endereço).
Para analisar o treino ou montar o próximo bloco:
1. contexto_de_treino (treinos, cargas, peso, dores, pulos) e plano_atual.
2. formato_do_plano: regras do formato app-treino/plan@1 e a biblioteca (use SÓ esses nomes, em inglês, exatamente).
3. publicar_plano com so_validar=true: mostre ao Rafael o resumo e o que muda; ele precisa aprovar a mudança de treino.
4. Só depois do "pode publicar" dele: publicar_plano com so_validar=false. O plano aparece no celular na próxima sincronização.
Ao falar com o Rafael, cite exercícios pelo nome em inglês exatamente como no app. Nunca use Lying Triceps Extension with a Barbell.`;

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const erro = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function tratar(m, ferramentas) {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return erro(m?.id ?? null, -32600, "Requisição inválida");
  if (m.id === undefined || m.id === null) return null; // notificação: sem resposta
  switch (m.method) {
    case "initialize":
      return ok(m.id, {
        protocolVersion: VERSOES.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "pulse", title: "Pulse", version: "1.0.0" },
        instructions: INSTRUCOES,
      });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: ferramentas.map(({ run, ...t }) => t) });
    case "tools/call": {
      const f = ferramentas.find((t) => t.name === m.params?.name);
      if (!f) return erro(m.id, -32602, `Ferramenta desconhecida: ${m.params?.name}`);
      try {
        const r = await f.run(m.params.arguments || {});
        return ok(m.id, { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }], isError: false });
      } catch (e) {
        // erro de ferramenta volta como resultado: o Claude lê e corrige (ex.: erros do plano)
        return ok(m.id, { content: [{ type: "text", text: e.message }], isError: true });
      }
    }
    default:
      return erro(m.id, -32601, `Método não suportado: ${m.method}`);
  }
}

/* ---------------- dados da pessoa ---------------- */

const isoToday = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // dia em São Paulo

async function load(DB, userId) {
  const { results } = await DB.prepare(`SELECT t, k, v FROM records WHERE user_id = ? AND v IS NOT NULL AND t IN ('sessions','sets','measures','skips','settings','plans','flags','exercises')`).bind(userId).all();
  const by = { sessions: [], sets: [], measures: [], skips: [], settings: {}, plans: [], flags: [], exercises: [] };
  for (const r of results) {
    const v = JSON.parse(r.v);
    if (r.t === "settings") by.settings[v.key] = v.value;
    else by[r.t].push(v);
  }
  by.sessions = by.sessions.filter((s) => s.status === "done").sort((a, b) => a.startedAt - b.startedAt);
  return by;
}

const activePlan = (d) => d.plans.find((p) => p.id === d.settings.activePlanId) ?? null;
const fmtSet = (x) => `${x.kg != null ? x.kg : "PC"}x${x.reps ?? "?"}${x.rir != null ? `@${x.rir}` : ""}`;

/** Treinos das últimas semanas, cargas de sempre, peso, medidas, dores e pulos — compacto para o Claude ler. */
function contexto(d, semanas) {
  const hoje = isoToday();
  const from = new Date(Date.parse(hoje) - semanas * 7 * 86_400_000).toISOString().slice(0, 10);
  const sets = d.sets.filter((x) => x.done);
  const bySession = new Map();
  for (const x of sets) bySession.set(x.sessionId, [...(bySession.get(x.sessionId) ?? []), x]);
  const treinos = d.sessions.filter((s) => s.date >= from).map((s) => {
    const list = (bySession.get(s.id) ?? []).sort((a, b) => a.exOrder - b.exOrder || a.setIndex - b.setIndex);
    const ex = new Map();
    for (const x of list) ex.set(x.exercise, [...(ex.get(x.exercise) ?? []), x]);
    return {
      data: s.date,
      dia: [s.dayKey, s.dayName].filter(Boolean).join(" · "),
      semana: s.week ?? null,
      duracao_min: s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null,
      fadiga: s.fatigue ?? null,
      dores: s.pains?.length ? s.pains.map((p) => `${p.area} ${p.intensity}/10`) : undefined,
      notas: s.notes || undefined,
      exercicios: [...ex].map(([nome, xs]) => ({
        nome,
        series: xs.filter((x) => !x.mode).map(fmtSet).join(", ") || undefined,
        cardio: xs.find((x) => x.mode === "cardio")?.cardio,
      })),
      pulados: s.exercises?.filter((e) => e.skipped).map((e) => e.name),
    };
  });
  const plan = activePlan(d);
  const peso = d.measures.filter((m) => m.type === "peso" && m.date >= new Date(Date.parse(hoje) - 120 * 86_400_000).toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).map((m) => [m.date, m.value]);
  const ultimas = {};
  for (const m of [...d.measures].sort((a, b) => a.date.localeCompare(b.date))) if (m.type !== "peso") ultimas[m.type] = { data: m.date, valor: m.value };
  const work = sets.filter((x) => x.kind === "work" && !x.mode);
  return {
    hoje,
    pessoa: d.settings.name || null,
    altura_cm: d.settings.heightCm ?? null,
    meta_peso: d.settings.goalWeight ?? null,
    plano_ativo: plan ? { id: plan.id, nome: plan.plan.block.name, inicio: plan.plan.block.startDate, semanas: plan.plan.block.weeks, semana_atual: weekOf(plan.plan, hoje) } : null,
    treinos,
    pulos: d.skips.filter((s) => s.date >= from).map((s) => ({ data: s.date, motivo: s.reason })),
    peso,
    medidas: ultimas,
    restricoes_do_usuario: d.flags.map((f) => ({ exercicio: f.exercise, tipo: f.type, ate: f.until ?? undefined, motivo: f.reason ?? undefined })),
    cargas: loadsForPrompt(loadHistory(d.sessions, work), hoje),
  };
}

function biblioteca(d) {
  const custom = d.exercises.filter((e) => e.custom);
  const vetoed = new Set(d.flags.filter((f) => f.type === "vetoed").map((f) => f.exercise));
  return libraryForPrompt([...LIBRARY, ...custom], vetoed);
}

function resumo(plan) {
  const linhas = plan.days.map((day) => `${day.key} · ${day.name}: ${day.exercises.filter((e) => (e.block ?? "main") === "main").length} exercícios`);
  return `${plan.block.name} (${plan.block.startDate}, ${plan.block.weeks} semanas${plan.block.deloadWeeks.length ? `, deload ${plan.block.deloadWeeks.join(", ")}` : ""})\n${linhas.join("\n")}`;
}

function mudancas(old, next) {
  if (!old) return "Primeiro plano: nada a comparar.";
  const diff = planDiff(old, next);
  const out = [];
  if (diff.daysAdded.length) out.push(`Dias novos: ${diff.daysAdded.join(", ")}`);
  if (diff.daysRemoved.length) out.push(`Dias que saem: ${diff.daysRemoved.join(", ")}`);
  for (const day of diff.days) {
    out.push(`${day.key} · ${day.name}:`);
    for (const n of day.added) out.push(`  + ${n}`);
    for (const n of day.removed) out.push(`  − ${n}`);
    for (const c of day.changed) out.push(`  ~ ${c.name}: ${c.from} → ${c.to}`);
  }
  return out.length ? out.join("\n") : "Mesmos dias, exercícios e séries do plano atual (semana 1).";
}

export const UPSERT_ONE = `
INSERT INTO records (user_id, t, k, u, v, seq, device, received_at)
SELECT ?1, json_extract(j.value, '$.t'), json_extract(j.value, '$.k'), json_extract(j.value, '$.u'), json_extract(j.value, '$.v'),
       (SELECT COALESCE(MAX(seq), 0) FROM records) + j.key + 1, 'Claude', ?3
FROM json_each(?2) AS j WHERE true
ON CONFLICT(user_id, t, k) DO UPDATE SET u = excluded.u, v = excluded.v, seq = excluded.seq, device = excluded.device, received_at = excluded.received_at
WHERE excluded.u > records.u`;

function ferramentas(DB, userId) {
  let cache;
  const dados = async () => (cache ??= await load(DB, userId));
  return [
    {
      name: "contexto_de_treino",
      title: "Contexto de treino",
      description: "Treinos feitos (séries kg×reps@RIR por exercício, duração, fadiga, dores, notas), pulos, peso dos últimos 120 dias, últimas medidas, restrições e o histórico de cargas de cada exercício.",
      inputSchema: { type: "object", properties: { semanas: { type: "integer", minimum: 1, maximum: 26, description: "Quantas semanas de treinos (padrão 8)." } } },
      annotations: { readOnlyHint: true },
      run: async (a) => contexto(await dados(), Math.min(26, Math.max(1, Number(a.semanas) || 8))),
    },
    {
      name: "plano_atual",
      title: "Plano atual",
      description: "O plano de treino ativo (formato app-treino/plan@1) e a lista dos outros planos guardados.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => {
        const d = await dados();
        const p = activePlan(d);
        return { ativo: p?.plan ?? null, outros: d.plans.filter((x) => x.id !== p?.id).map((x) => ({ id: x.id, nome: x.plan.block.name, inicio: x.plan.block.startDate })) };
      },
    },
    {
      name: "formato_do_plano",
      title: "Formato do plano",
      description: "Regras do formato app-treino/plan@1 (com exemplo) e a biblioteca de exercícios: use somente esses nomes.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => `${PROMPT_FOR_CLAUDE}\n\n${biblioteca(await dados())}`,
    },
    {
      name: "feedback_do_app",
      title: "Feedback do app",
      description: "Anotações que o Rafael fez em Ajustes → Feedback do app (o que melhorar no Pulse) e os últimos erros que apareceram na tela.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => {
        const notes = (await DB.prepare(`SELECT at, text, route, version FROM feedback WHERE user_id = ? ORDER BY at DESC LIMIT 50`).bind(userId).all()).results;
        const errors = (await DB.prepare(`SELECT at, message, route, version FROM errors WHERE user_id = ? ORDER BY at DESC LIMIT 20`).bind(userId).all()).results;
        const d = (t) => new Date(t - 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
        return { anotacoes: notes.map((n) => ({ quando: d(n.at), tela: n.route, versao: n.version, texto: n.text })), erros: errors.map((e) => ({ quando: d(e.at), tela: e.route, versao: e.version, erro: e.message })) };
      },
    },
    {
      name: "publicar_plano",
      title: "Publicar plano",
      description: "Confere (so_validar=true) ou publica e ativa (so_validar=false) um plano app-treino/plan@1. Sempre confira primeiro, mostre o resumo e o que muda ao Rafael e só publique depois que ele aprovar.",
      inputSchema: {
        type: "object",
        required: ["plano", "so_validar"],
        properties: { plano: { type: "object", description: "O plano completo (app-treino/plan@1)." }, so_validar: { type: "boolean", description: "true = só confere; false = publica e ativa." } },
      },
      annotations: { destructiveHint: false, idempotentHint: true },
      run: async (a) => {
        const d = await dados();
        const known = new Set([...LIBRARY, ...d.exercises].map((e) => e.name));
        const r = parsePlan(JSON.stringify(a.plano ?? null), known);
        if (!r.ok) throw new Error(`O plano tem erros:\n- ${r.errors.slice(0, 20).join("\n- ")}`);
        const old = activePlan(d)?.plan ?? null;
        const texto = `${resumo(r.plan)}\n\nO que muda:\n${mudancas(old, r.plan)}${r.warnings.length ? `\n\nAvisos:\n- ${r.warnings.join("\n- ")}` : ""}`;
        if (a.so_validar !== false) return `Plano válido (ainda NÃO publicado).\n\n${texto}\n\nMostre isto ao Rafael e só publique (so_validar=false) depois que ele aprovar.`;
        const now = Date.now();
        // nomes fora da biblioteca viram exercício novo da pessoa (como na importação do app)
        const fresh = [...new Set(r.plan.days.flatMap((day) => day.exercises.flatMap((e) => [e.name, e.sub ?? null])).filter((n) => n && !known.has(n)))];
        const recs = [
          { t: "plans", k: r.plan.block.id, u: now, v: JSON.stringify({ id: r.plan.block.id, plan: r.plan, importedAt: now }) },
          { t: "settings", k: "activePlanId", u: now, v: JSON.stringify({ key: "activePlanId", value: r.plan.block.id }) },
          ...fresh.map((name) => ({ t: "exercises", k: name, u: now, v: JSON.stringify({ name, group: "Outros", equipment: "", pattern: "", unilateral: false, blocks: [], notes: "Criado pelo Claude (conector)", vetoed: false, custom: true }) })),
        ];
        await DB.prepare(UPSERT_ONE).bind(userId, JSON.stringify(recs), now).run();
        cache = undefined;
        return `Publicado e ativado: ${r.plan.block.name}. Aparece no celular do Rafael na próxima sincronização (ao abrir o app).\n\n${texto}`;
      },
    },
  ];
}

/* ---------------- rotas ---------------- */

/**
 * POST /api/mcp/token (logado): gera o endereço secreto do conector (o anterior para de funcionar).
 * DELETE /api/mcp/token: desliga o conector. GET: diz se existe (o endereço só aparece ao gerar).
 * POST /api/mcp/<token>: o conector em si.
 */
export async function handleMcp(req, env, url, DB) {
  if (url.pathname === "/api/mcp/token") {
    const { user, setCookie } = await requireUser(req, env);
    const headers = setCookie ? { "set-cookie": setCookie } : {};
    if (req.method === "GET") return json({ on: !!(await DB.prepare(`SELECT 1 FROM mcp_tokens WHERE user_id = ?`).bind(user.id).first()) }, 200, headers);
    await DB.prepare(`DELETE FROM mcp_tokens WHERE user_id = ?`).bind(user.id).run();
    if (req.method === "DELETE") return json({ on: false }, 200, headers);
    if (req.method !== "POST") throw new HttpError(405, "Método não suportado.");
    const token = randomToken(24);
    await DB.prepare(`INSERT INTO mcp_tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)`).bind(await sha256(token), user.id, Date.now()).run();
    return json({ url: `${url.origin}/api/mcp/${token}` }, 200, headers);
  }
  const m = url.pathname.match(/^\/api\/mcp\/([\w-]{20,})$/);
  const row = m ? await DB.prepare(`SELECT user_id FROM mcp_tokens WHERE token_hash = ?`).bind(await sha256(m[1])).first() : null;
  if (!row) return new Response("Não encontrado", { status: 404 });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Conector do Pulse para o Claude: use POST.", { status: 405, headers: { allow: "POST, DELETE" } });
  let msg;
  try { msg = await req.json(); } catch { return Response.json(erro(null, -32700, "JSON inválido"), { status: 400 }); }
  const fs = ferramentas(DB, row.user_id);
  const lote = Array.isArray(msg);
  const respostas = [];
  for (const one of lote ? msg : [msg]) { const r = await tratar(one, fs); if (r) respostas.push(r); }
  if (!respostas.length) return new Response(null, { status: 202 });
  return Response.json(lote ? respostas : respostas[0], { headers: { "cache-control": "no-store" } });
}
