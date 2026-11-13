import { LIBRARY } from "../lib/library";
import { MotionFigure } from "./MotionFigure";

const BY_NAME = new Map(LIBRARY.map((e) => [e.name, e]));

/** Miniatura parada do exercício (pose do meio da repetição, músculos em destaque): dá a noção do movimento sem tocar em nada. */
export function ExThumb({ name, size = 52, group, muscles }: { name: string; size?: number; group?: string; muscles?: Parameters<typeof MotionFigure>[0]["muscles"] }) {
  const info = BY_NAME.get(name);
  return (
    <div className="thumb" style={{ width: size, height: size }} aria-hidden="true">
      <MotionFigure name={name} group={group ?? info?.group} muscles={muscles ?? info?.muscles} animate={false} aspect={1} label="" />
    </div>
  );
}
