import { addDays, daysBetween } from "./calendar";

export interface Point {
  date: string;
  value: number;
}

/** Média móvel por janela de dias corridos (inclui o próprio dia): suaviza a oscilação diária do peso. */
export function movingAverage(points: Point[], windowDays = 7): Point[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const from = addDays(p.date, -(windowDays - 1));
    const inWin = sorted.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, value: Math.round((inWin.reduce((s, q) => s + q.value, 0) / inWin.length) * 10) / 10 };
  });
}

/** Valor mais recente até a data (inclusive), ou null. */
export function valueAt(points: Point[], iso: string): Point | null {
  let best: Point | null = null;
  for (const p of points) if (p.date <= iso && (!best || p.date > best.date)) best = p;
  return best;
}

/** Variação entre o último registro e o registro mais próximo de `days` dias antes dele. */
export function change(points: Point[], days: number): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1)!;
  const ref = valueAt(sorted.slice(0, -1), addDays(last.date, -days)) ?? sorted[0];
  if (ref === last) return null;
  return Math.round((last.value - ref.value) * 10) / 10;
}

/** Ritmo semanal (kg/semana) entre o primeiro e o último registro do intervalo. */
export function weeklyRate(points: Point[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const days = daysBetween(sorted[0].date, sorted.at(-1)!.date);
  if (days < 7) return null;
  return Math.round(((sorted.at(-1)!.value - sorted[0].value) / days) * 7 * 100) / 100;
}

export function bmi(weightKg: number, heightCm: number): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiLabel(v: number): string {
  if (v < 18.5) return "abaixo do peso";
  if (v < 25) return "faixa normal";
  if (v < 30) return "sobrepeso";
  return "obesidade";
}

/* ---------------- composição corporal ---------------- */

/** Sexo para as fórmulas (as equações e as faixas de % de gordura são diferentes). Sem informar = masculino. */
export type Sex = "m" | "f";

/**
 * % de gordura pela fórmula da Marinha americana (Hodgdon & Beckett), só com fita métrica, em cm:
 * homens 495 / (1,0324 − 0,19077·log10(cintura − pescoço) + 0,15456·log10(altura)) − 450;
 * mulheres 495 / (1,29579 − 0,35004·log10(cintura + quadril − pescoço) + 0,22100·log10(altura)) − 450.
 * Cintura na altura do umbigo. Erro típico ±3–4 pontos — vale pela tendência.
 */
export function navyBodyFat(heightCm: number, waistCm: number, neckCm: number, sex: Sex = "m", hipCm?: number | null): number | null {
  if (!heightCm || !waistCm || !neckCm) return null;
  let bf: number;
  if (sex === "f") {
    if (!hipCm || waistCm + hipCm <= neckCm) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  } else {
    if (waistCm <= neckCm) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  }
  return bf > 2 && bf < 60 ? Math.round(bf * 10) / 10 : null;
}

/**
 * RFM, "massa gorda relativa" (Woolcott & Bergman, 2018, validada contra DXA): só altura e cintura.
 * Homens 64 − 20 × altura/cintura; mulheres 76 − 20 × altura/cintura. Usada quando falta o pescoço (ou o quadril).
 */
export function rfmBodyFat(heightCm: number, waistCm: number, sex: Sex = "m"): number | null {
  if (!heightCm || !waistCm) return null;
  const bf = (sex === "f" ? 76 : 64) - 20 * (heightCm / waistCm);
  return bf > 2 && bf < 60 ? Math.round(bf * 10) / 10 : null;
}

export type BodyFatMethod = "medido" | "marinha" | "rfm";

/** Melhor estimativa disponível: Marinha (cintura + pescoço [+ quadril]); senão RFM (cintura + altura). */
export function estimateBodyFat(heightCm: number, sex: Sex, m: { waist?: number | null; neck?: number | null; hip?: number | null }): { value: number; method: "marinha" | "rfm" } | null {
  if (!m.waist) return null;
  const navy = m.neck ? navyBodyFat(heightCm, m.waist, m.neck, sex, m.hip) : null;
  if (navy != null) return { value: navy, method: "marinha" };
  const rfm = rfmBodyFat(heightCm, m.waist, sex);
  return rfm != null ? { value: rfm, method: "rfm" } : null;
}

export const METHOD_LABEL: Record<BodyFatMethod, string> = { medido: "medida", marinha: "estimada · Marinha", rfm: "estimada · RFM" };
export const METHOD_NAME: Record<BodyFatMethod, string> = { medido: "% medido", marinha: "fórmula da Marinha", rfm: "fórmula RFM" };

export function leanMass(weightKg: number, bodyFatPct: number): number {
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}

/**
 * FFMI (índice de massa livre de gordura) = massa magra / altura², normalizado para 1,80 m
 * (+ 6,1 × (1,8 − altura)). Mede o quanto você é musculoso independente da gordura.
 */
export function ffmi(leanKg: number, heightCm: number): { raw: number; normalized: number } | null {
  if (!leanKg || !heightCm) return null;
  const h = heightCm / 100;
  const raw = leanKg / (h * h);
  return { raw: Math.round(raw * 10) / 10, normalized: Math.round((raw + 6.1 * (1.8 - h)) * 10) / 10 };
}

export function ffmiLabel(v: number, sex: Sex = "m"): string {
  // mulheres: ~3 pontos abaixo nas mesmas faixas
  const x = sex === "f" ? v + 3 : v;
  if (x < 18) return "abaixo da média";
  if (x < 20) return "média";
  if (x < 22) return "acima da média";
  if (x < 23) return "excelente";
  if (x < 25) return "muito musculoso";
  return "topo do natural";
}

/** % de gordura em faixas do ACE (homens 6/14/18/25; mulheres 14/21/25/32). */
export function bodyFatLabel(v: number, sex: Sex = "m"): string {
  const [ess, ath, fit, avg] = sex === "f" ? [14, 21, 25, 32] : [6, 14, 18, 25];
  if (v < ess) return "essencial";
  if (v < ath) return "atleta";
  if (v < fit) return "boa forma";
  if (v < avg) return "média";
  return "alto";
}

/** Relação cintura/altura: indicador simples de gordura abdominal e risco (meta < 0,5). */
export function waistToHeight(waistCm: number, heightCm: number): number | null {
  if (!waistCm || !heightCm) return null;
  return Math.round((waistCm / heightCm) * 100) / 100;
}

export function waistToHeightLabel(v: number): string {
  if (v < 0.43) return "muito baixo";
  if (v < 0.5) return "saudável";
  if (v < 0.6) return "risco aumentado";
  return "risco alto";
}

export interface BodyFatPoint {
  date: string;
  value: number;
  source: BodyFatMethod;
}

export interface BodyFatInputs {
  bodyFat?: Point[];
  waist?: Point[];
  neck?: Point[];
  hip?: Point[];
}

const MAX_AGE = 30;

function recentValue(pts: Point[] | undefined, iso: string, maxAge = MAX_AGE): number | null {
  const p = pts ? valueAt(pts, iso) : null;
  return p && daysBetween(p.date, iso) <= maxAge ? p.value : null;
}

/**
 * % de gordura em cada dia com medida (gordura, cintura, pescoço ou quadril): o % medido mais recente
 * (até 30 dias) vence; senão a estimativa com as medidas mais recentes (até 30 dias).
 */
export function bodyFatSeries(heightCm: number | null, sex: Sex, opts: BodyFatInputs): BodyFatPoint[] {
  const dates = [...new Set([opts.bodyFat, opts.waist, opts.neck, opts.hip].flatMap((l) => (l ?? []).map((p) => p.date)))].sort();
  const out: BodyFatPoint[] = [];
  for (const d of dates) {
    const measured = recentValue(opts.bodyFat, d);
    if (measured != null) {
      out.push({ date: d, value: measured, source: "medido" });
      continue;
    }
    if (!heightCm) continue;
    const e = estimateBodyFat(heightCm, sex, { waist: recentValue(opts.waist, d), neck: recentValue(opts.neck, d), hip: recentValue(opts.hip, d) });
    if (e) out.push({ date: d, value: e.value, source: e.method });
  }
  return out;
}

export interface Composition {
  date: string;
  weight: number;
  bodyFat: number;
  /** "medido" = registro de % de gordura; "marinha"/"rfm" = estimado pelas medidas com fita. */
  source: BodyFatMethod;
  lean: number;
  fat: number;
  ffmi: number;
}

/**
 * Composição ao longo do tempo: um ponto em cada dia em que o % de gordura foi medido ou estimado
 * (com o peso mais perto, até 14 dias), e o "agora" com o peso mais recente e o % mais recente (até 30 dias).
 * Não cria pontos em dias só de peso: senão a perda de peso viraria perda de massa magra no gráfico.
 */
export function compositionSeries(weights: Point[], heightCm: number | null, opts: BodyFatInputs, sex: Sex = "m"): Composition[] {
  if (!heightCm || !weights.length) return [];
  const ws = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const nearest = (iso: string): Point | null => {
    let best: Point | null = null;
    for (const w of ws) if (Math.abs(daysBetween(w.date, iso)) <= 14 && (!best || Math.abs(daysBetween(w.date, iso)) < Math.abs(daysBetween(best.date, iso)))) best = w;
    return best;
  };
  const make = (date: string, weight: number, bf: BodyFatPoint): Composition => {
    const lean = leanMass(weight, bf.value);
    return { date, weight, bodyFat: bf.value, source: bf.source, lean, fat: Math.round((weight - lean) * 10) / 10, ffmi: ffmi(lean, heightCm)!.normalized };
  };
  const out: Composition[] = [];
  const bfs = bodyFatSeries(heightCm, sex, opts);
  for (const bf of bfs) {
    const w = nearest(bf.date);
    if (w) out.push(make(bf.date, w.value, bf));
  }
  const lastW = ws.at(-1)!;
  const lastBf = bfs.filter((b) => b.date <= lastW.date).at(-1);
  if (lastBf && daysBetween(lastBf.date, lastW.date) <= MAX_AGE && (!out.length || lastW.date > out.at(-1)!.date)) out.push(make(lastW.date, lastW.value, lastBf));
  return out;
}
