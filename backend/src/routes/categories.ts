import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { adminWriteRateLimiter } from '../middleware/rateLimiter';
import { resolverEvento } from '../middleware/evento';
import { createCategorySchema, updateCategorySchema } from '../schemas/category';
import * as categoryController from '../controllers/categoryController';

const router = Router();

router.use(authMiddleware, resolverEvento, adminOnly);

router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategoryById);
router.post('/', adminWriteRateLimiter(), validate(createCategorySchema), categoryController.createCategory);
router.put('/:id', adminWriteRateLimiter(), validate(updateCategorySchema), categoryController.updateCategory);
router.delete('/:id', adminWriteRateLimiter(), categoryController.deleteCategory);

export default router;
