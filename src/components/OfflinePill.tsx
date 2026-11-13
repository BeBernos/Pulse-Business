import { useEffect, useState } from "react";
import { tr } from "../i18n";

/** Selo discreto no topo quando o aparelho fica sem internet (em qualquer tela, inclusive no treino). */
export function OfflinePill() {
  const [off, setOff] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOff(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  if (!off) return null;
  return <div className="offline-pill" role="status">{tr("Sem internet · salvo no celular")}</div>;
}
