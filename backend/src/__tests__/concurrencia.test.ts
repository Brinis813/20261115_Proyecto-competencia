import fs from 'fs';

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-key-at-least-32-chars!',
    JWT_EXPIRES_IN: '4h',
    CORS_ORIGIN: '*',
    TRUST_PROXY: '0',
  },
  corsOrigins: '*',
  isProduction: false,
  UPLOADS_DIR: '/tmp/test-uploads-tx',
}));

const txMock = jest.fn(async (cb: any) => cb({ tx: true }));

jest.mock('../config/database', () => ({
  sequelize: { transaction: (cb: any) => txMock(cb) },
}));

jest.mock('sequelize', () => ({
  Op: { in: Symbol('Op.in'), or: Symbol('Op.or'), ne: Symbol('Op.ne') },
}));

jest.mock('../models', () => ({
  __esModule: true,
  Competencia: { findByPk: jest.fn() },
  Arranque: { create: jest.fn(), findAll: jest.fn().mockResolvedValue([]), destroy: jest.fn() },
  Wod: {},
  Asignacion: {},
  Usuario: {},
  Participante: {},
  Resultado: {},
  Categoria: {},
  CompetenciaCategoria: {},
  EventoUsuario: {},
}));

jest.mock('../models/Competencia', () => ({
  COMPETENCIA_TIEBREAK_POLICIES: ['NONE', 'TIEBREAK_MARK', 'DESIGNATED_CIRCUIT_SPLIT'],
}));

jest.mock('../sockets/handlers', () => ({ broadcastLeaderboard: jest.fn() }));

/* ------------------------------------------------------------------ */

import { programarArranque } from '../services/arranqueService';
import { actualizarImagenCompetencia } from '../services/competenciaService';
import { Competencia, Arranque } from '../models';

const COMP = { id: 7, evento_id: 1, duracion_minutos: 20, rondas: 3 };

beforeEach(() => {
  jest.clearAllMocks();
  (Competencia as any).findByPk.mockResolvedValue(COMP);
  (Arranque as any).findAll.mockResolvedValue([]);
  (Arranque as any).create.mockImplementation(async (vals: any) => ({ ...vals, id: 99 }));
});

describe('programarArranque serializado', () => {
  it('directo calcula t0 futuro y corre create+poda en una tx', async () => {
    const snap = await programarArranque(7, { modo: 'directo' }, 1);
    expect(snap.estado).toBe('en_curso');
    expect(snap.startTimeServer).toBeGreaterThan(Date.now());
    expect(txMock).toHaveBeenCalledTimes(1);
    expect((Arranque as any).create).toHaveBeenCalledWith(
      expect.objectContaining({ competencia_id: 7, estado: 'en_curso' }),
      expect.objectContaining({ transaction: expect.anything() }),
    );
  });

  it('doble armar concurrente: cada uno crea+poda dentro de su tx (sin poda a medias)', async () => {
    (Arranque as any).create
      .mockResolvedValueOnce({
        id: 101,
        competencia_id: 7,
        modo: 'directo',
        estado: 'en_curso',
        t0_ms: 1,
        pausa_acumulada_ms: 0,
        rondas: 3,
        countdown_seg: null,
        programado_para_ms: null,
        duracion_minutos: 20,
        version: 1,
        evento_id: 1,
      })
      .mockResolvedValueOnce({
        id: 102,
        competencia_id: 7,
        modo: 'directo',
        estado: 'en_curso',
        t0_ms: 2,
        pausa_acumulada_ms: 0,
        rondas: 3,
        countdown_seg: null,
        programado_para_ms: null,
        duracion_minutos: 20,
        version: 1,
        evento_id: 1,
      });
    const [a, b] = await Promise.all([
      programarArranque(7, { modo: 'directo' }, 1),
      programarArranque(7, { modo: 'directo' }, 2),
    ]);
    expect(a.estado).toBe('en_curso');
    expect(b.estado).toBe('en_curso');
    expect(txMock).toHaveBeenCalledTimes(2);
    for (const call of (Arranque as any).create.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ transaction: expect.anything() }));
    }
  });

  it('programado con menos de 30 s lanza antes de tocar la DB', async () => {
    await expect(
      programarArranque(7, { modo: 'programado', programadoParaMs: Date.now() + 1000 }, 1),
    ).rejects.toThrow(/30 segundos/);
    expect(txMock).not.toHaveBeenCalled();
  });
});

describe('portada en transacción', () => {
  const DIR = '/tmp/test-uploads-tx/competencias';

  beforeEach(() => {
    fs.mkdirSync(DIR, { recursive: true });
  });

  it('reemplaza y borra solo la URL desplazada', async () => {
    fs.writeFileSync(`${DIR}/old.jpg`, 'vieja');
    (Competencia as any).findByPk.mockResolvedValue({
      id: 7,
      imagen_url: '/api/uploads/competencias/old.jpg',
      update: jest.fn().mockResolvedValue(true),
    });
    const res = await actualizarImagenCompetencia(7, '/api/uploads/competencias/new.jpg');
    expect(res.imagen_url).toBe('/api/uploads/competencias/new.jpg');
    expect(txMock).toHaveBeenCalled();
    // El borrado del archivo es fire-and-forget: ceder el hilo antes de afirmar.
    await new Promise((resolve) => setImmediate(resolve));
    expect(fs.existsSync(`${DIR}/old.jpg`)).toBe(false);
  });

  it('URL inválida lanza sin tocar la DB', async () => {
    await expect(actualizarImagenCompetencia(7, 'http://evil/x.jpg')).rejects.toThrow(/invalida/i);
    expect((Competencia as any).findByPk).not.toHaveBeenCalled();
  });

  it('quitar (null) deja imagen_url en null', async () => {
    (Competencia as any).findByPk.mockResolvedValue({
      id: 7,
      imagen_url: null,
      update: jest.fn().mockResolvedValue(true),
    });
    const res = await actualizarImagenCompetencia(7, null);
    expect(res.imagen_url).toBeNull();
  });
});
