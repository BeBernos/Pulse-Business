import { useState } from "react";
import type { MuscleMap } from "../lib/muscles";
import { Motion3D } from "./Motion3D";
import { MotionFigure } from "./MotionFigure";
import { Segmented } from "./ui";

import { tr } from "../i18n";
const KEY = "pulso.motionDim";
const read = (): "2d" | "3d" => {
  try {
    return localStorage.getItem(KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
};

/** Animação com a escolha Desenho / 3D (a última escolha fica lembrada neste aparelho). */
export function MotionView({ name, group, muscles, aspect = 1.3, height3d = 300, children }: { name: string; group?: string; muscles?: MuscleMap; aspect?: number; height3d?: number; children?: React.ReactNode }) {
  const [dim, setDimState] = useState(read);
  const setDim = (v: "2d" | "3d") => {
    setDimState(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* sem armazenamento: só não lembra */
    }
  };
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Segmented value={dim} options={[{ value: "2d", label: tr("Desenho") }, { value: "3d", label: "3D" }]} onChange={setDim} />
      </div>
      {dim === "3d" ? (
        <Motion3D name={name} group={group} muscles={muscles} height={height3d} />
      ) : (
        <>
          <MotionFigure name={name} group={group} muscles={muscles} aspect={aspect} />
          {children}
        </>
      )}
    </>
  );
}
