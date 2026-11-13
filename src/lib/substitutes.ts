import type { MuscleId } from "./muscles";

interface Lib { name: string; group: string; pattern: string; equipment: string; unilateral?: boolean; vetoed?: boolean; muscles?: { primary: MuscleId[]; secondary: MuscleId[] } }

/**
 * Exercícios parecidos para trocar na hora (aparelho ocupado): mesmo grupo e algum músculo principal em comum.
 * Ordem: mais músculos principais em comum, mesmo padrão de movimento, mesmo lado (uni/bilateral), outro equipamento.
 */
export function suggestSubstitutes(name: string, library: readonly Lib[], exclude: ReadonlySet<string> = new Set(), n = 8): string[] {
  const me = library.find((e) => e.name === name);
  if (!me?.muscles) return [];
  const mine = new Set(me.muscles.primary);
  return library
    .filter((e) => e.name !== name && !e.vetoed && !exclude.has(e.name) && e.group === me.group && e.muscles?.primary.some((m) => mine.has(m)))
    .map((e) => ({
      name: e.name,
      score:
        e.muscles!.primary.filter((m) => mine.has(m)).length * 4 +
        (e.pattern === me.pattern ? 3 : 0) +
        (!!e.unilateral === !!me.unilateral ? 1 : 0) +
        (e.equipment !== me.equipment ? 0.5 : 0), // aparelho ocupado: outro equipamento ajuda
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, n)
    .map((e) => e.name);
}
