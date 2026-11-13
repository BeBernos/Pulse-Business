import { useEffect, useRef, useState, type ReactNode } from "react";
import { tr } from "../i18n";
import { Icon } from "./Icon";

const HOLD_MS = 380; // segurar para arrastar
const SLOP = 10; // px até decidir se é rolagem, deslize ou toque
const OPEN_W = 96; // largura do botão "Remover"

/**
 * Lista com gestos: segure ~0,4 s e arraste para mudar a ordem (`onMove`); deslize para a esquerda para apagar
 * (`onDelete`): curto mostra o botão, longo ou rápido apaga direto. A rolagem da página continua normal.
 */
export function GestureList<T>({ items, keyOf, render, onMove, onDelete, gap = 8 }: {
  items: readonly T[];
  keyOf: (item: T, i: number) => string;
  render: (item: T, i: number) => ReactNode;
  onMove?: (from: number, to: number) => void;
  onDelete?: (i: number) => void;
  gap?: number;
}) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDragState] = useState<{ from: number; to: number; dy: number } | null>(null);
  const dragRef = useRef(drag);
  const setDrag = (d: typeof drag) => { dragRef.current = d; setDragState(d); };
  const g = useRef<{ i: number; x: number; y: number; t: number; mode: "wait" | "swipe" | "drag" | "none"; timer?: number; el: HTMLElement; pid: number; mids?: number[]; h?: number; dx: number; moved: boolean } | null>(null);

  // arrastando: a página não rola (o toque é do item)
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (g.current?.mode === "drag" || g.current?.mode === "swipe") e.preventDefault(); };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);

  const slide = (i: number, x: number, animate: boolean) => {
    const el = rows.current[i]?.querySelector<HTMLElement>(".gl-front");
    if (!el) return;
    el.style.transition = animate ? "transform .22s ease" : "none";
    el.style.transform = x ? `translateX(${x}px)` : "";
  };

  const down = (e: React.PointerEvent, i: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, textarea, select, .gl-del")) return;
    const key = keyOf(items[i], i);
    if (open && open !== key) { slide(items.findIndex((x, j) => keyOf(x, j) === open), 0, true); setOpen(null); }
    const st = { i, x: e.clientX, y: e.clientY, t: performance.now(), mode: "wait" as const, dx: open === key ? -OPEN_W : 0, moved: false, el: e.currentTarget as HTMLElement, pid: e.pointerId };
    g.current = st;
    if (onMove) {
      g.current.timer = window.setTimeout(() => {
        const cur = g.current;
        if (!cur || cur.mode !== "wait") return;
        const rects = rows.current.slice(0, items.length).map((r) => r?.getBoundingClientRect());
        cur.mode = "drag";
        cur.mids = rects.map((r) => (r ? r.top + r.height / 2 : 0));
        cur.h = (rects[i]?.height ?? 60) + gap;
        navigator.vibrate?.(25);
        cur.el.setPointerCapture?.(cur.pid);
        setDrag({ from: i, to: i, dy: 0 });
      }, HOLD_MS);
    }
  };

  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === "wait") {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      clearTimeout(s.timer);
      s.moved = true;
      if (onDelete && Math.abs(dx) > Math.abs(dy)) { s.mode = "swipe"; s.el.setPointerCapture?.(s.pid); }
      else { s.mode = "none"; return; }
    }
    if (s.mode === "swipe") slide(s.i, Math.min(0, s.dx + dx), false);
    else if (s.mode === "drag") {
      const y = s.mids![s.i] + dy;
      let to = s.i;
      s.mids!.forEach((m, j) => { if (j < s.i && y < m) to = Math.min(to, j); if (j > s.i && y > m) to = Math.max(to, j); });
      setDrag({ from: s.i, to, dy });
    }
  };

  const up = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.mode === "drag") {
      s.moved = true;
      const d = dragRef.current;
      setDrag(null);
      if (d && d.to !== d.from) onMove?.(d.from, d.to);
    } else if (s.mode === "swipe") {
      const dx = s.dx + (e.clientX - s.x);
      const w = rows.current[s.i]?.offsetWidth ?? 320;
      const speed = (e.clientX - s.x) / Math.max(1, performance.now() - s.t); // px/ms
      if (dx < -w * 0.5 || speed < -0.9) {
        slide(s.i, -w, true);
        setOpen(null);
        window.setTimeout(() => { slide(s.i, 0, false); onDelete?.(s.i); }, 200);
      } else if (dx < -OPEN_W / 2) { slide(s.i, -OPEN_W, true); setOpen(keyOf(items[s.i], s.i)); }
      else { slide(s.i, 0, true); setOpen(null); }
    }
    if (s.moved) {
      // depois de arrastar/deslizar, o "clique" do fim do gesto não abre o item
      const kill = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", kill, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", kill, { capture: true }), 50);
    }
  };

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    const h = g.current?.h ?? 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return h;
    return 0;
  };

  rows.current.length = items.length; // a lista pode ter encolhido desde o último desenho
  return (
    <div className="gl" style={{ gap }}>
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        return (
          <div
            key={keyOf(item, i)}
            ref={(el) => { rows.current[i] = el; }}
            className={`gl-row${dragging ? " dragging" : ""}`}
            style={{ transform: dragging ? `translateY(${drag!.dy}px) scale(1.02)` : `translateY(${shift(i)}px)`, transition: dragging ? "none" : "transform .18s ease" }}
            onPointerDown={(e) => down(e, i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onContextMenu={(e) => onMove && e.preventDefault()}
          >
            {onDelete && (
              <button className="gl-del" onClick={() => { slide(i, 0, false); setOpen(null); onDelete(i); }} aria-label={tr("Remover")}>
                <Icon name="trash" size={18} /> {tr("Remover")}
              </button>
            )}
            <div className="gl-front">{render(item, i)}</div>
          </div>
        );
      })}
    </div>
  );
}
