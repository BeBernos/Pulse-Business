import { useEffect, useState } from "react";
import { currentAccount, deviceLabel } from "../account";
import { Icon } from "../components/Icon";
import { BackHeader, Empty, Section, copyText, toast, toastUndo } from "../components/ui";
import { addNote, clearFeedback, feedbackNotes, feedbackReport, recentErrors, removeNote, resolvedNote, restoreNote, uploadNotes } from "../lib/feedback";
import { GestureList } from "../components/GestureList";
import { back } from "../router";

import { tr } from "../i18n";
function useFeedback() {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener("pulso-feedback", on);
    return () => window.removeEventListener("pulso-feedback", on);
  }, []);
  return { notes: feedbackNotes(), errors: recentErrors() };
}

const when = (at: number) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Feedback do app: anote o que melhorar e copie tudo (com os erros recentes) para colar no Claude Code. */
export function Feedback() {
  const { notes: all, errors } = useFeedback();
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { uploadNotes().catch(() => {}); }, []);
  // o que já virou melhoria sai das pendentes (lista em data/feedback-done.ts)
  const notes = all.filter((n) => !resolvedNote(n));
  const done = all.filter((n) => resolvedNote(n));
  const account = !!currentAccount();
  const report = () => feedbackReport({ version: __APP_VERSION__, device: deviceLabel(), person: currentAccount()?.name });
  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Ajustes")} title={tr("Feedback do app")} onBack={() => back("ajustes")} />
      <p className="small muted" style={{ marginTop: 0 }}>{account ? tr("Anote aqui o que ficou confuso, feio ou deu errado. Vai sozinho para o Claude que mexe no app (ele lê no começo de cada conversa), junto com os erros que apareceram na tela. O que virar melhoria sai da lista.") : <>{tr("Anote aqui o que ficou confuso, feio ou deu errado. Depois toque em")} <b>{tr("Copiar tudo")}</b> {tr("e cole na conversa com o Claude que mexe no app — vai junto a versão, o aparelho e os erros que apareceram na tela.")}</>}</p>
      <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Ex.: no treino, o botão de série ficou escondido atrás do timer")} />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn grow" disabled={!text.trim()} onClick={() => { addNote(text); setText(""); toast(tr("Anotado")); }}><Icon name="plus" size={16} /> {tr("Anotar")}</button>
        <button className="btn primary grow" disabled={!notes.length && !errors.length} onClick={async () => toast((await copyText(report())) ? tr("Copiado — cole no Claude") : tr("Não consegui copiar"))}><Icon name="copy" size={16} /> {tr("Copiar tudo")}</button>
      </div>

      <Section title={tr("Anotações ({0})", notes.length)} action={notes.length > 0 && <button onClick={() => clearFeedback("notes")}>{tr("Limpar")}</button>} />
      {notes.length === 0 ? <Empty icon="note" title={tr("Nada pendente")}>{account ? tr("Escreva acima. Vai para o Claude sozinho.") : tr("Escreva acima. Fica só neste aparelho.")}</Empty> : (
        <div className="group gl-group">
          <GestureList gap={0} items={[...notes].reverse()} keyOf={(n) => String(n.at)}
            onDelete={(i) => { const n = [...notes].reverse()[i]; removeNote(n.at); toastUndo(tr("Anotação apagada"), () => restoreNote(n)); }}
            render={(n) => (
            <div className="item">
              <div className="grow"><div className="t" style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{n.text}</div><div className="s">{when(n.at)} · {n.route}{account && <> · {n.sent ? tr("enviada ✓") : tr("a enviar")}</>}</div></div>
              <button className="icon-btn sm" onClick={() => removeNote(n.at)} aria-label={tr("Apagar anotação")}><Icon name="trash" size={16} /></button>
            </div>
          )} />
        </div>
      )}

      {done.length > 0 && (
        <>
          <button className="btn ghost sm block" style={{ marginTop: 10 }} onClick={() => setShowDone(!showDone)}>{showDone ? tr("Esconder resolvidas") : tr("Resolvidas ({0})", done.length)}</button>
          {showDone && (
            <div className="group" style={{ marginTop: 8 }}>
              {[...done].reverse().map((n) => {
                const r = resolvedNote(n)!;
                return <div key={n.at} className="item"><div className="grow"><div className="t" style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{r.o_que}</div><div className="s">{tr("Feito na v{0}", r.versao)} · {when(n.at)}</div></div><Icon name="check" size={16} /></div>;
              })}
            </div>
          )}
        </>
      )}

      <Section title={tr("Erros recentes ({0})", errors.length)} action={errors.length > 0 && <button onClick={() => clearFeedback("errors")}>{tr("Limpar")}</button>} />
      {errors.length === 0 ? <div className="card small muted">{tr("Nenhum erro guardado. Quando algo der errado, a mensagem fica aqui também.")}</div> : (
        <div className="group">
          {[...errors].reverse().map((e) => (
            <div key={e.at} className="item"><div className="grow"><div className="t" style={{ fontWeight: 500, whiteSpace: "normal" }}>{e.message}</div><div className="s">{when(e.at)} · {e.route}</div></div></div>
          ))}
        </div>
      )}
    </div>
  );
}
