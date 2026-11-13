import HOW from "../data/how-to.json";
import HOW_EN from "../data/how-to.en.json";
import { lang } from "../i18n";

/**
 * "Como fazer" de cada exercício da biblioteca (texto próprio): posição, movimento e cuidado.
 * Em português (`how-to.json`) e inglês (`how-to.en.json`, mesmas chaves); sem tradução, fica o português.
 * Exercício criado no app não tem texto (as anotações dele aparecem no lugar).
 */
const TABLE = HOW as Record<string, string[]>;
const TABLE_EN = HOW_EN as Record<string, string[]>;

export function howTo(name: string): string[] | null {
  return (lang() === "en" ? TABLE_EN[name] : undefined) ?? TABLE[name] ?? null;
}
