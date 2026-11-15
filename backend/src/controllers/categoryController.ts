import { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import * as categoryService from '../services/categoryService';
import { eventoDestino, filtroEvento } from '../middleware/evento';
import { perteneceAlAlcance, mensajeSeguro } from './helpers';
import { Categoria } from '../models';
import { log } from '../utils/logger';

export async function getAllCategories(req: AuthRequest, res: Response) {
  try {
    const categorias = await categoryService.getAllCategories(filtroEvento(req.alcance));
    res.json(categorias);
  } catch (error: any) {
    log.error('getAllCategories error:', error?.message);
    res.status(500).json({ message: mensajeSeguro(error) });
  }
}

export async function getCategoryById(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ message: 'ID de categoría inválido' });
      return;
    }
    const categoria = await Categoria.findByPk(id, { attributes: ['evento_id'] });
    if (!categoria) return res.status(404).json({ message: 'Categoria no encontrada' });

    if (!perteneceAlAlcance(req.alcance, categoria.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a esta categoría' });
    }

    const fullCategoria = await categoryService.getCategoryById(id);
    res.json(fullCategoria);
  } catch (error: any) {
    log.error('getCategoryById error:', error?.message);
    res.status(404).json({ message: mensajeSeguro(error) });
  }
}

export async function createCategory(req: AuthRequest, res: Response) {
  try {
    const categoria = await categoryService.createCategory({ ...req.body, evento_id: eventoDestino(req.alcance) });
    res.status(201).json(categoria);
  } catch (error: any) {
    log.error('createCategory error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function updateCategory(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ message: 'ID de categoría inválido' });
      return;
    }

    const categoria = await Categoria.findByPk(id, { attributes: ['evento_id'] });
    if (!categoria) return res.status(404).json({ message: 'Categoria no encontrada' });

    if (!perteneceAlAlcance(req.alcance, categoria.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a esta categoría' });
    }

    const updated = await categoryService.updateCategory(id, req.body);
    res.json(updated);
  } catch (error: any) {
    log.error('updateCategory error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function deleteCategory(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ message: 'ID de categoría inválido' });
      return;
    }

    const categoria = await Categoria.findByPk(id, { attributes: ['evento_id'] });
    if (!categoria) return res.status(404).json({ message: 'Categoria no encontrada' });

    if (!perteneceAlAlcance(req.alcance, categoria.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a esta categoría' });
    }

    const result = await categoryService.deleteCategory(id);
    res.json(result);
  } catch (error: any) {
    log.error('deleteCategory error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}
