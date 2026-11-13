import { useState } from "react";
import { skipDay, SKIP_REASONS } from "../db";
import { tr } from "../i18n";
import { AsyncButton, toast } from "./ui";

/** "Não treinei": motivo em um toque + o que houve, se quiser contar (vai junto no relatório para o Claude). */
export function SkipPicker({ date, dayKey, onDone }: { date: string; dayKey?: string; onDone?: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="field">
      <span>{tr("Não treinou? Registre o motivo")}</span>
      <div className="row wrap" style={{ gap: 6 }}>
        {SKIP_REASONS.map((r) => <button key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{tr(r)}</button>)}
      </div>
      {reason && (
        <>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("Quer contar o que houve? (opcional)")} aria-label={tr("O que houve")} style={{ marginTop: 8 }} />
          <AsyncButton className="btn block" onClick={async () => { await skipDay(date, note.trim() ? `${reason} — ${note.trim()}` : reason, dayKey); toast(tr("Dia marcado")); onDone?.(); }}>{tr("Marcar como “")}{tr(reason)}”</AsyncButton>
        </>
      )}
    </div>
  );
}
