/**
 * Anotações do Feedback do app que já viraram melhoria. O Claude lê as anotações no servidor (tabela `feedback`)
 * no começo de cada sessão; quando uma entra numa versão, ganha uma linha aqui. No app ela sai da lista de pendentes
 * e vai para "Resolvidas" (com a versão). `inicio` = começo do texto da anotação (sem diferenciar maiúsculas/acentos).
 */
export interface FeedbackDone { inicio: string; versao: string; o_que: string }

export const FEEDBACK_DONE: FeedbackDone[] = [
  { inicio: "Seria interessante enquanto está com o treino ativado", versao: "1.4.0", o_que: "Treino na barra de notificações (séries, início e fim do descanso, vibra no fim)" },
  { inicio: "Nas séries de superset, os exercícios ficam em telas separadas", versao: "1.4.0", o_que: "Superset numa tela só" },
  { inicio: "Vc tirou essa função mas agora q eu tô treinando", versao: "1.4.0", o_que: "Trocar exercício com parecidos (aparelho ocupado)" },
  { inicio: "Outro ponto de melhoria, semana passada eu estava em deload", versao: "1.4.0", o_que: "Semana exata no dia de treino (deload incluído) e ícone novo" },
];
