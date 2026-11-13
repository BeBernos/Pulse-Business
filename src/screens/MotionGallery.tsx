import { LIBRARY as library } from "../lib/library";
import { MotionFigure } from "../components/MotionFigure";
import { BackHeader } from "../components/ui";
import type { MuscleMap } from "../lib/muscles";
import { back } from "../router";

import { tr } from "../i18n";
/** Todos os movimentos lado a lado (início → fim). Tela de conferência, sem link no menu: #/movimentos[/Grupo]. */
export function MotionGallery({ group, cols = 2, filter }: { group?: string; cols?: number; filter?: string }) {
  const f = filter?.toLowerCase().split(",");
  const items = library.filter((e) => (!group || group === "todos" || e.group === group) && (!f || f.some((x) => e.name.toLowerCase().includes(x))));
  return (
    <div className="screen">
      <BackHeader eyebrow={`${items.length} movimentos`} title={tr("Movimentos")} onBack={() => back("exercicios")} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
        {items.map((e) => (
          <div key={e.name} className="card" style={{ padding: 6 }}>
            <div className="tiny" style={{ minHeight: 28, lineHeight: 1.2 }}>{e.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <MotionFigure name={e.name} group={e.group} muscles={e.muscles as MuscleMap} keyframe={0} aspect={0.9} />
              <MotionFigure name={e.name} group={e.group} muscles={e.muscles as MuscleMap} animate={false} aspect={0.9} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
