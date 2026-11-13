import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { db, effectiveRestrictions, getSettings, type AppSettings, type StoredPlan } from "./db";
import { isoDay } from "./lib/calendar";
import type { Restriction } from "./lib/plan";

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(getSettings, []);
}

export function useActivePlan(): StoredPlan | null | undefined {
  return useLiveQuery(async () => {
    const s = await getSettings();
    const plan = s.activePlanId ? await db.plans.get(s.activePlanId) : undefined;
    return plan ?? (await db.plans.orderBy("importedAt").last()) ?? null;
  }, []);
}

export function useRestrictions(stored: StoredPlan | null | undefined): Restriction[] {
  return useLiveQuery(() => effectiveRestrictions(stored?.plan), [stored]) ?? [];
}

/** Data de hoje, que vira sozinha à meia-noite (app aberto de um dia pro outro). */
export function useToday(): string {
  const [today, setToday] = useState(isoDay);
  useEffect(() => {
    const id = setInterval(() => setToday(isoDay()), 30_000);
    const onVis = () => setToday(isoDay());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return today;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Mantém a tela acesa enquanto `on` (Screen Wake Lock API). */
export function useWakeLock(on: boolean): void {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release();
        else lock.current = l;
      } catch {
        /* sem permissão ou aba em segundo plano */
      }
    };
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      lock.current?.release();
      lock.current = null;
    };
  }, [on]);
}

/** Aplica a cor do treino como --accent no documento inteiro. */
export function useAccent(color: string | undefined): void {
  useEffect(() => {
    if (!color) return;
    const root = document.documentElement;
    const prev = root.style.getPropertyValue("--accent");
    root.style.setProperty("--accent", color);
    root.style.setProperty("--accent-2", `color-mix(in srgb, ${color} 70%, white)`);
    return () => {
      if (prev) root.style.setProperty("--accent", prev);
      else root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
    };
  }, [color]);
}

export function useLibrary() {
  return useLiveQuery(() => db.exercises.orderBy("name").toArray(), []);
}

export function usePlans(): StoredPlan[] | undefined {
  return useLiveQuery(() => db.plans.orderBy("importedAt").reverse().toArray(), []);
}

/** Sessões finalizadas + séries de trabalho feitas (musculação) + cardio + datas puladas: base de calendário e análises. */
export function useTrainingData() {
  return useLiveQuery(async () => {
    const sessions = (await db.sessions.where("status").equals("done").toArray()).sort((a, b) => a.startedAt - b.startedAt);
    const done = await db.sets.filter((s) => s.done && s.kind === "work").toArray();
    // mobilidade e cardio ficam fora de volume, recordes e contagem de séries (cardio tem análise própria)
    const sets = done.filter((s) => !s.mode);
    const cardio = done.filter((s) => s.mode === "cardio");
    const skips = await db.skips.toArray();
    return { sessions, sets, skips, cardio };
  }, []);
}

export function useMeasures(type?: string) {
  return useLiveQuery(async () => {
    const rows = type ? await db.measures.where("type").equals(type).toArray() : await db.measures.toArray();
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [type]);
}

/** Tela larga (PC): menu lateral e lista + detalhe lado a lado. Mesmo limite do CSS (1000 px). */
export function useWide(min = 1000): boolean {
  const q = typeof matchMedia !== "undefined" ? `(min-width: ${min}px)` : "";
  const [wide, setWide] = useState(() => (q ? matchMedia(q).matches : false));
  useEffect(() => {
    if (!q) return;
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return wide;
}
