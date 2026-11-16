import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Usuario, Participante, EventoUsuario, Box, Evento } from '../models';

/**
 * Contrasena temporal para un juez recien creado. Se genera con
 * `crypto.randomBytes` (no con Math.random) y siempre incluye mayuscula,
 * minuscula, numero y simbolo para pasar la validacion del cambio.
 */
function generarPasswordTemporal(): string {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!@#$%&*'];
  const todos = grupos.join('');
  const longitud = 14;

  const bytes = crypto.randomBytes(longitud);
  const caracteres = grupos.map((g, i) => g[bytes[i] % g.length]);
  for (let i = grupos.length; i < longitud; i++) {
    caracteres.push(todos[bytes[i] % todos.length]);
  }

  // Mezcla Fisher-Yates con entropia criptografica.
  const mezcla = crypto.randomBytes(longitud);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = mezcla[i] % (i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }

  return caracteres.join('');
}

/**
 * Administradores, con su box. Solo lo usa el superadmin.
 *
 * `box_id` null lista a todos; con valor, solo los de ese box.
 */
export async function getAllAdmins(boxId?: number | null) {
  const where: any = { rol: 'admin', es_superadmin: false };
  if (boxId) where.box_id = boxId;

  return Usuario.findAll({
    where,
    attributes: { exclude: ['password', 'verificacion_token'] },
    include: [{ model: Box, as: 'boxDetalle', attributes: ['id', 'nombre'] }],
    order: [['apellidos', 'ASC']],
  });
}

/**
 * Crea un administrador de box con contrasena temporal.
 *
 * Mismo trato que un juez: la contrasena se muestra una sola vez y quien
 * entra tiene que cambiarla. Nace verificado porque lo da de alta el
 * superadmin, no hay correo que comprobar.
 */
export async function createAdmin(data: {
  nombre: string;
  apellidos: string;
  cedula: string;
  box_id: number;
  email?: string | null;
}) {
  const existente = await Usuario.findOne({ where: { cedula: data.cedula } });
  if (existente) throw new Error('Ya existe un usuario con esta cedula');

  const box = await Box.findByPk(data.box_id);
  if (!box) throw new Error('El box seleccionado ya no existe');

  if (data.email) {
    const correoRepetido = await Usuario.findOne({ where: { email: data.email } });
    if (correoRepetido) throw new Error('Ya existe una cuenta con ese correo');
  }

  const tempPassword = generarPasswordTemporal();

  const usuario = await Usuario.create({
    nombre: data.nombre,
    apellidos: data.apellidos,
    cedula: data.cedula,
    // Se conserva el texto por compatibilidad con lo que ya mostraba la app.
    box: box.nombre,
    box_id: box.id,
    email: data.email || null,
    rol: 'admin',
    password: await bcrypt.hash(tempPassword, 12),
    password_cambiado: false,
    email_verificado: true,
  });

  const {
    password: _pw1,
    verificacion_token: _vt,
    ...sinSecretos
  } = usuario.toJSON() as Record<string, unknown>;
  return { usuario: { ...sinSecretos, box_nombre: box.nombre }, tempPassword };
}

export async function createJuez(data: {
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string;
  /** Evento en la que arbitra. La pone el controlador desde la sesion. */
  evento_id?: number | null;
}) {
  const existente = await Usuario.findOne({ where: { cedula: data.cedula } });
  if (existente) throw new Error('Ya existe un usuario con esta cedula');

  const tempPassword = generarPasswordTemporal();

  const { evento_id, ...datosUsuario } = data;

  // El juez queda en el box del evento en la que se le da de alta.
  const evento = evento_id ? await Evento.findByPk(evento_id) : null;

  const usuario = await Usuario.create({
    ...datosUsuario,
    email: null,
    box_id: evento?.box_id ?? null,
    rol: 'juez',
    password: await bcrypt.hash(tempPassword, 12),
    password_cambiado: false,
    email_verificado: true,
  });

  // El juez solo ve el evento en la que se le dio de alta.
  if (evento_id) {
    await EventoUsuario.create({ evento_id, usuario_id: usuario.id, rol: 'juez' });
  }

  const { password: _pw2, ...usuarioSinPassword } = usuario.toJSON() as Record<string, unknown>;
  return { usuario: usuarioSinPassword, tempPassword };
}

export async function createParticipante(data: {
  nombre: string;
  apellidos: string;
  cedula: string;
  fecha_nacimiento: string;
  box: string;
  email?: string | null;
  categoria?: string | null;
  categoria_id?: number | null;
  evento_id?: number | null;
}) {
  const existente = await Participante.findOne({ where: { cedula: data.cedula } });
  if (existente) throw new Error('Ya existe un participante con esta cedula');

  if (data.email) {
    const emailExiste = await Participante.findOne({ where: { email: data.email } });
    if (emailExiste) throw new Error('Ya existe un participante con este correo electrónico');
  }

  return Participante.create({
    ...data,
    email: data.email || null,
    categoria: data.categoria || null,
    categoria_id: data.categoria_id || null,
  });
}

/**
 * Jueces de un evento. La pertenencia vive en `evento_usuarios`,
 * asi que se filtra por los ids de esa tabla en vez de por una columna del
 * usuario: un mismo juez puede acabar arbitrando en varias eventos.
 */
export async function getAllJueces(filtro: Record<string, any> = {}) {
  const where: any = { rol: 'juez' };

  if (filtro.evento_id) {
    const miembros = await EventoUsuario.findAll({
      where: { evento_id: filtro.evento_id },
      attributes: ['usuario_id'],
    });
    where.id = miembros.map((m) => m.usuario_id);
  }

  return Usuario.findAll({
    where,
    attributes: { exclude: ['password'] },
    order: [['apellidos', 'ASC']],
  });
}

export async function getAllParticipantes(filtro: Record<string, any> = {}) {
  return Participante.findAll({
    where: filtro,
    order: [['apellidos', 'ASC']],
  });
}

/** Solo se permiten estos campos: evita que un PUT toque rol o password. */
export async function updateUsuario(
  id: number,
  data: Partial<{ nombre: string; apellidos: string; box: string }>,
) {
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new Error('Usuario no encontrado');

  const permitidos: Record<string, any> = {};
  for (const campo of ['nombre', 'apellidos', 'box'] as const) {
    if (data[campo] !== undefined) permitidos[campo] = data[campo];
  }

  await usuario.update(permitidos);

  const { password: _pw3, ...sinPassword } = usuario.toJSON() as Record<string, unknown>;
  return sinPassword;
}

export async function updateParticipante(
  id: number,
  data: Partial<{
    nombre: string;
    apellidos: string;
    box: string;
    email: string | null;
    categoria: string | null;
    categoria_id: number | null;
    fecha_nacimiento: string;
  }>,
) {
  const participante = await Participante.findByPk(id);
  if (!participante) throw new Error('Participante no encontrado');

  // Validar unicidad del email si se está cambiando
  if (data.email !== undefined && data.email !== null && data.email !== participante.email) {
    const { Op } = await import('sequelize');
    const emailExiste = await Participante.findOne({
      where: { email: data.email, id: { [Op.ne]: id } },
    });
    if (emailExiste) throw new Error('Ya existe un participante con este correo electrónico');
  }

  const permitidos: Record<string, any> = {};
  for (const campo of [
    'nombre',
    'apellidos',
    'box',
    'email',
    'categoria',
    'categoria_id',
    'fecha_nacimiento',
  ] as const) {
    if (data[campo] !== undefined) permitidos[campo] = data[campo];
  }

  await participante.update(permitidos);
  return participante;
}

/**
 * Genera una contraseña temporal nueva para un juez que la olvidó.
 * No toca asignaciones ni resultados: solo reemplaza el hash y obliga a
 * cambiarla al entrar (password_cambiado=false). Se muestra una sola vez.
 */
export async function resetPasswordJuez(id: number) {
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new Error('Usuario no encontrado');
  if (usuario.rol !== 'juez') throw new Error('Solo se puede resetear la contraseña de un juez');

  const tempPassword = generarPasswordTemporal();
  await usuario.update({
    password: await bcrypt.hash(tempPassword, 12),
    password_cambiado: false,
    reset_token: null,
    reset_expira: null,
  });

  return {
    nombre: `${usuario.nombre} ${usuario.apellidos}`,
    cedula: usuario.cedula,
    tempPassword,
  };
}

export async function deleteUsuario(id: number) {
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new Error('Usuario no encontrado');

  // Nunca se borra el ultimo administrador: dejaria el sistema inaccesible.
  if (usuario.rol === 'admin') {
    const admins = await Usuario.count({ where: { rol: 'admin' } });
    if (admins <= 1) throw new Error('No se puede eliminar el unico administrador del sistema');
  }

  // Dependency check: warn if user has active assignments or results
  const { Asignacion, Resultado } = await import('../models');
  const [asignaciones, resultadosJuez] = await Promise.all([
    Asignacion.count({ where: { usuario_id: id } }),
    Resultado.count({ where: { juez_id: id } }),
  ]);
  if (asignaciones > 0) {
    throw new Error(
      `No se puede eliminar: el usuario tiene ${asignaciones} asignacion(es) activa(s). Elimina las asignaciones primero.`,
    );
  }
  if (resultadosJuez > 0) {
    throw new Error(
      `No se puede eliminar: el usuario tiene ${resultadosJuez} resultado(s) como juez. No es posible eliminar jueces con historial.`,
    );
  }

  await usuario.destroy();
}

export async function deleteParticipante(id: number) {
  const participante = await Participante.findByPk(id);
  if (!participante) throw new Error('Participante no encontrado');

  // Dependency check: warn if participant has assignments or results
  const { Asignacion, Resultado } = await import('../models');
  const [asignaciones, resultados] = await Promise.all([
    Asignacion.count({ where: { participante_id: id } }),
    Resultado.count({ where: { participante_id: id } }),
  ]);
  if (resultados > 0) {
    throw new Error(
      `No se puede eliminar: el participante tiene ${resultados} resultado(s) registrado(s). Elimina los resultados primero.`,
    );
  }
  if (asignaciones > 0) {
    throw new Error(
      `No se puede eliminar: el participante tiene ${asignaciones} asignacion(es) activa(s). Elimina las asignaciones primero.`,
    );
  }

  await participante.destroy();
}

// ── Carga masiva ──

export interface FilaCSV {
  tipo: string;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string;
  fecha_nacimiento?: string;
  email?: string;
  categoria?: string;
}

export interface ResultadoCargaMasiva {
  total: number;
  exitosos: number;
  fallidos: number;
  errores: Array<{ fila: number; cedula: string; mensaje: string }>;
  juecesCreados?: Array<{ nombre: string; cedula: string; password: string }>;
}

/** Parsea un CSV simple (separado por comas) con encabezados en la primera fila. */
export function parseCSV(texto: string): FilaCSV[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2)
    throw new Error('El archivo debe tener encabezados y al menos una fila de datos');
  // Tope anti-DoS: 5000 filas bastan para cualquier carga real.
  if (lineas.length - 1 > 5000)
    throw new Error('El archivo supera las 5000 filas; dividelo en partes');

  const encabezados = lineas[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const filas: FilaCSV[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const valores = lineas[i].split(',').map((v) => v.trim());
    const fila: any = {};
    encabezados.forEach((h, idx) => {
      fila[h] = valores[idx] ?? '';
    });
    filas.push(fila as FilaCSV);
  }
  return filas;
}

export async function bulkCreate(
  filas: FilaCSV[],
  evento_id?: number | null,
): Promise<ResultadoCargaMasiva> {
  const resultado: ResultadoCargaMasiva = {
    total: filas.length,
    exitosos: 0,
    fallidos: 0,
    errores: [],
    juecesCreados: [],
  };

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const filaNum = i + 2; // +2 porque la fila 1 es encabezado
    const tipo = (fila.tipo || '').toLowerCase().trim();

    try {
      if (!fila.nombre?.trim()) throw new Error('Falta el nombre');
      if (!fila.apellidos?.trim()) throw new Error('Faltan los apellidos');
      if (!fila.cedula?.trim()) throw new Error('Falta la cédula');
      if (!fila.box?.trim()) throw new Error('Falta el box/gimnasio');

      if (tipo === 'juez' || tipo === 'judge') {
        // Crear juez
        const existente = await Usuario.findOne({ where: { cedula: fila.cedula.trim() } });
        if (existente) throw new Error('Ya existe un usuario con esta cédula');

        const tempPassword = generarPasswordTemporal();
        const usuario = await Usuario.create({
          nombre: fila.nombre.trim(),
          apellidos: fila.apellidos.trim(),
          cedula: fila.cedula.trim(),
          box: fila.box.trim(),
          rol: 'juez',
          password: await bcrypt.hash(tempPassword, 12),
          password_cambiado: false,
        });

        // El juez solo ve el evento en la que se le da de alta. Sin esto el
        // juez queda con alcance vacío y todo lookup/arranque da 403.
        if (evento_id) {
          await EventoUsuario.findOrCreate({
            where: { evento_id, usuario_id: usuario.id },
            defaults: { evento_id, usuario_id: usuario.id, rol: 'juez' },
          });
        }

        resultado.juecesCreados!.push({
          nombre: `${fila.nombre.trim()} ${fila.apellidos.trim()}`,
          cedula: fila.cedula.trim(),
          password: tempPassword,
        });
        resultado.exitosos++;
      } else {
        // Crear participante (atleta)
        const existente = await Participante.findOne({ where: { cedula: fila.cedula.trim() } });
        if (existente) throw new Error('Ya existe un participante con esta cédula');

        if (fila.email?.trim()) {
          const emailExiste = await Participante.findOne({ where: { email: fila.email.trim() } });
          if (emailExiste) throw new Error('Ya existe un participante con este correo electrónico');
        }

        // Validar fecha de nacimiento (acepta YYYY-MM-DD o YYYY/MM/DD)
        const fn = fila.fecha_nacimiento?.trim();
        if (fn && !/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(fn)) {
          throw new Error('Formato de fecha inválido (use AAAA/MM/DD o AAAA-MM-DD)');
        }

        await Participante.create({
          nombre: fila.nombre.trim(),
          apellidos: fila.apellidos.trim(),
          cedula: fila.cedula.trim(),
          box: fila.box.trim(),
          fecha_nacimiento: fn ? fn.replace(/\//g, '-') : '2000-01-01',
          email: fila.email?.trim() || null,
          categoria: fila.categoria?.trim() || null,
          evento_id: evento_id ?? null,
        });
        resultado.exitosos++;
      }
    } catch (err: any) {
      resultado.fallidos++;
      resultado.errores.push({
        fila: filaNum,
        cedula: fila.cedula?.trim() || '?',
        mensaje: err.message || 'Error desconocido',
      });
    }
  }

  return resultado;
}
