import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, type ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Icon } from "./components/Icon";
import { ToastHost } from "./components/ui";
import { WhatsNew } from "./components/WhatsNew";
import { LiveWorkout } from "./components/LiveWorkout";
import { OfflinePill } from "./components/OfflinePill";
import { uploadNotes } from "./lib/feedback";
import { db, MEASURE_TYPES, type MeasureType } from "./db";
import { useWide } from "./hooks";
import { href, useRoute } from "./router";
import { Body, MeasureDetail } from "./screens/Body";
import { Photos } from "./screens/Photos";
import { PulsoScreen } from "./screens/Pulso";
import { ClaudeScreen } from "./screens/Claude";
import { ExerciseDetail } from "./screens/ExerciseDetail";
import { ExerciseGroup, Exercises } from "./screens/Exercises";
import { Home } from "./screens/Home";
import { MotionGallery } from "./screens/MotionGallery";
import { DayEditor, ProgramEditor } from "./screens/ProgramEditor";
import { Progress, SessionDetail } from "./screens/Progress";
import { Feedback } from "./screens/Feedback";
import { MesaScreen } from "./screens/Mesa";
import { ImportPlan, Settings } from "./screens/Settings";
import { Workout } from "./screens/Workout";
import { Workouts } from "./screens/Workouts";
import { Summary } from "./screens/Summary";

import { tr } from "./i18n";
const TABS = [
  { id: "inicio", label: "Início", icon: "home" },
  { id: "treinos", label: "Treinos", icon: "dumbbell" },
  { id: "exercicios", label: "Exercícios", icon: "list" },
  { id: "progresso", label: "Progresso", icon: "chart" },
  { id: "corpo", label: "Corpo", icon: "body" },
];

/** Rotas antigas (antes da reformulação) continuam abrindo a tela certa. */
const LEGACY: Record<string, string> = { hoje: "inicio", plano: "treinos", biblioteca: "exercicios", historico: "progresso", medidas: "corpo", mais: "ajustes" };

export function App() {
  const wide = useWide();
  const route = useRoute();
  const [raw, a, b, c, d] = route;
  const page = raw === "historico" && a ? "historico" : LEGACY[raw] ?? raw;
  // anotações do Feedback que ainda não chegaram ao servidor: ao abrir e quando a internet volta
  useEffect(() => {
    const up = () => uploadNotes().catch(() => {});
    up();
    window.addEventListener("online", up);
    return () => window.removeEventListener("online", up);
  }, []);
  // grupo do exercício aberto (para a lista ao lado, no PC)
  const exGroup = useLiveQuery(async () => (wide && page === "exercicio" && a ? (await db.exercises.get(a))?.group ?? null : null), [wide, page, a]);

  let screen;
  let tab = page;
  switch (page) {
    case "treino":
      screen = <Workout />;
      break;
    case "resumo":
      screen = <Summary id={a ?? ""} />;
      break;
    case "treinos":
      if (a === "programa" && b) screen = <ProgramEditor id={b} />;
      else if (a === "dia" && b && c) screen = <DayEditor key={`${b}/${c}/${d ?? ""}`} planId={b} dayKey={c} week={d ? Number(d) || undefined : undefined} />;
      else if (a === "importar" || (raw === "mais" && a === "importar")) screen = <ImportPlan />;
      else screen = <Workouts />;
      break;
    case "exercicios":
      screen = a ? <ExerciseGroup group={a} /> : <Exercises />;
      break;
    case "exercicio":
      screen = <ExerciseDetail name={a} />;
      tab = "exercicios";
      break;
    case "progresso":
      screen = <Progress tab={a} param={b} />;
      break;
    case "historico":
      // links antigos (antes do Pulse) usavam o número da sessão: 57 → "m00000057"
      screen = <SessionDetail id={/^\d+$/.test(a ?? "") ? `m${a.padStart(8, "0")}` : a ?? ""} />;
      tab = "progresso";
      break;
    case "corpo":
      screen = a === "medida" && b ? <MeasureDetail type={b} /> : a === "fotos" ? <Photos /> : <Body add={a === "novo" && b && b in MEASURE_TYPES ? (b as MeasureType) : undefined} />;
      break;
    case "movimentos":
      screen = <MotionGallery group={a} cols={Number(b) || 2} filter={c} />;
      tab = "exercicios";
      break;
    case "ajustes":
      screen = <Settings sec={a} />;
      tab = "inicio";
      break;
    case "feedback":
      screen = <Feedback />;
      tab = "inicio";
      break;
    case "claude":
      screen = <ClaudeScreen id={a} />;
      tab = "progresso";
      break;
    case "mesa":
      screen = <MesaScreen />;
      tab = "inicio";
      break;
    case "pulso":
      screen = <PulsoScreen />;
      tab = "inicio";
      break;
    default:
      screen = <Home />;
      tab = "inicio";
  }

  // PC: lista à esquerda e detalhe à direita (exercício, sessão, análise do Claude)
  let content = <div key={route.join("/")}>{screen}</div>;
  if (wide) {
    const split = (list: ReactNode, main: ReactNode) => (
      <div className="split">
        <div className="split-list">{list}</div>
        <div className="split-main" key={route.join("/")}>{main}</div>
      </div>
    );
    if (page === "exercicio" && a) content = split(exGroup ? <ExerciseGroup group={exGroup} /> : <Exercises />, screen);
    else if (page === "exercicios" && a) content = split(screen, <div className="split-empty">Escolha um exercício da lista para ver a animação, o passo a passo e a sua evolução.</div>);
    else if (page === "historico" && a) content = split(<Progress tab="sessoes" />, screen);
    else if (page === "claude" && a) content = split(<ClaudeScreen />, screen);
  }
  const isSplit = wide && content.type === "div" && (content.props as { className?: string }).className === "split";

  return (
    <div className={`app${page === "treino" || page === "resumo" ? " focus" : ""}`}>
      <div className={`content${isSplit ? " split-wrap" : ""}`}>{content}</div>
      {page !== "treino" && page !== "resumo" && (
        <div className="tabbar">
          <a className="side-only side-brand" href={href("inicio")} aria-label={tr("Pulse — início")}><span className="dot" />{tr("Pulse")}</a>
          <nav>
            {TABS.map((t) => (
              <a key={t.id} href={href(t.id)} aria-current={tab === t.id && !(wide && (page === "claude" || page === "ajustes" || page === "mesa")) ? "page" : undefined}>
                <span className="pill"><Icon name={t.icon} size={22} /></span>
                {tr(t.label)}
              </a>
            ))}
            <div className="side-only side-sep" />
            <a className="side-only" href={href("claude")} aria-current={page === "claude" ? "page" : undefined}>
              <span className="pill"><Icon name="bolt" size={22} /></span>{tr("Claude")}
            </a>
            <a className="side-only" href={href("mesa")} aria-current={page === "mesa" ? "page" : undefined}>
              <span className="pill"><Icon name="scale" size={22} /></span>{tr("Mesa")}
            </a>
            <a className="side-only" href={href("ajustes")} aria-current={page === "ajustes" ? "page" : undefined}>
              <span className="pill"><Icon name="gear" size={22} /></span>{tr("Ajustes")}
            </a>
          </nav>
          <div className="side-only side-foot">{tr("Pulse · treino pessoal")}</div>
        </div>
      )}
      <UpdatePrompt />
      <WhatsNew />
      <LiveWorkout />
      <OfflinePill />
      <ToastHost />
    </div>
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // o app instalado fica aberto em segundo plano: confere versão nova ao voltar para ele e a cada hora
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      {tr("Nova versão disponível")}
      <button className="btn sm primary" onClick={() => updateServiceWorker(true)}>{tr("Atualizar")}</button>
    </div>
  );
}
