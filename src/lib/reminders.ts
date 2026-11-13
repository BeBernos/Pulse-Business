import { addDays, blockStatus, parseDay, scheduledDay } from "./calendar";
import type { Plan } from "./plan";
import { estimateMinutes, fmtMinutes } from "./prescription";

export interface ReminderEvent {
  at: number;
  title: string;
  body: string;
  tag: string;
  url: string;
}

export interface ReminderOpts {
  workout: boolean;
  workoutTime: string; // "HH:MM"
  forgot: boolean;
  forgotTime: string;
  backup: boolean;
  weigh?: boolean;
  weighDays?: number[];
  weighTime?: string;
}

const DAYS = 14;
const WEEK_MS = 7 * 86_400_000;

/** Instante local de uma data + "HH:MM" (fuso do aparelho). */
export function at(iso: string, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = parseDay(iso);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/**
 * Avisos dos próximos 14 dias, calculados no aparelho a partir do plano (o servidor só dispara):
 * - lembrete do treino agendado no horário escolhido;
 * - "esqueceu de registrar?" à noite, se o dia tinha treino e não houve sessão nem marcação de pulo;
 * - backup semanal (domingo 20h) quando o último backup tem mais de 7 dias.
 */
export function buildReminderEvents(p: {
  plan?: Plan;
  today: string;
  now: number;
  trained: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  opts: ReminderOpts;
  lastBackupAt: number | null;
  /** Dias com peso registrado (o lembrete de pesagem não toca se já pesou). */
  weighed?: ReadonlySet<string>;
}): ReminderEvent[] {
  const { plan, today, now, trained, skipped, opts, lastBackupAt } = p;
  const out: ReminderEvent[] = [];
  if (opts.weigh && opts.weighDays?.length) {
    for (let i = 0; i < DAYS; i++) {
      const date = addDays(today, i);
      if (!opts.weighDays.includes(parseDay(date).getDay()) || p.weighed?.has(date)) continue;
      const t = at(date, opts.weighTime ?? "07:00");
      if (t > now) out.push({ at: t, title: "Dia de pesagem", body: "Em jejum, depois do banheiro. Um toque para registrar.", tag: `peso-${date}`, url: "#/corpo/novo/peso" });
    }
  }
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(today, i);
    if (!plan || blockStatus(plan, date) !== "live") continue;
    const day = scheduledDay(plan, date);
    if (!day) continue;
    const done = trained.has(date) || skipped.has(date);
    if (opts.workout && !done) {
      const t = at(date, opts.workoutTime);
      if (t > now) out.push({ at: t, title: `Hoje: ${day.key} · ${day.name}`, body: `${day.exercises.length} exercícios · ~${fmtMinutes(estimateMinutes(plan, day, 1))}. Bora!`, tag: `treino-${date}`, url: "#/inicio" });
    }
    if (opts.forgot && !done) {
      const t = at(date, opts.forgotTime);
      if (t > now) out.push({ at: t, title: "Treinou hoje?", body: `O ${day.key} · ${day.name} ainda não foi registrado. Registre ou marque o motivo.`, tag: `esqueci-${date}`, url: `#/progresso/dia/${date}` });
    }
  }
  if (opts.backup) {
    for (let i = 0; i < DAYS; i++) {
      const date = addDays(today, i);
      if (parseDay(date).getDay() !== 0) continue;
      const t = at(date, "20:00");
      if (t > now && (!lastBackupAt || t - lastBackupAt >= WEEK_MS)) {
        out.push({ at: t, title: "Hora do backup", body: "Seus treinos ficam só neste celular. Baixe o backup em Ajustes (1 toque).", tag: "backup", url: "#/ajustes/dados" });
        break;
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
