import type { CompetenciaTieBreakPolicy } from '../../models';
import type { FilaPuntuada, ResultadoEntrada, TipoMedicion } from './types';
import {
  parsearValor,
  parsearNumero,
  menorEsMejor,
  obtenerTiempoTotalDeSplits,
  obtenerTiempoDesempateDeSplits,
} from './parse';

/**
 * Ordena por valor y asigna posicion absoluta a partir de `rangoBase` atletas
 * ya clasificados por encima. Con politica estandar o TIEBREAK_MARK, ante igual
 * valor el `desempate` del resultado (menor es mejor: lo que el juez registró
 * como marca de desempate) rompe el empate; solo comparten posicion cuando
 * valor y desempate coinciden. Con politica NONE el desempate se ignora:
 * igual valor = mismo puesto y mismos puntos.
 * Los puntos son `puntaje_maximo - (posicion - 1)`, con minimo 0.
 */
function rankear(
  filas: Array<{
    participante_id: number;
    resultado_id: number;
    valor_bruto: string;
    valor: number;
    desempate: number | null;
  }>,
  ascendente: boolean,
  rangoBase: number,
  puntajeMaximo: number,
  capado: boolean,
  ignorarDesempate = false,
): FilaPuntuada[] {
  const CASI_INFINITO = Number.MAX_SAFE_INTEGER;
  filas.sort((a, b) => {
    if (a.valor !== b.valor) return ascendente ? a.valor - b.valor : b.valor - a.valor;
    if (ignorarDesempate) return 0;
    // Igual valor: gana el menor desempate (los que no tienen quedan al final).
    return (a.desempate ?? CASI_INFINITO) - (b.desempate ?? CASI_INFINITO);
  });

  const salida: FilaPuntuada[] = [];
  let posicion = rangoBase;
  let claveAnterior: string | null = null;

  filas.forEach((fila, indice) => {
    const clave = ignorarDesempate ? `${fila.valor}` : `${fila.valor}|${fila.desempate ?? ''}`;
    if (claveAnterior === null || clave !== claveAnterior) {
      posicion = rangoBase + indice + 1;
      claveAnterior = clave;
    }
    salida.push({
      participante_id: fila.participante_id,
      resultado_id: fila.resultado_id,
      valor: fila.valor,
      abandono: false,
      capado,
      valor_bruto: fila.valor_bruto,
      posicion,
      puntos: Math.max(0, puntajeMaximo - (posicion - 1)),
    });
  });

  return salida;
}

/**
 * Ordena y puntua los resultados de un único WOD, en cuatro niveles:
 *
 *  1. Finalizadores: quienes completaron la prueba. Se ordenan por su valor
 *     (menor tiempo, o mayor en reps/peso/distancia). Reciben los mejores puntos.
 *  2. Capados (solo en wods de tiempo con tope): no terminaron antes del
 *     tope, asi que se ordenan por las repeticiones hechas (mas es mejor) y
 *     quedan SIEMPRE por detras de todos los finalizadores. Convencion Hyrox/
 *     CrossFit "cap + reps".
 *  3. Abandonos (DNF por lesion/salud): al final, 0 puntos.
 *  4. Descalificados (DSQ por incumplimiento de reglas): al final, 0 puntos.
 *
 * Exportado para poder probarlo de forma aislada.
 */
export function puntuarWod(
  resultados: ResultadoEntrada[],
  tipoMedicion: TipoMedicion,
  puntajeMaximo: number,
  policy: CompetenciaTieBreakPolicy = 'DESIGNATED_CIRCUIT_SPLIT',
): FilaPuntuada[] {
  const esTiempo = tipoMedicion === 'tiempo';
  const esSplits = tipoMedicion === 'time_trial_splits';
  // NONE ignora el campo `desempate` al agrupar: misma marca, mismo puesto.
  const sinDesempate = policy === 'NONE';

  const abandonos = resultados.filter((r) => r.abandono && !r.disqualificado);
  const disqualificados = resultados.filter((r) => r.disqualificado);
  // El "capado" solo tiene sentido en pruebas de tiempo con tope; en el resto
  // se ignora la marca y el resultado se trata como un finalizador normal.
  // Para time_trial_splits, no hay capados (es una prueba de etapas, no con tope).
  const capados = esTiempo
    ? resultados.filter((r) => !r.abandono && !r.disqualificado && r.capado)
    : [];
  const finalizadores = resultados.filter(
    (r) => !r.abandono && !r.disqualificado && !(esTiempo && r.capado),
  );

  // Nivel 1: finalizadores por su valor.
  const filasFin = rankear(
    finalizadores.map((r) => {
      let valor: number;
      let desempate: number | null = r.desempate ?? null;

      if (esSplits && r.detalle?.splits && r.detalle.splits.length > 0) {
        // Para time_trial_splits: valor = tiempo total (ultimo split acumulado)
        valor = obtenerTiempoTotalDeSplits(r.detalle.splits);
        // Desempate: segmento mas rapido
        if (!desempate) {
          desempate = obtenerTiempoDesempateDeSplits(r.detalle.splits);
        }
      } else if (esSplits) {
        // Sin splits validos, mandarlos al final
        valor = Number.MAX_SAFE_INTEGER;
      } else {
        valor = parsearValor(r.valor_bruto, tipoMedicion);
      }

      return {
        participante_id: r.participante_id,
        resultado_id: r.resultado_id ?? 0,
        valor_bruto: r.valor_bruto,
        valor,
        desempate,
      };
    }),
    menorEsMejor(tipoMedicion),
    0,
    puntajeMaximo,
    false,
    sinDesempate,
  );

  // Nivel 2: capados por reps hechas (mayor es mejor), detras de los finalizadores.
  const filasCap = rankear(
    capados.map((r) => ({
      participante_id: r.participante_id,
      resultado_id: r.resultado_id ?? 0,
      valor_bruto: r.valor_bruto,
      valor: parsearNumero(r.valor_bruto),
      desempate: r.desempate ?? null,
    })),
    false,
    filasFin.length,
    puntajeMaximo,
    true,
    sinDesempate,
  );

  // Nivel 3: abandonos, comparten la ultima posicion, 0 puntos.
  const posicionDNF = filasFin.length + filasCap.length + 1;
  const filasDNF: FilaPuntuada[] = abandonos.map((r) => ({
    participante_id: r.participante_id,
    resultado_id: r.resultado_id ?? 0,
    valor: Number.MAX_SAFE_INTEGER,
    abandono: true,
    capado: false,
    valor_bruto: r.valor_bruto,
    posicion: posicionDNF,
    puntos: 0,
  }));

  // Nivel 4: descalificados, comparten la posicion de DNF, 0 puntos.
  const filasDSQ: FilaPuntuada[] = disqualificados.map((r) => ({
    participante_id: r.participante_id,
    resultado_id: r.resultado_id ?? 0,
    valor: Number.MAX_SAFE_INTEGER,
    abandono: false,
    capado: false,
    valor_bruto: r.valor_bruto,
    posicion: posicionDNF,
    puntos: 0,
  }));

  return [...filasFin, ...filasCap, ...filasDNF, ...filasDSQ];
}
