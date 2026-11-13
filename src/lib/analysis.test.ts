import { describe, expect, it } from "vitest";
import { ANALYSIS_FORMAT, freeTextAnalysis, parseAnalysis, planContext, shareMessage } from "./analysis";

const block = {
  format: ANALYSIS_FORMAT,
  from: "2026-10-13",
  to: "2026-10-19",
  title: "Semana 12: boa adesão",
  summary: "Treinou 4 de 4 dias.",
  highlights: ["Recorde no Barbell Curl"],
  attention: ["Dor no ombro na quinta"],
  exercises: [{ name: "Seated Dumbbell Lateral Raise", note: "reps subindo", trend: "up" }],
  nextSteps: ["Manter as cargas da semana 13"],
};

describe("análise do Claude (pulse/analysis@1)", () => {
  it("acha o bloco no meio da resposta (texto + cerca ```json)", () => {
    const text = `Ótima semana!\n\nResumo...\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\nQualquer dúvida, me chame.`;
    const r = parseAnalysis(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.block.exercises?.[0].trend).toBe("up");
  });

  it("aceita sem cercas e com aspas curvas do celular", () => {
    const curly = JSON.stringify(block).replace(/"/g, "“");
    expect(parseAnalysis(`aqui vai: ${curly}`).ok).toBe(true);
  });

  it("ignora outros blocos (ex.: um plano) e pega o da análise", () => {
    const text = `\`\`\`json\n{"format":"app-treino/plan@1"}\n\`\`\`\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``;
    expect(parseAnalysis(text).ok).toBe(true);
  });

  it("erro claro quando falta campo ou o formato é outro", () => {
    const r1 = parseAnalysis(JSON.stringify({ ...block, title: "" }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toContain("title");
    const r2 = parseAnalysis(`\`\`\`json\n{"format":"app-treino/plan@1"}\n\`\`\``);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain("outro formato");
    expect(parseAnalysis("só texto").ok).toBe(false);
  });

  it("tendência inválida é recusada", () => {
    expect(parseAnalysis(JSON.stringify({ ...block, exercises: [{ name: "X", note: "y", trend: "melhor" }] })).ok).toBe(false);
  });

  it("texto livre vira análise só de texto, título = 1ª linha", () => {
    const a = freeTextAnalysis("\n## Semana boa\nDetalhes...");
    expect(a).toMatchObject({ title: "Semana boa", freeText: true });
  });

  it("mensagem a compartilhar leva o pedido, o plano e o relatório", () => {
    const ctx = planContext({ block: { name: "Bloco Ago–Out", weeks: 13 }, days: [{ key: "A", name: "Peito", exercises: [{ name: "Chest Dips" }] }] }, 12);
    const msg = shareMessage('{"format":"app-treino/log@1"}', ctx, "Rafael");
    expect(msg).toContain(ANALYSIS_FORMAT);
    expect(msg).toContain("Plano: Bloco Ago–Out · semana 12 de 13");
    expect(msg).toContain("- A Peito: Chest Dips");
    expect(msg).toContain('"format":"app-treino/log@1"');
  });
});
