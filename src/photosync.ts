import { currentAccount } from "./account";
import { blobToDataUrl, db, makeThumb, type Photo, type PhotoPose } from "./db";

/**
 * Fotos de progresso no servidor (`/api/photos`): cópia das fotos do aparelho, para não perder se trocar ou
 * perder o celular, e para aparecerem no PC. Fora da sincronização normal: uma foto por pedido.
 * Ordem: apaga no servidor o que foi apagado aqui → envia o que falta lá → baixa o que falta aqui.
 */
const DELETES = "pulso.photoDeletes";

function pendingDeletes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DELETES) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function setPendingDeletes(ids: string[]) {
  try {
    localStorage.setItem(DELETES, JSON.stringify([...new Set(ids)]));
  } catch {
    /* sem armazenamento */
  }
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`./api/photos${path}`, { credentials: "same-origin", ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Fotos: erro ${res.status}`);
  return res;
}

export interface PhotoSyncResult {
  sent: number;
  received: number;
  deleted: number;
}

let running: Promise<PhotoSyncResult> | null = null;

export function syncPhotos(): Promise<PhotoSyncResult> {
  if (!currentAccount()) return Promise.resolve({ sent: 0, received: 0, deleted: 0 });
  running ??= run().finally(() => (running = null));
  return running;
}

async function run(): Promise<PhotoSyncResult> {
  const out = { sent: 0, received: 0, deleted: 0 };
  for (const id of pendingDeletes()) {
    await call(`/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "content-type": "text/plain" } });
    setPendingDeletes(pendingDeletes().filter((x) => x !== id));
    out.deleted++;
  }
  const list = (await (await call("")).json()) as { photos: { id: string; date: string; pose: PhotoPose; note?: string }[]; deleted?: string[] };
  const remote = list.photos;
  const there = new Set(remote.map((p) => p.id));
  const gone = new Set(list.deleted ?? []);
  // apagada em outro aparelho: some daqui também (e não volta para o servidor)
  for (const p of await db.photos.toArray()) {
    if (gone.has(p.id)) {
      await db.photos.delete(p.id);
      out.deleted++;
    }
  }
  const local = await db.photos.toArray();
  for (const p of local) {
    if (there.has(p.id)) {
      if (!p.serverAt) await db.photos.update(p.id, { serverAt: Date.now() });
      continue;
    }
    const b64 = (await blobToDataUrl(p.blob)).replace(/^data:[^,]*,/, "");
    const q = new URLSearchParams({ date: p.date, pose: p.pose, ...(p.note ? { note: p.note } : {}) });
    const res = await fetch(`./api/photos/${encodeURIComponent(p.id)}?${q}`, { method: "PUT", credentials: "same-origin", headers: { "content-type": "text/plain" }, body: b64 });
    if (res.status === 410) {
      await db.photos.delete(p.id);
      continue;
    }
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Fotos: erro ${res.status}`);
    await db.photos.update(p.id, { serverAt: Date.now() });
    out.sent++;
  }
  const here = new Set(local.map((p) => p.id));
  const skip = new Set(pendingDeletes());
  for (const r of remote) {
    if (here.has(r.id) || skip.has(r.id)) continue;
    const b64 = await (await call(`/${encodeURIComponent(r.id)}`)).text();
    const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
    const photo: Photo = { id: r.id, date: r.date, pose: r.pose, note: r.note, blob, thumb: await makeThumb(blob), serverAt: Date.now() };
    await db.photos.put(photo);
    out.received++;
  }
  return out;
}

/** Apaga aqui e marca para apagar no servidor (mesmo sem internet agora). */
export async function deletePhoto(id: string): Promise<void> {
  await db.photos.delete(id);
  if (!currentAccount()) return;
  setPendingDeletes([...pendingDeletes(), id]);
  syncPhotos().catch(() => undefined);
}
