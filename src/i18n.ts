import EN from "./data/i18n.en.json";

/**
 * Idioma da interface (por pessoa: ajuste `lang`, sincronizado). O texto-fonte é o português: `t("Começar treino")`
 * procura a tradução em `data/i18n.en.json`; sem tradução, fica o português. `{0}`, `{1}`… recebem os argumentos.
 * Instruções e relatórios para o Claude ficam sempre em português (pedido do Rafael); datas no formato dd/mm.
 */
export type Lang = "pt" | "en";

let current: Lang = "pt";
const en = EN as Record<string, string>;

export function setLang(l: Lang | null | undefined): void {
  current = l === "en" ? "en" : "pt";
  if (typeof document !== "undefined") document.documentElement.lang = current === "en" ? "en" : "pt-BR";
}

export const lang = (): Lang => current;

export function t(s: string, ...args: unknown[]): string {
  const base = current === "en" ? en[s] ?? s : s;
  return args.length ? base.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : base;
}

/** Plural simples: `tn(n, "{0} treino", "{0} treinos")`. */
export function tn(n: number, one: string, many: string): string {
  return t(n === 1 ? one : many, n);
}

/** Mesmo que `t` (nas telas, `t` já é nome de variável em vários lugares). */
export const tr = t;
