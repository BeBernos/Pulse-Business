import base from "../data/library.json";
import extra from "../data/library-extra.json";
import type { Exercise } from "../db";

/**
 * Biblioteca do app: a do app da academia (`library.json`, gerada do Notion — não editar à mão)
 * + mobilidade/alongamento e cardio (`library-extra.json`, mantida aqui).
 */
export const LIBRARY = [...base, ...extra] as Exercise[];
