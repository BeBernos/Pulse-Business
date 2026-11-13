import type { BodySide } from "../components/BodyFigure";
import type { MuscleId } from "./muscles";

/** Grupamentos da biblioteca (nomes do Notion) → músculos destacados no boneco e lado da figura. */
export const GROUPS: { name: string; muscles: MuscleId[]; side: BodySide }[] = [
  { name: "Peito", muscles: ["peito_sup", "peito"], side: "front" },
  { name: "Costas", muscles: ["dorsal", "costas_media", "trapezio_sup", "lombar"], side: "back" },
  { name: "Ombros", muscles: ["delt_ant", "delt_lat", "delt_post"], side: "front" },
  { name: "Bíceps", muscles: ["biceps", "braquial"], side: "front" },
  { name: "Tríceps", muscles: ["triceps"], side: "back" },
  { name: "Antebraço", muscles: ["antebraco"], side: "front" },
  { name: "Pernas", muscles: ["quadriceps", "adutores", "gastrocnemio", "soleo"], side: "front" },
  { name: "Glúteos", muscles: ["gluteo", "gluteo_medio", "posterior"], side: "back" },
  { name: "Core", muscles: ["abdomen", "obliquos"], side: "front" },
  { name: "Mobilidade", muscles: ["posterior", "lombar", "manguito"], side: "back" },
  { name: "Cardio", muscles: ["quadriceps", "gluteo", "gastrocnemio"], side: "front" },
  { name: "Pilates", muscles: ["abdomen", "obliquos", "gluteo_medio"], side: "front" },
  { name: "Funcional", muscles: ["quadriceps", "gluteo", "abdomen", "delt_ant"], side: "front" },
];

/** Ordem dos grupos para quem treina Pilates/funcional (ajuste "Tipo de treino"): esses vêm primeiro. */
export function groupsFor(focus: "strength" | "pilates" | null | undefined) {
  if (focus !== "pilates") return GROUPS;
  const first = ["Pilates", "Funcional", "Mobilidade"];
  return [...first.map((n) => GROUPS.find((g) => g.name === n)!), ...GROUPS.filter((g) => !first.includes(g.name))];
}

export const EQUIPMENT = ["Barra", "Halter", "Máquina", "Cabo", "Smith", "Peso Corporal", "Elástico", "Colchonete", "Reformer", "Cadillac", "Chair", "Kettlebell", "Medicine Ball", "Caixa", "Corda Naval", "TRX"];
export const PATTERNS = [
  "Press Horizontal",
  "Press Inclinado",
  "Press Vertical",
  "Puxada Horizontal",
  "Puxada Vertical",
  "Agachamento",
  "Hinge",
  "Unilateral Perna",
  "Isolador",
  "Core",
  "Aquecimento",
  "Mobilidade",
  "Alongamento",
  "Cardio",
  "Pilates",
  "Funcional",
];

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
