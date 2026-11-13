import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { AsyncButton, BackHeader, Empty, Segmented, Sheet, toast, toastError } from "../components/ui";
import { addPhoto, db, POSES, type Photo, type PhotoPose } from "../db";
import { useMeasures, useToday } from "../hooks";
import { valueAt } from "../lib/body";
import { fmtLong, fmtShort } from "../lib/calendar";
import { fmtKg } from "../lib/prescription";
import { back } from "../router";
import { currentAccount } from "../account";
import { deletePhoto, syncPhotos } from "../photosync";

import { tr } from "../i18n";
/** Imagem a partir de Blob do IndexedDB (libera a URL ao sair). */
export function PhotoImg({ blob, alt, style }: { blob: Blob; alt: string; style?: React.CSSProperties }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} style={{ display: "block", width: "100%", objectFit: "cover", ...style }} /> : <div style={style} />;
}

export function usePhotos() {
  return useLiveQuery(async () => (await db.photos.toArray()).sort((a, b) => b.date.localeCompare(a.date) || POSES.findIndex((p) => p.id === a.pose) - POSES.findIndex((p) => p.id === b.pose)), []);
}

export function Photos() {
  const photos = usePhotos();
  const weights = useMeasures("peso");
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<Photo | null>(null);
  const [mode, setMode] = useState<"linha" | "comparar">("linha");
  if (!photos || !weights) return <div className="screen" />;
  const dates = [...new Set(photos.map((p) => p.date))];

  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Corpo")} title={tr("Fotos de progresso")} onBack={() => back("corpo")} right={<button className="btn sm primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> {tr("Foto")}</button>} />
      {photos.length === 0 ? (
        <Empty icon="body" title={tr("Nenhuma foto ainda")}>
          {tr("Tire frente, lado e costas a cada 2–4 semanas, mesma luz e mesmo horário.")} {currentAccount() ? tr("Ficam no aparelho e numa cópia no servidor (só você vê).") : tr("As fotos ficam só neste aparelho.")}
          <div><button className="btn primary" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>{tr("Adicionar fotos")}</button></div>
        </Empty>
      ) : (
        <>
          {currentAccount() && <PhotoServerStatus photos={photos} />}
          <Segmented value={mode} options={[{ value: "linha", label: tr("Linha do tempo") }, { value: "comparar", label: tr("Comparar") }]} onChange={setMode} />
          <div style={{ marginTop: 14 }}>
            {mode === "linha" ? (
              <div className="stack lg">
                {dates.map((d) => {
                  const w = valueAt(weights, d);
                  return (
                    <div key={d}>
                      <div className="row between" style={{ marginBottom: 8 }}>
                        <span className="bold" style={{ textTransform: "capitalize" }}>{fmtLong(d)}</span>
                        {w && <span className="tag">{fmtKg(w.value)} {tr("kg")}</span>}
                      </div>
                      <div className="grid-3">
                        {photos.filter((p) => p.date === d).map((p) => (
                          <button key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }} onClick={() => setView(p)}>
                            <PhotoImg blob={p.thumb} alt={`${p.pose} em ${d}`} style={{ aspectRatio: "3 / 4" }} />
                            <div className="tiny muted" style={{ padding: "6px 8px", textTransform: "capitalize" }}>{p.pose}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Compare photos={photos} weights={weights} />
            )}
          </div>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)}>{adding && <AddPhotos today={today} onDone={() => setAdding(false)} />}</Sheet>
      <Sheet open={!!view} onClose={() => setView(null)} footer={view && (
        <AsyncButton className="btn danger block" busyLabel={tr("Apagando…")} onClick={async () => { await deletePhoto(view.id); setView(null); toast(tr("Foto apagada")); }}>
          <Icon name="trash" size={16} /> {tr("Apagar foto")}
        </AsyncButton>
      )}>
        {view && (
          <div className="stack">
            <div className="title-md" style={{ textTransform: "capitalize" }}>{view.pose} · {fmtShort(view.date)}</div>
            <PhotoImg blob={view.blob} alt={view.pose} style={{ borderRadius: 18, maxHeight: "62dvh", objectFit: "contain", background: "#000" }} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** Quantas fotos já têm cópia no servidor (e botão para enviar/baixar agora). */
function PhotoServerStatus({ photos }: { photos: Photo[] }) {
  const onServer = photos.filter((p) => p.serverAt).length;
  const all = onServer === photos.length;
  return (
    <div className={`alert ${all ? "info" : ""} small`} style={{ marginBottom: 12 }}>
      <Icon name={all ? "check" : "upload"} size={16} />
      <div className="grow">{all ? tr("As {0} fotos têm cópia no servidor (só você vê).", photos.length) : tr("{0} de {1} fotos com cópia no servidor.", onServer, photos.length)}</div>
      {!all && <AsyncButton className="btn sm" busyLabel={tr("Enviando…")} onClick={async () => { const r = await syncPhotos(); toast(`${r.sent} enviada${r.sent === 1 ? "" : "s"}${r.received ? tr(" · {0} recebida{1}", r.received, r.received === 1 ? "" : "s") : ""}`); }}>{tr("Enviar agora")}</AsyncButton>}
    </div>
  );
}

function Compare({ photos, weights }: { photos: Photo[]; weights: { date: string; value: number }[] }) {
  const [pose, setPose] = useState<PhotoPose>("frente");
  const ofPose = photos.filter((p) => p.pose === pose).sort((a, b) => a.date.localeCompare(b.date));
  const [aId, setA] = useState<string | null>(null);
  const [bId, setB] = useState<string | null>(null);
  const a = ofPose.find((p) => p.id === aId) ?? ofPose[0];
  const b = ofPose.find((p) => p.id === bId) ?? ofPose.at(-1);
  const wa = a ? valueAt(weights, a.date) : null;
  const wb = b ? valueAt(weights, b.date) : null;
  return (
    <div className="stack">
      <Segmented value={pose} options={POSES.map((p) => ({ value: p.id, label: tr(p.label) }))} onChange={(v) => { setPose(v); setA(null); setB(null); }} />
      {ofPose.length < 2 ? (
        <div className="card small muted">{tr("Precisa de pelo menos 2 fotos de “")}{pose}{tr("” em datas diferentes para comparar.")}</div>
      ) : (
        <>
          <div className="grid-2">
            {[{ p: a!, w: wa, set: setA, label: tr("Antes") }, { p: b!, w: wb, set: setB, label: tr("Depois") }].map(({ p, w, set, label }) => (
              <div key={label} className="stack" style={{ gap: 6 }}>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <PhotoImg blob={p.blob} alt={`${label}: ${p.date}`} style={{ aspectRatio: "3 / 4" }} />
                </div>
                <select className="input" style={{ minHeight: 40, padding: "6px 10px" }} value={p.id} onChange={(e) => set(e.target.value)}>
                  {ofPose.map((x) => <option key={x.id} value={x.id}>{fmtShort(x.date)}</option>)}
                </select>
                <div className="tiny muted center">{label}{w ? tr(" · {0} kg", fmtKg(w.value)) : ""}</div>
              </div>
            ))}
          </div>
          {wa && wb && <div className="card center small">{tr("Diferença de peso:")} <b className="num">{wb.value - wa.value > 0 ? "+" : ""}{fmtKg(Math.round((wb.value - wa.value) * 10) / 10)} {tr("kg")}</b></div>}
        </>
      )}
    </div>
  );
}

function AddPhotos({ today, onDone }: { today: string; onDone: () => void }) {
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<PhotoPose | null>(null);
  const [done, setDone] = useState<PhotoPose[]>([]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  return (
    <div className="stack">
      <div className="title-md">{tr("Adicionar fotos")}</div>
      <div className="small muted">{tr("Mesmo lugar, mesma luz, de manhã. Tire da câmera ou escolha da galeria.")}</div>
      <label className="field"><span>{tr("Data")}</span><input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="grid-3">
        {POSES.map((p) => (
          <button key={p.id} className="card tap center" style={{ padding: "18px 6px" }} disabled={!!busy} onClick={() => inputs.current[p.id]?.click()}>
            <span className="ico" style={{ margin: "0 auto 8px", ["--c" as string]: done.includes(p.id) ? "var(--blue)" : "var(--accent)" }}>
              <Icon name={done.includes(p.id) ? "check" : "plus"} size={20} />
            </span>
            <div className="bold small">{busy === p.id ? tr("Salvando…") : tr(p.label)}</div>
            <input
              ref={(el) => { inputs.current[p.id] = el; }}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(p.id);
                try {
                  await addPhoto(f, date, p.id);
                  setDone((d) => [...d, p.id]);
                } catch (err) {
                  toastError(err);
                } finally {
                  setBusy(null);
                }
              }}
            />
          </button>
        ))}
      </div>
      <button className="btn primary block" onClick={() => { if (done.length) { toast(tr("{0} foto{1} salva{2}", done.length, done.length > 1 ? "s" : "", done.length > 1 ? "s" : "")); syncPhotos().catch(() => undefined); } onDone(); }}>{tr("Concluir")}</button>
    </div>
  );
}
