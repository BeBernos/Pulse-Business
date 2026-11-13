import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lang } from "../i18n";
import { GLOSSARY, type TermId } from "../lib/glossary";
import { Sheet } from "./ui";

const SEEN = "pulso.terms";
const seen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN) ?? "[]"); } catch { return []; } };

/** Termo técnico tocável: abre a explicação. Enquanto nunca foi aberto, ganha um pontinho (primeira vez que aparece). */
export function Term({ id, children }: { id: TermId; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isNew, setNew] = useState(() => !seen().includes(id));
  const show = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
    if (isNew) { setNew(false); try { localStorage.setItem(SEEN, JSON.stringify([...seen(), id])); } catch { /* sem armazenamento */ } }
  };
  return (
    <>
      <span role="button" tabIndex={0} className={`term${isNew ? " new" : ""}`} onClick={show} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && show(e)}>{children}</span>
      {/* portal: a folha é fixa na tela e o termo pode estar dentro de algo com transform (listas com gesto);
          eventos do React atravessam o portal, então param aqui para não abrir/arrastar o cartão de baixo */}
      {open && createPortal(
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <Sheet open onClose={() => setOpen(false)}><TermText id={id} /></Sheet>
        </div>,
        document.body,
      )}
    </>
  );
}

export function TermText({ id }: { id: TermId }) {
  const t = GLOSSARY[id][lang()];
  return <div className="stack" style={{ gap: 8 }}><div className="title-md">{t.title}</div><p className="small muted" style={{ margin: 0, lineHeight: 1.55 }}>{t.text}</p></div>;
}
