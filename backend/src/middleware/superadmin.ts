import { Response, NextFunction } from 'express';
import { Usuario } from '../models';
import type { AuthRequest } from './auth';

/**
 * Solo el superadmin.
 *
 * El rol viaja en el token, pero `es_superadmin` no: se comprueba contra la
 * base en cada peticion para que quitarle el permiso a alguien tenga efecto
 * inmediato, sin esperar a que le caduque la sesion.
 */
export async function superadminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.tipo !== 'usuario') {
    return res.status(403).json({ message: 'Acceso restringido' });
  }

  const usuario = await Usuario.findByPk(req.user.id, { attributes: ['id', 'es_superadmin'] });
  if (!usuario?.es_superadmin) {
    return res.status(403).json({ message: 'Solo el administrador general puede hacer esto' });
  }

  next();
}
