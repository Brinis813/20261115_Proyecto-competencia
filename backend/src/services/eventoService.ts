import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import { sequelize } from '../config/database';
import {
  Box,
  Evento,
  EventoUsuario,
  Categoria,
  Participante,
  Usuario,
  Competencia,
  Wod,
  CompetenciaCategoria,
  estadoDeEvento,
  type EstadoEvento,
  type ScoringType,
  SCORING_TYPES,
  type EventoTieBreakPolicy,
  EVENTO_TIEBREAK_POLICIES,
} from '../models';

/** Fecha de hoy en formato AAAA-MM-DD, que es como guarda MySQL un DATE. */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface EventoListada {
  id: number;
  nombre: string;
  descripcion: string | null;
  sede: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  es_demo: boolean;
  scoring_type: ScoringType;
  tiebreak_policy: EventoTieBreakPolicy;
  tiebreak_competencia_id: number | null;
  estado: EstadoEvento;
  /** Papel del usuario que consulta. null si solo la ve como superadmin. */
  rol: string | null;
  box_id: number | null;
  box_nombre: string | null;
  total_competencias: number;
  total_atletas: number;
  /** Portada del evento. null = sin imagen. */
  imagen_url: string | null;
}

/**
 * Eventos visibles para un usuario, ya ordenadas para el panel:
 * primero las que estan en curso, luego las proximas y al final las pasadas.
 *
 * El orden se resuelve aqui y no en el cliente para que la API sea util tal
 * cual desde cualquier pantalla.
 */
export async function listarEventos(usuario: {
  id: number;
  rol?: string;
  box_id?: number | null;
  es_superadmin?: boolean;
}): Promise<EventoListada[]> {
  const membresias = await EventoUsuario.findAll({ where: { usuario_id: usuario.id } });
  const rolPorEvento = new Map(membresias.map((m) => [m.evento_id, m.rol]));

  // Un administrador manda sobre todo su box, aunque no tenga membresia
  // explicita en cada evento. El superadmin las ve todas.
  const eventos = usuario.es_superadmin
    ? await Evento.findAll()
    : usuario.rol === 'admin' && usuario.box_id
      ? await Evento.findAll({ where: { box_id: usuario.box_id } })
      : await Evento.findAll({ where: { id: [...rolPorEvento.keys()] } });

  if (eventos.length === 0) return [];

  const ids = eventos.map((c) => c.id);
  const [competencias, atletas] = await Promise.all([
    Competencia.findAll({
      attributes: ['evento_id', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      where: { evento_id: { [Op.in]: ids } },
      group: ['evento_id'],
      raw: true,
    }) as unknown as Array<{ evento_id: number; total: number }>,
    Participante.findAll({
      attributes: ['evento_id', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      where: { evento_id: { [Op.in]: ids } },
      group: ['evento_id'],
      raw: true,
    }) as unknown as Array<{ evento_id: number; total: number }>,
  ]);

  const competenciasPor = new Map(competencias.map((w) => [w.evento_id, Number(w.total)]));
  const atletasPor = new Map(atletas.map((a) => [a.evento_id, Number(a.total)]));
  const boxesPor = await nombresDeBox(eventos);

  const listadas: EventoListada[] = eventos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    sede: c.sede,
    fecha_inicio: c.fecha_inicio,
    fecha_fin: c.fecha_fin,
    es_demo: c.es_demo,
    scoring_type: c.scoring_type ?? 'POINTS_ACCUMULATION',
    tiebreak_policy: c.tiebreak_policy ?? 'BEST_INDIVIDUAL_RANK',
    tiebreak_competencia_id: c.tiebreak_competencia_id ?? null,
    estado: estadoDeEvento(c.fecha_inicio, c.fecha_fin),
    rol: rolPorEvento.get(c.id) ?? null,
    box_id: c.box_id,
    box_nombre: c.box_id ? (boxesPor.get(c.box_id) ?? null) : null,
    total_competencias: competenciasPor.get(c.id) ?? 0,
    total_atletas: atletasPor.get(c.id) ?? 0,
    imagen_url: c.imagen_url ?? null,
  }));

  return ordenarParaPanel(listadas);
}

/**
 * Orden del panel: en curso primero (la que empezo antes), luego las proximas
 * (la mas cercana) y al final las pasadas (la mas reciente).
 */
function ordenarParaPanel(lista: EventoListada[]): EventoListada[] {
  const peso: Record<EstadoEvento, number> = { en_curso: 0, proxima: 1, pasada: 2 };
  return [...lista].sort((a, b) => {
    if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado];
    if (a.estado === 'pasada') return b.fecha_fin.localeCompare(a.fecha_fin);
    return a.fecha_inicio.localeCompare(b.fecha_inicio);
  });
}

/**
 * Todas los eventos, para la portada publica.
 *
 * No pide sesion: es el escaparate del evento, igual que la clasificacion.
 * Solo se cuentan las competencias publicados (los borradores no existen para el
 * publico) y va con el mismo orden que el panel del organizador.
 */
export async function listarEventosPublicos(): Promise<EventoListada[]> {
  const eventos = await Evento.findAll();
  if (eventos.length === 0) return [];

  const ids = eventos.map((c) => c.id);
  const [competencias, atletas] = await Promise.all([
    Competencia.findAll({
      attributes: ['evento_id', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      where: { evento_id: { [Op.in]: ids }, estado: { [Op.ne]: 'borrador' } },
      group: ['evento_id'],
      raw: true,
    }) as unknown as Array<{ evento_id: number; total: number }>,
    Participante.findAll({
      attributes: ['evento_id', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      where: { evento_id: { [Op.in]: ids } },
      group: ['evento_id'],
      raw: true,
    }) as unknown as Array<{ evento_id: number; total: number }>,
  ]);

  const competenciasPor = new Map(competencias.map((w) => [w.evento_id, Number(w.total)]));
  const atletasPor = new Map(atletas.map((a) => [a.evento_id, Number(a.total)]));
  const boxesPor = await nombresDeBox(eventos);

  return ordenarParaPanel(
    eventos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      sede: c.sede,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      es_demo: c.es_demo,
      scoring_type: c.scoring_type ?? 'POINTS_ACCUMULATION',
      tiebreak_policy: c.tiebreak_policy ?? 'BEST_INDIVIDUAL_RANK',
      tiebreak_competencia_id: c.tiebreak_competencia_id ?? null,
      estado: estadoDeEvento(c.fecha_inicio, c.fecha_fin),
      rol: null,
      box_id: c.box_id,
      box_nombre: c.box_id ? (boxesPor.get(c.box_id) ?? null) : null,
      total_competencias: competenciasPor.get(c.id) ?? 0,
      total_atletas: atletasPor.get(c.id) ?? 0,
      imagen_url: c.imagen_url ?? null,
    }))
  );
}

/** Un evento concreto, para su portada publica. */
export async function eventoPublico(id: number) {
  const evento = await Evento.findByPk(id);
  if (!evento) return null;

  return {
    id: evento.id,
    nombre: evento.nombre,
    descripcion: evento.descripcion,
    sede: evento.sede,
    fecha_inicio: evento.fecha_inicio,
    fecha_fin: evento.fecha_fin,
    es_demo: evento.es_demo,
    scoring_type: evento.scoring_type ?? 'POINTS_ACCUMULATION',
    tiebreak_policy: evento.tiebreak_policy ?? 'BEST_INDIVIDUAL_RANK',
    tiebreak_competencia_id: evento.tiebreak_competencia_id ?? null,
    estado: estadoDeEvento(evento.fecha_inicio, evento.fecha_fin),
    imagen_url: evento.imagen_url ?? null,
  };
}

/**
 * Cambia la portada del evento. `imagenUrl` en null la quita.
 * Devuelve la URL guardada (o null).
 */
export async function actualizarImagen(
  eventoId: number,
  imagenUrl: string | null
): Promise<{ id: number; imagen_url: string | null }> {
  const evento = await Evento.findByPk(eventoId);
  if (!evento) throw new Error('Evento no encontrada');
  await evento.update({ imagen_url: imagenUrl });
  return { id: evento.id, imagen_url: evento.imagen_url ?? null };
}

/**
 * Actualiza la scoring policy y/o la política de desempate global.
 * Si la política es DESIGNATED_TIEBREAK_Competencia, la competencia debe pertenecer a la
 * evento; si se cambia a otra política, el designado se limpia.
 */
export async function actualizarScoringType(
  eventoId: number,
  input: {
    scoringType?: ScoringType;
    tiebreakPolicy?: EventoTieBreakPolicy;
    tiebreakCompetenciaId?: number | null;
  }
): Promise<{ id: number; scoring_type: ScoringType; tiebreak_policy: EventoTieBreakPolicy; tiebreak_competencia_id: number | null }> {
  const evento = await Evento.findByPk(eventoId);
  if (!evento) throw new Error('Evento no encontrada');

  const cambios: Record<string, unknown> = {};
  if (input.scoringType !== undefined) {
    if (!SCORING_TYPES.includes(input.scoringType)) {
      throw new Error('scoringType inválido: usa POINTS_ACCUMULATION o WINNER_PER_Competencia');
    }
    cambios.scoring_type = input.scoringType;
  }
  if (input.tiebreakPolicy !== undefined) {
    if (!EVENTO_TIEBREAK_POLICIES.includes(input.tiebreakPolicy)) {
      throw new Error('tiebreakPolicy inválida: usa NONE, BEST_INDIVIDUAL_RANK, DESIGNATED_TIEBREAK_Competencia o LAST_Competencia_SCORE');
    }
    cambios.tiebreak_policy = input.tiebreakPolicy;
  }

  const policyFinal: EventoTieBreakPolicy =
    (cambios.tiebreak_policy as EventoTieBreakPolicy) ??
    ((evento as unknown as { tiebreak_policy: EventoTieBreakPolicy }).tiebreak_policy ?? 'BEST_INDIVIDUAL_RANK');

  if (input.tiebreakCompetenciaId !== undefined) {
    if (input.tiebreakCompetenciaId === null) {
      cambios.tiebreak_competencia_id = null;
    } else {
      const designado = await Competencia.findOne({
        where: { id: input.tiebreakCompetenciaId, evento_id: eventoId, estado: { [Op.ne]: 'borrador' } },
      });
      if (!designado) throw new Error('La competencia de desempate no pertenece a este evento o es borrador');
      cambios.tiebreak_competencia_id = designado.id;
    }
  } else if (policyFinal !== 'DESIGNATED_TIEBREAK_Competencia') {
    // Sin designado vigente: se limpia para no aplicar un criterio obsoleto.
    cambios.tiebreak_competencia_id = null;
  }

  await evento.update(cambios as never);
  const fresca = (await Evento.findByPk(eventoId)) as unknown as {
    id: number;
    scoring_type: ScoringType;
    tiebreak_policy: EventoTieBreakPolicy;
    tiebreak_competencia_id: number | null;
  };
  return {
    id: fresca.id,
    scoring_type: fresca.scoring_type,
    tiebreak_policy: fresca.tiebreak_policy,
    tiebreak_competencia_id: fresca.tiebreak_competencia_id,
  };
}

/** Nombre de cada box implicado, en una sola consulta. */
async function nombresDeBox(eventos: Evento[]): Promise<Map<number, string>> {
  const ids = [...new Set(eventos.map((c) => c.box_id).filter((id): id is number => !!id))];
  if (ids.length === 0) return new Map();

  const boxes = await Box.findAll({ where: { id: ids }, attributes: ['id', 'nombre'] });
  return new Map(boxes.map((b) => [b.id, b.nombre]));
}

/** Evento activa de un usuario. null = superadmin sin acotar, o sin ninguna. */
export async function eventoDeUsuario(usuarioId: number): Promise<number | null> {
  const membresia = await EventoUsuario.findOne({
    where: { usuario_id: usuarioId },
    order: [['evento_id', 'ASC']],
  });
  return membresia?.evento_id ?? null;
}

/**
 * Creal evento de ejemplo de un usuario recien verificado.
 *
 * Trae datos suficientes para que la aplicacion se entienda sin configurar
 * nada: dos categorias por genero, una competencia de dos wods con reps y peso por
 * categoria, seis atletas y un juez. Todo dentro de una transaccion: o queda
 * completa o no queda nada.
 */
export async function crearEventoDeEjemplo(usuario: Usuario): Promise<Evento> {
  return sequelize.transaction(async (t) => {
    const evento = await Evento.create(
      {
        nombre: `Evento de ${usuario.nombre}`,
        descripcion:
          'Evento de ejemplo creada al activar tu cuenta. Cambia lo que quieras o borra los datos y empieza de cero.',
        sede: usuario.box,
        // Empieza hoy para que salga en «en curso» y se pueda trastear ya.
        fecha_inicio: hoyISO(),
        fecha_fin: sumarDias(1),
        propietario_id: usuario.id,
        box_id: usuario.box_id ?? null,
        es_demo: true,
      },
      { transaction: t }
    );

    await EventoUsuario.create(
      { evento_id: evento.id, usuario_id: usuario.id, rol: 'propietario' },
      { transaction: t }
    );

    // MySQL no admite RETURNING, asi que `bulkCreate` no rellena los ids. Se
    // vuelven a leer para poder enlazarlas con la competencia y con los atletas.
    await Categoria.bulkCreate(
      [
        { nombre: 'RX', genero: 'Masculino', tipo_participacion: 'Individual' },
        { nombre: 'RX', genero: 'Femenino', tipo_participacion: 'Individual' },
        { nombre: 'Scaled', genero: 'Masculino', tipo_participacion: 'Escalado' },
        { nombre: 'Scaled', genero: 'Femenino', tipo_participacion: 'Escalado' },
      ].map((c) => ({ ...c, evento_id: evento.id })),
      { transaction: t }
    );

    const categorias = await Categoria.findAll({
      where: { evento_id: evento.id },
      transaction: t,
    });

    const etiqueta = (c: Categoria) => `${c.nombre} ${c.genero}`;
    const porNombre = (nombre: string, genero: string) =>
      categorias.find((c) => c.nombre === nombre && c.genero === genero)!;

    const competencia = await Competencia.create(
      {
        nombre: 'Competencia 1 - Bienvenida',
        descripcion:
          'AMRAP de 12 minutos. Las repeticiones y el peso cambian segun la categoria del atleta.',
        tipo_flujo: 'en_serie',
        tipo_publicacion: 'tiempo_real',
        estado: 'activo',
        tipo_participacion: 'Individual',
        duracion_minutos: 12,
        rondas: 1,
        divisiones: categorias.map(etiqueta),
        evento_id: evento.id,
      },
      { transaction: t }
    );

    await CompetenciaCategoria.bulkCreate(
      categorias.map((c) => ({ competencia_id: competencia.id, categoria_id: c.id })),
      { transaction: t }
    );

    // Reps y peso por categoria: es justo lo que distingue Rx de Scaled.
    const reps = (rxM: number, rxF: number, scM: number, scF: number) => ({
      [etiqueta(porNombre('RX', 'Masculino'))]: rxM,
      [etiqueta(porNombre('RX', 'Femenino'))]: rxF,
      [etiqueta(porNombre('Scaled', 'Masculino'))]: scM,
      [etiqueta(porNombre('Scaled', 'Femenino'))]: scF,
    });

    await Wod.bulkCreate(
      [
        {
          competencia_id: competencia.id,
          orden: 1,
          nombre_ejercicio: 'AMRAP 12 min',
          tipo_medicion: 'repeticiones' as const,
          tiempo_estimado_duracion: 720,
          tiempo_cap: 0,
          puntaje_maximo: 100,
          esquema: {
            modalidad: 'amrap' as const,
            rondas: 1,
            movimientos: [
              {
                nombre: 'Thrusters',
                reps: reps(10, 10, 8, 8),
                peso: reps(43, 30, 30, 20),
                unidad_peso: 'kg' as const,
              },
              { nombre: 'Pull-ups', reps: reps(12, 12, 8, 8) },
              { nombre: 'Box jumps', reps: reps(15, 15, 12, 12) },
            ],
          },
        },
        {
          competencia_id: competencia.id,
          orden: 2,
          nombre_ejercicio: '500m Row',
          tipo_medicion: 'tiempo' as const,
          tiempo_estimado_duracion: 180,
          tiempo_cap: 0,
          puntaje_maximo: 100,
          esquema: null,
        },
      ],
      { transaction: t }
    );

    const atletas = [
      { nombre: 'Ana', apellidos: 'Rojas', cedula: `${evento.id}0000001`, cat: porNombre('RX', 'Femenino'), nac: '1994-03-11' },
      { nombre: 'Lucia', apellidos: 'Mendez', cedula: `${evento.id}0000002`, cat: porNombre('RX', 'Femenino'), nac: '1997-08-02' },
      { nombre: 'Carlos', apellidos: 'Duarte', cedula: `${evento.id}0000003`, cat: porNombre('RX', 'Masculino'), nac: '1992-01-25' },
      { nombre: 'Mateo', apellidos: 'Silva', cedula: `${evento.id}0000004`, cat: porNombre('RX', 'Masculino'), nac: '1996-06-30' },
      { nombre: 'Sofia', apellidos: 'Nunez', cedula: `${evento.id}0000005`, cat: porNombre('Scaled', 'Femenino'), nac: '1999-11-14' },
      { nombre: 'Diego', apellidos: 'Paredes', cedula: `${evento.id}0000006`, cat: porNombre('Scaled', 'Masculino'), nac: '1990-05-19' },
    ];

    await Participante.bulkCreate(
      atletas.map((a) => ({
        nombre: a.nombre,
        apellidos: a.apellidos,
        cedula: a.cedula,
        fecha_nacimiento: a.nac,
        box: usuario.box,
        categoria: etiqueta(a.cat),
        categoria_id: a.cat.id,
        evento_id: evento.id,
      })),
      { transaction: t }
    );

    // Un juez de ejemplo, con contrasena temporal conocida para que el
    // propietario pueda entrar a probar la pantalla de medicion.
    const juez = await Usuario.create(
      {
        nombre: 'Juez',
        apellidos: 'De ejemplo',
        cedula: `${evento.id}0000009`,
        box: usuario.box,
        rol: 'juez',
        password: await bcrypt.hash('Juez123!', 12),
        password_cambiado: false,
        email_verificado: true,
      },
      { transaction: t }
    );

    await EventoUsuario.create(
      { evento_id: evento.id, usuario_id: juez.id, rol: 'juez' },
      { transaction: t }
    );

    return evento;
  });
}
