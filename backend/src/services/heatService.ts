import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import {
  Heat,
  HeatParticipante,
  HeatHorario,
  Categoria,
  Participante,
  Competencia,
} from '../models';
import type { AlcanceEvento } from '../middleware/evento';

/**
 * Heats globales por categoría.
 *
 * La serie es estable para todo el evento (heat + carril fijos por atleta) y
 * solo el horario varía por Competencia (`heat_horarios`). Todo el flujo es del admin y
 * siempre acotado a su evento.
 */

export type ModoDistribucion = 'alfabetico' | 'aleatorio';

export interface ParticipanteHeat {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string | null;
  categoria: string | null;
  carril_numero: number;
}

export interface HeatDetalle {
  id: number;
  numero: number;
  capacidad_maxima: number;
  ocupados: number;
  hora_inicio: string | null;
  participantes: ParticipanteHeat[];
}

export interface VistaHeats {
  categoria: { id: number; nombre: string; genero: string };
  heats: HeatDetalle[];
  sinAsignar: Array<{
    id: number;
    nombre: string;
    apellidos: string;
    cedula: string;
    box: string | null;
    categoria: string | null;
  }>;
}

/** La categoría debe existir y pertenecer al alcance del admin. */
async function categoriaPermitida(
  categoriaId: number,
  alcance?: AlcanceEvento,
): Promise<Categoria> {
  const categoria = await Categoria.findByPk(categoriaId);
  if (!categoria) throw new Error('Categoría no encontrada');
  const compId = categoria.evento_id;
  if (compId == null) return categoria; // legacy sin evento
  if (!alcance) throw new Error('Sin alcance de evento');
  if (alcance.permitidas === null) return categoria; // superadmin
  const permitidas = alcance.activa ? [alcance.activa, ...alcance.permitidas] : alcance.permitidas;
  if (!permitidas.includes(compId)) throw new Error('No administras este evento');
  return categoria;
}

function validarCapacidad(capacidad: unknown): number {
  const n = Number(capacidad);
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    throw new Error('La capacidad máxima debe estar entre 1 y 50');
  }
  return n;
}

/** 'HH:MM' -> minutos desde medianoche. */
function parseHora(hora: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.exec(hora.trim());
  if (!m) throw new Error(`Hora inválida: "${hora}" (usa HH:MM de 24 h)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutos -> 'HH:MM:SS' (da la vuelta a medianoche). */
function formatoHora(minutos: number): string {
  const norm = ((Math.round(minutos) % 1440) + 1440) % 1440;
  const h = String(Math.floor(norm / 60)).padStart(2, '0');
  const m = String(norm % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

function mezclar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Vista completa de la categoría: heats con atletas y carriles, atletas sin
 * asignar y, si se pide una competencia, la hora de cada serie en esa prueba.
 */
export async function obtenerHeats(
  categoriaId: number,
  competenciaId: number | null,
  alcance?: AlcanceEvento,
): Promise<VistaHeats> {
  const categoria = await categoriaPermitida(categoriaId, alcance);
  return construirVista(categoria, competenciaId);
}

/**
 * Generación automática: divide los inscritos por la capacidad y reparte en
 * orden alfabético o aleatorio, con carriles 1..N en orden de llenado.
 * Reemplaza las series anteriores de la categoría.
 */
export async function generarHeats(
  categoriaId: number,
  capacidad: number,
  modo: ModoDistribucion,
  alcance?: AlcanceEvento,
): Promise<VistaHeats> {
  const cap = validarCapacidad(capacidad);
  if (modo !== 'alfabetico' && modo !== 'aleatorio')
    throw new Error('Modo inválido: usa alfabetico o aleatorio');
  const categoria = await categoriaPermitida(categoriaId, alcance);

  return sequelize.transaction(async (t) => {
    // Reemplazo total: los horarios por Competencia cuelgan de los heats (CASCADE).
    await Heat.destroy({ where: { categoria_id: categoriaId }, transaction: t });

    let atletas = await Participante.findAll({
      where: {
        categoria_id: categoriaId,
        ...(categoria.evento_id != null ? { evento_id: categoria.evento_id } : {}),
      },
      order: [
        ['apellidos', 'ASC'],
        ['nombre', 'ASC'],
      ],
      transaction: t,
    });
    if (modo === 'aleatorio') atletas = mezclar(atletas);
    if (atletas.length === 0) throw new Error('La categoría no tiene atletas inscritos');

    let numero = 0;
    for (let i = 0; i < atletas.length; i += cap) {
      numero += 1;
      const bloque = atletas.slice(i, i + cap);
      const heat = await Heat.create(
        {
          evento_id: categoria.evento_id ?? 0,
          categoria_id: categoriaId,
          numero,
          capacidad_maxima: cap,
        },
        { transaction: t },
      );
      await HeatParticipante.bulkCreate(
        bloque.map((a, idx) => ({
          heat_id: heat.id,
          participante_id: a.id,
          carril_numero: idx + 1,
        })),
        { transaction: t },
      );
    }

    return construirVista(categoria, null, t);
  });
}

/** Crea una serie vacía al final (modalidad manual). */
export async function crearHeatVacio(
  categoriaId: number,
  capacidad: number,
  alcance?: AlcanceEvento,
): Promise<VistaHeats> {
  const cap = validarCapacidad(capacidad);
  const categoria = await categoriaPermitida(categoriaId, alcance);
  const maximo =
    ((await Heat.max('numero', { where: { categoria_id: categoriaId } })) as number | null) ?? 0;
  await sequelize.transaction(async (t) => {
    await Heat.create(
      {
        evento_id: categoria.evento_id ?? 0,
        categoria_id: categoriaId,
        numero: maximo + 1,
        capacidad_maxima: cap,
      },
      { transaction: t },
    );
  });
  return obtenerHeats(categoriaId, null, alcance);
}

/**
 * Mueve un atleta a otro heat (o cambia su carril dentro del mismo),
 * respetando capacidad y sin duplicar carriles. Sin carril, usa el primero libre.
 */
export async function moverAtleta(
  participanteId: number,
  heatDestinoId: number,
  carrilNumero: number | null,
  alcance?: AlcanceEvento,
): Promise<VistaHeats> {
  const destino = await Heat.findByPk(heatDestinoId);
  if (!destino) throw new Error('Heat no encontrado');
  const categoria = await categoriaPermitida(destino.categoria_id, alcance);

  const atleta = await Participante.findByPk(participanteId);
  if (!atleta) throw new Error('Atleta no encontrado');
  if (atleta.categoria_id !== categoria.id) {
    throw new Error('El atleta no pertenece a esta categoría');
  }

  return sequelize.transaction(async (t) => {
    const ocupados = await HeatParticipante.findAll({
      where: { heat_id: destino.id },
      transaction: t,
    });
    const esMismoHeat = ocupados.some((o) => o.participante_id === participanteId);
    if (!esMismoHeat && ocupados.length >= destino.capacidad_maxima) {
      throw new Error(`El Heat ${destino.numero} está lleno (${destino.capacidad_maxima})`);
    }

    let carril = carrilNumero;
    if (carril == null) {
      const usados = new Set(
        ocupados.filter((o) => o.participante_id !== participanteId).map((o) => o.carril_numero),
      );
      carril =
        Array.from({ length: destino.capacidad_maxima }, (_, i) => i + 1).find(
          (n) => !usados.has(n),
        ) ?? null;
      if (carril == null)
        throw new Error(`El Heat ${destino.numero} está lleno (${destino.capacidad_maxima})`);
    } else {
      if (!Number.isInteger(carril) || carril < 1 || carril > destino.capacidad_maxima) {
        throw new Error(`El carril debe estar entre 1 y ${destino.capacidad_maxima}`);
      }
      const choca = ocupados.some(
        (o) => o.carril_numero === carril && o.participante_id !== participanteId,
      );
      if (choca)
        throw new Error(`El carril ${carril} ya está ocupado en el Heat ${destino.numero}`);
    }

    const actual = await HeatParticipante.findOne({
      where: { participante_id: participanteId },
      transaction: t,
    });
    if (actual) {
      await actual.update({ heat_id: destino.id, carril_numero: carril }, { transaction: t });
    } else {
      await HeatParticipante.create(
        { heat_id: destino.id, participante_id: participanteId, carril_numero: carril },
        { transaction: t },
      );
    }

    return construirVista(categoria, null, t);
  });
}

/** Saca al atleta de su heat (vuelve a la bolsa de sin asignar). */
export async function quitarAtleta(
  participanteId: number,
  categoriaId: number,
  alcance?: AlcanceEvento,
): Promise<VistaHeats> {
  await categoriaPermitida(categoriaId, alcance);
  await sequelize.transaction(async (t) => {
    const eliminado = await HeatParticipante.destroy({
      where: { participante_id: participanteId },
      transaction: t,
    });
    if (!eliminado) throw new Error('El atleta no está en ningún heat');
  });
  return obtenerHeats(categoriaId, null, alcance);
}

/** Elimina una serie vacía (y renumera las siguientes). */
export async function eliminarHeat(heatId: number, alcance?: AlcanceEvento): Promise<VistaHeats> {
  const heat = await Heat.findByPk(heatId);
  if (!heat) throw new Error('Heat no encontrado');
  const categoria = await categoriaPermitida(heat.categoria_id, alcance);

  return sequelize.transaction(async (t) => {
    const ocupados = await HeatParticipante.count({ where: { heat_id: heatId }, transaction: t });
    if (ocupados > 0)
      throw new Error('Vacía el heat antes de eliminarlo (mueve o quita a sus atletas)');
    const numero = heat.numero;
    await heat.destroy({ transaction: t });
    // Renumera para no dejar huecos: 1..N siempre consecutivos.
    const siguientes = await Heat.findAll({
      where: { categoria_id: categoria.id, numero: { [Op.gt]: numero } },
      order: [['numero', 'ASC']],
      transaction: t,
    });
    for (const [i, h] of siguientes.entries()) {
      await h.update({ numero: numero + i }, { transaction: t });
    }
    return construirVista(categoria, null, t);
  });
}

/** Borra todas las series de la categoría (series + horarios + carriles). */
export async function limpiarCategoria(
  categoriaId: number,
  alcance?: AlcanceEvento,
): Promise<{ message: string }> {
  await categoriaPermitida(categoriaId, alcance);
  const total = await sequelize.transaction(async (t) => {
    return await Heat.destroy({ where: { categoria_id: categoriaId }, transaction: t });
  });
  return { message: total > 0 ? `${total} heats eliminados` : 'La categoría no tenía heats' };
}

async function competenciaDeEvento(
  competenciaId: number,
  eventoId: number | null,
): Promise<Competencia> {
  const competencia = await Competencia.findByPk(competenciaId);
  if (!competencia) throw new Error('Competencia no encontrado');
  if (eventoId != null && competencia.evento_id !== eventoId) {
    throw new Error('La competencia no pertenece al evento de la categoría');
  }
  return competencia;
}

/**
 * Horario automático: Hora_Heat_N = Hora_Heat_Anterior + Duración_Competencia + Transición.
 * Si la competencia no tiene duración, solo se suma la transición (se avisa).
 */
export async function programarHorarioAuto(
  categoriaId: number,
  competenciaId: number,
  horaHeat1: string,
  transicionMin: number,
  alcance?: AlcanceEvento,
): Promise<{
  heats: Array<{ heat_id: number; numero: number; hora_inicio: string }>;
  sinDuracion: boolean;
}> {
  const categoria = await categoriaPermitida(categoriaId, alcance);
  const competencia = await competenciaDeEvento(competenciaId, categoria.evento_id);
  const transicion = Number(transicionMin);
  if (!Number.isFinite(transicion) || transicion < 0 || transicion > 180) {
    throw new Error('La transición debe estar entre 0 y 180 minutos');
  }
  const duracion = competencia.duracion_minutos ?? 0;
  const inicio = parseHora(horaHeat1);

  const heats = await Heat.findAll({
    where: { categoria_id: categoriaId },
    order: [['numero', 'ASC']],
  });
  if (heats.length === 0) throw new Error('Primero arma las series de la categoría');

  const filas = heats.map((h, i) => ({
    heat_id: h.id,
    competencia_id: competenciaId,
    hora_inicio: formatoHora(inicio + i * (duracion + transicion)),
  }));
  await HeatHorario.bulkCreate(filas, { updateOnDuplicate: ['hora_inicio'] });
  return {
    heats: filas.map((f, i) => ({ ...f, numero: heats[i].numero })),
    sinDuracion: competencia.duracion_minutos == null,
  };
}

/** Horario manual: una hora exacta por heat (timepicker por serie). */
export async function programarHorarioManual(
  categoriaId: number,
  competenciaId: number,
  horarios: Array<{ heat_id: number; hora_inicio: string }>,
  alcance?: AlcanceEvento,
): Promise<{ heats: Array<{ heat_id: number; numero: number; hora_inicio: string }> }> {
  const categoria = await categoriaPermitida(categoriaId, alcance);
  await competenciaDeEvento(competenciaId, categoria.evento_id);
  if (!Array.isArray(horarios) || horarios.length === 0) {
    throw new Error('Envía al menos un horario');
  }

  const heats = await Heat.findAll({ where: { categoria_id: categoriaId } });
  const validos = new Map(heats.map((h) => [h.id, h.numero]));
  const filas = horarios.map(({ heat_id, hora_inicio }) => {
    if (!validos.has(heat_id)) throw new Error(`El heat ${heat_id} no es de esta categoría`);
    return {
      heat_id,
      competencia_id: competenciaId,
      hora_inicio: formatoHora(parseHora(hora_inicio)),
    };
  });
  await HeatHorario.bulkCreate(filas, { updateOnDuplicate: ['hora_inicio'] });
  return { heats: filas.map((f) => ({ ...f, numero: validos.get(f.heat_id)! })) };
}

/** Constructor único de la vista (con o sin transacción). */
async function construirVista(
  categoria: Categoria,
  competenciaId: number | null,
  t?: any,
): Promise<VistaHeats> {
  const heats = await Heat.findAll({
    where: { categoria_id: categoria.id },
    order: [['numero', 'ASC']],
    transaction: t,
  });
  const heatIds = heats.map((h) => h.id);
  const [filas, horarios] = await Promise.all([
    heatIds.length > 0
      ? HeatParticipante.findAll({
          where: { heat_id: { [Op.in]: heatIds } },
          include: [{ model: Participante, as: 'Participante' }],
          transaction: t,
        })
      : [],
    competenciaId != null && heatIds.length > 0
      ? HeatHorario.findAll({
          where: { heat_id: { [Op.in]: heatIds }, competencia_id: competenciaId },
          transaction: t,
        })
      : [],
  ]);
  const horaPorHeat = new Map(horarios.map((h) => [h.heat_id, String(h.hora_inicio).slice(0, 5)]));
  const asignados = new Set<number>();
  const detalle: HeatDetalle[] = heats.map((h) => {
    const participantes = (
      filas as Array<{
        heat_id: number;
        participante_id: number;
        carril_numero: number;
        Participante?: {
          nombre?: string;
          apellidos?: string;
          cedula?: string;
          box?: string;
          categoria?: string;
        } | null;
      }>
    )
      .filter((f) => f.heat_id === h.id)
      .map((f) => {
        asignados.add(f.participante_id);
        const p = f.Participante ?? {};
        return {
          id: f.participante_id,
          nombre: p.nombre ?? '',
          apellidos: p.apellidos ?? '',
          cedula: p.cedula ?? '',
          box: p.box ?? null,
          categoria: p.categoria ?? null,
          carril_numero: f.carril_numero,
        };
      })
      .sort((a, b) => a.carril_numero - b.carril_numero);
    return {
      id: h.id,
      numero: h.numero,
      capacidad_maxima: h.capacidad_maxima,
      ocupados: participantes.length,
      hora_inicio: horaPorHeat.get(h.id) ?? null,
      participantes,
    };
  });
  const todos = await Participante.findAll({
    where: {
      categoria_id: categoria.id,
      ...(categoria.evento_id != null ? { evento_id: categoria.evento_id } : {}),
    },
    order: [
      ['apellidos', 'ASC'],
      ['nombre', 'ASC'],
    ],
    transaction: t,
  });
  return {
    categoria: { id: categoria.id, nombre: categoria.nombre, genero: categoria.genero },
    heats: detalle,
    sinAsignar: todos
      .filter((p) => !asignados.has(p.id))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        apellidos: p.apellidos,
        cedula: p.cedula,
        box: p.box ?? null,
        categoria: p.categoria ?? null,
      })),
  };
}
