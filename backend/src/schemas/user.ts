import { z } from 'zod';

const nombre = z.string().trim().min(1, 'El nombre es obligatorio').max(100);
const apellidos = z.string().trim().min(1, 'Los apellidos son obligatorios').max(100);
const cedula = z.string().trim().min(1, 'La cedula es obligatoria').max(20);
const box = z.string().trim().min(1, 'El box es obligatorio').max(100);
const fechaNacimiento = z.string().regex(/^\d{4}[-/]\d{2}[-/]\d{2}$/, 'Formato esperado: AAAA/MM/DD o AAAA-MM-DD');

export const createAdminSchema = z.object({
  nombre,
  apellidos,
  cedula,
  box_id: z.number().int().positive('Elige el box al que pertenece'),
  email: z.string().trim().email('Formato de correo invalido').max(150).nullable().optional(),
});

export const createJuezSchema = z.object({ nombre, apellidos, cedula, box });

export const createParticipanteSchema = z.object({
  nombre,
  apellidos,
  cedula,
  box,
  fecha_nacimiento: fechaNacimiento,
  email: z.string().trim().email('Formato de correo electrónico inválido').max(150).nullable().optional(),
  categoria: z.string().trim().max(50).nullable().optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
});

export const updateUsuarioSchema = z.object({
  nombre: nombre.optional(),
  apellidos: apellidos.optional(),
  box: box.optional(),
});

export const updateParticipanteSchema = z.object({
  nombre: nombre.optional(),
  apellidos: apellidos.optional(),
  box: box.optional(),
  fecha_nacimiento: fechaNacimiento.optional(),
  email: z.string().trim().email('Formato de correo electrónico inválido').max(150).nullable().optional(),
  categoria: z.string().trim().max(50).nullable().optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
});

export const paramsIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type CreateJuezInput = z.infer<typeof createJuezSchema>;
export type CreateParticipanteInput = z.infer<typeof createParticipanteSchema>;
export type UpdateUsuarioInput = z.infer<typeof updateUsuarioSchema>;
export type UpdateParticipanteInput = z.infer<typeof updateParticipanteSchema>;
export type ParamsId = z.infer<typeof paramsIdSchema>;
