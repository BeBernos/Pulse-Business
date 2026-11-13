import { useEffect, useRef, useState } from "react";
import { motionFor } from "../lib/motion";
import { motion3For } from "../lib/motion3d/poses";
import type { Input3, View3D } from "../lib/motion3d/scene";
import type { MuscleMap } from "../lib/muscles";

import { tr } from "../i18n";
const VIEWS = [
  { v: "oblique", label: "3/4" },
  { v: "front", label: "Frente" },
  { v: "side", label: "Lado" },
  { v: "back", label: "Costas" },
  { v: "top", label: "Cima" },
] as const;

/**
 * Animação 3D: o three.js só é baixado quando este componente aparece. Poses feitas à mão quando existem
 * (giros, aberturas); nos outros exercícios, o próprio movimento 2D convertido. Arrastar gira a câmera.
 */
export function Motion3D({ name, group, muscles, height = 300 }: { name: string; group?: string; muscles?: MuscleMap; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View3D | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [playing, setPlaying] = useState(true);
  const [angle, setAngle] = useState<(typeof VIEWS)[number]["v"]>("oblique");

  useEffect(() => {
    if (!host.current) return;
    const hand = motion3For(name);
    const input: Input3 = hand ? { kind: "angles", motion: hand } : { kind: "from2d", motion: motionFor(name, group) };
    let alive = true;
    import("../lib/motion3d/scene")
      .then(({ mount }) => {
        if (!alive || !host.current) return;
        view.current = mount(host.current, input, muscles);
        // conferência visual (testes): window.__m3d.seek(segundos)
        (window as unknown as { __m3d?: View3D }).__m3d = view.current;
        setState("ready");
      })
      .catch((e) => {
        console.error("3D indisponível", e);
        if (alive) setState("error");
      });
    return () => {
      alive = false;
      view.current?.dispose();
      view.current = null;
    };
  }, [name, group, muscles]);

  return (
    <div className="m3d">
      <div ref={host} className="m3d-stage" style={{ height }} aria-label={tr("Movimento em 3D: {0}", name)} role="img" />
      {state === "loading" && <div className="m3d-msg tiny dim">{tr("Carregando o 3D…")}</div>}
      {state === "error" && <div className="m3d-msg small">{tr("Este aparelho não conseguiu abrir o 3D (WebGL). O desenho 2D continua valendo.")}</div>}
      <div className="row wrap" style={{ gap: 6, justifyContent: "center", marginTop: 8 }}>
        {VIEWS.map((x) => (
          <button key={x.v} className="chip" aria-pressed={angle === x.v} onClick={() => { setAngle(x.v); view.current?.setView(x.v); }}>{tr(x.label)}</button>
        ))}
        <button className="chip" onClick={() => { view.current?.setPlaying(!playing); setPlaying(!playing); }}>{playing ? tr("Pausar") : tr("Animar")}</button>
      </div>
      <div className="tiny dim center" style={{ marginTop: 6 }}>{tr("Arraste para girar · pinça para aproximar")}</div>
    </div>
  );
}
