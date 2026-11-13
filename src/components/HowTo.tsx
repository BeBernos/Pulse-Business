import { tr } from "../i18n";
import { howTo } from "../lib/howto";

const LABELS = ["Posição", "Movimento", "Atenção"];

/** Passo a passo em texto do exercício (posição → movimento → atenção). Nada quando não há texto. */
export function HowTo({ name, compact = false }: { name: string; compact?: boolean }) {
  const steps = howTo(name);
  if (!steps) return null;
  return (
    <ol className={`howto${compact ? " compact" : ""}`}>
      {steps.map((s, i) => (
        <li key={i}>
          <span className="howto-n">{i + 1}</span>
          <div>
            {!compact && <div className="howto-k">{LABELS[i] ? tr(LABELS[i]) : ""}</div>}
            <div>{s}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
