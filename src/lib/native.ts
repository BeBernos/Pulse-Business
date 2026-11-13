import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** Dentro do app Android do Pulse (casca Capacitor que abre o site). No navegador/PWA = false. */
export const isNative = () => Capacitor.isNativePlatform();

/** Estado do treino que a notificação nativa mostra (o Android cuida do cronômetro, dos botões e dos alarmes). */
export interface LivePayload {
  startedAt: number;
  /** fim do descanso (0 = sem descanso) */
  endsAt: number;
  restTotal: number;
  color: string;
  setsTotal: number;
  setsDone: number;
  title: string;
  text: string;
  bigText: string;
  restTitle: string;
  restText: string;
  canDone: boolean;
  /** o que mostrar depois de cada "Série feita" (o Android avança sozinho, mesmo com o Pulse parado) */
  steps: { rest: number; setsDone: number; title: string; text: string; bigText: string; restTitle: string; restText: string; canDone: boolean }[];
  doneLabel: string; plusLabel: string; skipLabel: string; overTitle: string; warnTitle: string;
}

export interface LiveAction { action: "done" | "plus15" | "skip" | "end"; at: number; endsAt: number }

interface WorkoutLivePlugin {
  update(p: LivePayload): Promise<void>;
  clear(): Promise<void>;
  flush(): Promise<void>;
  requestNotifications(): Promise<{ granted: boolean }>;
  addListener(e: "action", cb: (a: LiveAction) => void): Promise<PluginListenerHandle>;
}

export const WorkoutLive = registerPlugin<WorkoutLivePlugin>("WorkoutLive");
