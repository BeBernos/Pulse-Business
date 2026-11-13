import Dexie from "dexie";
import { BACKUP_FORMAT, db, differsFromLibrary, fromLegacy, LEGACY_BACKUP_FORMAT, LOCAL_SETTINGS, plain, replaceAll, type BackupData, type Exercise, type Photo, type Session, type SetEntry } from "./db";

/**
 * Migração do app antigo ("app-treino", ids numéricos) para o banco do Pulse.
 * Regra: copiar, nunca transformar no lugar. O banco antigo só é LIDO (nenhuma escrita, nem marca):
 * fica no aparelho como garantia até a pessoa apagar à mão em Ajustes (liberado depois de 30 dias).
 */

export const LEGACY_DB = "app-treino";
/**
 * Marca no aparelho (fora do banco novo): a cópia já foi feita aqui. Sem ela, apagar o banco novo
 * (Sair e apagar) faria a próxima abertura copiar de novo os dados antigos — e, ao entrar, eles
 * voltariam ao servidor com carimbo novo, por cima de edições mais recentes.
 */
const MIGRATED_KEY = "pulso.legacyMigrated";
const storage = () => (typeof localStorage === "undefined" ? null : localStorage);
const LEGACY_TABLES = ["exercises", "plans", "sessions", "sets", "flags", "settings", "measures", "skips", "photos"] as const;

/** O que se confere antes/depois da cópia. */
export interface Tally {
  sessions: number;
  sessionsDone: number;
  sets: number;
  setsDone: number;
  /** Soma de kg × reps das séries feitas (pega série trocada/perdida). */
  tonnage: number;
  lastSession: string | null;
  plans: number;
  measures: number;
  skips: number;
  flags: number;
  settings: number;
  photos: number;
  /** Exercícios criados ou editados pela pessoa. */
  customExercises: number;
}

export interface MigrationReport {
  at: number;
  before: Tally;
  after: Tally;
  ok: boolean;
  /** Linhas em que antes ≠ depois. */
  diffs: string[];
}

export const TALLY_LABELS: Record<keyof Tally, string> = {
  sessions: "Treinos (todos)",
  sessionsDone: "Treinos finalizados",
  sets: "Séries",
  setsDone: "Séries feitas",
  tonnage: "Volume total (kg × reps)",
  lastSession: "Último treino",
  plans: "Programas",
  measures: "Medidas",
  skips: "Dias pulados",
  flags: "Restrições",
  settings: "Ajustes",
  photos: "Fotos",
  customExercises: "Exercícios criados/editados",
};

export function tally(d: { exercises: Exercise[]; sessions: Session[]; sets: SetEntry[]; plans: unknown[]; measures: unknown[]; skips: unknown[]; flags: unknown[]; settings: unknown[]; photos?: Photo[] | unknown[] }): Tally {
  const done = d.sets.filter((s) => s.done);
  return {
    sessions: d.sessions.length,
    sessionsDone: d.sessions.filter((s) => s.status === "done").length,
    sets: d.sets.length,
    setsDone: done.length,
    tonnage: Math.round(done.reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0) * 100) / 100,
    lastSession: d.sessions.map((s) => s.date).sort().at(-1) ?? null,
    plans: d.plans.length,
    measures: d.measures.length,
    skips: d.skips.length,
    flags: d.flags.length,
    settings: d.settings.length,
    photos: d.photos?.length ?? 0,
    customExercises: d.exercises.filter(differsFromLibrary).length,
  };
}

export function compare(before: Tally, after: Tally): string[] {
  return (Object.keys(before) as (keyof Tally)[]).filter((k) => before[k] !== after[k]).map((k) => `${TALLY_LABELS[k]}: ${before[k]} → ${after[k]}`);
}

export class MigrationError extends Error {
  constructor(public report: MigrationReport) {
    super(`A cópia dos dados não bateu (${report.diffs.join("; ")}). Nada foi apagado: o app antigo continua guardado no aparelho.`);
  }
}

export async function legacyExists(): Promise<boolean> {
  return Dexie.exists(LEGACY_DB);
}

/** Lê o banco antigo inteiro, sem declarar versão (abrir com versão poderia "atualizá-lo"). */
export async function readLegacy(): Promise<Record<string, unknown[]> | null> {
  if (!(await legacyExists())) return null;
  const old = new Dexie(LEGACY_DB);
  try {
    await old.open(); // modo dinâmico: só lê o esquema que já existe
    const out: Record<string, unknown[]> = {};
    for (const t of LEGACY_TABLES) out[t] = old.tables.some((x) => x.name === t) ? await old.table(t).toArray() : [];
    return out;
  } finally {
    old.close();
  }
}

/** Backup do banco antigo no formato antigo (botão de emergência se a migração falhar). */
export async function exportLegacyBackup(): Promise<string | null> {
  const data = await readLegacy();
  if (!data) return null;
  const { photos: _photos, ...rest } = data;
  return JSON.stringify({ format: "app-treino/backup@1", exportedAt: new Date().toISOString(), ...rest });
}

export async function migrationReport(): Promise<MigrationReport | null> {
  return ((await db.meta.get("migration"))?.value as MigrationReport | undefined) ?? null;
}

async function currentTally(withPhotos: boolean): Promise<Tally> {
  const [exercises, sessions, sets, plans, measures, skips, flags, settings] = await Promise.all([
    db.exercises.toArray(), db.sessions.toArray(), db.sets.toArray(), db.plans.toArray(), db.measures.toArray(), db.skips.toArray(), db.flags.toArray(), db.settings.toArray(),
  ]);
  return tally({ exercises, sessions, sets, plans, measures, skips, flags, settings, photos: withPhotos ? await db.photos.toArray() : [] });
}

/**
 * Copia o app antigo para o banco atual (uma vez). Confere os números antes/depois; se algo não
 * bater, desfaz a cópia (o banco novo volta vazio) e lança MigrationError — o antigo fica intacto.
 * Devolve null quando não há o que migrar.
 */
export async function migrateLegacy(opts: { force?: boolean } = {}): Promise<MigrationReport | null> {
  const done = await migrationReport();
  if (done?.ok) return done;
  // `force`: a pessoa pediu para copiar de novo (tela de resgate) — ignora a marca do aparelho
  if (!opts.force && storage()?.getItem(MIGRATED_KEY)) return note("já copiado antes neste aparelho");
  let raw: Record<string, unknown[]> | null;
  try {
    raw = await readLegacy();
  } catch (e) {
    note(`erro ao ler: ${(e as Error).message}`);
    throw e;
  }
  if (!raw) return note("banco antigo não encontrado");
  if (!((raw.sessions?.length ?? 0) + (raw.measures?.length ?? 0) + (raw.plans?.length ?? 0) + (raw.skips?.length ?? 0))) return note("banco antigo vazio");

  const data = fromLegacy(raw);
  const before = tally({ ...data, photos: data.photos ?? [] });
  // ids fixos (m00000057): se a cópia já começou antes e parou no meio, regravar não duplica
  await replaceAll(data, { keepDeviceSettings: true });
  const after = await currentTally(true);
  const diffs = compare(before, after);
  const report: MigrationReport = { at: Date.now(), before, after, ok: diffs.length === 0, diffs };
  if (!report.ok) {
    await db.transaction("rw", [db.sessions, db.sets, db.plans, db.measures, db.skips, db.flags, db.settings, db.photos, db.tombs], async () => {
      await Promise.all([db.sessions.clear(), db.sets.clear(), db.plans.clear(), db.measures.clear(), db.skips.clear(), db.flags.clear(), db.settings.clear(), db.photos.clear()]);
      await db.tombs.clear();
    });
    note(`conferência não bateu: ${report.diffs.join("; ")}`);
    throw new MigrationError(report);
  }
  await db.meta.put({ key: "migration", value: report });
  storage()?.setItem(MIGRATED_KEY, String(report.at));
  note(`copiado: ${report.after.sessions} treinos`);
  return report;
}

/* ---------------- diagnóstico e resgate ---------------- */

const LOG_KEY = "pulso.migrationLog";

/** Guarda o resultado da última tentativa de cópia (aparece no diagnóstico). */
function note(result: string): null {
  storage()?.setItem(LOG_KEY, JSON.stringify({ at: new Date().toISOString(), db: db?.name, result }));
  return null;
}

export interface DeviceProbe {
  origin: string;
  /** Treinos do app antigo que ainda não estão no banco aberto agora. */
  missingSessions: number;
  /** Bancos que existem neste endereço, neste navegador. */
  databases: { name: string; version?: number }[];
  /** O app antigo, se achado: quantos registros em cada tabela. */
  legacy: { version: number; counts: Record<string, number> } | null;
  lastAttempt: unknown;
  migratedFlag: string | null;
  error?: string;
}

/** Só leitura: o que existe neste aparelho (para "meus treinos sumiram?"). */
export async function probeDevice(): Promise<DeviceProbe> {
  const out: DeviceProbe = {
    origin: typeof location === "undefined" ? "" : location.origin,
    missingSessions: 0,
    databases: [],
    legacy: null,
    lastAttempt: JSON.parse(storage()?.getItem(LOG_KEY) ?? "null"),
    migratedFlag: storage()?.getItem(MIGRATED_KEY) ?? null,
  };
  try {
    if (typeof indexedDB !== "undefined" && "databases" in indexedDB) out.databases = (await indexedDB.databases()).map((d) => ({ name: d.name ?? "?", version: d.version }));
    if (await legacyExists()) {
      const old = new Dexie(LEGACY_DB);
      try {
        await old.open();
        const counts: Record<string, number> = {};
        for (const t of old.tables) counts[t.name] = await t.count();
        out.legacy = { version: old.verno, counts };
        if (old.tables.some((t) => t.name === "sessions")) {
          const ids = fromLegacy({ sessions: await old.table("sessions").toArray() }).sessions.map((s) => s.id);
          const here = await db.sessions.bulkGet(ids);
          out.missingSessions = here.filter((s) => !s).length;
        }
      } finally {
        old.close();
      }
    }
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}

/**
 * Resgate: traz do app antigo só o que **falta** no banco aberto (nunca apaga nem sobrescreve nada).
 * É o que a tela "Meus treinos antigos" usa — o banco pode já ter plano importado, medidas, dados do servidor.
 * Confere no fim que tudo do app antigo está aqui. Devolve quantos registros entraram.
 */
export async function mergeLegacy(): Promise<number> {
  const raw = await readLegacy();
  if (!raw) throw new Error("Não achei o app antigo neste aparelho.");
  const added = await mergeData(fromLegacy(raw));
  storage()?.setItem(MIGRATED_KEY, String(Date.now()));
  note(`resgate: ${added} registros acrescentados`);
  return added;
}

/** Arquivo de backup (antigo ou novo) no modo resgate: só acrescenta o que falta. */
export async function mergeBackupFile(text: string): Promise<number> {
  const raw = JSON.parse(text);
  if (raw?.format !== BACKUP_FORMAT && raw?.format !== LEGACY_BACKUP_FORMAT) throw new Error("Este arquivo não é um backup do app.");
  if (raw.photos)
    raw.photos = await Promise.all(raw.photos.map(async (p: Photo & { blob: string; thumb: string }) => ({ ...p, blob: await (await fetch(p.blob)).blob(), thumb: await (await fetch(p.thumb)).blob() })));
  return mergeData(fromLegacy(raw));
}

/** Acrescenta ao banco aberto os registros que ainda não existem (por chave). Confere no fim. */
async function mergeData(data: BackupData): Promise<number> {
  let added = 0;
  const tables = [db.exercises, db.plans, db.sessions, db.sets, db.flags, db.settings, db.measures, db.skips, db.analyses, db.photos];
  await db.transaction("rw", tables, async () => {
    const addMissing = async <T>(table: { bulkGet: (k: string[]) => Promise<(T | undefined)[]>; bulkAdd: (r: T[]) => Promise<unknown> }, rows: T[], key: (r: T) => string) => {
      if (!rows.length) return;
      const have = await table.bulkGet(rows.map(key));
      const fresh = rows.filter((_, i) => !have[i]);
      if (fresh.length) await table.bulkAdd(fresh.map((r) => plain(r as object) as T));
      added += fresh.length;
    };
    await addMissing(db.exercises as never, data.exercises.filter(differsFromLibrary), (r: Exercise) => r.name);
    await addMissing(db.plans as never, data.plans, (r: { id: string }) => r.id);
    await addMissing(db.sessions as never, data.sessions, (r: Session) => r.id);
    await addMissing(db.sets as never, data.sets, (r: SetEntry) => r.id);
    await addMissing(db.flags as never, data.flags, (r: { exercise: string }) => r.exercise);
    await addMissing(db.settings as never, data.settings.filter((r) => !LOCAL_SETTINGS.has(r.key)), (r: { key: string }) => r.key);
    await addMissing(db.measures as never, data.measures, (r: { id: string }) => r.id);
    await addMissing(db.skips as never, data.skips, (r: { date: string }) => r.date);
    if (data.analyses) await addMissing(db.analyses as never, data.analyses, (r: { id: string }) => r.id);
    if (data.photos) await addMissing(db.photos as never, data.photos, (r: Photo) => r.id);
  });
  // conferência: todo treino e toda série do app antigo agora existem aqui
  const sessionsHere = await db.sessions.bulkGet(data.sessions.map((s) => s.id));
  const setsHere = await db.sets.bulkGet(data.sets.map((s) => s.id));
  const missing = sessionsHere.filter((s) => !s).length + setsHere.filter((s) => !s).length;
  if (missing) throw new Error(`${missing} registros não entraram. Nada foi apagado; tente de novo ou mande o diagnóstico.`);
  return added;
}

/** Apaga o banco antigo (só a pedido, em Ajustes, depois de 30 dias da migração). */
export async function deleteLegacy(): Promise<void> {
  await Dexie.delete(LEGACY_DB);
}

export const LEGACY_KEEP_DAYS = 30;
