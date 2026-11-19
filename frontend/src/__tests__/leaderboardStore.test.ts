import { describe, it, expect, beforeEach } from 'vitest';
import { useLeaderboardStore } from '../stores/leaderboardStore';
import type { LeaderboardData } from '../types';

function datos(
  entradas: Array<{ participante_id: number; puesto: number; puntos_total: number }>,
): LeaderboardData {
  return {
    competencia: { id: 1, nombre: 'Evento', divisiones: ['RX'], tiebreakPolicy: 'NONE' },
    wods: [
      {
        id: 10,
        nombre_ejercicio: 'Fran',
        tipo_medicion: 'tiempo',
        orden: 1,
        puntaje_maximo: 100,
      } as never,
    ],
    leaderboard: entradas.map((e) => ({
      participante_id: e.participante_id,
      nombre: 'A',
      apellidos: 'B',
      puesto: e.puesto,
      puntos_total: e.puntos_total,
      resultados: [],
    })) as never,
  } as unknown as LeaderboardData;
}

beforeEach(() => {
  useLeaderboardStore.getState().reset();
});

describe('leaderboardStore', () => {
  it('iniciar fija competencia y modo cargando, y no resetea si es la misma', () => {
    const s = useLeaderboardStore.getState();
    s.iniciar(5);
    expect(useLeaderboardStore.getState().competenciaId).toBe(5);
    expect(useLeaderboardStore.getState().cargando).toBe(true);

    useLeaderboardStore.getState().setCargando(false);
    useLeaderboardStore.getState().iniciar(5);
    expect(useLeaderboardStore.getState().cargando).toBe(false);

    // Cambiar de competencia descarta entradas previas
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 100 }]));
    expect(useLeaderboardStore.getState().entradas).toHaveLength(1);
    useLeaderboardStore.getState().iniciar(9);
    expect(useLeaderboardStore.getState().entradas).toHaveLength(0);
    expect(useLeaderboardStore.getState().competenciaId).toBe(9);
  });

  it('marca entradas nuevas como "nuevo"', () => {
    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 100 }]));
    const e = useLeaderboardStore.getState().entradas[0];
    expect(e.movimiento).toBe('nuevo');
    expect(e.delta).toBe(0);
  });

  it('detecta subida y bajada de puestos con delta', () => {
    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore.getState().aplicarDatos(
      datos([
        { participante_id: 1, puesto: 2, puntos_total: 90 },
        { participante_id: 2, puesto: 1, puntos_total: 100 },
      ]),
    );
    useLeaderboardStore.getState().aplicarDatos(
      datos([
        { participante_id: 1, puesto: 1, puntos_total: 100 },
        { participante_id: 2, puesto: 2, puntos_total: 90 },
      ]),
    );
    const porId = new Map(
      useLeaderboardStore.getState().entradas.map((e) => [e.participante_id, e]),
    );
    expect(porId.get(1)?.movimiento).toBe('sube');
    expect(porId.get(1)?.delta).toBe(1);
    expect(porId.get(2)?.movimiento).toBe('baja');
    expect(porId.get(2)?.delta).toBe(1);
    expect(useLeaderboardStore.getState().resaltados.has(1)).toBe(true);
    expect(useLeaderboardStore.getState().resaltados.has(2)).toBe(true);
  });

  it('marca "igual" sin resaltar si nada cambia', () => {
    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 50 }]));
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 50 }]));
    expect(useLeaderboardStore.getState().entradas[0].movimiento).toBe('igual');
    expect(useLeaderboardStore.getState().resaltados.size).toBe(0);
  });

  it('resalta cuando suben puntos sin cambiar de puesto', () => {
    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 50 }]));
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 80 }]));
    expect(useLeaderboardStore.getState().entradas[0].movimiento).toBe('igual');
    expect(useLeaderboardStore.getState().resaltados.has(1)).toBe(true);
  });

  it('guarda wods, nombre, divisiones, tiebreak y timestamp', () => {
    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 10 }]));
    const s = useLeaderboardStore.getState();
    expect(s.wods).toHaveLength(1);
    expect(s.competenciaNombre).toBe('Evento');
    expect(s.competenciaDivisiones).toEqual(['RX']);
    expect(s.competenciaTiebreak).toBe('NONE');
    expect(s.cargando).toBe(false);
    expect(s.error).toBeNull();
    expect(typeof s.actualizadoEn).toBe('number');
  });

  it('tolera payload sin leaderboard ni competencia', () => {
    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore.getState().aplicarDatos({} as unknown as LeaderboardData);
    expect(useLeaderboardStore.getState().entradas).toEqual([]);
    expect(useLeaderboardStore.getState().wods).toEqual([]);
  });

  it('setCargando, setError, limpiarResaltados y reset', () => {
    const s = useLeaderboardStore.getState();
    s.setCargando(true);
    expect(useLeaderboardStore.getState().cargando).toBe(true);
    s.setError('fallo');
    expect(useLeaderboardStore.getState().error).toBe('fallo');
    expect(useLeaderboardStore.getState().cargando).toBe(false);

    useLeaderboardStore.getState().iniciar(1);
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 2, puntos_total: 10 }]));
    useLeaderboardStore
      .getState()
      .aplicarDatos(datos([{ participante_id: 1, puesto: 1, puntos_total: 20 }]));
    expect(useLeaderboardStore.getState().resaltados.size).toBe(1);
    useLeaderboardStore.getState().limpiarResaltados();
    expect(useLeaderboardStore.getState().resaltados.size).toBe(0);

    useLeaderboardStore.getState().reset();
    const r = useLeaderboardStore.getState();
    expect(r.competenciaId).toBeNull();
    expect(r.entradas).toEqual([]);
    expect(r.resaltados.size).toBe(0);
  });
});
