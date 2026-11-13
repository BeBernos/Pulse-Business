import { beforeEach, describe, expect, it } from "vitest";
import { addNote, clearFeedback, feedbackNotes, feedbackReport, recentErrors, recordError, removeNote } from "./feedback";

// localStorage e eventos mínimos para o teste (Vitest roda em Node)
const mem = new Map<string, string>();
globalThis.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as Storage;
globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
globalThis.dispatchEvent ??= () => true;

describe("feedback do app", () => {
  beforeEach(() => mem.clear());
  it("anota, apaga e junta tudo num texto para o Claude", () => {
    addNote("  botão escondido atrás do timer ");
    addNote("   ");
    expect(feedbackNotes().map((n) => n.text)).toEqual(["botão escondido atrás do timer"]);
    recordError(new Error("Falha ao salvar"));
    recordError(new Error("Falha ao salvar")); // repetido em seguida: um só
    expect(recentErrors()).toHaveLength(1);
    const txt = feedbackReport({ version: "1.0.0", device: "Celular", person: "Rafael" });
    expect(txt).toContain("Feedback do app Pulse (v1.0.0) · Celular · Rafael");
    expect(txt).toContain("botão escondido atrás do timer");
    expect(txt).toContain("Falha ao salvar");
    removeNote(feedbackNotes()[0].at);
    clearFeedback("errors");
    expect(feedbackNotes()).toEqual([]);
    expect(recentErrors()).toEqual([]);
  });
  it("guarda só os 30 erros mais recentes", () => {
    for (let i = 0; i < 40; i++) recordError(`erro ${i}`);
    const list = recentErrors();
    expect(list).toHaveLength(30);
    expect(list.at(-1)!.message).toBe("erro 39");
  });
});

describe("anotações resolvidas", () => {
  it("acha pelo começo do texto, sem ligar para maiúsculas e acentos", async () => {
    const { resolvedNote } = await import("./feedback");
    const done = [{ inicio: "Nas séries de superset", versao: "1.4.0", o_que: "Superset numa tela só" }];
    expect(resolvedNote({ text: "nas SERIES de superset, os exercícios ficam em telas separadas" }, done)?.versao).toBe("1.4.0");
    expect(resolvedNote({ text: "Outra coisa" }, done)).toBeNull();
  });
});
