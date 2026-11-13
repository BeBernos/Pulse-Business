import { z } from "zod";

/**
 * Análise do Claude (Fase 4, opção A): o app manda o relatório pelo menu Compartilhar do Android para o app do
 * Claude; a resposta volta colada como um bloco `pulse/analysis@1`. Sem API e sem automação da conta.
 * Contrato: docs/FORMATO-ANALISE.md.
 */
export const ANALYSIS_FORMAT = "pulse/analysis@1";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const line = z.string().trim().min(1).max(600);
const list = z.array(line).max(20).optional();

export const analysisSchema = z.object({
  format: z.literal(ANALYSIS_FORMAT),
  from: isoDate.optional(),
  to: isoDate.optional(),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(2000),
  highlights: list,
  attention: list,
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        note: line,
        trend: z.enum(["up", "flat", "down"]).optional(),
      }),
    )
    .max(40)
    .optional(),
  nextSteps: list,
  /** só uma proposta: o plano novo vem à parte (plan@1) e só entra se a pessoa importar */
  planChange: z.object({ summary: line }).optional(),
});

export type AnalysisBlock = z.infer<typeof analysisSchema>;

export interface Analysis extends Omit<AnalysisBlock, "format"> {
  id: string;
  createdAt: number;
  /** resposta sem bloco válido: guardada como texto, para não perder */
  freeText?: boolean;
}

/** Blocos JSON candidatos num texto colado: cercas ```json …``` e, sem cercas, o maior trecho entre { e }. */
function candidates(text: string): string[] {
  const out: string[] = [];
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  for (let m; (m = fence.exec(text)); ) out.push(m[1].trim());
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) out.push(text.slice(a, b + 1));
  return out;
}

export type ParseResult = { ok: true; block: AnalysisBlock } | { ok: false; error: string };

/** Acha e valida o bloco pulse/analysis@1 no texto colado (aceita texto em volta, cercas de código e aspas “curvas”). */
export function parseAnalysis(text: string): ParseResult {
  const cleaned = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  let lastError = "Não achei o bloco da análise (pulse/analysis@1) no texto colado.";
  for (const c of candidates(cleaned)) {
    let raw: unknown;
    try {
      raw = JSON.parse(c);
    } catch {
      continue;
    }
    if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== ANALYSIS_FORMAT) {
      if (raw && typeof raw === "object" && "format" in raw) lastError = `O bloco tem outro formato (${String((raw as { format: unknown }).format)}).`;
      continue;
    }
    const r = analysisSchema.safeParse(raw);
    if (r.success) return { ok: true, block: r.data };
    const issue = r.error.issues[0];
    lastError = `Bloco da análise com problema em "${issue.path.join(".") || "raiz"}": ${issue.message}`;
  }
  return { ok: false, error: lastError };
}

/** Resposta sem bloco: vira uma análise só de texto (título = 1ª linha). */
export function freeTextAnalysis(text: string): Omit<Analysis, "id" | "createdAt"> {
  const t = text.trim();
  const first = t.split("\n").find((l) => l.trim()) ?? "Análise";
  return { title: first.replace(/^#+\s*/, "").slice(0, 120), summary: t.slice(0, 20000), freeText: true };
}

/** Instruções que acompanham o relatório (funciona com ou sem Projeto configurado no Claude). */
export const ANALYSIS_REQUEST = `Analise meu treino com o relatório abaixo (app Pulse, formato app-treino/log@1) e o contexto do plano.
Responda em português, direto ao ponto, e termine com UM bloco \`\`\`json no formato ${ANALYSIS_FORMAT}:
{"format":"${ANALYSIS_FORMAT}","from":"AAAA-MM-DD","to":"AAAA-MM-DD","title":"…","summary":"…",
 "highlights":["…"],"attention":["…"],"exercises":[{"name":"<nome exato do app>","note":"…","trend":"up|flat|down"}],
 "nextSteps":["…"],"planChange":{"summary":"…"}}
Regras: nomes de exercício exatamente como no relatório (inglês); não invente cargas fora do plano (a progressão vem do plano);
se achar que o plano deve mudar, descreva em planChange (eu aprovo antes) e, se eu pedir, mande o plano novo em app-treino/plan@1;
considere dores, fadiga, RIR, dias pulados e medidas.`;

/** Texto para o Projeto do Claude (configurar uma vez): papel fixo + o mesmo contrato. */
export const PROJECT_INSTRUCTIONS = `Você é meu treinador e analista de dados de treino. Eu uso o app Pulse (treino pessoal).
Quando eu mandar um relatório (app-treino/log@1), analise: adesão ao plano, evolução de carga/reps/RIR por exercício,
volume, fadiga, dores, descanso, cardio e medidas corporais. Seja franco e objetivo; aponte riscos (dor, platô, excesso de fadiga).
Sempre termine com UM bloco \`\`\`json no formato ${ANALYSIS_FORMAT} (campos: format, from, to, title, summary, highlights[], attention[],
exercises[{name, note, trend: up|flat|down}], nextSteps[], planChange{summary} opcional).
Regras do meu app: nomes de exercício exatamente como no relatório (inglês, nomes do app da academia); nunca extrapolar cargas —
a progressão vem explícita no plano; mudança de treino só com a minha aprovação (proponha em planChange e, se eu pedir,
gere o plano em app-treino/plan@1); "Lying Triceps Extension with a Barbell" é vetado; anilhas 2,5/5/10/20 kg, barra 20 kg.`;

export interface PlanContext {
  name?: string;
  week?: number;
  weeks?: number;
  days?: { key: string; name: string; exercises: string[] }[];
}

/** Mensagem completa a compartilhar com o Claude. */
export function shareMessage(report: string, ctx: PlanContext, person?: string): string {
  const head = [ANALYSIS_REQUEST, "", person ? `Pessoa: ${person}` : null, ctx.name ? `Plano: ${ctx.name}${ctx.week ? ` · semana ${ctx.week}${ctx.weeks ? ` de ${ctx.weeks}` : ""}` : ""}` : null]
    .filter((x) => x !== null)
    .join("\n");
  const days = ctx.days?.length ? `\nDias do plano:\n${ctx.days.map((d) => `- ${d.key} ${d.name}: ${d.exercises.join(", ")}`).join("\n")}` : "";
  return `${head}${days}\n\nRelatório:\n\`\`\`json\n${report}\n\`\`\``;
}

export const TREND_LABEL: Record<"up" | "flat" | "down", string> = { up: "subindo", flat: "estável", down: "caindo" };

/** Contexto do plano ativo para o Claude (nome, semana, dias e exercícios). */
export function planContext(plan: { block: { name: string; weeks: number }; days: { key: string; name: string; exercises: { name: string }[] }[] } | undefined, week?: number): PlanContext {
  if (!plan) return {};
  return { name: plan.block.name, week, weeks: plan.block.weeks, days: plan.days.map((d) => ({ key: d.key, name: d.name, exercises: d.exercises.map((e) => e.name) })) };
}
