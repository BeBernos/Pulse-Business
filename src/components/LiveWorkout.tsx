import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { activeSession, db } from "../db";
import { useSettings } from "../hooks";
import { toast } from "./ui";
import { recordError } from "../lib/feedback";
import { tr } from "../i18n";
import { fillSet, focusOf, liveSteps, nextAfter, nextSetOf, type LEx, type LSet } from "../lib/liveNext";
import { isNative, WorkoutLive, type LiveAction, type LivePayload } from "../lib/native";
import { fmtClock } from "../lib/metrics";
import { drawCard, drawIcon, fontsReady } from "../lib/notifArt";
import { fmtKg, supersetGroups } from "../lib/prescription";
import { REST_KEY } from "../screens/Workout";

const TAG = "pulse-treino";
/** Exercício que a tela do treino está mostrando (o treino grava; a notificação segue). */
export const CUR_KEY = "pulso.wkCurrent";
/** Descanso ou exercício da vez mudou fora da tela do treino (botão da notificação): a tela relê. */
export const LIVE_EVENT = "pulso-live";

interface Rest { endsAt: number; total: number; label: string; setId?: string }

const allowed = () => typeof Notification !== "undefined" && Notification.permission === "granted" && "serviceWorker" in navigator;
const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const save = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const BLUE = "#4da3ff";

async function clear() {
  const reg = await navigator.serviceWorker?.getRegistration();
  for (const n of (await reg?.getNotifications({ tag: TAG })) ?? []) n.close();
}

/** Série feita pelo botão da notificação: marca a próxima série do exercício da vez e começa o descanso. */
async function quickDone(sessionId: string, endsAt?: number) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const sets = await db.sets.where({ sessionId }).toArray();
  const i = focusOf(session.exercises, sets, read<{ s: string; i: number }>(CUR_KEY)?.s === sessionId ? read<{ i: number }>(CUR_KEY)!.i : null);
  const ns = i >= 0 ? nextSetOf(sets, i) : null;
  if (!ns) return;
  await db.sets.update(ns.set.id, { done: true, completedAt: Date.now(), ...fillSet(sets, ns.set) });
  const r = nextAfter(session.exercises, sets, i, ns.set.id);
  if (r.next >= 0) save(CUR_KEY, { s: sessionId, i: r.next });
  const end = endsAt ?? (r.rest > 0 ? Date.now() + r.rest * 1000 : 0);
  save(REST_KEY, end > Date.now() ? { endsAt: end, total: r.rest, label: session.exercises[i].name } : null);
  navigator.vibrate?.(30);
}

/** Textos da notificação nativa para um estado das séries (agora ou depois de N toques em "Série feita"). */
function describe(exercises: readonly (LEx & { name: string })[], sets: readonly LSet[], preferred: number | null) {
  const groups = supersetGroups(exercises as never);
  const i = focusOf(exercises, sets, preferred);
  const work = sets.filter((x) => x.kind === "work" && !exercises[x.exOrder]?.skipped);
  const setsDone = work.filter((x) => x.done).length;
  const ex = i >= 0 ? exercises[i] : null;
  const g = i >= 0 ? groups[i] : null;
  const label = g ? `${g.letter}${g.members.indexOf(i) + 1} ` : "";
  const ns = i >= 0 ? nextSetOf(sets, i) : null;
  const fill = ns ? fillSet(sets, ns.set) : null;
  const detail = !ns ? "" : ns.set.mode === "cardio" ? tr("Cardio") : ns.set.kind === "warmup" ? tr("Aquecimento") : `${tr("Série {0} de {1}", ns.n, ns.total)}${fill?.kg != null ? ` · ${fmtKg(fill.kg)} kg` : ""}${fill?.reps != null ? ` × ${fill.reps}` : ""}`;
  const name = ex ? `${label}${ex.name}` : tr("Tudo feito — finalize o treino");
  const count = tr("{0}/{1} séries", setsDone, work.length);
  return {
    setsDone,
    canDone: !!ns,
    title: name,
    text: detail || count,
    bigText: detail ? `${detail}\n${count}` : count,
    restTitle: `${tr("Descanso")}${g ? ` · Superset ${g.letter}` : ""}`,
    restText: ex ? `${tr("Depois:")} ${name}${detail ? ` — ${detail}` : ""}` : tr("Último exercício feito"),
  };
}

let askedPermission = false;

/** App Android: o Android mostra a notificação (cronômetro do sistema, botões e alarmes com a tela apagada). */
function useNativeLive(on: boolean, session: Awaited<ReturnType<typeof activeSession>>, sets: LSet[] | undefined) {
  useEffect(() => {
    if (!isNative()) return;
    if (!on || !session || !sets) { WorkoutLive.clear().catch(recordError); return; }
    let sent = "";
    let failed = false;
    // erro da parte nativa vai para o Feedback do app/servidor (uma vez por treino, sem repetir a cada segundo)
    const fail = (e: unknown) => { if (!failed) { failed = true; recordError(e); } };
    const push = async () => {
      const fresh = await db.sets.where({ sessionId: session.id }).toArray();
      const cur = read<{ s: string; i: number }>(CUR_KEY);
      const pref = cur?.s === session.id ? cur.i : null;
      const rest = read<Rest>(REST_KEY);
      const now = describe(session.exercises, fresh, pref);
      const steps = liveSteps(session.exercises, fresh, pref).map((st) => ({ rest: st.rest, ...describe(session.exercises, st.sets, st.next >= 0 ? st.next : null) }));
      const p: LivePayload = {
        startedAt: session.startedAt,
        // mantém o fim por 1 min: o alarme do Android vibra no fim mesmo com o Pulse aberto
        endsAt: rest && rest.endsAt > Date.now() - 60_000 ? rest.endsAt : 0,
        restTotal: rest?.total ?? 0,
        color: session.color || "#ff3b5c",
        setsTotal: fresh.filter((x) => x.kind === "work" && !session.exercises[x.exOrder]?.skipped).length,
        ...now,
        steps,
        doneLabel: tr("✓ Série feita"), plusLabel: tr("+15 s"), skipLabel: tr("Pular"), overTitle: tr("Bora!"), warnTitle: tr("Faltam 10 s"),
      };
      const key = JSON.stringify(p);
      if (key !== sent) { sent = key; await WorkoutLive.update(p); }
    };
    const onAction = async (a: LiveAction) => {
      if (a.action === "done") await quickDone(session.id, a.endsAt);
      else if (a.action === "plus15" || a.action === "skip") {
        const rest = read<Rest>(REST_KEY);
        save(REST_KEY, a.endsAt > Date.now() && rest ? { ...rest, endsAt: a.endsAt, total: rest.total + 15 } : null);
      }
      window.dispatchEvent(new Event(LIVE_EVENT));
    };
    const handle = WorkoutLive.addListener("action", (a) => { onAction(a).then(push).catch(fail); });
    handle.then(() => WorkoutLive.flush()).catch(fail);
    if (!askedPermission) { askedPermission = true; WorkoutLive.requestNotifications().then((r) => { if (!r.granted) toast(tr("As notificações do Pulse estão bloqueadas nos ajustes do Android.")); }).catch(fail); }
    const tick = () => push().catch(fail);
    // o descanso começa/muda na tela do treino (REST_KEY no aparelho): confere a cada segundo, só envia se mudou
    const t = window.setInterval(tick, 1000);
    window.addEventListener(LIVE_EVENT, tick);
    tick();
    return () => { window.clearInterval(t); window.removeEventListener(LIVE_EVENT, tick); handle.then((h) => h.remove()).catch(() => {}); };
  }, [on, session, sets]);
}

/**
 * Treino ativo na barra de notificações (opção C escolhida pelo Rafael em 05/11): fechada, o ícone é o anel do descanso
 * com o tempo; aberta, um cartão com o anel grande, o exercício da vez, a série e a carga. Atualiza a cada ~5 s (a cada
 * 1 s nos últimos 10), vibra aos 10 s e no fim do descanso, e tem os botões "Série feita" e "+15 s". Fica durante todo o treino (também com o app aberto, como um player de música).
 * shortcut: o Android não deixa um app web ter cronômetro nativo na notificação; o app reescreve. Com a tela apagada por
 * muito tempo o Android pode espaçar as atualizações.
 */
export function LiveWorkout() {
  const settings = useSettings();
  const session = useLiveQuery(activeSession, []);
  const sets = useLiveQuery(async () => (session ? db.sets.where({ sessionId: session.id }).toArray() : []), [session?.id]);
  const on = !!session && settings?.liveNotify !== false;
  useNativeLive(on, session, sets);

  useEffect(() => {
    if (isNative()) return;
    if (!on || !session || !sets) { clear().catch(() => {}); return; }
    let last = 0;
    let warned = 0;
    let ended = 0;
    const groups = supersetGroups(session.exercises);
    const paint = async (force = false) => {
      if (!allowed()) return;
      const now = Date.now();
      const rest = read<Rest>(REST_KEY);
      const left = rest ? rest.endsAt - now : -Infinity;
      const resting = !!rest && left > 0;
      if (!force && now - last < (resting && left <= 10_500 ? 900 : 4900) && !(rest && left <= 0 && ended !== rest.endsAt)) return;
      last = now;
      await fontsReady();
      const fresh = await db.sets.where({ sessionId: session.id }).toArray();
      const cur = read<{ s: string; i: number }>(CUR_KEY);
      const i = focusOf(session.exercises, fresh, cur?.s === session.id ? cur.i : null);
      const work = fresh.filter((x) => x.kind === "work" && !session.exercises[x.exOrder]?.skipped);
      const doneW = work.filter((x) => x.done).length;
      const ex = i >= 0 ? session.exercises[i] : null;
      const g = i >= 0 ? groups[i] : null;
      const label = g ? `${g.letter}${g.members.indexOf(i) + 1} ` : "";
      const ns = i >= 0 ? nextSetOf(fresh, i) : null;
      const fill = ns ? fillSet(fresh, ns.set) : null;
      const detail = !ns ? "" : ns.set.mode === "cardio" ? tr("Cardio") : ns.set.kind === "warmup" ? tr("Aquecimento") : `${tr("Série {0} de {1}", ns.n, ns.total)}${fill?.kg != null ? ` · ${fmtKg(fill.kg)} kg` : ""}${fill?.reps != null ? ` × ${fill.reps}` : ""}`;
      const chips = ex ? fresh.filter((x) => x.exOrder === i && x.kind === "work").sort((a, b) => a.setIndex - b.setIndex).map((x) => (x.done ? "on" : x.id === ns?.set.id ? "cur" : "off") as "on" | "cur" | "off") : [];
      const corner = tr("{0}/{1} séries · {2} de treino", doneW, work.length, fmtClock(now - session.startedAt));
      const color = session.color || "#ff3b5c";

      // vibrações: aos 10 s (aviso curto) e no fim
      let vibrate: number[] | null = null;
      if (resting && left <= 10_500 && warned !== rest!.endsAt) { warned = rest!.endsAt; vibrate = [120, 80, 120]; }
      if (rest && left <= 0 && left > -60_000 && ended !== rest.endsAt) { ended = rest.endsAt; vibrate = [250, 120, 250, 120, 400]; }

      let title: string, body: string, icon: string, image: string;
      if (resting) {
        const t = fmtClock(left + 999);
        title = `${t} · ${tr("Descanso")}${g ? ` · Superset ${g.letter}` : ""}`;
        body = ex ? `${tr("Depois:")} ${label}${ex.name}${detail ? ` — ${detail}` : ""}` : tr("Último exercício feito");
        icon = drawIcon(left / (rest!.total * 1000), t, color);
        image = drawCard({ frac: left / (rest!.total * 1000), center: t, under: tr("descanso"), color, eyebrow: `${tr("A seguir")}${label ? ` · ${label.trim()}` : ""}`, name: ex?.name ?? tr("Tudo feito"), detail, chips, corner });
      } else {
        const over = !!rest && left > -60_000;
        title = ex ? `${over ? tr("Bora!") + " " : ""}${label}${ex.name}` : tr("Tudo feito — finalize o treino");
        body = detail || `${session.dayKey} · ${session.dayName}`;
        const center = `${doneW}/${work.length}`;
        icon = drawIcon(work.length ? doneW / work.length : 0, center, over ? BLUE : color);
        image = drawCard({ frac: work.length ? doneW / work.length : 0, center, under: tr("séries"), color: over ? BLUE : color, eyebrow: `${tr("Agora")}${label ? ` · ${label.trim()}` : ""}`, name: ex?.name ?? tr("Tudo feito"), detail, chips, corner });
      }
      const max = (Notification as unknown as { maxActions?: number }).maxActions ?? 2;
      const actions = (ns ? [{ action: "done", title: tr("✓ Série feita") }] : []).concat(resting ? [{ action: "plus15", title: tr("+15 s") }, { action: "skip", title: tr("Pular") }] : []).slice(0, max);
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.showNotification(title, {
        body,
        tag: TAG,
        icon,
        image,
        badge: "badge-96.png",
        timestamp: session.startedAt,
        silent: !vibrate,
        ...(vibrate ? { renotify: true, vibrate } : {}),
        actions,
        data: { url: "#/treino" },
      } as NotificationOptions);
    };
    const t = window.setInterval(() => paint().catch(() => {}), 1000);
    const now = () => paint(true).catch(() => {});
    // botões da notificação (o service worker repassa para cá)
    const onMsg = async (e: MessageEvent) => {
      if (e.data?.type !== "pulse-action") return;
      const rest = read<Rest>(REST_KEY);
      if (e.data.action === "done") await quickDone(session.id);
      else if (e.data.action === "plus15" && rest) save(REST_KEY, { ...rest, endsAt: Math.max(Date.now(), rest.endsAt) + 15_000, total: rest.total + 15 });
      else if (e.data.action === "skip") save(REST_KEY, null);
      window.dispatchEvent(new Event(LIVE_EVENT));
      now();
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    document.addEventListener("visibilitychange", now);
    window.addEventListener(LIVE_EVENT, now);
    now();
    return () => {
      window.clearInterval(t);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
      document.removeEventListener("visibilitychange", now);
      window.removeEventListener(LIVE_EVENT, now);
    };
  }, [on, session, sets]);

  return null;
}

