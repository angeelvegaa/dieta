/* Aviso puntual (toast) al cruzar el umbral de 80% de cumplimiento del mes.
   No es un indicador permanente: solo notifica el momento del cruce.

   Con menos de MIN_REGISTROS registros en el mes (comidas marcadas + extras)
   el % es demasiado volátil: no se evalúa el cruce ni se compara nada. A
   partir del registro nº 5 empieza a comparar y a guardar el último % conocido.

   El último % se guarda en dieta:ultimoPctConocido junto con el mes al que
   corresponde. El cruce se detecta comparando el % recién recalculado con ese
   valor; después se actualiza siempre, haya avisado o no. Así no se repite el
   aviso al abrir la app ni al marcar algo si se sigue en la misma franja. */

import { monthKey } from "../state.js";
import { load, save } from "../storage.js";
import { toast } from "../toast.js";

const KEY = "dieta:ultimoPctConocido";
const UMBRAL = 80;
const MIN_REGISTROS = 5;

async function readPrev(){
  const stored = await load(KEY);
  if (stored && stored.month === monthKey() && typeof stored.pct === "number") return stored.pct;
  return null;
}

async function store(pct){
  await save(KEY, { month: monthKey(), pct: (typeof pct === "number") ? pct : null });
}

/* Se llama tras marcar/desmarcar algo. Avisa solo si el % cruza el 80%,
   y solo cuando ya hay al menos MIN_REGISTROS registros en el mes. */
export async function checkPctCrossing(pct, logged){
  if (!(logged >= MIN_REGISTROS)) return; // aún no se evalúa el cruce

  const prev = await readPrev();
  if (prev !== null && typeof pct === "number"){
    if (prev < UMBRAL && pct >= UMBRAL){
      toast("¡Por encima del 80%! Sigue así.");
    } else if (prev >= UMBRAL && pct < UMBRAL){
      toast("Has bajado del 80% este mes, vigila los próximos días.");
    }
  }
  await store(pct);
}

/* Reajusta el valor guardado sin avisar. Para cambios en bloque (importar,
   cambiar comidas, borrar el mes) o para fijar la línea base al arrancar.
   Por debajo de MIN_REGISTROS deja el valor como "sin base fiable". */
export async function syncPctBaseline(pct, logged){
  await store((logged >= MIN_REGISTROS) ? pct : null);
}
