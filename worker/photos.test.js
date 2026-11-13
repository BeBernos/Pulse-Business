import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index.js";
import { MAX_PHOTO_CHARS } from "./photos.js";
import { fakeD1 } from "./testing/d1.js";

const ORIGIN = "https://pulse.example.workers.dev";
let env;
beforeEach(() => {
  env = { DB: fakeD1(), PULSO_SETUP: "codigo", ASSETS: { fetch: () => new Response("app") } };
});

function device(name) {
  let cookie = "";
  async function call(path, { method = "GET", body, json = true } = {}) {
    const res = await worker.fetch(
      new Request(ORIGIN + path, { method, headers: { origin: ORIGIN, cookie, "cf-connecting-ip": name, ...(json ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : json ? JSON.stringify(body) : body }),
      env,
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* texto (a imagem) */ }
    return { status: res.status, body: data };
  }
  return { call };
}

async function accounts() {
  const rafael = device("S25");
  await rafael.call("/api/auth/setup", { method: "POST", body: { code: "codigo", name: "Rafael", password: "senha-forte-1", device: "S25" } });
  const inv = (await rafael.call("/api/auth/invite", { method: "POST", body: { kind: "join" } })).body.code;
  const marina = device("S26");
  await marina.call("/api/auth/join", { method: "POST", body: { code: inv, name: "Marina", password: "senha-dela-9", device: "S26" } });
  return { rafael, marina };
}

describe("fotos no servidor", () => {
  it("envia, lista, baixa e apaga; cada pessoa só vê as suas", async () => {
    const { rafael, marina } = await accounts();
    const img = "/9j/4AAQSkZJRgABAQ" + "A".repeat(1000);
    expect((await rafael.call("/api/photos/p1abc?date=2026-10-25&pose=frente&note=jejum", { method: "PUT", body: img, json: false })).status).toBe(200);
    const list = (await rafael.call("/api/photos")).body.photos;
    expect(list).toEqual([expect.objectContaining({ id: "p1abc", date: "2026-10-25", pose: "frente", note: "jejum", size: img.length })]);
    expect((await rafael.call("/api/photos/p1abc")).body).toBe(img);
    // a Marina não vê nem baixa as fotos do Rafael
    expect((await marina.call("/api/photos")).body).toEqual({ photos: [], deleted: [] });
    expect((await marina.call("/api/photos/p1abc")).status).toBe(404);
    expect((await rafael.call("/api/photos/p1abc", { method: "DELETE" })).status).toBe(200);
    expect((await rafael.call("/api/photos")).body).toEqual({ photos: [], deleted: ["p1abc"] });
    expect((await rafael.call("/api/photos/p1abc")).status).toBe(404);
    // outro aparelho que ainda tinha a foto não consegue reenviá-la (não ressuscita)
    expect((await rafael.call("/api/photos/p1abc?date=2026-10-25&pose=frente", { method: "PUT", body: img, json: false })).status).toBe(410);
  });
  it("recusa sem login, dados inválidos e foto grande demais", async () => {
    expect((await device("X").call("/api/photos")).status).toBe(401);
    const { rafael } = await accounts();
    expect((await rafael.call("/api/photos/p1abc?date=ontem&pose=frente", { method: "PUT", body: "QUJD", json: false })).status).toBe(400);
    expect((await rafael.call("/api/photos/p1abc?date=2026-10-25&pose=deitado", { method: "PUT", body: "QUJD", json: false })).status).toBe(400);
    expect((await rafael.call("/api/photos/p1abc?date=2026-10-25&pose=lado", { method: "PUT", body: "A".repeat(MAX_PHOTO_CHARS + 1), json: false })).status).toBe(413);
    expect((await rafael.call("/api/photos/a%20b", { method: "DELETE" })).status).toBe(400);
  });
});
