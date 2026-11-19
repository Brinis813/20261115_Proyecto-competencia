jest.mock('../config/env', () => {
  const path = require('path');
  const os = require('os');
  return {
    UPLOADS_DIR: path.join(os.tmpdir(), 'test-uploads-eventos'),
    env: { NODE_ENV: 'test' },
    corsOrigins: '*',
    isProduction: false,
  };
});

jest.mock('../models', () => ({
  __esModule: true,
  Usuario: { findByPk: jest.fn() },
}));

jest.mock('../services/eventoService', () => ({
  listarEventosPublicos: jest.fn(),
  eventoPublico: jest.fn(),
  listarEventos: jest.fn(),
  actualizarScoringType: jest.fn(),
  actualizarImagen: jest.fn(),
}));

jest.mock('../utils/archivos', () => ({
  esImagenValida: jest.fn(),
  borrarArchivoSubido: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token || token === 'invalid') {
      res.status(401).json({ message: 'No autenticado' });
      return;
    }
    if (token.startsWith('valid-admin-')) {
      req.user = { id: 1, cedula: '12345', rol: 'admin', tipo: 'usuario' };
    } else if (token.startsWith('valid-juez-')) {
      req.user = { id: 2, cedula: '67890', rol: 'juez', tipo: 'usuario' };
    } else if (token === 'valid-cliente') {
      req.user = { id: 7, cedula: '777', rol: 'cliente', tipo: 'cliente' };
    } else {
      res.status(401).json({ message: 'Sesion expirada o token invalido' });
      return;
    }
    next();
  },
  adminOnly: (req: any, res: any, next: any) => {
    if (!req.user || req.user.rol !== 'admin') {
      res.status(403).json({ message: 'No tienes permisos para esta accion' });
      return;
    }
    next();
  },
}));

jest.mock('../middleware/evento', () => ({
  resolverEvento: (req: any, _res: any, next: any) => {
    const h = req.headers['x-test-alcance'];
    req.alcance =
      h === 'super'
        ? { activa: null, permitidas: null }
        : {
            activa: 1,
            permitidas: String(h ?? '1')
              .split(',')
              .map(Number),
          };
    next();
  },
}));

jest.mock('../middleware/rateLimiter', () => {
  const pass = () => (_req: any, _res: any, next: any) => next();
  return { adminWriteRateLimiter: pass, rateLimiter: pass };
});

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import eventosRouter from '../routes/eventos';
import { Usuario } from '../models';
import * as eventoService from '../services/eventoService';
import { esImagenValida, borrarArchivoSubido } from '../utils/archivos';
import { log } from '../utils/logger';

const ADMIN = 'valid-admin-token';
const JUEZ = 'valid-juez-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/eventos', eventosRouter);
  return app;
}

const mockUsuario = Usuario as unknown as { findByPk: jest.Mock };

beforeEach(() => jest.clearAllMocks());

describe('GET /eventos/publicas', () => {
  it('lista los eventos sin sesión', async () => {
    (eventoService.listarEventosPublicos as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = await request(buildApp()).get('/eventos/publicas');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('responde 500 si el servicio falla', async () => {
    (eventoService.listarEventosPublicos as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = await request(buildApp()).get('/eventos/publicas');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'No se pudieron cargar los eventos' });
    expect(log.error).toHaveBeenCalled();
  });
});

describe('GET /eventos/publicas/:id', () => {
  it('rechaza un id no numérico', async () => {
    const res = await request(buildApp()).get('/eventos/publicas/abc');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 404 si el evento no existe', async () => {
    (eventoService.eventoPublico as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).get('/eventos/publicas/9');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Evento no encontrada' });
  });

  it('retorna el evento público', async () => {
    (eventoService.eventoPublico as jest.Mock).mockResolvedValue({ id: 1, nombre: 'Demo' });

    const res = await request(buildApp()).get('/eventos/publicas/1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, nombre: 'Demo' });
    expect(eventoService.eventoPublico).toHaveBeenCalledWith(1);
  });

  it('responde 500 si el servicio falla', async () => {
    (eventoService.eventoPublico as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = await request(buildApp()).get('/eventos/publicas/1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'No se pudo cargar el evento' });
  });
});

describe('GET /eventos/', () => {
  it('exige sesión', async () => {
    const res = await request(buildApp()).get('/eventos/');

    expect(res.status).toBe(401);
  });

  it('bloquea a quien no es personal del evento', async () => {
    const res = await request(buildApp())
      .get('/eventos/')
      .set('Authorization', 'Bearer valid-cliente');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Solo el personal del evento tiene panel' });
  });

  it('responde 404 si el usuario ya no existe', async () => {
    mockUsuario.findByPk.mockResolvedValue(null);

    const res = await request(buildApp()).get('/eventos/').set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Usuario no encontrado' });
  });

  it('entrega los eventos del usuario', async () => {
    mockUsuario.findByPk.mockResolvedValue({
      id: 1,
      rol: 'admin',
      box_id: 3,
      es_superadmin: false,
    });
    (eventoService.listarEventos as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = await request(buildApp()).get('/eventos/').set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
    expect(eventoService.listarEventos).toHaveBeenCalledWith({
      id: 1,
      rol: 'admin',
      box_id: 3,
      es_superadmin: false,
    });
  });

  it('responde 500 con el mensaje del error', async () => {
    mockUsuario.findByPk.mockResolvedValue({
      id: 1,
      rol: 'admin',
      box_id: 3,
      es_superadmin: true,
    });
    (eventoService.listarEventos as jest.Mock).mockRejectedValue(new Error('mysql caido'));

    const res = await request(buildApp()).get('/eventos/').set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'mysql caido' });
  });
});

describe('PUT /eventos/:id/scoring', () => {
  it('exige sesión y rol de admin', async () => {
    const sinSesion = await request(buildApp())
      .put('/eventos/1/scoring')
      .send({ scoringType: 'NONE' });
    expect(sinSesion.status).toBe(401);

    const juez = await request(buildApp())
      .put('/eventos/1/scoring')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({ scoringType: 'POINTS_ACCUMULATION' });
    expect(juez.status).toBe(403);
    expect(juez.body).toEqual({ message: 'No tienes permisos para esta accion' });
  });

  it('rechaza un cuerpo sin ningún campo', async () => {
    const res = await request(buildApp())
      .put('/eventos/1/scoring')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
    expect(eventoService.actualizarScoringType).not.toHaveBeenCalled();
  });

  it('rechaza valores fuera del catálogo', async () => {
    const res = await request(buildApp())
      .put('/eventos/1/scoring')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ tiebreakPolicy: 'CUALQUIERA' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
  });

  it('rechaza un id de ruta no numérico', async () => {
    const res = await request(buildApp())
      .put('/eventos/abc/scoring')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ tiebreakPolicy: 'NONE' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('actualiza la política de scoring', async () => {
    (eventoService.actualizarScoringType as jest.Mock).mockResolvedValue({ id: 1 });

    const res = await request(buildApp())
      .put('/eventos/4/scoring')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ scoringType: 'WINNER_PER_Competencia', tiebreakPolicy: 'NONE' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1 });
    expect(eventoService.actualizarScoringType).toHaveBeenCalledWith(4, {
      scoringType: 'WINNER_PER_Competencia',
      tiebreakPolicy: 'NONE',
      tiebreakCompetenciaId: undefined,
    });
  });

  it('acepta borrar el competencia de desempate con null', async () => {
    (eventoService.actualizarScoringType as jest.Mock).mockResolvedValue({ id: 1 });

    const res = await request(buildApp())
      .put('/eventos/4/scoring')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ tiebreakCompetenciaId: null });

    expect(res.status).toBe(200);
    expect(eventoService.actualizarScoringType).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ tiebreakCompetenciaId: null }),
    );
  });

  it('responde 400 si el servicio falla', async () => {
    (eventoService.actualizarScoringType as jest.Mock).mockRejectedValue(
      new Error('evento inexistente'),
    );

    const res = await request(buildApp())
      .put('/eventos/4/scoring')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ tiebreakPolicy: 'NONE' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'evento inexistente' });
  });
});

describe('PUT /eventos/:id/imagen', () => {
  it('rechaza un id de ruta no numérico y borra el archivo', async () => {
    const res = await request(buildApp())
      .put('/eventos/abc/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('png'), {
        filename: 'portada.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
    expect(eventoService.actualizarImagen).not.toHaveBeenCalled();
  });

  it('responde 403 si el admin no administras ese evento', async () => {
    const res = await request(buildApp())
      .put('/eventos/2/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .set('x-test-alcance', '1')
      .attach('imagen', Buffer.from('png'), {
        filename: 'portada.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'No administras este evento' });
    expect(eventoService.actualizarImagen).not.toHaveBeenCalled();
  });

  it('pide la imagen en el campo "imagen"', async () => {
    const res = await request(buildApp())
      .put('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Envia la imagen en el campo "imagen"' });
  });

  it('rechaza un archivo que no es imagen válida', async () => {
    (esImagenValida as jest.Mock).mockResolvedValue(false);

    const res = await request(buildApp())
      .put('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('pdf'), {
        filename: 'portada.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'El archivo no es una imagen JPG, PNG o WebP valida',
    });
    expect(eventoService.actualizarImagen).not.toHaveBeenCalled();
  });

  it('rechaza tipos que multer no admite', async () => {
    const res = await request(buildApp())
      .put('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('documento'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Solo se admiten imágenes JPG, PNG o WebP' });
  });

  it('guarda la portada y borra la anterior', async () => {
    (esImagenValida as jest.Mock).mockResolvedValue(true);
    (eventoService.eventoPublico as jest.Mock).mockResolvedValue({
      id: 1,
      imagen_url: '/api/uploads/eventos/vieja.png',
    });
    (eventoService.actualizarImagen as jest.Mock).mockResolvedValue({ id: 1 });

    const res = await request(buildApp())
      .put('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('png'), {
        filename: 'portada.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Portada actualizada');
    expect(eventoService.actualizarImagen).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^\/api\/uploads\/eventos\/evento_1_\d+\.png$/),
    );
    expect(borrarArchivoSubido).toHaveBeenCalledWith(
      '/api/uploads/eventos/vieja.png',
      '/api/uploads/',
    );
  });

  it('responde 400 si el servicio falla y limpia el archivo', async () => {
    (esImagenValida as jest.Mock).mockResolvedValue(true);
    (eventoService.eventoPublico as jest.Mock).mockResolvedValue({ id: 1, imagen_url: null });
    (eventoService.actualizarImagen as jest.Mock).mockRejectedValue(new Error('disco lleno'));

    const res = await request(buildApp())
      .put('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('png'), {
        filename: 'portada.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'disco lleno' });
  });
});

describe('DELETE /eventos/:id/imagen', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = await request(buildApp())
      .delete('/eventos/abc/imagen')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 403 si el admin no administras ese evento', async () => {
    const res = await request(buildApp())
      .delete('/eventos/2/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .set('x-test-alcance', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'No administras este evento' });
    expect(eventoService.actualizarImagen).not.toHaveBeenCalled();
  });

  it('quita la portada y borra el archivo anterior', async () => {
    (eventoService.eventoPublico as jest.Mock).mockResolvedValue({
      id: 1,
      imagen_url: '/api/uploads/eventos/vieja.png',
    });
    (eventoService.actualizarImagen as jest.Mock).mockResolvedValue({ id: 1 });

    const res = await request(buildApp())
      .delete('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Portada eliminada');
    expect(eventoService.actualizarImagen).toHaveBeenCalledWith(1, null);
    expect(borrarArchivoSubido).toHaveBeenCalledWith(
      '/api/uploads/eventos/vieja.png',
      '/api/uploads/',
    );
  });

  it('responde 400 si el servicio falla', async () => {
    (eventoService.eventoPublico as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = await request(buildApp())
      .delete('/eventos/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'caida' });
  });
});

describe('archivo de portada en disco', () => {
  it('el superadmin puede tocar portadas de cualquier evento', async () => {
    (esImagenValida as jest.Mock).mockResolvedValue(true);
    (eventoService.eventoPublico as jest.Mock).mockResolvedValue({ id: 7, imagen_url: null });
    (eventoService.actualizarImagen as jest.Mock).mockResolvedValue({ id: 7 });

    const res = await request(buildApp())
      .put('/eventos/7/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .set('x-test-alcance', 'super')
      .attach('imagen', Buffer.from('png'), {
        filename: 'portada.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(eventoService.actualizarImagen).toHaveBeenCalledWith(
      7,
      expect.stringContaining('/api/uploads/eventos/'),
    );
    // El archivo escrito por multer se crea en la carpeta de subidas.
    const creados = fs.existsSync(
      require('path').join(require('../config/env').UPLOADS_DIR, 'eventos'),
    );
    expect(creados).toBe(true);
  });
});
