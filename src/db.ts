import Dexie, { type DBCore, type EntityTable, type Middleware } from "dexie";
import type { Analysis } from "./lib/analysis";
import { LIBRARY } from "./lib/library";
import { isoDay, parseDay } from "./lib/calendar";
import { compositionSeries, type Sex } from "./lib/body";
import { loadHistory, type LoadHistory } from "./lib/analytics";
import type { CardioMachine, CardioValues } from "./lib/cardio";
import { isGreenish } from "./lib/color";
import { guessMachine } from "./lib/cardio";
import { planSchema, type CardioTarget, type DayBlock, type Plan, type PlanDay, type PlanExercise, type Restriction } from "./lib/plan";
import { avgRestSec } from "./lib/metrics";
import type { MuscleMap } from "./lib/muscles";
import { estimateMinutes, prescribe, timedSeconds } from "./lib/prescription";

export type ExerciseKind = "strength" | "mobility" | "cardio";
export type { CardioMachine };

export interface Exercise {
  name: string;
  /** Musculação (padrão), mobilidade/alongamento (por tempo ou reps, não conta volume) ou cardio (métricas). */
  kind?: ExerciseKind;
  /** Cardio: qual aparelho — define as métricas registradas (lib/cardio.ts). */
  machine?: CardioMachine;
  group: string;
  equipment: string;
  pattern: string;
  unilateral: boolean;
  blocks: string[];
  notes: string;
  vetoed: boolean;
  custom?: boolean;
  muscles?: MuscleMap;
  /** Link de vídeo escolhido pelo usuário (sem ele, o app abre a busca no YouTube pelo nome). */
  video?: string;
}

/** Vídeo do movimento: o link salvo, ou a busca no YouTube pelo nome exato (nomes do app da academia). */

export interface StoredPlan {
  id: string;
  plan: Plan;
  importedAt: number;
}

export interface Pain {
  area: string;
  intensity: number; // 0–10
  note?: string;
}

export interface SessionExercise {
  /** Exercício efetivamente feito (pode ser o substituto). */
  name: string;
  /** Exercício que estava no plano. */
  plannedName: string;
  sub?: string | null;
  restSec: number;
  rir?: string;
  perSide?: boolean;
  priority?: boolean;
  main?: boolean;
  handle?: string | null;
  notes?: string;
  /** Por que este exercício (explicação do Claude no plano). */
  why?: string;
  prescriptionNote?: string;
  restricted?: "vetoed" | "suspended";
  skipped?: boolean;
  superset?: string;
  /** Aquecimento / principal / volta à calma (do plano). */
  block?: DayBlock;
  /** Mobilidade ou cardio (sem campo = musculação). */
  kind?: ExerciseKind;
  /** Cardio: aparelho e metas. */
  machine?: CardioMachine;
  cardio?: CardioTarget;
}

export interface Session {
  id: string;
  planId: string;
  week: number;
  dayKey: string;
  dayName: string;
  color: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  status: "active" | "done";
  /** Treino livre: montado na hora, fora do plano. */
  freestyle?: boolean;
  deload: boolean;
  /** Duração estimada pelo plano no início da sessão (min). */
  estimatedMin?: number;
  exercises: SessionExercise[];
  fatigue?: number; // 1–5
  notes?: string;
  pains?: Pain[];
}

export interface SetEntry {
  id: string;
  sessionId: string;
  exOrder: number;
  exercise: string;
  setIndex: number;
  kind: "warmup" | "work";
  targetKg: number | null;
  targetReps: number | string;
  kg: number | null;
  reps: number | null;
  rir: number | null;
  done: boolean;
  completedAt?: number;
  /** Anotação da série (ex.: "pegada fechada", "fisgou no joelho"). */
  note?: string;
  /** Série de mobilidade ou sessão de cardio: fica fora de volume, recordes e contagem de séries. */
  mode?: "mobility" | "cardio";
  /** Cardio: o que foi feito (tempo, distância, FC…). */
  cardio?: CardioValues;
}

/** Dia em que o treino agendado não foi feito, com motivo (calendário). */
export interface Skip {
  date: string;
  dayKey?: string;
  reason: string;
}

/** Foto de progresso (fica só no aparelho). */
export interface Photo {
  id: string;
  date: string;
  pose: PhotoPose;
  blob: Blob;
  thumb: Blob;
  note?: string;
  /** Quando foi copiada para o servidor (sem campo = só neste aparelho). Não é índice: não muda o schema. */
  serverAt?: number;
}

export type PhotoPose = "frente" | "lado" | "costas";
export const POSES: { id: PhotoPose; label: string }[] = [
  { id: "frente", label: "Frente" },
  { id: "lado", label: "Lado" },
  { id: "costas", label: "Costas" },
];

export const SKIP_REASONS = ["Descanso extra", "Dor/lesão", "Doença", "Viagem", "Trabalho", "Sem tempo", "Outro"];

export interface Flag {
  exercise: string;
  type: "vetoed" | "suspended";
  until?: string;
  reason?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Measure {
  id: string;
  date: string;
  type: MeasureType;
  value: number;
  note?: string;
}

export type MeasureType =
  | "peso"
  | "gordura"
  | "pescoco"
  | "ombros"
  | "peito"
  | "braco"
  | "antebraco"
  | "cintura"
  | "abdomen"
  | "quadril"
  | "coxa"
  | "panturrilha";

/** `how` = como medir (aparece ao tocar no ponto do corpo). */
export const MEASURE_TYPES: Record<MeasureType, { label: string; unit: string; how: string }> = {
  peso: { label: "Peso", unit: "kg", how: "Ao acordar, depois do banheiro, sempre na mesma balança." },
  gordura: { label: "Gordura corporal", unit: "%", how: "Bioimpedância ou dobras — use sempre o mesmo método." },
  pescoco: { label: "Pescoço", unit: "cm", how: "Logo abaixo do pomo de Adão, fita na horizontal." },
  ombros: { label: "Ombros", unit: "cm", how: "Volta completa na parte mais larga dos deltoides, braços relaxados." },
  peito: { label: "Peito", unit: "cm", how: "Na linha dos mamilos, após expirar normalmente." },
  braco: { label: "Braço", unit: "cm", how: "Bíceps contraído, na parte mais volumosa." },
  antebraco: { label: "Antebraço", unit: "cm", how: "Parte mais grossa, braço estendido e mão fechada." },
  cintura: { label: "Cintura", unit: "cm", how: "Na altura do umbigo, abdômen relaxado, ao expirar." },
  abdomen: { label: "Abdômen", unit: "cm", how: "Ponto mais largo da barriga, entre umbigo e quadril." },
  quadril: { label: "Quadril", unit: "cm", how: "Parte mais larga dos glúteos, pés juntos." },
  coxa: { label: "Coxa", unit: "cm", how: "Logo abaixo do glúteo, parte mais grossa, perna relaxada." },
  panturrilha: { label: "Panturrilha", unit: "cm", how: "Parte mais grossa, em pé, peso distribuído." },
};

/* ---------------- banco local (um por pessoa) ---------------- */

/** Tabelas que sincronizam com o servidor (fotos e `meta` ficam só no aparelho). */
export const SYNCED_TABLES = ["exercises", "plans", "sessions", "sets", "flags", "settings", "measures", "skips", "analyses"] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
const isSynced = (name: string): name is SyncedTable => (SYNCED_TABLES as readonly string[]).includes(name);

/** Ajustes do aparelho (não acompanham a pessoa em outro aparelho). */
export const LOCAL_SETTINGS = new Set<string>(["deviceId", "remindOn", "vibrate", "sound", "keepAwake", "liveNotify", "lastBackupAt"]);

/** Lápide: registro apagado aqui que o servidor ainda precisa saber. */
export interface Tomb {
  key: string; // `${t}|${k}`
  t: SyncedTable;
  k: string;
  u: number;
  _d: number;
}

/** Estado local (cursor da sincronização, relatório da migração…). Nunca sincroniza. */
export interface Meta {
  key: string;
  value: unknown;
}

export type PulsoDB = Dexie & {
  exercises: EntityTable<Exercise, "name">;
  plans: EntityTable<StoredPlan, "id">;
  sessions: EntityTable<Session, "id">;
  sets: EntityTable<SetEntry, "id">;
  flags: EntityTable<Flag, "exercise">;
  settings: EntityTable<Setting, "key">;
  measures: EntityTable<Measure, "id">;
  skips: EntityTable<Skip, "date">;
  /** análises do Claude coladas no app (Fase 4) */
  analyses: EntityTable<Analysis, "id">;
  photos: EntityTable<Photo, "id">;
  tombs: EntityTable<Tomb, "key">;
  meta: EntityTable<Meta, "key">;
};

/**
 * Carimbo `u` (ms) sempre crescente neste aparelho: duas mudanças no mesmo milissegundo
 * não empatam. Em cada registro vence o maior `u` (worker/sync.js).
 */
let lastU = 0;
export function stamp(): number {
  const now = Date.now();
  lastU = now > lastU ? now : lastU + 1;
  return lastU;
}

/** Id de texto, ordenável pelo tempo, único entre aparelhos (substitui os números automáticos). */
export function newId(): string {
  const r = crypto.getRandomValues(new Uint8Array(8));
  return Date.now().toString(36).padStart(9, "0") + Array.from(r, (b) => (b % 36).toString(36)).join("");
}

/** Avisa a sincronização que houve mudança local (ela espera uns segundos e envia). */
let localChangeListener: (() => void) | null = null;
export function onLocalChange(fn: (() => void) | null): void {
  localChangeListener = fn;
}

/** Transações que aplicam o que veio do servidor: não viram "falta enviar". */
const remoteTx = new WeakSet<object>();

/** Roda `fn` numa transação marcada como "vinda do servidor/semente" (sem carimbo, sem lápide). */
export async function remoteWrite<T>(database: PulsoDB, tables: string[], fn: () => Promise<T>): Promise<T> {
  return database.transaction("rw", tables, async (tx) => {
    remoteTx.add(tx.idbtrans);
    return fn();
  });
}

/**
 * Por baixo de todas as telas: toda gravação numa tabela sincronizada ganha `u` (quando mudou) e
 * `_d = 1` (falta enviar); todo apagar deixa uma lápide em `tombs`, na mesma transação.
 * Assim nenhum "salvar" do app precisa saber que a sincronização existe.
 */
const syncMiddleware: Middleware<DBCore> = {
  stack: "dbcore",
  name: "pulso-sync",
  create(down) {
    return {
      ...down,
      transaction(stores, mode, options) {
        const scope = mode === "readwrite" && stores.some(isSynced) && !stores.includes("tombs") ? [...stores, "tombs"] : stores;
        return down.transaction(scope, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (!isSynced(name)) return table;
        return {
          ...table,
          async mutate(req) {
            if (remoteTx.has(req.trans)) return table.mutate(req);
            localChangeListener?.();
            if (req.type === "add" || req.type === "put") {
              return table.mutate({ ...req, values: req.values.map((v) => ({ ...v, u: stamp(), _d: 1 })) });
            }
            const keys: unknown[] =
              req.type === "delete"
                ? req.keys
                : ((await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })).result as unknown[]);
            const res = await table.mutate(req);
            if (keys.length)
              await down.table("tombs").mutate({
                type: "put",
                trans: req.trans,
                values: keys.map((k) => ({ key: `${name}|${k}`, t: name, k: String(k), u: stamp(), _d: 1 })),
              });
            return res;
          },
        };
      },
    };
  },
};

export const SCHEMA = {
  exercises: "&name, group, _d",
  plans: "&id, importedAt, _d",
  sessions: "&id, date, status, planId, [planId+week], _d",
  sets: "&id, sessionId, exercise, [exercise+completedAt], _d",
  flags: "&exercise, _d",
  settings: "&key, _d",
  measures: "&id, date, type, [type+date], _d",
  skips: "&date, _d",
  photos: "&id, date, pose",
  tombs: "&key, _d",
  meta: "&key",
};

/** Versão 2: tabela `analyses` (só acrescenta; nada do que existe muda). */
export const SCHEMA_V2 = { ...SCHEMA, analyses: "&id, createdAt, _d" };

export function createDb(name: string): PulsoDB {
  const d = new Dexie(name) as PulsoDB;
  d.version(1).stores(SCHEMA);
  d.version(2).stores(SCHEMA_V2);
  d.use(syncMiddleware);
  /*
   * Atualização de versão do banco com o app aberto em outra aba/instância (ex.: PWA antigo + aba nova):
   * sem isto, a versão nova fica esperando a antiga soltar o banco e todo "salvar" trava em silêncio.
   * A instância antiga fecha a conexão e recarrega já na versão nova.
   */
  d.on("versionchange", () => {
    d.close();
    if (typeof window !== "undefined") window.location.reload();
    return false;
  });
  d.on("blocked", () => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("app-error", { detail: "O app está aberto em outra aba/janela. Feche as outras para concluir a atualização." }));
  });
  return d;
}

/** Banco da pessoa atual (aberto no início, antes de desenhar a tela — `openDb` em main.tsx). */
export let db: PulsoDB;

export function openDb(name: string): PulsoDB {
  db = createDb(name);
  return db;
}

/** Troca o banco atual por um já aberto (testes com dois "aparelhos"). */
export function selectDb(d: PulsoDB): void {
  db = d;
}

export const DEFAULT_COLORS = ["#FF3B5C", "#3B9BFF", "#F5B942", "#C7CBD6", "#8B7BFF", "#FF8A3D"];

export function dayColor(plan: Plan, day: PlanDay): string {
  const fallback = DEFAULT_COLORS[plan.days.indexOf(day) % DEFAULT_COLORS.length];
  return day.color && !isGreenish(day.color) ? day.color : fallback;
}

/* ---------------- settings ---------------- */

export interface AppSettings {
  activePlanId: string | null;
  barKg: number;
  plates: number[];
  vibrate: boolean;
  sound: boolean;
  keepAwake: boolean;
  /** Treino ativo na barra de notificações ao sair do app (e aviso do fim do descanso). */
  liveNotify: boolean;
  name: string;
  heightCm: number | null;
  /** Para as fórmulas de gordura (Marinha/RFM) e as faixas; sem informar = masculino. */
  sex: Sex | null;
  /** Idioma da interface (por pessoa, sincronizado); instruções para o Claude ficam em português. */
  lang: "pt" | "en";
  goalWeight: number | null;
  /** Descanso padrão (s) para exercícios adicionados na hora. */
  defaultRest: number;
  /** Lembretes por notificação. */
  remindOn: boolean;
  remindWorkout: boolean;
  remindTime: string;
  remindForgot: boolean;
  remindForgotTime: string;
  remindBackup: boolean;
  /** Tipo de treino da pessoa: Pilates/funcional põe esses grupos primeiro e tira o RIR do treino. */
  focus: "strength" | "pilates";
  /** Quem você é na Mesa (app de dieta): "rafael", "marina", "theo"; null = o login da conta. */
  familyPerson: string | null;
  /** Pesagem guiada: lembrete nos dias escolhidos (0 = domingo … 6 = sábado), se ainda não pesou no dia. */
  remindWeigh: boolean;
  weighDays: number[];
  weighTime: string;
  deviceId: string | null;
  lastBackupAt: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activePlanId: null,
  barKg: 20,
  plates: [20, 10, 5, 2.5],
  vibrate: true,
  sound: true,
  keepAwake: true,
  liveNotify: true,
  name: "",
  heightCm: null,
  sex: null,
  lang: "pt",
  goalWeight: null,
  defaultRest: 90,
  remindOn: false,
  remindWorkout: true,
  remindTime: "05:30",
  remindForgot: true,
  remindForgotTime: "21:00",
  remindBackup: true,
  focus: "strength",
  familyPerson: null,
  remindWeigh: false,
  weighDays: [1, 4],
  weighTime: "07:00",
  deviceId: null,
  lastBackupAt: null,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await db.settings.put({ key, value });
  if (key === "activePlanId") resync();
}

/* ---------------- seed ---------------- */

export async function ensureSeeded(): Promise<void> {
  // a biblioteca vem com o app (não sincroniza): só sobe o exercício que a pessoa criar ou editar
  await remoteWrite(db, ["exercises"], async () => {
    const lib = LIBRARY;
    const have = new Set((await db.exercises.toCollection().primaryKeys()) as string[]);
    // exercício novo na biblioteca do app (ou banco recém-criado): entra sem marcar "falta enviar"
    const missing = lib.filter((e) => !have.has(e.name));
    if (missing.length) await db.exercises.bulkAdd(missing.map((e) => ({ ...e, _d: 0 }) as Exercise));
    // instalações antigas: completa o mapa de músculos sem mexer no resto
    const seed = new Map(lib.map((e) => [e.name, e.muscles]));
    await db.exercises
      .filter((e) => !e.muscles && seed.has(e.name))
      .modify((e) => {
        e.muscles = seed.get(e.name);
      });
  });
}

/* ---------------- planos ---------------- */

export async function importPlan(plan: Plan, activate = true): Promise<void> {
  await db.transaction("rw", db.plans, db.settings, db.exercises, async () => {
    await db.plans.put({ id: plan.block.id, plan, importedAt: Date.now() });
    if (activate) await db.settings.put({ key: "activePlanId", value: plan.block.id });
    const known = new Set(await db.exercises.toCollection().primaryKeys());
    const fresh = plan.days
      .flatMap((d) => d.exercises.flatMap((e) => [e.name, e.sub ?? null]))
      .filter((n): n is string => !!n && !known.has(n));
    for (const name of new Set(fresh))
      await db.exercises.add({ name, group: "Outros", equipment: "", pattern: "", unilateral: false, blocks: [], notes: "Criado na importação de plano", vetoed: false, custom: true });
  });
  resync();
}

/** Restrições do plano + flags do usuário (as do usuário vencem) + vetos da biblioteca. */
export async function effectiveRestrictions(plan: Plan | undefined): Promise<Restriction[]> {
  const flags = await db.flags.toArray();
  const vetoedLib = await db.exercises.filter((e) => e.vetoed).toArray();
  const byName = new Map<string, Restriction>();
  for (const e of vetoedLib) byName.set(e.name, { exercise: e.name, type: "vetoed", reason: e.notes });
  for (const r of plan?.restrictions ?? []) byName.set(r.exercise, r);
  for (const f of flags) byName.set(f.exercise, { exercise: f.exercise, type: f.type, until: f.until, reason: f.reason });
  return [...byName.values()];
}

/* ---------------- sessões ---------------- */

export async function activeSession(): Promise<Session | undefined> {
  return db.sessions.where("status").equals("active").first();
}

export async function startSession(
  stored: StoredPlan,
  day: PlanDay,
  week: number,
  date: string,
  restrictions: Restriction[],
): Promise<string> {
  const { plan } = stored;
  const restrictedOf = (name: string) => {
    const r = restrictions.find((x) => x.exercise === name);
    if (!r) return undefined;
    if (r.type === "vetoed") return "vetoed" as const;
    return !r.until || date <= r.until ? ("suspended" as const) : undefined;
  };
  return db.transaction("rw", db.sessions, db.sets, db.exercises, async () => {
    // tipo de cada exercício (musculação, mobilidade, cardio) vem da biblioteca; cardio sem metas no plano vira 1 sessão
    const info = await db.exercises.bulkGet(day.exercises.map((e) => e.name));
    const kindOf = (ex: PlanExercise, i: number): ExerciseKind => (ex.cardio ? "cardio" : info[i]?.kind ?? "strength");
    const planned = day.exercises.map((ex, i) => (kindOf(ex, i) === "cardio" && !ex.cardio ? { ...ex, cardio: {} } : ex));
    const exercises: SessionExercise[] = planned.map((ex, i) => {
      const p = prescribe(plan, ex, week);
      const restricted = restrictedOf(ex.name);
      const kind = kindOf(ex, i);
      return {
        name: ex.name,
        plannedName: ex.name,
        sub: ex.sub,
        restSec: p.restSec,
        rir: p.rir,
        perSide: ex.perSide,
        priority: ex.priority,
        main: ex.main,
        handle: ex.handle,
        notes: ex.notes,
        why: ex.why,
        prescriptionNote: p.note,
        restricted,
        skipped: !!restricted,
        superset: ex.superset,
        block: ex.block,
        kind: kind === "strength" ? undefined : kind,
        machine: kind === "cardio" ? ex.cardio?.machine ?? info[i]?.machine ?? guessMachine(ex.name) : undefined,
        cardio: ex.cardio,
      };
    });
    const id = newId();
    await db.sessions.add({
      id,
      planId: plan.block.id,
      week,
      dayKey: day.key,
      dayName: day.name,
      color: dayColor(plan, day),
      date,
      startedAt: startTimeFor(date),
      status: "active",
      deload: plan.block.deloadWeeks.includes(week),
      estimatedMin: estimateMinutes(plan, day, week, (n) => !!restrictedOf(n)),
      exercises,
    });

    const rows: SetEntry[] = [];
    planned.forEach((ex, exOrder) => {
      const k = exercises[exOrder].kind;
      const mode = k === "mobility" || k === "cardio" ? k : undefined;
      prescribe(plan, ex, week).sets.forEach((s, setIndex) =>
        rows.push({
          id: newId(),
          sessionId: id,
          exOrder,
          exercise: ex.name,
          setIndex,
          kind: s.kind,
          targetKg: s.kg,
          targetReps: s.reps,
          kg: s.kg,
          reps: typeof s.reps === "number" ? s.reps : null,
          rir: null,
          done: false,
          mode,
        }),
      );
    });
    await db.sets.bulkAdd(rows);
    return id;
  });
}

/** Troca o exercício de uma posição da sessão (ex.: pelo substituto) e renomeia as séries. */
export async function swapExercise(session: Session, exOrder: number, newName: string): Promise<void> {
  const exercises = session.exercises.map((e, i) => (i === exOrder ? { ...e, name: newName } : e));
  await db.transaction("rw", db.sessions, db.sets, async () => {
    await db.sessions.update(session.id, { exercises });
    await db.sets.where({ sessionId: session.id }).filter((s) => s.exOrder === exOrder).modify({ exercise: newName });
  });
}

export async function setSkipped(session: Session, exOrder: number, skipped: boolean): Promise<void> {
  const exercises = session.exercises.map((e, i) => (i === exOrder ? { ...e, skipped } : e));
  await db.sessions.update(session.id, { exercises });
}

export async function addSet(session: Session, exOrder: number): Promise<void> {
  const existing = await db.sets.where({ sessionId: session.id }).filter((s) => s.exOrder === exOrder).sortBy("setIndex");
  const last = existing.filter((s) => s.kind === "work").at(-1) ?? existing.at(-1);
  await db.sets.add({
    id: newId(),
    sessionId: session.id,
    exOrder,
    exercise: session.exercises[exOrder].name,
    setIndex: (existing.at(-1)?.setIndex ?? -1) + 1,
    kind: "work",
    targetKg: null,
    targetReps: last?.targetReps ?? "",
    kg: last?.kg ?? null,
    reps: last?.reps ?? null,
    rir: null,
    done: false,
  });
}

/**
 * Finaliza a sessão. `durationMin` serve para treino registrado depois (retroativo):
 * nesse caso o fim é início + duração, em vez de "agora".
 */
export async function finishSession(id: string, data: Pick<Session, "fatigue" | "notes" | "pains">, durationMin?: number): Promise<void> {
  const s = await db.sessions.get(id);
  const endedAt = durationMin && s ? s.startedAt + durationMin * 60000 : Date.now();
  await db.sessions.update(id, { ...data, status: "done", endedAt });
  resync();
}

/** Reagenda os lembretes em segundo plano (treino feito/pulado muda os avisos). */
function resync(): void {
  import("./push").then((m) => m.syncReminders()).catch(() => undefined);
}

/** Início da sessão: agora, se for hoje; 08:00 do dia, se for registro retroativo. */
export function startTimeFor(date: string): number {
  return date === isoDay() ? Date.now() : parseDay(date).getTime() + 8 * 3600_000;
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction("rw", db.sessions, db.sets, async () => {
    await db.sets.where({ sessionId: id }).delete();
    await db.sessions.delete(id);
  });
}

/** Séries de trabalho concluídas da última sessão finalizada que teve o exercício. */
export async function lastPerformance(exercise: string, beforeSessionId?: string): Promise<SetEntry[]> {
  const sets = await db.sets
    .where("exercise")
    .equals(exercise)
    .filter((s) => s.done && s.kind === "work" && s.sessionId !== beforeSessionId)
    .toArray();
  if (!sets.length) return [];
  const sessionIds = [...new Set(sets.map((s) => s.sessionId))];
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter((s): s is Session => !!s && s.status === "done");
  if (!sessions.length) return [];
  const latest = sessions.sort((a, b) => b.startedAt - a.startedAt)[0];
  return sets.filter((s) => s.sessionId === latest.id).sort((a, b) => a.setIndex - b.setIndex);
}

/** Cargas de todos os exercícios já feitos (último treino + melhor marca), para o Claude e a aba Cargas. */
export async function currentLoads(): Promise<LoadHistory[]> {
  const sessions = await db.sessions.where("status").equals("done").toArray();
  const sets = await db.sets.filter((s) => s.done && s.kind === "work" && !s.mode).toArray();
  return loadHistory(sessions, sets);
}

/* ---------------- backup ---------------- */

export const BACKUP_FORMAT = "pulso/backup@2";
/** Backup do app antes do Pulse (ids numéricos): continua restaurável, convertido na hora. */
export const LEGACY_BACKUP_FORMAT = "app-treino/backup@1";

/** Tira os campos internos da sincronização (`u`, `_d`). */
export function plain<T extends object>(row: T): T {
  const { u: _u, _d: _dd, ...rest } = row as T & { u?: number; _d?: number };
  return rest as T;
}

export async function exportBackup(withPhotos = false): Promise<string> {
  const [exercises, plans, sessions, sets, flags, settings, measures, skips, analyses] = await Promise.all([
    db.exercises.toArray(),
    db.plans.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
    db.flags.toArray(),
    db.settings.toArray(),
    db.measures.toArray(),
    db.skips.toArray(),
    db.analyses.toArray(),
  ]);
  const photos = withPhotos
    ? await Promise.all((await db.photos.toArray()).map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob), thumb: await blobToDataUrl(p.thumb) })))
    : undefined;
  return JSON.stringify({
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    exercises: exercises.map(plain),
    plans: plans.map(plain),
    sessions: sessions.map(plain),
    sets: sets.map(plain),
    flags: flags.map(plain),
    settings: settings.map(plain),
    measures: measures.map(plain),
    skips: skips.map(plain),
    analyses: analyses.map(plain),
    photos,
  });
}

/** Conteúdo de um backup, já no formato atual (ids de texto). */
export interface BackupData {
  exercises: Exercise[];
  plans: StoredPlan[];
  sessions: Session[];
  sets: SetEntry[];
  flags: Flag[];
  settings: Setting[];
  measures: Measure[];
  skips: Skip[];
  /** backups antigos não têm (restaurar não mexe nas análises existentes) */
  analyses?: Analysis[];
  photos?: Photo[];
}

type LegacyRow = Record<string, unknown> & { id?: number | string };

/** Forma comparável de um exercício (ordem das chaves fixa, sem campos internos/vazios). */
const fingerprint = (e: Exercise) =>
  JSON.stringify(
    Object.entries(plain(e))
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
const LIB_PRINTS = new Map(LIBRARY.map((e) => [e.name, fingerprint(e)]));

/** Exercício criado pela pessoa ou editado (vídeo, notas, músculos…) — o resto é a biblioteca do app. */
export function differsFromLibrary(e: Exercise): boolean {
  return LIB_PRINTS.get(e.name) !== fingerprint(e);
}

/**
 * Converte dados do app antigo (ids numéricos automáticos) para ids de texto fixos: sessão 57 → "m00000057".
 * Fixos de propósito: rodar de novo (migração interrompida, backup restaurado duas vezes) não duplica nada.
 */
export function fromLegacy(data: Record<string, unknown>): BackupData {
  const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  const mid = (id: unknown) => (typeof id === "number" ? `m${String(id).padStart(8, "0")}` : String(id));
  return {
    exercises: list<Exercise>(data.exercises),
    plans: list<StoredPlan>(data.plans),
    sessions: list<LegacyRow>(data.sessions).map((r) => ({ ...r, id: mid(r.id) }) as unknown as Session),
    sets: list<LegacyRow>(data.sets).map((r) => ({ ...r, id: mid(r.id), sessionId: mid(r.sessionId) }) as unknown as SetEntry),
    flags: list<Flag>(data.flags),
    settings: list<Setting>(data.settings),
    measures: list<LegacyRow>(data.measures).map((r) => ({ ...r, id: mid(r.id) }) as unknown as Measure),
    skips: list<Skip>(data.skips),
    analyses: Array.isArray(data.analyses) ? list<Analysis>(data.analyses) : undefined,
    photos: data.photos ? list<LegacyRow>(data.photos).map((r) => ({ ...r, id: mid(r.id) }) as unknown as Photo) : undefined,
  };
}

/**
 * Grava `data` substituindo o que existe: o que não está no backup é apagado (vira lápide e
 * some também nos outros aparelhos). Fotos só são trocadas se o backup tiver fotos.
 */
export async function replaceAll(data: BackupData, opts: { keepDeviceSettings?: boolean } = {}): Promise<void> {
  const tables = [db.exercises, db.plans, db.sessions, db.sets, db.flags, db.settings, db.measures, db.skips, db.analyses, db.photos];
  await db.transaction("rw", tables, async () => {
    const put = async <T, K extends keyof T>(table: EntityTable<T, K>, rows: T[], key: (r: T) => string, protect = (_k: string) => false) => {
      const keep = new Set(rows.map(key));
      const existing = ((await table.toCollection().primaryKeys()) as unknown as string[]).map(String);
      await table.bulkDelete(existing.filter((k) => !keep.has(k) && !protect(k)) as never);
      if (rows.length) await table.bulkPut(rows.map((r) => plain(r as object) as T));
    };
    // biblioteca: só os exercícios criados ou editados (os iguais à biblioteca do app não sobem)
    const changed = data.exercises.filter(differsFromLibrary);
    if (changed.length) await db.exercises.bulkPut(changed.map(plain));
    // plano que o esquema atual não reconhece fica como veio (melhor guardar do que perder)
    await put(db.plans, data.plans.map((p) => { const r = planSchema.safeParse(p.plan); return { ...p, plan: r.success ? r.data : p.plan }; }), (r) => r.id);
    await put(db.sessions, data.sessions, (r) => r.id);
    await put(db.sets, data.sets, (r) => r.id);
    await put(db.flags, data.flags, (r) => r.exercise);
    // ajustes do aparelho (id dos lembretes, vibração…) ficam como estão — a não ser na migração,
    // que é o mesmo aparelho (keepDeviceSettings)
    const fromBackup = opts.keepDeviceSettings ? data.settings : data.settings.filter((r) => !LOCAL_SETTINGS.has(r.key));
    await put(db.settings, fromBackup, (r) => r.key, (k) => !opts.keepDeviceSettings && LOCAL_SETTINGS.has(k));
    await put(db.measures, data.measures, (r) => r.id);
    await put(db.skips, data.skips, (r) => r.date);
    if (data.analyses) await put(db.analyses, data.analyses, (r) => r.id);
    if (data.photos) await put(db.photos, data.photos, (r) => r.id);
  });
}

export async function importBackup(text: string): Promise<void> {
  const raw = JSON.parse(text);
  if (raw?.format !== BACKUP_FORMAT && raw?.format !== LEGACY_BACKUP_FORMAT) throw new Error(`Arquivo não é um backup do app (${BACKUP_FORMAT}).`);
  // fotos convertidas antes da transação (fetch de data URL não pode rodar dentro dela)
  if (raw.photos)
    raw.photos = await Promise.all(raw.photos.map(async (p: Photo & { blob: string; thumb: string }) => ({ ...p, blob: await (await fetch(p.blob)).blob(), thumb: await (await fetch(p.thumb)).blob() })));
  await replaceAll(fromLegacy(raw));
}

/* ---------------- relatório para o Claude ---------------- */

export const LOG_FORMAT = "app-treino/log@1";

/** Resumo compacto das sessões no período, para colar no chat do Claude. */
export async function exportLog(from: string, to: string = isoDay()): Promise<string> {
  const sessions = (await db.sessions.where("date").between(from, to, true, true).toArray())
    .filter((s) => s.status === "done")
    .sort((a, b) => a.startedAt - b.startedAt);
  const out = [];
  for (const s of sessions) {
    const sets = await db.sets.where({ sessionId: s.id }).toArray();
    out.push({
      date: s.date,
      week: s.week,
      day: `${s.dayKey} — ${s.dayName}`,
      deload: s.deload || undefined,
      durationMin: s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : undefined,
      estimatedMin: s.estimatedMin,
      avgRestSec: avgRestSec(sets.filter((x) => !x.mode)) ?? undefined,
      fatigue: s.fatigue,
      pains: s.pains?.length ? s.pains : undefined,
      notes: s.notes || undefined,
      exercises: s.exercises.map((e, i) => {
        const done = sets.filter((x) => x.exOrder === i && x.done).sort((a, b) => a.setIndex - b.setIndex);
        const base = {
          name: e.name,
          block: e.block && e.block !== "main" ? e.block : undefined,
          planned: e.plannedName !== e.name ? e.plannedName : undefined,
          skipped: e.skipped || !done.length || undefined,
        };
        if (e.kind === "cardio") return { ...base, cardio: done[0]?.cardio };
        const timed = e.kind === "mobility" && done.some((x) => timedSeconds(x.targetReps) != null);
        return {
          ...base,
          sets: done
            .filter((x) => x.kind === "work")
            .map((x) => (timed ? `${x.reps ?? "?"} s` : `${x.kg ?? "PC"}×${x.reps ?? "?"}${x.rir != null ? ` @${x.rir}RIR` : ""}`)),
        };
      }),
    });
  }
  const measures = (await db.measures.where("date").between(from, to, true, true).sortBy("date")).map((m) => ({
    date: m.date,
    [m.type]: m.value,
    ...(m.note ? { note: m.note } : {}),
  }));
  const skips = await db.skips.where("date").between(from, to, true, true).toArray();
  // composição (massa magra/gordura/FFMI) nas datas com medida; usa também as medidas até 30 dias antes do período
  const settings = await getSettings();
  const upTo = (await db.measures.where("date").belowOrEqual(to).sortBy("date"));
  const ofType = (t: MeasureType) => upTo.filter((m) => m.type === t);
  const composition = compositionSeries(ofType("peso"), settings.heightCm, { bodyFat: ofType("gordura"), waist: ofType("cintura"), neck: ofType("pescoco"), hip: ofType("quadril") }, settings.sex ?? "m")
    .filter((c) => c.date >= from)
    .map((c) => ({ date: c.date, weight: c.weight, bodyFat: c.bodyFat, method: c.source, leanKg: c.lean, fatKg: c.fat, ffmi: c.ffmi }));
  return JSON.stringify(
    { format: LOG_FORMAT, from, to, sessions: out, measures: measures.length ? measures : undefined, composition: composition.length ? composition : undefined, notTrained: skips.length ? skips.map((s) => ({ date: s.date, day: s.dayKey, reason: s.reason })) : undefined },
    null,
    1,
  );
}

/* ---------------- programas montados no app ---------------- */

/** Salva (cria ou substitui) um programa montado/editado no app. Mesma rota da importação. */
export async function savePlan(plan: Plan, activate = false): Promise<void> {
  await importPlan(plan, activate);
}

export async function deletePlan(id: string): Promise<void> {
  await db.transaction("rw", db.plans, db.settings, async () => {
    await db.plans.delete(id);
    const s = await getSettings();
    if (s.activePlanId === id) {
      const next = await db.plans.orderBy("importedAt").last();
      await db.settings.put({ key: "activePlanId", value: next?.id ?? null });
    }
  });
}

export async function addCustomExercise(e: Pick<Exercise, "name" | "group" | "equipment" | "pattern" | "unilateral" | "notes"> & { muscles?: MuscleMap }): Promise<void> {
  const name = e.name.trim();
  if (!name) throw new Error("Dê um nome ao exercício.");
  if (await db.exercises.get(name)) throw new Error("Já existe um exercício com esse nome.");
  await db.exercises.add({ ...e, name, blocks: [], vetoed: false, custom: true });
}

/* ---------------- treino livre e edição na hora ---------------- */

export async function startFreestyle(date: string): Promise<string> {
  const id = newId();
  await db.sessions.add({
    id,
    planId: "livre",
    week: 0,
    dayKey: "L",
    dayName: "Treino livre",
    color: "#FF8A3D",
    date,
    startedAt: startTimeFor(date),
    status: "active",
    freestyle: true,
    deload: false,
    exercises: [],
  });
  return id;
}

/** Acrescenta um exercício ao fim da sessão, com séries vazias prontas para preencher. */
export async function addExerciseToSession(session: Session, name: string, opts: { sets: number; reps: number | string; restSec: number; rir?: string; perSide?: boolean }): Promise<void> {
  await db.transaction("rw", db.sessions, db.sets, db.exercises, async () => {
    const fresh = (await db.sessions.get(session.id))!;
    const exOrder = fresh.exercises.length;
    const info = await db.exercises.get(name);
    const kind = info?.kind && info.kind !== "strength" ? info.kind : undefined;
    await db.sessions.update(session.id, {
      exercises: [
        ...fresh.exercises,
        { name, plannedName: name, restSec: opts.restSec, rir: opts.rir, perSide: opts.perSide, kind, machine: kind === "cardio" ? info?.machine ?? guessMachine(name) : undefined },
      ],
    });
    // cardio é uma sessão só (as métricas vão nela)
    await db.sets.bulkAdd(
      Array.from({ length: kind === "cardio" ? 1 : opts.sets }, (_, setIndex) => ({
        id: newId(),
        sessionId: session.id,
        exOrder,
        exercise: name,
        setIndex,
        kind: "work" as const,
        targetKg: null,
        targetReps: opts.reps,
        kg: null,
        reps: typeof opts.reps === "number" ? opts.reps : null,
        rir: null,
        done: false,
        mode: kind,
      })),
    );
  });
}

/** Remove um exercício da sessão (e suas séries), renumerando os seguintes. */
export async function removeExerciseFromSession(session: Session, exOrder: number): Promise<void> {
  await db.transaction("rw", db.sessions, db.sets, async () => {
    const fresh = (await db.sessions.get(session.id))!;
    await db.sets.where({ sessionId: session.id }).filter((s) => s.exOrder === exOrder).delete();
    await db.sets
      .where({ sessionId: session.id })
      .filter((s) => s.exOrder > exOrder)
      .modify((s) => {
        s.exOrder -= 1;
      });
    await db.sessions.update(session.id, { exercises: fresh.exercises.filter((_, i) => i !== exOrder) });
  });
}

/** Nova ordem dos exercícios do treino (`order[k]` = índice antigo do k-ésimo); as séries acompanham. */
export async function reorderSessionExercises(session: Session, order: readonly number[]): Promise<void> {
  await db.transaction("rw", db.sessions, db.sets, async () => {
    const fresh = (await db.sessions.get(session.id))!;
    if (order.length !== fresh.exercises.length || new Set(order).size !== order.length) throw new Error("Ordem inválida.");
    const pos = new Map(order.map((old, k) => [old, k]));
    await db.sets.where({ sessionId: session.id }).modify((s) => {
      s.exOrder = pos.get(s.exOrder) ?? s.exOrder;
    });
    await db.sessions.update(session.id, { exercises: order.map((old) => fresh.exercises[old]) });
  });
}

/** Desfaz `removeExerciseFromSession`: põe o exercício e as séries dele de volta no lugar. */
export async function restoreSessionExercise(sessionId: string, exOrder: number, exercise: Session["exercises"][number], sets: SetEntry[]): Promise<void> {
  await db.transaction("rw", db.sessions, db.sets, async () => {
    const fresh = (await db.sessions.get(sessionId))!;
    await db.sets.where({ sessionId }).filter((s) => s.exOrder >= exOrder).modify((s) => {
      s.exOrder += 1;
    });
    await db.sets.bulkPut(sets.map((s) => ({ ...s, exOrder })));
    const list = [...fresh.exercises];
    list.splice(exOrder, 0, exercise);
    await db.sessions.update(sessionId, { exercises: list });
  });
}

export async function removeSet(id: string): Promise<void> {
  await db.sets.delete(id);
}

/** Série a mais num treino já feito (edição depois): copia a carga/reps da última e já entra como feita. */
export async function addDoneSet(session: Session, exOrder: number): Promise<void> {
  const existing = await db.sets.where({ sessionId: session.id }).filter((s) => s.exOrder === exOrder).sortBy("setIndex");
  const last = existing.filter((s) => s.kind === "work").at(-1) ?? existing.at(-1);
  await db.sets.add({
    id: newId(),
    sessionId: session.id,
    exOrder,
    exercise: session.exercises[exOrder].name,
    setIndex: (existing.at(-1)?.setIndex ?? -1) + 1,
    kind: "work",
    targetKg: null,
    targetReps: last?.targetReps ?? "",
    kg: last?.kg ?? null,
    reps: last?.reps ?? null,
    rir: last?.rir ?? null,
    done: true,
    completedAt: session.endedAt ?? Date.now(),
    mode: last?.mode,
  });
}

/* ---------------- medidas ---------------- */

export async function addMeasure(m: Omit<Measure, "id">): Promise<void> {
  await db.measures.add({ ...m, id: newId() });
}

/* ---------------- dias não treinados ---------------- */

export async function skipDay(date: string, reason: string, dayKey?: string): Promise<void> {
  await db.skips.put({ date, reason, dayKey });
  resync();
}

export async function unskipDay(date: string): Promise<void> {
  await db.skips.delete(date);
  resync();
}

/* ---------------- fotos ---------------- */

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** Redimensiona e comprime (JPEG) para não pesar no aparelho. */
async function resize(file: Blob, max: number, quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não consegui processar a foto."))), "image/jpeg", quality));
}

export async function addPhoto(file: File, date: string, pose: PhotoPose): Promise<void> {
  const [blob, thumb] = await Promise.all([resize(file, 1400, 0.85), resize(file, 320, 0.75)]);
  await db.photos.add({ id: newId(), date, pose, blob, thumb });
}

/** Miniatura da lista (a foto baixada do servidor chega sem ela). */
export const makeThumb = (b: Blob) => resize(b, 320, 0.75);

/* ---------------- análises do Claude (Fase 4) ---------------- */

/** Guarda a análise colada (bloco validado ou texto livre). Sincroniza como qualquer outra tabela. */
export async function saveAnalysis(a: Omit<Analysis, "id" | "createdAt">): Promise<string> {
  const id = newId();
  await db.analyses.add({ ...a, id, createdAt: Date.now() });
  return id;
}
