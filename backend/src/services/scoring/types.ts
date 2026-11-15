import type { CompetenciaTieBreakPolicy } from '../../models';
import type { DetalleMedicion } from '../../types/medicion';

export type TipoMedicion = 'tiempo' | 'repeticiones' | 'peso' | 'distancia' | 'calorías' | 'time_trial_splits';

export interface ResultadoWod {
  resultado_id: number;
  wod_id: number;
  orden: number;
  nombre_ejercicio: string;
  tipo_medicion: TipoMedicion;
  valor_bruto: string | null;
  puntos_calculados: number;
  posicion: number | null;
  abandono: boolean;
  capado: boolean;
}

export interface EntradaLeaderboard {
  participante_id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string | null;
  categoria: string | null;
  puesto: number;
  puntos_total: number;
  wods_completados: number;
  resultados: ResultadoWod[];
}

export interface LeaderboardResult {
  competencia: { id: number; nombre: string; descripcion?: string | null; divisiones: string[] | null; tiebreakPolicy: CompetenciaTieBreakPolicy } | null;
  leaderboard: Array<EntradaLeaderboard & { comparte_puesto: boolean }>;
  wods: Array<{ id: number; orden: number; nombre_ejercicio: string; tipo_medicion: TipoMedicion; unidad_distancia: string; imagen_url: string | null; tiempo_cap: number | null; esquema: unknown; puntaje_maximo: number }>;
  actualizado: string;
}

export interface FilaPuntuada {
  participante_id: number;
  resultado_id: number;
  valor: number;
  abandono: boolean;
  capado: boolean;
  valor_bruto: string;
  posicion: number;
  puntos: number;
}

export interface ResultadoEntrada {
  participante_id: number;
  resultado_id?: number;
  valor_bruto: string;
  abandono: boolean;
  capado?: boolean;
  disqualificado?: boolean;
  /** Criterio de desempate (menor es mejor); separa empates de valor. */
  desempate?: number | null;
  /** Detalle de medición (incluye splits para time_trial_splits). */
  detalle?: DetalleMedicion | null;
}
