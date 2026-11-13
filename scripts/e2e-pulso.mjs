// Ponta a ponta do Pulse: celular do Rafael com dados do app antigo → ativa o Pulse → PC entra e recebe
// tudo → digital (autenticador virtual do Chrome) → convite da Marina → sincronização nos dois sentidos,
// inclusive offline. Não roda no `npm test` (precisa do Worker local e de um Chromium).
//
//   npm run build
//   npx wrangler dev --local --port 8787 --persist-to <pasta-vazia> --var PULSO_SETUP:teste-instalacao-123
//   PLAYWRIGHT=<caminho do pacote playwright> CHROME=<executável do Chromium> node scripts/e2e-pulso.mjs <pasta-prints>
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pwMod = await import(process.env.PLAYWRIGHT ?? "playwright");
const { chromium } = pwMod.chromium ? pwMod : pwMod.default;
const root = fileURLToPath(new URL("..", import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:8787";
const OUT = process.argv[2] ?? "e2e-prints";
mkdirSync(OUT, { recursive: true });
const dexieJs = readFileSync(`${root}node_modules/dexie/dist/dexie.js`, "utf8");
const lib = JSON.parse(readFileSync(`${root}src/data/library.json`, "utf8"));
const seedPlan = JSON.parse(readFileSync(`${root}src/data/seed-plan.json`, "utf8"));

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const log = (...a) => console.log("•", ...a);
let shot = 0;
const snap = async (page, name) => page.screenshot({ path: `${OUT}/${String(++shot).padStart(2, "0")}-${name}.png` });

async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, userAgent: `Mozilla/5.0 (Linux; Android 15; ${name}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36` });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${name} erro]`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log(`  [${name} console]`, m.text()));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { ctx, page, cdp, authenticatorId };
}

const clickText = (page, text) => page.getByText(text, { exact: false }).first().click();
async function fill(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
}

/* 1. celular do Rafael com o app antigo (banco "app-treino" v4, ids numéricos) */
const s25 = await phone("SM-S931B");
await s25.page.route(`${BASE}/__seed`, (r) => r.fulfill({ contentType: "text/html", body: `<script>${dexieJs}</script>` }));
await s25.page.goto(`${BASE}/__seed`);
await s25.page.evaluate(async ({ lib, seedPlan }) => {
  const old = new Dexie("app-treino");
  old.version(1).stores({ exercises: "&name, group", plans: "&id, importedAt", sessions: "++id, date, status, planId, [planId+week]", sets: "++id, sessionId, exercise, [exercise+completedAt]", flags: "&exercise", settings: "&key" });
  old.version(2).stores({ measures: "++id, date, type, [type+date]" });
  old.version(3).stores({ skips: "&date" });
  old.version(4).stores({ photos: "++id, date, pose" });
  await old.open();
  await old.table("exercises").bulkAdd(lib);
  await old.table("plans").add({ id: seedPlan.block.id, plan: seedPlan, importedAt: 1 });
  const day = seedPlan.days[0];
  for (let i = 0; i < 40; i++) {
    const date = new Date(Date.UTC(2026, 7, 3 + i * 2)).toISOString().slice(0, 10);
    const sid = await old.table("sessions").add({ planId: seedPlan.block.id, week: 1 + Math.floor(i / 4), dayKey: day.key, dayName: day.name, color: "#FF3B5C", date, startedAt: Date.parse(date) + 8 * 3600e3, endedAt: Date.parse(date) + 9 * 3600e3, status: "done", deload: false, exercises: day.exercises.map((e) => ({ name: e.name, plannedName: e.name, restSec: 90 })) });
    for (const [exOrder, e] of day.exercises.entries())
      for (let j = 0; j < 3; j++) await old.table("sets").add({ sessionId: sid, exOrder, exercise: e.name, setIndex: j, kind: "work", targetKg: 40, targetReps: 10, kg: 40 + i, reps: 10, rir: 2, done: true, completedAt: Date.parse(date) + 8 * 3600e3 + j * 1000 });
  }
  await old.table("settings").bulkAdd([{ key: "activePlanId", value: seedPlan.block.id }, { key: "name", value: "Rafael" }, { key: "heightCm", value: 180 }]);
  await old.table("measures").bulkAdd([{ date: "2026-07-27", type: "peso", value: 82.2 }, { date: "2026-09-01", type: "peso", value: 81.4 }, { date: "2026-09-01", type: "cintura", value: 88 }]);
  await old.table("skips").add({ date: "2026-08-20", reason: "Viagem" });
  old.close();
}, { lib, seedPlan });
log("app antigo criado no celular (40 treinos)");

/* 2. abre o Pulse: migra sozinho, app funciona, faixa "Ative o Pulse" */
await s25.page.unroute(`${BASE}/__seed`);
await s25.page.goto(`${BASE}/#/inicio`);
await s25.page.getByText("Ative o Pulse").waitFor();
await snap(s25.page, "inicio-com-faixa-ativar");
const migrated = await s25.page.evaluate(async () => ({ sessions: await window.__treino.db.sessions.count(), sets: await window.__treino.db.sets.count() }));
log("migrado no aparelho:", migrated);

/* 3. Ativar: backup → criar conta principal → "são meus" */
await clickText(s25.page, "Ative o Pulse");
await snap(s25.page, "ativar-passo1-backup");
const dl = s25.page.waitForEvent("download");
await clickText(s25.page, "Baixar cópia de segurança");
const file = await dl;
log("backup baixado:", file.suggestedFilename());
await s25.page.getByRole("button", { name: "Continuar" }).click();
await s25.page.getByText("Código de instalação").first().waitFor();
await fill(s25.page, "Código de instalação", "teste-instalacao-123");
await fill(s25.page, "Nome", "Rafael");
await fill(s25.page, "Nova senha (mín. 8)", "senha-do-rafael-1");
await fill(s25.page, "Repita a senha", "senha-do-rafael-1");
await snap(s25.page, "ativar-passo2-conta");
await s25.page.getByRole("button", { name: "Criar conta principal" }).click();
await s25.page.getByText("Estes dados são de Rafael?").waitFor();
await snap(s25.page, "ativar-sao-meus");
await clickText(s25.page, "Sim, são meus");
await s25.page.getByText("Tudo no servidor ✓").waitFor({ timeout: 30000 });
await snap(s25.page, "conferencia-ok");
log("conferência no servidor: ok");

/* 4. digital no celular */
await clickText(s25.page, "Usar a digital neste aparelho");
await s25.page.getByText("Digital cadastrada").waitFor();
log("passkey cadastrada no S25");
await clickText(s25.page, "Ir para o app");
await s25.page.getByText("Ative o Pulse").waitFor({ state: "detached" });

/* 5. PC: entra com senha, recebe tudo */
const pc = await phone("PC");
await pc.page.goto(`${BASE}/`);
await pc.page.getByText("Bem-vindo ao").waitFor();
await snap(pc.page, "pc-bem-vindo");
await fill(pc.page, "Nome", "rafael");
await fill(pc.page, "Senha", "senha-do-rafael-1");
await pc.page.locator("button.btn.primary", { hasText: /^Entrar$/ }).click();
await pc.page.getByText("Tudo no servidor ✓").waitFor({ timeout: 30000 });
const pcData = await pc.page.evaluate(async () => ({ sessions: await window.__treino.db.sessions.count(), sets: await window.__treino.db.sets.count(), measures: await window.__treino.db.measures.count() }));
log("PC recebeu:", pcData);
if (pcData.sessions !== 40 || pcData.sets !== migrated.sets) throw new Error("PC não recebeu tudo");

/* 6. PC: digital, sair, entrar com a digital */
await clickText(pc.page, "Usar a digital neste aparelho");
await pc.page.getByText("Digital cadastrada").waitFor();
await clickText(pc.page, "Ir para o app");
await pc.page.goto(`${BASE}/#/ajustes`);
await clickText(pc.page, "Sair deste aparelho");
await clickText(pc.page, "Sair (dados ficam neste aparelho)");
await pc.page.getByText("Bem-vindo ao").waitFor();
await clickText(pc.page, "Entrar com a digital");
await pc.page.getByText("Pulse ativado").waitFor({ timeout: 20000 });
log("PC: saiu e entrou com a digital");

/* 6b. aparelho novo entra com o código gerado no celular (sem senha, sem Bluetooth) */
await s25.page.goto(`${BASE}/#/ajustes`);
await s25.page.getByRole("button", { name: "Gerar código" }).click();
const linkCode = (await s25.page.locator(".code-big").textContent()).replace(/\s/g, "");
await snap(s25.page, "s25-codigo-aparelho");
const tab = await phone("Tablet");
await tab.page.goto(`${BASE}/`);
await tab.page.getByText("Bem-vindo ao").waitFor();
await tab.page.getByRole("button", { name: "Código" }).click();
await fill(tab.page, "Código do aparelho conectado", linkCode);
await tab.page.locator("button.btn.primary", { hasText: /^Entrar$/ }).click();
await tab.page.getByText("Tudo no servidor ✓").waitFor({ timeout: 30000 });
const tabData = await tab.page.evaluate(async () => ({ sessions: await window.__treino.db.sessions.count() }));
log("Tablet entrou com o código e recebeu:", tabData);
if (tabData.sessions !== 40) throw new Error("Tablet não recebeu tudo");
await tab.ctx.close();

/* 7. convite da Marina (gerado no celular do Rafael) */
await s25.page.goto(`${BASE}/#/ajustes`);
await clickText(s25.page, "Gerar convite");
const code = (await s25.page.locator(".sheet .big").innerText()).trim();
await snap(s25.page, "convite");
log("convite:", code);
const s26 = await phone("SM-S936B");
await s26.page.goto(`${BASE}/`);
await s26.page.getByText("Bem-vindo ao").waitFor();
await s26.page.getByRole("button", { name: "Convite" }).click();
await fill(s26.page, "Código do convite", code.toLowerCase());
await fill(s26.page, "Nome", "Marina");
await fill(s26.page, "Nova senha (mín. 8)", "senha-da-marina-9");
await fill(s26.page, "Repita a senha", "senha-da-marina-9");
await s26.page.getByRole("button", { name: "Criar minha conta" }).click();
await s26.page.getByText("Pulse ativado").waitFor({ timeout: 20000 });
await clickText(s26.page, "Ir para o app");
const lid = await s26.page.evaluate(async () => ({ sessions: await window.__treino.db.sessions.count(), name: (await window.__treino.db.settings.get("name"))?.value, db: window.__treino.db.name }));
log("Marina:", lid);
if (lid.sessions !== 0 || lid.name !== "Marina") throw new Error("Marina não deveria ver os treinos do Rafael");
await snap(s26.page, "marina-inicio");

/* 8. mudança no celular aparece no PC (sincronização automática) */
await s25.page.goto(`${BASE}/#/corpo`);
await s25.page.evaluate(async () => {
  await window.__treino.db.measures.add({ id: "e2e-peso", date: "2026-10-21", type: "peso", value: 80.9 });
});
await pc.page.goto(`${BASE}/#/inicio`);
await pc.page.waitForFunction(async () => !!(await window.__treino.db.measures.get("e2e-peso")), null, { timeout: 30000, polling: 1000 });
log("peso novo do celular chegou no PC");
await pc.page.goto(`${BASE}/#/ajustes`);
await pc.page.getByText("Aparelhos conectados").waitFor();
await snap(pc.page, "pc-ajustes-conta");

/* 9. offline: registra sem internet, envia quando volta */
await s25.ctx.setOffline(true);
await s25.page.evaluate(async () => {
  await window.__treino.db.measures.add({ id: "e2e-offline", date: "2026-10-22", type: "peso", value: 80.7 });
});
await s25.page.waitForTimeout(4000);
await s25.ctx.setOffline(false);
await s25.page.evaluate(() => window.dispatchEvent(new Event("online")));
await pc.page.goto(`${BASE}/#/inicio`);
await pc.page.waitForFunction(async () => !!(await window.__treino.db.measures.get("e2e-offline")), null, { timeout: 30000, polling: 1000 });
log("registro offline enviado ao voltar a internet e recebido no PC");

/* 10. banco antigo intacto no celular */
const legacy = await s25.page.evaluate(async () => {
  const req = indexedDB.open("app-treino");
  const idb = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const count = (t) => new Promise((res) => { const r = idb.transaction(t).objectStore(t).count(); r.onsuccess = () => res(r.result); });
  const out = { version: idb.version, sessions: await count("sessions"), sets: await count("sets") };
  idb.close();
  return out;
});
log("banco antigo:", legacy);

await browser.close();
log("OK");
