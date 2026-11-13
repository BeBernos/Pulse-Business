/**
 * Desenhos da notificação do treino (opção C escolhida pelo Rafael em 05/11): ícone = anel do descanso (ou do treino)
 * com o tempo dentro; imagem grande = cartão com anel, exercício da vez, série/carga e as séries feitas.
 * Feitos num <canvas> no aparelho e entregues como data URL a cada atualização.
 */
const NUM = '500 {s}px "Oswald Variable", Oswald, "Arial Narrow", sans-serif';
const TXT = '{w} {s}px "Inter Variable", Inter, system-ui, sans-serif';
const num = (s: number) => NUM.replace("{s}", String(s));
const txt = (s: number, w = 500) => TXT.replace("{s}", String(s)).replace("{w}", String(w));

/** O canvas só usa a fonte já carregada: espera Oswald e Inter uma vez antes do primeiro desenho. */
let fonts: Promise<unknown> | null = null;
export const fontsReady = () => (fonts ??= typeof document !== "undefined" && document.fonts ? Promise.all([document.fonts.load(num(84)), document.fonts.load(txt(32, 650)), document.fonts.load(txt(20, 500))]).catch(() => null) : Promise.resolve());

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, frac: number, color: string) {
  g.lineCap = "round";
  g.lineWidth = width;
  g.strokeStyle = "rgba(255,255,255,.12)";
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  if (frac > 0) {
    g.strokeStyle = color;
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
    g.stroke();
  }
}

/** Ícone (aparece com a notificação fechada): fundo escuro, anel e o texto do meio (tempo ou "12/23"). */
export function drawIcon(frac: number, center: string, color: string): string {
  const [c, g] = canvas(192, 192);
  g.fillStyle = "#0b0b10";
  g.beginPath();
  g.roundRect(0, 0, 192, 192, 44);
  g.fill();
  ring(g, 96, 96, 70, 16, frac, color);
  g.fillStyle = "#f2f2f6";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = num(center.length > 4 ? 42 : 52);
  g.fillText(center, 96, 100);
  return c.toDataURL("image/png");
}

function fitLines(g: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width <= max) cur = t;
    else { out.push(cur); cur = w; }
  }
  out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, "") + "…"; }
  return out.filter(Boolean);
}

export interface CardArt {
  /** 0–1 do anel (descanso que falta, ou séries feitas do treino) */
  frac: number;
  center: string;
  /** texto pequeno embaixo do número do anel ("descanso", "séries") */
  under: string;
  color: string;
  eyebrow: string;
  name: string;
  detail: string;
  chips: ("on" | "cur" | "off")[];
  corner: string;
}

/** Imagem grande (notificação aberta), 2:1 como o Android mostra. */
export function drawCard(a: CardArt): string {
  const W = 720, H = 360;
  const [c, g] = canvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#15151c");
  bg.addColorStop(1, "#0b0b10");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // anel
  ring(g, 170, 180, 118, 22, a.frac, a.color);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#f2f2f6";
  g.font = num(a.center.length > 4 ? 70 : 84);
  g.fillText(a.center, 170, 172);
  g.fillStyle = "#a8a8b6";
  g.font = txt(22, 500);
  g.fillText(a.under, 170, 232);
  // texto
  const X = 330, MAX = W - X - 34;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#8b8b9c";
  g.font = txt(20, 600);
  g.fillText(a.eyebrow.toUpperCase(), X, 92);
  g.fillStyle = "#f2f2f6";
  g.font = txt(32, 650);
  const lines = fitLines(g, a.name, MAX, 2);
  lines.forEach((l, i) => g.fillText(l, X, 134 + i * 40));
  const y = 134 + lines.length * 40 + 14;
  g.fillStyle = a.color;
  g.font = num(34);
  g.fillText(a.detail, X, y);
  // séries
  a.chips.slice(0, 8).forEach((k, i) => {
    const x = X + i * 50, top = y + 24;
    g.fillStyle = k === "on" ? a.color : "#26262f";
    g.globalAlpha = k === "on" ? 0.85 : 1;
    g.beginPath();
    g.roundRect(x, top, 40, 40, 11);
    g.fill();
    g.globalAlpha = 1;
    if (k === "cur") { g.strokeStyle = a.color; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = k === "off" ? "#8b8b9c" : "#fff";
    g.font = num(22);
    g.textAlign = "center";
    g.fillText(String(i + 1), x + 20, top + 28);
    g.textAlign = "left";
  });
  // canto: progresso do treino
  g.fillStyle = "#8b8b9c";
  g.font = txt(19, 500);
  g.textAlign = "right";
  g.fillText(a.corner, W - 28, 44);
  return c.toDataURL("image/png");
}
