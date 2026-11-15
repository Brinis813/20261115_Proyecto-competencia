import { create } from 'zustand';
import type { LeaderboardData, LeaderboardEntry, LeaderboardWod, CompetenciaTieBreakPolicy } from '../types';

/**
 * Estado de la clasificacion en vivo.
 *
 * Vive en un store de Zustand (el equivalente a Pinia en React) y no dentro de
 * un componente porque:
 *  - la actualizacion llega por WebSocket, fuera del ciclo de render;
 *  - la consumen varias vistas a la vez (pantalla publica, panel del juez);
 *  - hay que comparar cada actualizacion con la anterior para saber quien
 *    subio o bajo de puesto, y eso exige recordar el estado previo.
 */

export type Movimiento = 'sube' | 'baja' | 'nuevo' | 'igual';

export interface EntradaConMovimiento extends LeaderboardEntry {
  movimiento: Movimiento;
  /** Puestos ganados o perdidos desde la actualizacion anterior. */
  delta: number;
}

interface LeaderboardState {
  competenciaId: number | null;
  entradas: EntradaConMovimiento[];
  wods: LeaderboardWod[];
  competenciaNombre: string | null;
  competenciaDivisiones: string[] | null;
  /** Política de desempate aplicada por el servidor en esta competencia. */
  competenciaTiebreak: CompetenciaTieBreakPolicy | null;
  cargando: boolean;
  error: string | null;
  /** Marca de tiempo del ultimo dato recibido, para el indicador "en vivo". */
  actualizadoEn: number | null;
  /** Ids que acaban de cambiar; la tabla los resalta durante un instante. */
  resaltados: Set<number>;

  iniciar: (competenciaId: number) => void;
  aplicarDatos: (data: LeaderboardData) => void;
  setCargando: (cargando: boolean) => void;
  setError: (error: string | null) => void;
  limpiarResaltados: () => void;
  reset: () => void;
}

function calcularMovimiento(puestoAnterior: number | undefined, puestoNuevo: number): {
  movimiento: Movimiento;
  delta: number;
} {
  if (puestoAnterior === undefined) return { movimiento: 'nuevo', delta: 0 };
  if (puestoAnterior === puestoNuevo) return { movimiento: 'igual', delta: 0 };
  return {
    movimiento: puestoAnterior > puestoNuevo ? 'sube' : 'baja',
    delta: Math.abs(puestoAnterior - puestoNuevo),
  };
}

const estadoInicial = {
  competenciaId: null,
  entradas: [] as EntradaConMovimiento[],
  wods: [] as LeaderboardWod[],
  competenciaNombre: null,
  competenciaDivisiones: null,
  competenciaTiebreak: null,
  cargando: false,
  error: null,
  actualizadoEn: null,
  resaltados: new Set<number>(),
};

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  ...estadoInicial,

  iniciar: (competenciaId) => {
    // Al cambiar de Competencia se descarta todo: mezclar clasificaciones de dos Competencias
    // produciria movimientos falsos.
    if (get().competenciaId !== competenciaId) {
      set({ ...estadoInicial, resaltados: new Set(), competenciaId, cargando: true });
    }
  },

  aplicarDatos: (data) => {
    const anteriores = new Map(get().entradas.map((e) => [e.participante_id, e]));

    const resaltados = new Set<number>();
    const entradas: EntradaConMovimiento[] = (data.leaderboard ?? []).map((entrada: LeaderboardEntry) => {
      const anterior = anteriores.get(entrada.participante_id);
      const { movimiento, delta } = calcularMovimiento(anterior?.puesto, entrada.puesto);

      // Se resalta tanto el cambio de puesto como el de puntos: un atleta puede
      // sumar puntos sin moverse y aun asi merece feedback visual.
      if (anterior && (movimiento === 'sube' || movimiento === 'baja' || anterior.puntos_total !== entrada.puntos_total)) {
        resaltados.add(entrada.participante_id);
      }

      return { ...entrada, movimiento, delta };
    });

    set({
      entradas,
      wods: data.wods ?? [],
      competenciaNombre: data.competencia?.nombre ?? get().competenciaNombre,
      competenciaDivisiones: data.competencia?.divisiones ?? get().competenciaDivisiones,
      competenciaTiebreak: data.competencia?.tiebreakPolicy ?? get().competenciaTiebreak,
      cargando: false,
      error: null,
      actualizadoEn: Date.now(),
      resaltados,
    });
  },

  setCargando: (cargando) => set({ cargando }),
  setError: (error) => set({ error, cargando: false }),
  limpiarResaltados: () => set({ resaltados: new Set() }),
  reset: () => set({ ...estadoInicial, resaltados: new Set() }),
}));
