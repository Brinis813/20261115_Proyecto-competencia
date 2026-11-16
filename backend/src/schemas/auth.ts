import { z } from 'zod';

const passwordField = z
  .string()
  .min(8, 'Minimo 8 caracteres')
  .max(100)
  .regex(/[A-Z]/, 'Debe contener al menos una mayuscula')
  .regex(/[a-z]/, 'Debe contener al menos una minuscula')
  .regex(/[0-9]/, 'Debe contener al menos un numero')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un caracter especial');

export const loginSchema = z.object({
  cedula: z.string().trim().min(1, 'La cedula es obligatoria').max(20),
  password: z.string().min(1, 'La contrasena es obligatoria').max(100),
});

export const loginParticipanteSchema = z.object({
  cedula: z.string().trim().min(1, 'La cedula es obligatoria').max(20),
  fecha_nacimiento: z
    .string()
    .regex(/^\d{4}[-/]\d{2}[-/]\d{2}$/, 'Formato esperado: AAAA/MM/DD o AAAA-MM-DD'),
});

export const registroSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  apellidos: z.string().trim().min(1, 'Los apellidos son obligatorios').max(100),
  cedula: z.string().trim().min(1, 'La cedula es obligatoria').max(20),
  box: z.string().trim().min(1, 'El box o gimnasio es obligatorio').max(100),
  email: z.string().trim().email('Formato de correo invalido').max(150),
  password: passwordField,
});

export const verificarSchema = z.object({
  token: z.string().trim().length(64, 'El enlace no es valido'),
});

export const reenviarVerificacionSchema = z.object({
  email: z.string().trim().email('Formato de correo invalido').max(150),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(100).optional(),
  newPassword: passwordField,
});

export const resetRequestSchema = z.object({
  email: z.string().trim().email('Formato de correo invalido').max(150),
});

export const resetConfirmSchema = z.object({
  token: z.string().trim().length(64, 'El enlace no es valido'),
  newPassword: passwordField,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginParticipanteInput = z.infer<typeof loginParticipanteSchema>;
export type RegistroInput = z.infer<typeof registroSchema>;
export type VerificarInput = z.infer<typeof verificarSchema>;
export type ReenviarVerificacionInput = z.infer<typeof reenviarVerificacionSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetConfirmInput = z.infer<typeof resetConfirmSchema>;
