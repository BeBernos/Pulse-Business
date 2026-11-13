import { useState } from "react";
import { CHANGELOG, LATEST } from "../data/changelog";
import { Sheet } from "./ui";

import { lang, tr } from "../i18n";
const KEY = "pulso.seenVersion";

/** Aparelho novo (tela de entrar): já conta a versão atual como vista — novidades são para quem já usava. */
export function markSeenIfNew(): void {
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, LATEST.version);
  } catch {
    /* sem armazenamento */
  }
}

/** Mostra as novidades uma vez quando a versão muda (aparelho novo começa já "visto": sem susto na 1ª abertura). */
export function WhatsNew() {
  const [open, setOpen] = useState(() => {
    try {
      const seen = localStorage.getItem(KEY);
      if (!seen) {
        localStorage.setItem(KEY, LATEST.version);
        // primeira vez com o controle de versão, mas o app já era usado: mostra a 1.0
        return localStorage.getItem("pulso.account") !== null || localStorage.getItem("pulso.activated") !== null;
      }
      return seen !== LATEST.version;
    } catch {
      return false;
    }
  });
  const close = () => {
    try { localStorage.setItem(KEY, LATEST.version); } catch { /* sem armazenamento */ }
    setOpen(false);
  };
  return (
    <Sheet open={open} onClose={close} footer={<button className="btn primary block" onClick={close}>{tr("Bora treinar")}</button>}>
      <ReleaseNotes releases={[LATEST]} />
    </Sheet>
  );
}

export function ReleaseNotes({ releases = CHANGELOG }: { releases?: typeof CHANGELOG }) {
  return (
    <div className="stack">
      {releases.map((r) => (
        <div key={r.version} className="stack" style={{ gap: 8 }}>
          <div><div className="eyebrow">{tr("Novidades · v")}{r.version}</div><div className="title-md">{lang() === "en" && r.en ? r.en.title : r.title}</div></div>
          <ul className="bullets">{(lang() === "en" && r.en ? r.en.items : r.items).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
