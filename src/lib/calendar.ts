import { lang } from "../i18n";
import { WEEKDAYS, type Plan, type PlanDay } from "./plan";

const DAY_MS = 86_400_000;

/** Data local (sem fuso) no formato AAAA-MM-DD. */
export function isoDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** Segunda-feira da semana de `iso` (a semana começa na segunda). */
export function mondayOf(iso: string): string {
  const d = parseDay(iso);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return isoDay(d);
}

/** Diferença em dias inteiros, imune a horário de verão. */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS);
}

/**
 * Semana do bloco que contém `iso`. A semana 1 é a semana (seg–dom) que contém
 * block.startDate, mesmo que o bloco comece numa terça.
 */
export function weekOf(plan: Plan, iso: string): number {
  return Math.floor(daysBetween(mondayOf(plan.block.startDate), mondayOf(iso)) / 7) + 1;
}

export type BlockStatus = "before" | "live" | "after";

export function blockStatus(plan: Plan, iso: string): BlockStatus {
  const w = weekOf(plan, iso);
  if (w < 1) return "before";
  if (w > plan.block.weeks) return "after";
  return "live";
}

export function isDeload(plan: Plan, week: number): boolean {
  return plan.block.deloadWeeks.includes(week);
}

export function weekRange(plan: Plan, week: number): { start: string; end: string } {
  const start = addDays(mondayOf(plan.block.startDate), (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export function weekLabel(plan: Plan, week: number): string {
  const custom = plan.block.weekLabels?.[String(week)];
  if (custom) return custom;
  return isDeload(plan, week) ? "Deload" : `${lang() === "en" ? "Week" : "Semana"} ${week}`;
}

export function dayByKey(plan: Plan, key: string): PlanDay | undefined {
  return plan.days.find((d) => d.key === key);
}

/** Chave do dia agendado para a data (rodízio, se houver; senão dia da semana), ou null. */
export function scheduledKey(plan: Plan, iso: string): string | null {
  if (plan.rotation) {
    const { pattern } = plan.rotation;
    const start = plan.rotation.start ?? plan.block.startDate;
    const n = daysBetween(start, iso);
    if (n < 0) return null;
    return pattern[n % pattern.length] ?? null;
  }
  return plan.schedule[WEEKDAYS[parseDay(iso).getDay()]] ?? null;
}

/** Treino agendado para a data, ou null em dia de descanso. */
export function scheduledDay(plan: Plan, iso: string): PlanDay | null {
  const key = scheduledKey(plan, iso);
  return key ? (dayByKey(plan, key) ?? null) : null;
}

/** Treinos agendados por semana (média, para metas de frequência). */
export function plannedPerWeek(plan: Plan): number {
  if (plan.rotation) return Math.round((plan.rotation.pattern.filter(Boolean).length / plan.rotation.pattern.length) * 7 * 10) / 10;
  return WEEKDAYS.filter((d) => plan.schedule[d]).length;
}

/** Próximo treino a partir da data (inclusive). Em dia de descanso devolve o próximo dia de treino. */
export function nextTrainingDay(plan: Plan, iso: string): { day: PlanDay; date: string } | null {
  for (let i = 0; i < 29; i++) {
    const date = addDays(iso, i);
    const day = scheduledDay(plan, date);
    if (day) return { day, date };
  }
  return null;
}

const WD_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// inglês: só os nomes mudam; a ordem continua dia/mês (pedido do Rafael)
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const en = () => lang() === "en";

export function fmtShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function fmtLong(iso: string): string {
  const d = parseDay(iso);
  return `${(en() ? WD_EN : WD_PT)[d.getDay()]}, ${d.getDate()} ${(en() ? MONTH_EN : MONTH_PT)[d.getMonth()]}`;
}

export function weekdayPt(iso: string): string {
  return (en() ? WD_EN : WD_PT)[parseDay(iso).getDay()];
}

const MONTH_FULL_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function monthLabel(year: number, month0: number): string {
  return `${(en() ? MONTH_FULL_EN : MONTH_FULL_PT)[month0]} ${year}`;
}

/** Datas (AAAA-MM-DD) da grade do mês, começando na segunda: inclui dias de borda dos meses vizinhos. */
export function monthGrid(year: number, month0: number): string[] {
  const first = isoDay(new Date(year, month0, 1));
  const start = mondayOf(first);
  const last = isoDay(new Date(year, month0 + 1, 0));
  const out: string[] = [];
  for (let d = start; d <= last || out.length % 7; d = addDays(d, 1)) out.push(d);
  return out;
}

export type DayStatus =
  | "done" // treinou (sessão finalizada)
  | "extra" // treinou num dia sem treino agendado
  | "missed" // tinha treino agendado, já passou e não treinou
  | "skipped" // pulou de propósito (com motivo)
  | "rest" // descanso agendado
  | "today" // hoje, com treino agendado e ainda não feito
  | "planned" // futuro, com treino agendado
  | "none"; // fora do bloco

/**
 * Status de um dia para o calendário. `trained` = datas com sessão finalizada;
 * `skipped` = datas marcadas como "não treinei". Fora do bloco só conta se treinou.
 */
export function dayStatus(plan: Plan | undefined, iso: string, today: string, trained: ReadonlySet<string>, skipped: ReadonlySet<string>): DayStatus {
  const key = plan && blockStatus(plan, iso) === "live" ? scheduledKey(plan, iso) : null;
  if (trained.has(iso)) return key ? "done" : "extra";
  if (skipped.has(iso)) return "skipped";
  if (!plan || blockStatus(plan, iso) !== "live") return "none";
  if (!key) return "rest";
  if (iso < today) return "missed";
  return iso === today ? "today" : "planned";
}
