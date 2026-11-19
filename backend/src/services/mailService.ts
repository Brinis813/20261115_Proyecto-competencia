import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { log } from '../utils/logger';

/**
 * Correo saliente.
 *
 * Si no hay `SMTP_HOST` configurado no se envia nada y el contenido se escribe
 * en el log. Eso permite completar un alta en desarrollo sin montar un
 * servidor de correo, y evita que un despliegue mal configurado se caiga al
 * intentar enviar.
 */

let transporte: Transporter | null = null;

function obtenerTransporte(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (transporte) return transporte;

  transporte = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  return transporte;
}

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/** Envia el correo, o lo deja en el log si no hay SMTP. Nunca lanza. */
export async function enviarCorreo(correo: Correo): Promise<{ enviado: boolean }> {
  const t = obtenerTransporte();

  if (!t) {
    log.warn(
      `sin SMTP configurado; correo no enviado a ${correo.para}\n  asunto: ${correo.asunto}\n  ${correo.texto.replace(/\n/g, '\n  ')}`,
    );
    return { enviado: false };
  }

  try {
    await t.sendMail({
      from: env.SMTP_FROM,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    return { enviado: true };
  } catch (err) {
    // Un fallo de correo no puede tumbar el alta: el usuario puede pedir que
    // se le reenvie, y el enlace queda en el log para poder rescatarlo.
    log.error(`no se pudo enviar el correo a ${correo.para}: ${(err as Error).message}`);
    log.warn(`enlace del correo fallido: ${correo.texto}`);
    return { enviado: false };
  }
}

/** Correo de bienvenida con el enlace para verificar la direccion. */
export function correoDeVerificacion(para: string, nombre: string, enlace: string): Correo {
  const texto = [
    `Hola ${nombre},`,
    '',
    'Confirma tu correo para activar tu cuenta de Competition Manager:',
    enlace,
    '',
    'El enlace caduca en 24 horas. Si no fuiste tu, ignora este mensaje.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h1 style="font-size:20px;margin:0 0 16px">Confirma tu correo</h1>
      <p style="margin:0 0 16px">Hola ${nombre}, ya casi esta. Confirma tu correo para activar tu cuenta de Competition Manager.</p>
      <p style="margin:0 0 24px">
        <a href="${enlace}" style="display:inline-block;background:#FF6B00;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Confirmar mi correo</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#666">Si el boton no funciona, copia esta direccion:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${enlace}">${enlace}</a></p>
      <p style="margin:0;font-size:13px;color:#666">El enlace caduca en 24 horas. Si no fuiste tu, ignora este mensaje.</p>
    </div>`;

  return { para, asunto: 'Confirma tu correo · Competition Manager', texto, html };
}

/** Enlace de recuperación de contraseña (caduca en 1 hora). */
export function correoDeRecuperacion(para: string, nombre: string, enlace: string): Correo {
  const texto = [
    `Hola ${nombre},`,
    '',
    'Pide restablecer tu contraseña de Competition Manager:',
    enlace,
    '',
    'El enlace caduca en 1 hora. Si no fuiste tu, ignora este mensaje.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h1 style="font-size:20px;margin:0 0 16px">Restablece tu contraseña</h1>
      <p style="margin:0 0 24px">
        <a href="${enlace}" style="display:inline-block;background:#FF6B00;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Crear contraseña nueva</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#666">Si el boton no funciona, copia esta direccion:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${enlace}">${enlace}</a></p>
      <p style="margin:0;font-size:13px;color:#666">El enlace caduca en 1 hora. Si no fuiste tu, ignora este mensaje.</p>
    </div>`;

  return { para, asunto: 'Restablece tu contraseña · Competition Manager', texto, html };
}

/** Aviso de asignación a un evento (juez/admin). SMTP genérico: vale Resend/Brevo. */
export function correoDeAsignacion(para: string, nombre: string, evento: string): Correo {
  const texto = [
    `Hola ${nombre},`,
    '',
    `Te asignaron al evento "${evento}" en Competition Manager.`,
    'Entra con tu cedula y contraseña para ver tus Competencias.',
    '',
    'Si no esperabas este mensaje, avisale a tu organizador.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h1 style="font-size:20px;margin:0 0 16px">Te asignaron a ${evento}</h1>
      <p style="margin:0;font-size:14px">Hola ${nombre}, entra a Competition Manager con tu cedula y contraseña para ver tus Competencias.</p>
    </div>`;

  return { para, asunto: `Te asignaron a ${evento} · Competition Manager`, texto, html };
}
