import { currentAccount } from "../account";
import { useState } from "react";
import { BodyFigure } from "../components/BodyFigure";
import { Icon } from "../components/Icon";
import { AsyncButton, BackHeader, LineChart, PageHead, Section, Segmented, Sheet, Stat, fmtDelta, toast, toastError, toastUndo, useWidth } from "../components/ui";
import { GestureList } from "../components/GestureList";
import { addMeasure, db, MEASURE_TYPES, setSetting, type Measure, type MeasureType } from "../db";
import { useMeasures, useSettings, useToday } from "../hooks";
import { bmi, bmiLabel, bodyFatLabel, bodyFatSeries, change, compositionSeries, ffmiLabel, METHOD_LABEL, METHOD_NAME, movingAverage, navyBodyFat, rfmBodyFat, waistToHeight, waistToHeightLabel, weeklyRate, type BodyFatInputs, type Composition as Comp, type Sex } from "../lib/body";
import { addDays, fmtShort } from "../lib/calendar";
import { fmtKg } from "../lib/prescription";
import { back, href, replace } from "../router";
import { PhotoImg, usePhotos } from "./Photos";

import { tr } from "../i18n";
import { Term } from "../components/Term";
/** Pontos de medida sobre a figura (coordenadas do viewBox 200×372) e lado da etiqueta. */
const SPOTS: { type: MeasureType; y: number; x1: number; x2: number; side: "left" | "right" }[] = [
  { type: "pescoco", y: 53, x1: 92, x2: 108, side: "right" },
  { type: "ombros", y: 80, x1: 50, x2: 150, side: "left" },
  { type: "peito", y: 97, x1: 69, x2: 131, side: "right" },
  { type: "braco", y: 120, x1: 51, x2: 64, side: "left" },
  { type: "cintura", y: 148, x1: 72, x2: 128, side: "right" },
  { type: "antebraco", y: 162, x1: 44, x2: 56, side: "left" },
  { type: "abdomen", y: 166, x1: 72, x2: 128, side: "right" },
  { type: "quadril", y: 192, x1: 68, x2: 132, side: "left" },
  { type: "coxa", y: 214, x1: 108, x2: 128, side: "right" },
  { type: "panturrilha", y: 298, x1: 112, x2: 126, side: "right" },
];

const RANGES = [
  { value: "30", label: "1M" },
  { value: "90", label: "3M" },
  { value: "180", label: "6M" },
  { value: "all", label: "Tudo" },
];

export function Body({ add }: { add?: MeasureType } = {}) {
  const today = useToday();
  const settings = useSettings();
  const all = useMeasures();
  const [range, setRange] = useState("90");
  // atalho do ícone ("Registrar peso") abre direto a folha de registrar
  const [adding, setAdding] = useState<MeasureType | null>(add ?? null);
  const [wrapRef, cw] = useWidth<HTMLDivElement>(326);
  if (!all || !settings) return <div className="screen" />;

  const of = (t: MeasureType) => all.filter((m) => m.type === t);
  const weights = of("peso");
  const last = weights.at(-1);
  const from = range === "all" ? "0000" : addDays(today, -Number(range));
  const shown = weights.filter((w) => w.date >= from);
  const recent = weights.filter((w) => w.date > addDays(today, -7));
  const week7 = recent.length >= 2 ? { avg: Math.round((recent.reduce((a, w) => a + w.value, 0) / recent.length) * 10) / 10, n: recent.length } : null;
  const avg = movingAverage(shown);
  const goal = settings.goalWeight;
  const imc = last && settings.heightCm ? bmi(last.value, settings.heightCm) : null;
  const rate = weeklyRate(weights.filter((w) => w.date >= addDays(today, -28)));
  const sex: Sex = settings.sex ?? "m";
  const inputs: BodyFatInputs = { bodyFat: of("gordura"), waist: of("cintura"), neck: of("pescoco"), hip: of("quadril") };
  const series = compositionSeries(weights, settings.heightCm, inputs, sex);
  const comp = series.at(-1);
  const bfs = bodyFatSeries(settings.heightCm, sex, inputs);
  // etiquetas com largura fixa dos dois lados; o boneco no meio; as linhas terminam na borda da etiqueta
  const GAP = 6;
  const W = Math.max(110, Math.min(150, cw - 2 * 96));
  const tagW = Math.max(78, Math.floor((cw - W) / 2) - GAP);
  const figLeft = (cw - W) / 2;
  const k = W / 200;
  // etiquetas: por lado, em ordem de altura, com no mínimo 30 px entre elas (empurra para baixo)
  const labelY = new Map<MeasureType, number>();
  for (const side of ["left", "right"] as const) {
    let prev = -Infinity;
    for (const sp of SPOTS.filter((x) => x.side === side).sort((a, b) => a.y - b.y)) {
      const y = Math.max(sp.y * k, prev + 38);
      labelY.set(sp.type, y);
      prev = y;
    }
  }
  return (
    <div className="screen">
      <PageHead title={tr("Corpo")} right={<button className="icon-btn" onClick={() => setAdding("peso")} aria-label={tr("Registrar")}><Icon name="plus" /></button>} />

      {/* peso */}
      <div className="hero plain" style={{ padding: 18 }}>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            {/* com 2+ pesagens na semana, o número principal é a média de 7 dias (o peso de um dia engana) */}
            <div className="eyebrow">{week7 ? tr("Média de 7 dias") : tr("Peso atual")}</div>
            <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
              <span className="big num">{week7 ? fmtKg(week7.avg) : last ? fmtKg(last.value) : "—"}</span>
              <span className="muted bold">{tr("kg")}</span>
            </div>
            <div className="small muted">{week7 && last ? tr("{0} pesagens · última {1} kg em {2}", week7.n, fmtKg(last.value), fmtShort(last.date)) : last ? tr("em {0}", fmtShort(last.date)) : tr("Nenhum registro ainda")}</div>
          </div>
          <button className="btn sm tonal" onClick={() => setAdding("peso")}><Icon name="plus" size={16} /> {tr("Peso")}</button>
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          <MiniStat label={tr("7 dias")} value={fmtDelta(change(weights, 7))} />
          <MiniStat label={tr("30 dias")} value={fmtDelta(change(weights, 30))} />
          <MiniStat label={tr("Ritmo/sem")} value={rate != null ? fmtDelta(rate, 2) : "—"} />
        </div>
        <div style={{ marginTop: 14 }}><Segmented value={range} options={RANGES} onChange={setRange} /></div>
        <div style={{ marginTop: 10 }}>
          <LineChart points={shown.map((w) => ({ x: fmtShort(w.date), y: w.value }))} avg={shown.length >= 3 ? avg.map((a) => a.value) : undefined} unit=" kg" goal={goal} />
        </div>
        {shown.length >= 3 && <div className="tiny dim">{tr("Linha branca = média móvel de 7 dias (tira o efeito da oscilação diária).")}</div>}
      </div>

      <div className="grid-2" style={{ marginTop: 10 }}>
        <div className="stat card" style={{ cursor: "pointer" }}>
          <GoalSetter goal={goal} last={last?.value} />
        </div>
        <button className="stat card tap" style={{ textAlign: "left" }} onClick={() => setAdding("gordura")}>
          <div className="v">{comp ? fmtKg(comp.bodyFat) : "—"}<small>%</small></div>
          <div className="l">{comp ? tr("Gordura · {0}", tr(METHOD_LABEL[comp.source])) : tr("% de gordura")}</div>
        </button>
      </div>

      <Composition comp={comp} series={series} heightCm={settings.heightCm} imc={imc} waist={of("cintura").at(-1)?.value} neck={of("pescoco").at(-1)?.value} hip={of("quadril").at(-1)?.value} sex={sex} sexSet={settings.sex != null} onAdd={setAdding} />

      {/* medidas no corpo */}
      <Section title={tr("Medidas")} action={<a href={href("corpo", "medida", "cintura")}>{tr("Histórico")}</a>} />
      <div className="card" style={{ padding: "14px 10px" }}>
        <div ref={wrapRef} className="body-wrap" style={{ height: Math.max(372 * k, ...labelY.values()) + 22, ["--tag-w" as string]: `${tagW}px` }}>
          <BodyFigure side="front" width={W}>
            {SPOTS.map((s) => {
              const end = s.side === "left" ? s.x1 : s.x2;
              const ly = labelY.get(s.type)! / k;
              const edge = s.side === "left" ? (tagW - figLeft) / k : (cw - tagW - figLeft) / k;
              return (
                <g key={s.type} pointerEvents="none">
                  <line x1={s.x1} x2={s.x2} y1={s.y} y2={s.y} stroke="var(--accent)" strokeWidth="1.8" strokeDasharray="3 2.5" />
                  <polyline points={`${end},${s.y} ${s.side === "left" ? Math.min(end, 40) - 6 : Math.max(end, 160) + 6},${s.y} ${edge},${ly}`} fill="none" stroke="var(--hairline-2)" strokeWidth="1.2" />
                  <circle cx={end} cy={s.y} r="3" fill="var(--accent)" />
                </g>
              );
            })}
          </BodyFigure>
          {SPOTS.map((s) => {
            const list = of(s.type);
            const v = list.at(-1);
            const d = change(list, 30);
            return (
              <button
                key={s.type}
                className={`mtag ${v ? "" : "blank"}`}
                style={{ top: labelY.get(s.type)!, [s.side]: 0 }}
                onClick={() => setAdding(s.type)}
              >
                <span className="mt-l">{tr(MEASURE_TYPES[s.type].label)}</span>
                <span className="mt-v">
                  {v ? <b>{fmtKg(v.value)}</b> : <Icon name="plus" size={13} />}
                  {d != null && d !== 0 && <span style={{ color: d > 0 ? "var(--blue)" : "var(--accent)" }}>{fmtDelta(d)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="tiny dim center">{tr("Toque numa medida para registrar · variação dos últimos 30 dias")}</div>
      </div>

      <PhotosPreview />

      <Section title={tr("Todas as medidas")} />
      {/* grade de 2 colunas (antes uma linha alta por medida: a tela ficava comprida demais) */}
      <div className="mgrid">
        {(Object.keys(MEASURE_TYPES) as MeasureType[]).map((t) => {
          // gordura sem % medido: mostra a estimativa pelas medidas com fita
          const est = t === "gordura" && !of(t).length ? bfs : null;
          const list = est ?? of(t);
          const v = list.at(-1);
          const d = change(list, 30);
          return (
            <a key={t} className="card tap mtile" href={href("corpo", "medida", t)}>
              <div className="tiny muted">{tr(MEASURE_TYPES[t].label)}{est && v ? ` · ${tr("estimado")}` : ""}</div>
              <div className="mtile-v">{v ? <><span className="num">{fmtKg(v.value)}</span> <small>{MEASURE_TYPES[t].unit}</small></> : <span className="dim">—</span>}</div>
              <div className="tiny dim">
                {v ? fmtShort(v.date) : tr("Sem registro")}
                {d != null && d !== 0 && <span style={{ color: d > 0 ? "var(--blue)" : "var(--accent)", marginLeft: 6 }}>{fmtDelta(d)} {tr("/30d")}</span>}
              </div>
            </a>
          );
        })}
      </div>

      <Sheet open={adding !== null} onClose={() => setAdding(null)}>
        {adding && <AddMeasure type={adding} today={today} last={of(adding).at(-1)} onDone={() => setAdding(null)} />}
      </Sheet>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "10px 12px" }}>
      <div className="bold num" style={{ fontSize: 17 }}>{value}</div>
      <div className="tiny muted">{label}</div>
    </div>
  );
}

function GoalSetter({ goal, last }: { goal: number | null; last?: number }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(goal ? fmtKg(goal) : "");
  const diff = goal && last ? Math.round((goal - last) * 10) / 10 : null;
  return (
    <>
      <div onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <div className="v">{goal ? fmtKg(goal) : "—"}<small>{goal ? "kg" : ""}</small></div>
        <div className="l">{goal ? (diff === 0 ? tr("Meta atingida 🎯") : diff == null ? tr("Meta") : tr("Meta · {0} {1} kg", diff > 0 ? tr("ganhar") : tr("perder"), fmtKg(Math.abs(diff)))) : tr("Definir meta de peso")}</div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="stack">
          <div className="title-md">{tr("Meta de peso")}</div>
          <input className="input num" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={tr("Ex.: 80")} style={{ fontSize: 22, fontWeight: 700 }} />
          <AsyncButton className="btn primary block" onClick={async () => { const n = Number(v.replace(",", ".")); await setSetting("goalWeight", v.trim() && Number.isFinite(n) ? n : null); toast(tr("Meta salva")); setOpen(false); }}>{tr("Salvar")}</AsyncButton>
        </div>
      </Sheet>
    </>
  );
}

export function AddMeasure({ type: initial, today, last, onDone }: { type: MeasureType; today: string; last?: Measure; onDone: () => void }) {
  const [type, setType] = useState<MeasureType>(initial);
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const value = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(value) && value > 0;
  const info = MEASURE_TYPES[type];
  return (
    <div className="stack">
      <div className="title-md">{tr("Registrar")} {info.label.toLowerCase()}</div>
      <div className="chips">
        {(Object.keys(MEASURE_TYPES) as MeasureType[]).map((t) => <button key={t} className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{tr(MEASURE_TYPES[t].label)}</button>)}
      </div>
      <div className="alert info small"><Icon name="ruler" size={16} /> <div><b>{tr("Como medir:")}</b> {tr(info.how)}</div></div>
      <label className="field">
        <span>{tr(info.label)} ({info.unit}){last && type === initial ? tr(" · último: {0} em {1}", fmtKg(last.value), fmtShort(last.date)) : ""}</span>
        <input className="input num" inputMode="decimal" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="0" style={{ fontSize: 24, fontWeight: 750 }} />
      </label>
      <div className="grid-2">
        <label className="field"><span>{tr("Data")}</span><input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>{tr("Obs.")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("em jejum")} /></label>
      </div>
      <AsyncButton className="btn primary lg block" disabled={!valid} onClick={async () => { await addMeasure({ type, date, value, note: note.trim() || undefined }); toast(`${tr(info.label)} salvo`); onDone(); }}>
        <Icon name="check" /> {tr("Salvar")}
      </AsyncButton>
    </div>
  );
}

/* =================== Histórico de uma medida =================== */

export function MeasureDetail({ type }: { type: string }) {
  const today = useToday();
  const t = (type in MEASURE_TYPES ? type : "peso") as MeasureType;
  const list = useMeasures(t);
  const all = useMeasures();
  const settings = useSettings();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Measure | null>(null);
  if (!list || !all || !settings) return <div className="screen" />;
  const info = MEASURE_TYPES[t];
  // gordura: estimativa pela fita (cintura/pescoço/quadril + altura), para quando não há % medido
  const of = (x: MeasureType) => all.filter((m) => m.type === x);
  const est = t === "gordura" ? bodyFatSeries(settings.heightCm, settings.sex ?? "m", { waist: of("cintura"), neck: of("pescoco"), hip: of("quadril") }) : [];
  const shown = list.length || !est.length ? list : est;
  const last = shown.at(-1);
  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Corpo")} title={info.label} onBack={() => back("corpo")} right={<button className="btn sm primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> {tr("Registrar")}</button>} />
      {/* trocar de medida não empilha no histórico: o "voltar" vai direto para o Corpo */}
      <div className="chips" style={{ marginBottom: 12 }}>
        {(Object.keys(MEASURE_TYPES) as MeasureType[]).map((x) => <button key={x} className="chip" aria-pressed={x === t} onClick={() => x !== t && replace("corpo", "medida", x)}>{tr(MEASURE_TYPES[x].label)}</button>)}
      </div>
      <div className="grid-3">
        <Stat value={last ? fmtKg(last.value) : "—"} unit={info.unit} label={shown === est ? tr("Estimada") : tr("Atual")} />
        <Stat value={fmtDelta(change(shown, 30))} label={tr("30 dias")} />
        <Stat value={fmtDelta(shown.length >= 2 ? shown.at(-1)!.value - shown[0].value : null)} label={tr("Desde o início")} />
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <LineChart points={shown.map((m) => ({ x: fmtShort(m.date), y: m.value }))} avg={t === "peso" && list.length >= 3 ? movingAverage(list).map((a) => a.value) : undefined} unit={` ${info.unit}`} />
      </div>
      {t === "gordura" && <BodyFatNote est={est.at(-1)} measured={list.length > 0} heightCm={settings.heightCm} />}
      <div className="alert info small" style={{ marginTop: 10 }}><Icon name="ruler" size={16} /> <div><b>{tr("Como medir:")}</b> {tr(info.how)}</div></div>
      {t === "peso" && currentAccount() && <div className="tiny dim" style={{ marginTop: 8 }}>{tr("O peso é o mesmo da Mesa (dieta da família): o que você registra lá aparece aqui, e vice-versa (um por dia).")}</div>}
      <Section title={t === "gordura" ? tr("% medidos ({0})", list.length) : tr("Registros ({0})", list.length)} />
      {list.length === 0 ? <div className="card small muted">{t === "gordura" ? tr("Nenhum % medido ainda. Se fizer bioimpedância ou dobras, registre aqui: o medido passa a valer no lugar da estimativa.") : tr("Nenhum registro ainda.")}</div> : (
        <div className="group gl-group">
          <GestureList gap={0} items={[...list].reverse()} keyOf={(m) => m.id}
            onDelete={(i) => { const m = [...list].reverse()[i]; db.measures.delete(m.id).then(() => toastUndo(tr("Registro apagado"), () => db.measures.put(m))).catch(toastError); }}
            render={(m, i) => {
            const arr = [...list].reverse();
            const prev = arr[i + 1];
            return (
              <button className="item" onClick={() => setRemoving(m)}>
                <div className="grow"><div className="t num">{fmtKg(m.value)} {info.unit}</div><div className="s num">{fmtShort(m.date)}{m.note ? ` · ${m.note}` : ""}</div></div>
                {prev && <span className="tiny" style={{ color: m.value - prev.value > 0 ? "var(--blue)" : "var(--accent)" }}>{fmtDelta(m.value - prev.value)}</span>}
                <Icon name="trash" size={16} />
              </button>
            );
          }} />
        </div>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)}>{adding && <AddMeasure type={t} today={today} last={list.at(-1)} onDone={() => setAdding(false)} />}</Sheet>
      <Sheet open={!!removing} onClose={() => setRemoving(null)} footer={
        <>
          <AsyncButton className="btn danger block" onClick={async () => { await db.measures.delete(removing!.id); setRemoving(null); toast(tr("Registro apagado")); }}>{tr("Apagar")}</AsyncButton>
          <button className="btn ghost block" onClick={() => setRemoving(null)}>{tr("Cancelar")}</button>
        </>
      }>
        {removing && <><div className="title-md">{tr("Apagar registro?")}</div><p className="small muted">{tr(info.label)}: {fmtKg(removing.value)} {info.unit} {tr("em")} {fmtShort(removing.date)}.</p></>}
      </Sheet>
    </div>
  );
}

/** Explica de onde vem o % de gordura na tela da medida. */
function BodyFatNote({ est, measured, heightCm }: { est?: { date: string; value: number; source: keyof typeof METHOD_LABEL }; measured: boolean; heightCm: number | null }) {
  if (!heightCm) return <div className="alert small" style={{ marginTop: 10 }}><Icon name="info" size={16} /><div>{tr("Informe a altura em")} <a href={href("ajustes", "perfil")}>{tr("Ajustes")}</a> {tr("para estimar o % pela fita métrica.")}</div></div>;
  if (!est) return <div className="alert small" style={{ marginTop: 10 }}><Icon name="info" size={16} /><div>{tr("Registre a")} <b>{tr("cintura")}</b> {tr("(e, de preferência, o")} <b>{tr("pescoço")}</b>{tr(") para o app estimar o seu % de gordura.")}</div></div>;
  return (
    <div className="alert info small" style={{ marginTop: 10 }}>
      <Icon name="info" size={16} />
      <div>
        {measured ? <>{tr("Pela fita, hoje:")} <b>{fmtKg(est.value)}%</b> ({tr(METHOD_NAME[est.source])}{tr("). O gráfico mostra o % medido.")}</> : <>{tr("Sem % medido: o gráfico mostra a")} <b>{tr("estimativa pelas suas medidas")}</b> ({tr(METHOD_NAME[est.source])}).</>}
        {est.source === "rfm" ? tr(" Registre também o pescoço para usar a fórmula da Marinha, mais precisa.") : ""} {tr("Erro típico ±3–4 pontos: vale a tendência.")}
      </div>
    </div>
  );
}

/* =================== Composição corporal =================== */

function Composition({ comp, series, heightCm, imc, waist, neck, hip, sex, sexSet, onAdd }: { comp?: Comp; series: Comp[]; heightCm: number | null; imc: number | null; waist?: number; neck?: number; hip?: number; sex: Sex; sexSet: boolean; onAdd: (t: MeasureType) => void }) {
  const [why, setWhy] = useState(false);
  const whtr = waist && heightCm ? waistToHeight(waist, heightCm) : null;
  const missing = [!heightCm && tr("altura (em Ajustes)"), !waist && "cintura"].filter(Boolean) as string[];
  // a outra fórmula, para conferir (as duas usam a cintura; se baterem, a estimativa é mais confiável)
  const other = comp && heightCm && waist && comp.source !== "medido"
    ? comp.source === "marinha" ? { name: tr("RFM (cintura + altura)"), v: rfmBodyFat(heightCm, waist, sex) } : null
    : comp && heightCm && waist && neck ? { name: tr("pela fita (Marinha)"), v: navyBodyFat(heightCm, waist, neck, sex, hip) } : null;
  return (
    <>
      <Section title={tr("Composição corporal")} action={<button onClick={() => setWhy(true)}>{tr("Como é calculado?")}</button>} />
      {comp ? (
        <div className="card stack" style={{ gap: 14 }}>
          <div className="grid-3">
            <div><div className="bold num" style={{ fontSize: 22 }}>{fmtKg(comp.lean)}<small className="muted" style={{ fontSize: 12 }}> {tr("kg")}</small></div><div className="tiny muted"><Term id="massaMagra">{tr("Massa magra")}</Term></div></div>
            <div><div className="bold num" style={{ fontSize: 22 }}>{fmtKg(comp.fat)}<small className="muted" style={{ fontSize: 12 }}> {tr("kg")}</small></div><div className="tiny muted">{tr("Gordura")}</div></div>
            <div><div className="bold num" style={{ fontSize: 22 }}>{fmtKg(comp.ffmi)}</div><div className="tiny muted"><Term id="ffmi">{tr("FFMI")}</Term></div></div>
          </div>
          {/* barra massa magra × gordura */}
          <div>
            <div style={{ display: "flex", height: 12, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ width: `${100 - comp.bodyFat}%`, background: "var(--blue)" }} />
              <div style={{ width: `${comp.bodyFat}%`, background: "var(--amber)" }} />
            </div>
            <div className="row between tiny muted" style={{ marginTop: 4, gap: 8 }}><span>{tr("Magra")} {fmtKg(Math.round((100 - comp.bodyFat) * 10) / 10)}%</span><span style={{ textAlign: "right" }}>{tr("Gordura")} {fmtKg(comp.bodyFat)}% · {tr(bodyFatLabel(comp.bodyFat, sex))}</span></div>
          </div>
          <div className="group">
            <div className="item"><div className="grow"><div className="t"><Term id="ffmi">{tr("FFMI normalizado")}</Term></div><div className="s">{tr("Quanto músculo você tem para a sua altura")}</div></div><span className="tag ok">{tr(ffmiLabel(comp.ffmi, sex))}</span></div>
            {whtr != null && <div className="item"><div className="grow"><div className="t">{tr("Cintura ÷ altura ·")} {fmtKg(whtr)}</div><div className="s">{tr("Gordura abdominal e risco (meta abaixo de 0,5)")}</div></div><span className={`tag ${whtr < 0.5 ? "ok" : "warn"}`}>{tr(waistToHeightLabel(whtr))}</span></div>}
            {imc != null && <div className="item"><div className="grow"><div className="t"><Term id="imc">{tr("IMC ·")} {fmtKg(imc)}</Term></div><div className="s">{tr("Não separa músculo de gordura — só referência")}</div></div><span className="tag">{tr(bmiLabel(imc))}</span></div>}
          </div>
          {series.length >= 2 && (
            <div>
              <div className="small bold" style={{ marginBottom: 4 }}>{tr("Massa magra ao longo do tempo")}</div>
              <LineChart points={series.map((c) => ({ x: fmtShort(c.date), y: c.lean }))} unit=" kg" height={120} />
              <div className="tiny dim">{tr("Um ponto a cada vez que você mede a cintura/pescoço ou o % de gordura.")}</div>
            </div>
          )}
          <div className="tiny dim">
            {comp.source === "medido" ? tr("Usando seu % de gordura medido.") : <Term id="rfm">{comp.source === "marinha" ? tr("% estimado pela fórmula da Marinha ({0} + altura).", sex === "f" ? tr("pescoço + cintura + quadril") : tr("pescoço + cintura")) : tr("% estimado pela RFM (cintura + altura). Registre o pescoço para usar a fórmula da Marinha, mais precisa.")}</Term>}
            {other?.v != null && tr(" Conferência {0}: {1}%.", other.name, fmtKg(other.v))}
            {comp.source !== "medido" && tr(" Erro típico ±3–4 pontos: acompanhe a tendência, não o número exato.")}
            {!sexSet && <> {tr("Fórmulas para homens —")} <a href={href("ajustes", "perfil")}>{tr("mudar em Ajustes")}</a>.</>}
          </div>
        </div>
      ) : (
        <div className="card stack">
          <div className="small">{tr("Para separar músculo de gordura, falta:")} <b>{missing.join(", ") || tr("um registro de peso (até 14 dias da medida)")}</b>.</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {!waist && <button className="btn sm tonal" onClick={() => onAdd("cintura")}>{tr("+ Cintura")}</button>}
            {!neck && <button className="btn sm tonal" onClick={() => onAdd("pescoco")}>{tr("+ Pescoço")}</button>}
            {!heightCm && <a className="btn sm tonal" href={href("ajustes", "perfil")}>{tr("Informar altura")}</a>}
            <button className="btn sm" onClick={() => onAdd("gordura")}>{tr("Tenho meu % de gordura")}</button>
          </div>
          {imc != null && <div className="tiny dim">{tr("IMC")} {fmtKg(imc)} ({tr(bmiLabel(imc))}{tr(") — sozinho, não diz se o peso é músculo ou gordura.")}</div>}
        </div>
      )}

      <Sheet open={why} onClose={() => setWhy(false)}>
        <div className="stack">
          <div className="title-md">{tr("Como o app calcula")}</div>
          <p className="small" style={{ margin: 0 }}>{tr("O IMC é só")} <b>{tr("peso ÷ altura²")}</b>{tr(". Ele não sabe se o peso é músculo ou gordura — e músculo é mais denso. Por isso quem faz musculação costuma cair em “sobrepeso” mesmo estando magro. Aqui ele aparece só como referência.")}</p>
          <div className="group">
            <div className="item"><div className="grow"><div className="t">{tr("% de gordura")}</div><div className="s">{tr("Quanto do seu peso é gordura. Em boa forma: homens ~14–17%, mulheres ~21–24%. Ordem de preferência: 1) o seu %")} <b>{tr("medido")}</b> {tr("(bioimpedância/dobras), se tiver até 30 dias; 2) a fórmula da")} <b>{tr("Marinha americana")}</b> {tr("— pescoço + cintura (+ quadril, para mulheres) + altura; 3) a")} <b>{tr("RFM")}</b> {tr("(massa gorda relativa, validada contra DXA) — só cintura + altura, quando falta o pescoço.")}</div></div></div>
            <div className="item"><div className="grow"><div className="t">{tr("Massa magra e FFMI")}</div><div className="s">{tr("Massa magra = peso × (1 − % de gordura), com o peso mais perto do dia da medida. FFMI = massa magra ÷ altura², normalizado para 1,80 m: homens 18–20 é a média, 22–23 excelente, acima de 25 é raro sem anabolizantes (mulheres ~3 pontos abaixo).")}</div></div></div>
            <div className="item"><div className="grow"><div className="t">{tr("Cintura ÷ altura")}</div><div className="s">{tr("O indicador simples que melhor se relaciona com gordura abdominal e risco cardiometabólico. Meta: abaixo de 0,5 (cintura menor que metade da altura).")}</div></div></div>
          </div>
          <p className="tiny dim" style={{ margin: 0 }}>{tr("Para acompanhar: pese-se no mesmo horário e meça cintura e pescoço a cada 2–4 semanas, sempre do mesmo jeito. A massa magra subindo com a cintura estável é o sinal de que o peso extra é músculo.")}</p>
        </div>
      </Sheet>
    </>
  );
}

function PhotosPreview() {
  const photos = usePhotos();
  if (!photos) return null;
  const last = photos[0]?.date;
  const latest = photos.filter((p) => p.date === last);
  return (
    <>
      <Section title={tr("Fotos de progresso")} action={<a href={href("corpo", "fotos")}>{photos.length ? tr("Ver e comparar") : tr("Adicionar")}</a>} />
      <a className="card tap" href={href("corpo", "fotos")} style={{ padding: latest.length ? 10 : 16 }}>
        {latest.length ? (
          <>
            <div className="grid-3">{latest.map((p) => <PhotoImg key={p.id} blob={p.thumb} alt={p.pose} style={{ aspectRatio: "3 / 4", borderRadius: 12 }} />)}</div>
            <div className="tiny muted" style={{ marginTop: 8 }}>{tr("Últimas:")} {fmtShort(last!)} · {photos.length} {tr("fotos no total")}</div>
          </>
        ) : (
          <div className="row"><span className="ico"><Icon name="body" size={18} /></span><div className="grow small">{tr("Frente, lado e costas a cada 2–4 semanas mostram o que a balança não mostra.")}</div><Icon name="chevron" size={16} /></div>
        )}
      </a>
    </>
  );
}
