import { describe, expect, it } from "vitest";
import { capDevices, cleanRegistration, MAX_DEVICES, splitDue } from "./logic.js";

const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BPk", auth: "xyz" } };
const now = Date.UTC(2026, 9, 18, 12);

describe("servidor de lembretes", () => {
  it("aceita cadastro válido e limpa os avisos", () => {
    const r = cleanRegistration({ id: "dev-12345678", sub, events: [
      { at: now + 3600_000, title: "Treino A hoje", body: "Push", tag: "treino-2026-10-19", url: "#/inicio" },
      { at: now - 3600_000, title: "velho" }, // passado: fora
      { at: now + 60 * 86_400_000, title: "longe" }, // além de 31 dias: fora
      { at: now + 60_000, title: "x", url: "https://malicioso.example" }, // url externa vira #/inicio
    ] }, now);
    expect(r?.events.map((e) => e.title)).toEqual(["x", "Treino A hoje"]);
    expect(r?.events[0].url).toBe("#/inicio");
  });
  it("rejeita id ou inscrição inválidos", () => {
    expect(cleanRegistration({ id: "curto", sub }, now)).toBeNull();
    expect(cleanRegistration({ id: "dev-12345678", sub: { endpoint: "http://inseguro" } }, now)).toBeNull();
    expect(cleanRegistration(null, now)).toBeNull();
  });
  it("separa avisos vencidos no minuto do cron", () => {
    const ev = [{ at: 100 }, { at: 160 }, { at: 200 }];
    expect(splitDue(ev, 100, 160)).toEqual({ due: [{ at: 160 }], rest: [{ at: 200 }] });
  });
  it("limita a quantidade de aparelhos", () => {
    const devices = Object.fromEntries(Array.from({ length: MAX_DEVICES + 3 }, (_, i) => [`d${i}`, { id: `d${i}`, updated: i }]));
    const capped = capDevices(devices);
    expect(Object.keys(capped)).toHaveLength(MAX_DEVICES);
    expect(capped.d0).toBeUndefined();
  });
});
