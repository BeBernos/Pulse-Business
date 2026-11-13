// Fotos de progresso no servidor (cópia das que estão no aparelho), por pessoa.
// Fora do /api/sync: cada foto vai num pedido só dela, como texto base64 (o Worker não decodifica nada —
// fica dentro dos ~10 ms de CPU do plano grátis). A miniatura é refeita no aparelho que baixa.
//   GET    /api/photos            → { photos: [{ id, date, pose, note, size, at }], deleted: [id] } (sem a imagem)
//   GET    /api/photos/:id        → a imagem (texto base64 do JPEG)
//   PUT    /api/photos/:id?date=&pose=&note=  corpo = base64 do JPEG
//   DELETE /api/photos/:id        → vira lápide: os outros aparelhos apagam a cópia deles e não reenviam
import { HttpError, json, requireUser } from "./auth.js";
import { database } from "./schema.js";

/** D1 aceita até ~2 MB por linha; a foto do app (1400 px, JPEG 0,85) fica em 0,2–0,6 MB. */
export const MAX_PHOTO_CHARS = 1_900_000;
const POSES = new Set(["frente", "lado", "costas"]);
const ID = /^[A-Za-z0-9_-]{4,40}$/;

export async function handlePhotos(req, env, url) {
  const { user, setCookie } = await requireUser(req, env);
  const DB = await database(env);
  const headers = setCookie ? { "set-cookie": setCookie } : {};
  const id = decodeURIComponent(url.pathname.replace(/^\/api\/photos\/?/, ""));

  if (!id) {
    if (req.method !== "GET") throw new HttpError(405, "Método não permitido.");
    const rows = (await DB.prepare(`SELECT id, date, pose, note, size, created_at, deleted_at FROM photos WHERE user_id = ? ORDER BY date, id`).bind(user.id).all()).results;
    return json({
      photos: rows.filter((r) => !r.deleted_at).map((r) => ({ id: r.id, date: r.date, pose: r.pose, note: r.note ?? undefined, size: r.size, at: r.created_at })),
      deleted: rows.filter((r) => r.deleted_at).map((r) => r.id),
    }, 200, headers);
  }
  if (!ID.test(id)) throw new HttpError(400, "Foto inválida.");

  if (req.method === "GET") {
    const row = await DB.prepare(`SELECT data FROM photos WHERE user_id = ? AND id = ? AND deleted_at IS NULL`).bind(user.id, id).first();
    if (!row) throw new HttpError(404, "Foto não encontrada.");
    return new Response(row.data, { headers: { "content-type": "text/plain", "cache-control": "no-store", ...headers } });
  }

  if (req.method === "PUT") {
    const date = url.searchParams.get("date") ?? "";
    const pose = url.searchParams.get("pose") ?? "";
    const note = (url.searchParams.get("note") ?? "").slice(0, 300) || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !POSES.has(pose)) throw new HttpError(400, "Data ou pose inválida.");
    const gone = await DB.prepare(`SELECT deleted_at FROM photos WHERE user_id = ? AND id = ?`).bind(user.id, id).first();
    if (gone?.deleted_at) throw new HttpError(410, "Esta foto foi apagada em outro aparelho.");
    const data = await req.text();
    if (!data || data.length > MAX_PHOTO_CHARS || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 64))) throw new HttpError(413, "Foto grande demais ou inválida.");
    await DB.prepare(
      `INSERT INTO photos (user_id, id, date, pose, note, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET date = excluded.date, pose = excluded.pose, note = excluded.note, size = excluded.size, data = excluded.data`,
    ).bind(user.id, id, date, pose, note, data.length, data, Date.now()).run();
    return json({ ok: true }, 200, headers);
  }

  if (req.method === "DELETE") {
    const now = Date.now();
    await DB.prepare(
      `INSERT INTO photos (user_id, id, date, pose, size, data, created_at, deleted_at) VALUES (?, ?, '', '', 0, '', ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET data = '', size = 0, deleted_at = excluded.deleted_at`,
    ).bind(user.id, id, now, now).run();
    return json({ ok: true }, 200, headers);
  }
  throw new HttpError(405, "Método não permitido.");
}
