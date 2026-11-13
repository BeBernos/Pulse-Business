import { FEEDBACK_DONE, type FeedbackDone } from "../data/feedback-done";

/**
 * Feedback do app: anotações da pessoa + os últimos erros que apareceram na tela. Ficam no aparelho (localStorage)
 * e vão sozinhos para o servidor (tabelas `feedback` e `errors`), onde o Claude lê no começo de cada sessão
 * (igual às ideias do app de finanças). O que vira melhoria entra em `data/feedback-done.ts` e sai das pendentes.
 */
export interface FeedbackNote {
  at: number;
  text: string;
  /** tela em que estava (hash da rota) */
  route: string;
  /** já chegou ao servidor */
  sent?: boolean;
}

export interface ErrorEntry {
  at: number;
  message: string;
  route: string;
  stack?: string;
}

const NOTES = "pulso.feedback";
const ERRORS = "pulso.errors";
const MAX_ERRORS = 30;

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* sem armazenamento: segue sem guardar */
  }
  window.dispatchEvent(new Event("pulso-feedback"));
}

const route = () => (typeof location !== "undefined" ? location.hash || "#/inicio" : "");

export const feedbackNotes = () => read<FeedbackNote>(NOTES);
export const recentErrors = () => read<ErrorEntry>(ERRORS);

export function addNote(text: string): void {
  const t = text.trim();
  if (!t) return;
  write(NOTES, [...feedbackNotes(), { at: Date.now(), text: t, route: route() }]);
  uploadNotes().catch(() => {});
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** A anotação já virou melhoria? (pelo começo do texto, em `data/feedback-done.ts`) */
export function resolvedNote(n: { text: string }, done: readonly FeedbackDone[] = FEEDBACK_DONE): FeedbackDone | null {
  const t = norm(n.text);
  return done.find((d) => t.startsWith(norm(d.inicio))) ?? null;
}

let uploading = false;
/** Manda ao servidor as anotações que ainda não foram (sem conta ou sem internet: fica para a próxima). */
export async function uploadNotes(): Promise<number> {
  if (uploading || typeof fetch !== "function" || typeof location === "undefined") return 0;
  uploading = true;
  let n = 0;
  try {
    for (const note of feedbackNotes().filter((x) => !x.sent)) {
      const r = await fetch("./api/sync/feedback", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ at: note.at, text: note.text, route: note.route, version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "" }) });
      if (!r.ok) break;
      write(NOTES, feedbackNotes().map((x) => (x.at === note.at ? { ...x, sent: true } : x)));
      n++;
    }
  } finally {
    uploading = false;
  }
  return n;
}

export function removeNote(at: number): void {
  write(NOTES, feedbackNotes().filter((n) => n.at !== at));
}

/** Desfaz `removeNote` (volta para o lugar dela, pela hora). */
export function restoreNote(note: FeedbackNote): void {
  write(NOTES, [...feedbackNotes().filter((n) => n.at !== note.at), note].sort((a, b) => a.at - b.at));
}

/** Guarda um erro (repetido em seguida = um só), mantendo os últimos 30. */
export function recordError(err: unknown): void {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err) ?? "erro";
  const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : undefined;
  const list = recentErrors();
  const last = list.at(-1);
  if (last && last.message === message && Date.now() - last.at < 5000) return;
  write(ERRORS, [...list, { at: Date.now(), message, route: route(), stack }].slice(-MAX_ERRORS));
  // também vai para o servidor (só da própria conta): dá para corrigir antes de alguém precisar contar
  if (typeof location !== "undefined" && typeof fetch === "function")
    fetch("./api/sync/errors", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, route: route(), stack, version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "" }) }).catch(() => {});
}

export function clearFeedback(what: "notes" | "errors"): void {
  write(what === "notes" ? NOTES : ERRORS, []);
}

const when = (at: number) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Texto para colar no Claude Code: contexto + anotações + erros. */
export function feedbackReport(ctx: { version: string; device: string; person?: string }, notes = feedbackNotes(), errors = recentErrors()): string {
  const lines = [
    `Feedback do app Pulse (v${ctx.version}) · ${ctx.device}${ctx.person ? ` · ${ctx.person}` : ""} · ${when(Date.now())}`,
    "",
    notes.length ? "O que melhorar / o que deu errado:" : "Sem anotações.",
    ...notes.map((n) => `- [${when(n.at)} · ${n.route}] ${n.text}`),
  ];
  if (errors.length) lines.push("", "Erros que apareceram na tela:", ...errors.map((e) => `- [${when(e.at)} · ${e.route}] ${e.message}${e.stack ? `\n  ${e.stack.replace(/\n/g, "\n  ")}` : ""}`));
  return lines.join("\n");
}
