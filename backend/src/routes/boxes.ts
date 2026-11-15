import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { superadminOnly } from '../middleware/superadmin';
import { adminWriteRateLimiter } from '../middleware/rateLimiter';
import * as boxService from '../services/boxService';

const router = Router();

const boxSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre del box es obligatorio').max(120),
  ciudad: z.string().trim().max(120).nullable().optional(),
});

const boxParcialSchema = boxSchema.partial();

// Los boxes solo los toca el superadmin: son la unidad de permisos, asi que un
// administrador de box no puede crearse otros ni cambiarse de sitio.
router.use(authMiddleware, superadminOnly);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await boxService.listarBoxes());
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los boxes' });
  }
});

router.post('/', adminWriteRateLimiter(), validate(boxSchema), async (req: AuthRequest, res: Response) => {
  try {
    const box = await boxService.crearBox(req.body);
    res.status(201).json({ message: 'Box creado', box });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', adminWriteRateLimiter(), validate(boxParcialSchema), async (req: AuthRequest, res: Response) => {
  try {
    const box = await boxService.actualizarBox(Number(req.params.id), req.body);
    res.json({ message: 'Box actualizado', box });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', adminWriteRateLimiter(), async (req: AuthRequest, res: Response) => {
  try {
    await boxService.eliminarBox(Number(req.params.id));
    res.json({ message: 'Box eliminado' });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
