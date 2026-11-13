import { useEffect, useState, type ReactNode } from "react";
import { PLATE_COLORS, plateLoad } from "../lib/plates";
import { fmtKg } from "../lib/prescription";
import { Icon } from "./Icon";
import { recordError } from "../lib/feedback";

import { tr } from "../i18n";
/* ---------------- avisos (toast) e erros visíveis ---------------- */

type ToastMsg = { text: string; error?: boolean; undo?: () => unknown };
let toastListener: ((m: ToastMsg) => void) | null = null;

export function toast(text: string): void {
  toastListener?.({ text });
}

/** Aviso com "Desfazer" (5 s): para apagar com um gesto sem medo de perder nada. */
export function toastUndo(text: string, undo: () => unknown): void {
  toastListener?.({ text, undo });
}

export function toastError(err: unknown): void {
  recordError(err);
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : tr("Algo deu errado.");
  toastListener?.({ text: tr("Erro: {0}", tr(text)), error: true });
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    toastListener = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), m.error ? 6000 : m.undo ? 5000 : 2600);
    };
    // nenhuma falha fica em silêncio: promessas rejeitadas e erros do banco aparecem na tela
    const onRejection = (e: PromiseRejectionEvent) => toastError(e.reason);
    const onAppError = (e: Event) => toastError((e as CustomEvent<string>).detail);
    const onWindowError = (e: ErrorEvent) => recordError(e.error ?? e.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("app-error", onAppError);
    window.addEventListener("error", onWindowError);
    return () => {
      toastListener = null;
      clearTimeout(t);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("app-error", onAppError);
      window.removeEventListener("error", onWindowError);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className={`toast ${msg.error ? "error" : ""}${msg.undo ? " undo" : ""}`} role="status" onClick={() => setMsg(null)}>
      {msg.undo && <i className="toast-bar" />}
      {msg.text}
      {msg.undo && <button className="toast-undo" onClick={() => { Promise.resolve(msg.undo!()).catch(toastError); setMsg(null); }}>{tr("Desfazer")}</button>}
    </div>
  );
}

/** Botão que executa uma ação assíncrona: mostra estado de carregamento, evita toque duplo e exibe erro. */
export function AsyncButton({ onClick, children, busyLabel = tr("Salvando…"), className = "btn", disabled }: { onClick: () => Promise<unknown>; children: ReactNode; busyLabel?: string; className?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

/* ---------------- estrutura de tela ---------------- */

export function PageHead({ eyebrow, title, right }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="titles">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title-xl">{title}</h1>
      </div>
      {right && <div className="row" style={{ gap: 8 }}>{right}</div>}
    </header>
  );
}

export function BackHeader({ title, eyebrow, onBack, right }: { title: ReactNode; eyebrow?: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="row" style={{ margin: "4px 0 18px", alignItems: "center" }}>
      <button className="icon-btn" onClick={onBack} aria-label={tr("Voltar")}>
        <Icon name="back" />
      </button>
      <div className="grow">
        {eyebrow && <div className="eyebrow ellipsis">{eyebrow}</div>}
        <h1 className="title-md ellipsis" style={{ fontSize: 20 }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Section({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="section">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="ico"><Icon name={icon} size={26} /></span>
      <div className="title-md">{title}</div>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, children, footer }: { open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{tr(o.label)}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, decimal = false, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; decimal?: boolean; label?: string }) {
  const [text, setText] = useState(fmtKg(value));
  useEffect(() => setText(fmtKg(value)), [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="stepper">
      <button aria-label={tr("Diminuir")} onClick={() => onChange(clamp(value - step))}>−</button>
      <input
        aria-label={label}
        inputMode={decimal ? "decimal" : "numeric"}
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() && Number.isFinite(n)) onChange(clamp(n));
        }}
        onBlur={() => setText(fmtKg(value))}
      />
      <button aria-label={tr("Aumentar")} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}

export function Stat({ value, unit, label, tone }: { value: ReactNode; unit?: string; label: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="stat">
      <div className={`v ${tone === "up" ? "delta-up" : tone === "down" ? "delta-down" : ""}`}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Ring({ value, max, label, size = 64, stroke = 7, color = "var(--accent)" }: { value: number; max: number; label: ReactNode; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.9,.3,1)" }}
        />
      </svg>
      <div className="lbl" style={{ fontSize: size * 0.22 }}>{label}</div>
    </div>
  );
}

export function PlateChips({ kg, bar = 20, plates }: { kg: number; bar?: number; plates?: number[] }) {
  const load = plateLoad(kg, bar, plates);
  if (load.barOnly) return <span className="plates"><span className="bar">{tr("só a barra")}</span></span>;
  return (
    <span className="plates" aria-label={tr("Por lado: {0} kg", load.perSide.join(", "))}>
      {load.perSide.map((p, i) => (
        <span key={i} className={`plate ${p >= 20 ? "p20" : ""}`} style={{ background: PLATE_COLORS[String(p)] ?? "#8E8CA3" }}>
          {fmtKg(p)}
        </span>
      ))}
      {load.remainder > 0 && <span className="bar">+{fmtKg(load.remainder)}?</span>}
      <span className="bar">{tr("/lado")}</span>
    </span>
  );
}

/* ---------------- gráficos ---------------- */

/** Linha com área; `avg` desenha uma segunda série (ex.: média móvel) por cima. */
/** Largura real do elemento (px): os gráficos desenham na escala da tela, sem esticar o texto no PC. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  // ref por callback: mede quando o elemento aparece (a tela pode renderizar vazia antes de ter os dados)
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w] as const;
}

export function LineChart(props: { points: { x: string; y: number }[]; avg?: number[]; height?: number; unit?: string; goal?: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(340);
  return <div ref={ref}>{props.points.length < 2 ? <div className="empty small" style={{ padding: 24 }}>{props.points.length ? tr("Precisa de 2+ registros para o gráfico.") : tr("Sem dados ainda.")}</div> : <LineChartSvg {...props} w={w} />}</div>;
}

function LineChartSvg({ points, avg, height = 150, unit = "", goal, w }: { points: { x: string; y: number }[]; avg?: number[]; height?: number; unit?: string; goal?: number | null; w: number }) {
  const pad = { l: 6, r: 6, t: 18, b: 22 };
  const all = [...points.map((p) => p.y), ...(avg ?? []), ...(goal != null ? [goal] : [])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const X = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (points.length - 1);
  const Y = (v: number) => pad.t + (1 - (v - min) / span) * (height - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L${X(points.length - 1)},${height - pad.b} L${X(0)},${height - pad.b} Z`;
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" style={{ display: "block" }} role="img" aria-label={tr("Gráfico")}>
      <defs>
        <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".14" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {goal != null && (
        <>
          <line x1={pad.l} x2={w - pad.r} y1={Y(goal)} y2={Y(goal)} stroke="var(--violet)" strokeDasharray="4 4" strokeWidth="1.5" />
          <text x={pad.l} y={Y(goal) - 5} fill="var(--violet)" fontSize="10">{tr("meta")} {fmtKg(goal)}</text>
        </>
      )}
      <path d={area} fill="url(#lc-fill)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={avg ? 1.5 : 2.5} strokeOpacity={avg ? 0.55 : 1} strokeLinejoin="round" strokeLinecap="round" />
      {avg && <path d={avg.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinejoin="round" />}
      {points.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.y)} r={i === last ? 4.5 : 2.2} fill={i === last ? "var(--text)" : "var(--accent)"} />)}
      <text x={X(last)} y={Y(points[last].y) - 9} fill="var(--text)" fontSize="11" fontWeight="700" textAnchor="end">
        {fmtKg(Math.round(points[last].y * 10) / 10)}{unit}
      </text>
      <text x={pad.l} y={height - 6} fill="var(--text-3)" fontSize="10">{points[0].x}</text>
      <text x={w - pad.r} y={height - 6} fill="var(--text-3)" fontSize="10" textAnchor="end">{points[last].x}</text>
    </svg>
  );
}

/** Barras verticais simples (uma por item); destaca a última. */
export function BarChart({ data, height = 130, format = (v: number) => String(Math.round(v)) }: { data: { label: string; value: number }[]; height?: number; format?: (v: number) => string }) {
  const w = 340;
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const bw = (w - gap * (data.length - 1)) / data.length;
  const top = 16;
  const base = height - 18;
  // nas pontas o texto encosta na borda em vez de sair do gráfico
  const anchor = (i: number) => (i === 0 ? "start" : i === data.length - 1 ? "end" : "middle");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" style={{ display: "block" }} role="img" aria-label={tr("Gráfico de barras")}>
      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(3, ((base - top) * d.value) / max) : 2;
        const x = i * (bw + gap);
        const last = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={x + bw / 2 - 1.5} y={base - h} width={3} height={h} rx={1.5} fill={last ? "var(--accent)" : "var(--surface-3)"} />
            {d.value > 0 && <circle cx={x + bw / 2} cy={base - h} r={last ? 4.5 : 3.2} fill={last ? "var(--accent)" : "var(--text-3)"} />}
            {(last || data.length <= 8) && d.value > 0 && (
              <text x={x + bw / 2} y={base - h - 8} fill={last ? "var(--text)" : "var(--text-3)"} fontSize="9.5" fontWeight="700" textAnchor={anchor(i)}>{format(d.value)}</text>
            )}
            {(i % Math.ceil(data.length / 7) === 0 || last) && (
              <text x={i === 0 ? x : last ? x + bw : x + bw / 2} y={height - 4} fill="var(--text-3)" fontSize="9.5" textAnchor={anchor(i)}>{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ values, width = 90, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i * width) / (values.length - 1)).toFixed(1)},${(2 + (1 - (v - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- utilidades ---------------- */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fmtDelta(v: number | null, digits = 1): string {
  if (v == null) return "—";
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return `${r > 0 ? "+" : ""}${fmtKg(r)}`;
}
