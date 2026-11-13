/** Termos do app explicados em uma frase ou duas (tocar no termo abre; Ajustes → Termos lista todos). */
export interface Term { title: string; text: string }

export const GLOSSARY: Record<string, { pt: Term; en: Term }> = {
  rir: {
    pt: { title: "RIR — repetições na reserva", text: "Quantas repetições ainda daria para fazer quando você para a série. RIR 2 = parou com 2 sobrando; RIR 0 = não sairia mais nenhuma. Serve para treinar perto do limite sem ir à falha toda vez." },
    en: { title: "RIR — reps in reserve", text: "How many more reps you could still do when you stop the set. RIR 2 = stopped with 2 left; RIR 0 = not one more. It lets you train close to the limit without failing every set." },
  },
  e1rm: {
    pt: { title: "1RM estimado", text: "A carga máxima que você levantaria uma única vez, calculada a partir das séries feitas (carga × reps, contando o RIR). Não precisa testar o máximo: serve para comparar a força ao longo do tempo." },
    en: { title: "Estimated 1RM", text: "The most you could lift for a single rep, calculated from the sets you did (load × reps, counting RIR). No need to test a max: it is for comparing strength over time." },
  },
  volume: {
    pt: { title: "Volume", text: "Soma de carga × repetições das séries de trabalho (aquecimento, mobilidade e cardio ficam de fora). Por músculo, o app conta séries: músculo principal = 1, secundário = ½." },
    en: { title: "Volume", text: "Load × reps added up over the work sets (warm-up, mobility and cardio are left out). Per muscle, the app counts sets: main muscle = 1, secondary = ½." },
  },
  adesao: {
    pt: { title: "Adesão", text: "Quanto dos treinos planejados você fez no período. 100% = todos os dias do plano feitos." },
    en: { title: "Adherence", text: "How much of the planned training you did in the period. 100% = every planned day done." },
  },
  superset: {
    pt: { title: "Superset", text: "Dois ou mais exercícios feitos em sequência, sem descanso entre eles: uma série de cada (A1, A2…) e só depois descansa. Economiza tempo sem perder qualidade." },
    en: { title: "Superset", text: "Two or more exercises done back to back with no rest between them: one set of each (A1, A2…), then rest. Saves time without losing quality." },
  },
  massaMagra: {
    pt: { title: "Massa magra", text: "Tudo o que não é gordura: músculo, ossos, órgãos e água. Calculada como peso × (1 − % de gordura). Subir massa magra com o mesmo peso = trocar gordura por músculo." },
    en: { title: "Lean mass", text: "Everything that is not fat: muscle, bone, organs and water. Calculated as weight × (1 − body fat %). More lean mass at the same weight = trading fat for muscle." },
  },
  ffmi: {
    pt: { title: "FFMI", text: "Índice de massa magra: massa magra ÷ altura², ajustado para 1,80 m. Diz quanto músculo você tem para a sua altura. Homens: 18–20 média, 22–23 excelente (mulheres ~3 pontos abaixo)." },
    en: { title: "FFMI", text: "Fat-free mass index: lean mass ÷ height², adjusted to 1.80 m. It tells how much muscle you carry for your height. Men: 18–20 average, 22–23 excellent (women ~3 points lower)." },
  },
  imc: {
    pt: { title: "IMC", text: "Peso ÷ altura². Não separa músculo de gordura: quem treina costuma dar \"sobrepeso\" com pouca gordura. No app fica só como referência." },
    en: { title: "BMI", text: "Weight ÷ height². It cannot tell muscle from fat: people who lift often read \"overweight\" with little fat. The app shows it only as a reference." },
  },
  rfm: {
    pt: { title: "RFM e fórmula da Marinha", text: "Jeitos de estimar o % de gordura com fita métrica. Marinha americana: pescoço + cintura (+ quadril, mulheres) + altura. RFM: só cintura + altura, quando falta o pescoço. Medido (bioimpedância/dobras) vale mais, se tiver até 30 dias." },
    en: { title: "RFM and Navy formula", text: "Ways to estimate body fat % with a tape measure. US Navy: neck + waist (+ hips for women) + height. RFM: waist + height only, when the neck is missing. A measured value (bioimpedance/calipers) wins if it is under 30 days old." },
  },
};

export type TermId = keyof typeof GLOSSARY;
