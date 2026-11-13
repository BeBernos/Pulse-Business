import { useEffect, useState } from "react";

/** Roteador mínimo por hash: funciona offline e em qualquer subpasta. */
export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, "") || "inicio").split("/").map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function href(...parts: (string | number)[]): string {
  return "#/" + parts.map((p) => encodeURIComponent(String(p))).join("/");
}

export function go(...parts: (string | number)[]): void {
  window.location.hash = href(...parts);
}

/** Troca a tela sem criar passo no histórico (o "voltar" pula direto para a tela de antes). */
export function replace(...parts: (string | number)[]): void {
  window.location.replace(href(...parts));
}

export function back(fallback = "inicio"): void {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
}
