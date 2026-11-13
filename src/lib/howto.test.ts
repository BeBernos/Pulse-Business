import { describe, expect, it } from "vitest";
import { howTo } from "./howto";
import { LIBRARY } from "./library";
import HOW from "../data/how-to.json";
import HOW_EN from "../data/how-to.en.json";
import { setLang } from "../i18n";

describe("como fazer", () => {
  it("todo exercício da biblioteca tem passo a passo (2 a 3 frases curtas)", () => {
    for (const e of LIBRARY) {
      const steps = howTo(e.name);
      expect(steps, e.name).not.toBeNull();
      expect(steps!.length, e.name).toBeGreaterThanOrEqual(2);
      expect(steps!.length, e.name).toBeLessThanOrEqual(3);
      for (const s of steps!) expect(s.length, `${e.name}: ${s}`).toBeLessThanOrEqual(120);
    }
  });

  it("não sobra texto de exercício que não existe (nome errado)", () => {
    const names = new Set(LIBRARY.map((e) => e.name));
    expect(Object.keys(HOW).filter((n) => !names.has(n))).toEqual([]);
  });

  it("inglês: mesmas chaves e mesmo número de frases do português", () => {
    const pt = HOW as Record<string, string[]>;
    const en = HOW_EN as Record<string, string[]>;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const k of Object.keys(pt)) expect(en[k].length, k).toBe(pt[k].length);
    setLang("en");
    try {
      expect(howTo(Object.keys(pt)[0])?.[0]).toMatch(/^[A-Z]/);
      expect(howTo(Object.keys(pt)[0])).toEqual(en[Object.keys(pt)[0]]);
    } finally {
      setLang("pt");
    }
  });

  it("exercício criado no app não tem texto", () => {
    expect(howTo("Meu exercício inventado")).toBeNull();
  });
});
