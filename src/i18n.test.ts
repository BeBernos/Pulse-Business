import { describe, expect, it } from "vitest";
import EN from "./data/i18n.en.json";
import { GROUPS, EQUIPMENT, PATTERNS } from "./lib/groups";
import { MUSCLES } from "./lib/muscles";
import { MACHINE_LABEL, METRICS } from "./lib/cardio";
import { MEASURE_TYPES, POSES, SKIP_REASONS } from "./db";
import { fmtLong, monthLabel } from "./lib/calendar";
import { lang, setLang, t, tn } from "./i18n";

const en = EN as Record<string, string>;
// textos que são iguais nas duas línguas (nomes, unidades, exemplos de código)
const SAME = /^[\s\d{}#×·:/%+\-–—()., @'"…→✓✎⚠]*$|^(App|Claude|Pulse|FFMI|RFM|RIR|IMC ·|kg|min|s|sub|uni|Reps|Extra|Original|Smith|Core|Cardio|Pilates|Reformer|Cadillac|Chair|Kettlebell|Medicine Ball|TRX|Hinge|\/30d|20 min|×|treino-backup-….json|translate\(.*|Running in place[\s\S]*|\{"format".*)$/;

// código-fonte das telas e da lógica (sem os testes), lido como texto
const SOURCES = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("idioma", () => {
  it("todo tr(\"…\") das telas tem tradução para o inglês", () => {
    const keys = new Set<string>();
    for (const code of Object.values(SOURCES)) {
      for (const m of code.matchAll(/\btr\("((?:\\.|[^"\\])*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
    }
    expect(keys.size).toBeGreaterThan(800);
    const missing = [...keys].filter((k) => !(k in en) && !SAME.test(k));
    expect(missing).toEqual([]);
  });

  it("rótulos vindos dos dados também têm tradução", () => {
    const labels = [
      ...Object.values(MUSCLES).flatMap((m) => [m.label, m.region]),
      ...GROUPS.map((g) => g.name),
      ...EQUIPMENT,
      ...PATTERNS,
      ...Object.values(MEASURE_TYPES).flatMap((m) => [m.label, m.how]),
      ...Object.values(METRICS).map((m) => m.label),
      ...Object.values(MACHINE_LABEL),
      ...POSES.map((p) => p.label),
      ...SKIP_REASONS,
    ];
    expect(labels.filter((k) => !(k in en) && !SAME.test(k))).toEqual([]);
  });

  it("traduções mantêm os marcadores {0}, {1}…", () => {
    for (const [k, v] of Object.entries(en)) {
      const need = [...k.matchAll(/\{(\d)\}/g)].map((m) => m[1]);
      for (const n of need) {
        // plural em português ("treino{1}") pode sumir no inglês quando não faz sentido
        if (new RegExp(`[a-zà-ú]\\{${n}\\}`).test(k)) continue;
        expect(v, k).toContain(`{${n}}`);
      }
    }
  });

  it("português é o padrão; inglês troca o texto e mantém dia/mês", () => {
    expect(lang()).toBe("pt");
    expect(t("Começar treino")).toBe("Começar treino");
    expect(tn(2, "{0} treino", "{0} treinos")).toBe("2 treinos");
    setLang("en");
    try {
      expect(t("Começar treino")).toBe("Start workout");
      expect(t("Próximo: {0}", "Squat")).toBe("Next: Squat");
      expect(t("texto sem tradução")).toBe("texto sem tradução");
      expect(fmtLong("2026-10-28")).toBe("Wed, 28 Oct");
      expect(monthLabel(2026, 9)).toBe("October 2026");
    } finally {
      setLang("pt");
    }
    expect(fmtLong("2026-10-28")).toBe("qua, 28 out");
  });
});
