jest.mock('../models', () => ({
  Evento: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
  },
  EventoUsuario: {
    findAll: jest.fn(),
  },
  Categoria: {
    findAll: jest.fn(),
  },
  Participante: {
    findAll: jest.fn(),
  },
  Competencia: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
  Box: {
    findAll: jest.fn(),
  },
  Usuario: {},
  Wod: {},
  CompetenciaCategoria: {},
  estadoDeEvento: jest.fn(() => 'en_curso' as const),
  SCORING_TYPES: ['POINTS_ACCUMULATION', 'WINNER_PER_Competencia'],
  EVENTO_TIEBREAK_POLICIES: [
    'NONE',
    'BEST_INDIVIDUAL_RANK',
    'DESIGNATED_TIEBREAK_Competencia',
    'LAST_Competencia_SCORE',
  ],
}));

jest.mock('../config/database', () => ({
  sequelize: {
    fn: jest.fn((_fn: string, col: string) => `FN(${col})`),
    col: jest.fn((c: string) => c),
    transaction: jest.fn((fn: any) => fn({})),
  },
}));

jest.mock('bcrypt', () => ({}));

import { listarEventos, eventoPublico, actualizarScoringType } from '../services/eventoService';
import { Evento, EventoUsuario, Competencia, Participante, Box } from '../models';
import { estadoDeEvento } from '../models';

const mockEvento = Evento as jest.Mocked<typeof Evento>;
const mockEventoUsuario = EventoUsuario as jest.Mocked<typeof EventoUsuario>;
const mockCompetencia = Competencia as jest.Mocked<typeof Competencia>;
const mockParticipante = Participante as jest.Mocked<typeof Participante>;
const mockBox = Box as jest.Mocked<typeof Box>;
const mockEstadoDeEvento = estadoDeEvento as jest.MockedFunction<typeof estadoDeEvento>;

beforeEach(() => jest.clearAllMocks());

describe('listarEventos', () => {
  it('retorna array vacío si no hay eventos', async () => {
    mockEventoUsuario.findAll.mockResolvedValue([]);
    mockEvento.findAll.mockResolvedValue([]);

    const result = await listarEventos({ id: 1 });

    expect(result).toEqual([]);
  });

  it('retorna eventos con conteos de competencias y atletas', async () => {
    mockEventoUsuario.findAll.mockResolvedValue([
      { evento_id: 1, rol: 'admin' },
    ] as any);
    mockEvento.findAll.mockResolvedValue([
      { id: 1, nombre: 'Evento Test', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02', box_id: null },
    ] as any);
    mockCompetencia.findAll.mockResolvedValue([
      { evento_id: 1, total: 3 },
    ] as any);
    mockParticipante.findAll.mockResolvedValue([
      { evento_id: 1, total: 12 },
    ] as any);
    mockBox.findAll.mockResolvedValue([]);

    const result = await listarEventos({ id: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('Evento Test');
    expect(result[0].total_competencias).toBe(3);
    expect(result[0].total_atletas).toBe(12);
  });

  it('superadmin ve todos los eventos sin necesitar membresía', async () => {
    mockEvento.findAll.mockResolvedValue([
      { id: 1, nombre: 'E1', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02', box_id: null },
      { id: 2, nombre: 'E2', fecha_inicio: '2026-02-01', fecha_fin: '2026-02-02', box_id: null },
    ] as any);
    mockEventoUsuario.findAll.mockResolvedValue([]);
    mockCompetencia.findAll.mockResolvedValue([]);
    mockParticipante.findAll.mockResolvedValue([]);
    mockBox.findAll.mockResolvedValue([]);

    const result = await listarEventos({ id: 1, es_superadmin: true });

    expect(result).toHaveLength(2);
  });

  it('admin ve eventos de su box', async () => {
    mockEvento.findAll.mockResolvedValue([
      { id: 1, nombre: 'Box Event', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02', box_id: 5 },
    ] as any);
    mockEventoUsuario.findAll.mockResolvedValue([]);
    mockCompetencia.findAll.mockResolvedValue([]);
    mockParticipante.findAll.mockResolvedValue([]);
    mockBox.findAll.mockResolvedValue([]);

    const result = await listarEventos({ id: 1, rol: 'admin', box_id: 5 });

    expect(result).toHaveLength(1);
  });
});

describe('eventoPublico', () => {
  it('retorna null si el evento no existe', async () => {
    mockEvento.findByPk.mockResolvedValue(null);

    const result = await eventoPublico(999);

    expect(result).toBeNull();
  });

  it('retorna datos públicos del evento', async () => {
    mockEvento.findByPk.mockResolvedValue({
      id: 1,
      nombre: 'Open 2026',
      descripcion: 'Competencia abierta',
      sede: 'Box Central',
      fecha_inicio: '2026-06-01',
      fecha_fin: '2026-06-02',
      es_demo: false,
      scoring_type: 'POINTS_ACCUMULATION',
      tiebreak_policy: 'BEST_INDIVIDUAL_RANK',
      tiebreak_competencia_id: null,
      imagen_url: '/img/evento.jpg',
    } as any);
    mockEstadoDeEvento.mockReturnValue('en_curso');

    const result = await eventoPublico(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.nombre).toBe('Open 2026');
    expect(result!.sede).toBe('Box Central');
    expect(result!.estado).toBe('en_curso');
    expect(result!.imagen_url).toBe('/img/evento.jpg');
  });
});

describe('actualizarScoringType', () => {
  it('lanza error si el evento no existe', async () => {
    mockEvento.findByPk.mockResolvedValue(null);

    await expect(
      actualizarScoringType(999, { scoringType: 'POINTS_ACCUMULATION' })
    ).rejects.toThrow('Evento no encontrada');
  });

  it('actualiza scoring_type correctamente', async () => {
    const updateMock = jest.fn();
    mockEvento.findByPk
      .mockResolvedValueOnce({
        id: 1,
        scoring_type: 'POINTS_ACCUMULATION',
        tiebreak_policy: 'BEST_INDIVIDUAL_RANK',
        update: updateMock,
      } as any)
      .mockResolvedValueOnce({
        id: 1,
        scoring_type: 'WINNER_PER_Competencia',
        tiebreak_policy: 'BEST_INDIVIDUAL_RANK',
        tiebreak_competencia_id: null,
      } as any);

    const result = await actualizarScoringType(1, {
      scoringType: 'WINNER_PER_Competencia',
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ scoring_type: 'WINNER_PER_Competencia' })
    );
    expect(result.scoring_type).toBe('WINNER_PER_Competencia');
  });

  it('lanza error con scoringType inválido', async () => {
    mockEvento.findByPk.mockResolvedValue({
      id: 1,
      scoring_type: 'POINTS_ACCUMULATION',
      tiebreak_policy: 'BEST_INDIVIDUAL_RANK',
    } as any);

    await expect(
      actualizarScoringType(1, { scoringType: 'INVALID' as any })
    ).rejects.toThrow('scoringType inválido');
  });

  it('actualiza tiebreak_policy correctamente', async () => {
    const updateMock = jest.fn();
    mockEvento.findByPk
      .mockResolvedValueOnce({
        id: 1,
        scoring_type: 'POINTS_ACCUMULATION',
        tiebreak_policy: 'BEST_INDIVIDUAL_RANK',
        update: updateMock,
      } as any)
      .mockResolvedValueOnce({
        id: 1,
        scoring_type: 'POINTS_ACCUMULATION',
        tiebreak_policy: 'NONE',
        tiebreak_competencia_id: null,
      } as any);

    const result = await actualizarScoringType(1, {
      tiebreakPolicy: 'NONE',
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ tiebreak_policy: 'NONE' })
    );
    expect(result.tiebreak_policy).toBe('NONE');
  });

  it('lanza error con tiebreakPolicy inválida', async () => {
    mockEvento.findByPk.mockResolvedValue({
      id: 1,
      scoring_type: 'POINTS_ACCUMULATION',
      tiebreak_policy: 'BEST_INDIVIDUAL_RANK',
    } as any);

    await expect(
      actualizarScoringType(1, { tiebreakPolicy: 'BOGUS' as any })
    ).rejects.toThrow('tiebreakPolicy inválida');
  });

  it('limpia tiebreak_competencia_id cuando el policy no es DESIGNATED', async () => {
    const updateMock = jest.fn();
    mockEvento.findByPk
      .mockResolvedValueOnce({
        id: 1,
        scoring_type: 'POINTS_ACCUMULATION',
        tiebreak_policy: 'DESIGNATED_TIEBREAK_Competencia',
        tiebreak_competencia_id: 5,
        update: updateMock,
      } as any)
      .mockResolvedValueOnce({
        id: 1,
        scoring_type: 'POINTS_ACCUMULATION',
        tiebreak_policy: 'NONE',
        tiebreak_competencia_id: null,
      } as any);

    const result = await actualizarScoringType(1, {
      tiebreakPolicy: 'NONE',
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ tiebreak_competencia_id: null })
    );
    expect(result.tiebreak_competencia_id).toBeNull();
  });
});
