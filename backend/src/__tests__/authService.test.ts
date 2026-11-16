jest.mock('../config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-that-is-long-enough-for-jwt-32chars!',
    JWT_EXPIRES_IN: '4h',
    APP_URL: 'http://localhost:5173',
    NODE_ENV: 'test',
  },
}));

jest.mock('../models', () => ({
  Usuario: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
  Participante: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../services/eventoService', () => ({
  crearEventoDeEjemplo: jest.fn(),
}));

jest.mock('../services/mailService', () => ({
  correoDeVerificacion: jest.fn(),
  enviarCorreo: jest.fn().mockResolvedValue({ enviado: true }),
}));

jest.mock('../services/boxService', () => ({
  boxParaAlta: jest.fn(),
}));

import { refreshToken, loginUsuario } from '../services/authService';
import jwt from 'jsonwebtoken';
import type { TokenPayload } from '../middleware/auth';

const mockJwt = jwt as jest.Mocked<typeof jwt>;

beforeEach(() => jest.clearAllMocks());

const basePayload: TokenPayload = {
  id: 1,
  cedula: '12345',
  rol: 'admin',
  tipo: 'usuario',
};

describe('refreshToken', () => {
  it('retorna un token nuevo como string', () => {
    mockJwt.sign.mockReturnValue('new-token-abc' as any);

    const result = refreshToken(basePayload);

    expect(result.token).toBe('new-token-abc');
    expect(typeof result.token).toBe('string');
  });

  it('llama a jwt.sign con el payload correcto + origen de sesión', () => {
    mockJwt.sign.mockReturnValue('tok' as any);

    refreshToken(basePayload);

    expect(mockJwt.sign).toHaveBeenCalledWith(
      { ...basePayload, origenMs: expect.any(Number) },
      'test-secret-key-that-is-long-enough-for-jwt-32chars!',
      expect.objectContaining({ expiresIn: expect.any(Number) }),
    );
  });

  it('conserva el origen entre refreshes (no prorroga la vida absoluta)', () => {
    mockJwt.sign.mockReturnValue('tok' as any);
    const origen = Date.now() - 24 * 3600 * 1000;

    refreshToken({ ...basePayload, origenMs: origen });

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ origenMs: origen }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('rechaza refresh con sesión de más de 7 días', () => {
    expect(() =>
      refreshToken({ ...basePayload, origenMs: Date.now() - 8 * 24 * 3600 * 1000 }),
    ).toThrow(/caducada/i);
    expect(mockJwt.sign).not.toHaveBeenCalled();
  });

  it('genera tokens diferentes en cada llamada (expiracion fresca)', () => {
    mockJwt.sign.mockReturnValueOnce('token-1' as any).mockReturnValueOnce('token-2' as any);

    const r1 = refreshToken(basePayload);
    const r2 = refreshToken(basePayload);

    expect(r1.token).toBe('token-1');
    expect(r2.token).toBe('token-2');
    expect(mockJwt.sign).toHaveBeenCalledTimes(2);
  });

  it('usa la expiracion calculada desde JWT_EXPIRES_IN', () => {
    mockJwt.sign.mockReturnValue('tok' as any);

    refreshToken(basePayload);

    const callArgs = mockJwt.sign.mock.calls[0];
    const expiresIn = (callArgs[2] as any).expiresIn;
    // 4h = 14400 seconds
    expect(expiresIn).toBe(14400);
  });
});

describe('segundosDeExpiracion (via env.JWT_EXPIRES_IN)', () => {
  const testCases = [
    { value: '24h', expected: 86400 },
    { value: '4h', expected: 14400 },
    { value: '7d', expected: 604800 },
    { value: '30m', expected: 1800 },
    { value: '3600', expected: 3600 },
  ];

  it.each(testCases)('parsea $value a $expected segundos', ({ value, expected }) => {
    const envMod = require('../config/env');
    const original = envMod.env.JWT_EXPIRES_IN;
    envMod.env.JWT_EXPIRES_IN = value;

    mockJwt.sign.mockReturnValue('tok' as any);
    refreshToken(basePayload);

    const callArgs = mockJwt.sign.mock.calls[0];
    expect((callArgs[2] as any).expiresIn).toBe(expected);

    envMod.env.JWT_EXPIRES_IN = original;
  });
});

describe('loginUsuario', () => {
  it('lanza error con credenciales invalidas (usuario no encontrado)', async () => {
    const { Usuario } = require('../models');
    Usuario.findOne.mockResolvedValue(null);
    const bcrypt = require('bcrypt');
    bcrypt.compare.mockResolvedValue(false);

    await expect(loginUsuario('00000', 'wrong')).rejects.toThrow('Cedula o contrasena incorrectos');
  });

  it('lanza error si el email no esta verificado', async () => {
    const { Usuario } = require('../models');
    Usuario.findOne.mockResolvedValue({
      id: 1,
      cedula: '12345',
      password: 'hashed',
      email_verificado: false,
      rol: 'admin',
    });
    const bcrypt = require('bcrypt');
    bcrypt.compare.mockResolvedValue(true);

    await expect(loginUsuario('12345', 'pass')).rejects.toThrow(
      'Confirma tu correo antes de entrar',
    );
  });

  it('retorna token y perfil cuando las credenciales son validas', async () => {
    const { Usuario } = require('../models');
    Usuario.findOne.mockResolvedValue({
      id: 1,
      cedula: '12345',
      password: 'hashed',
      email_verificado: true,
      rol: 'admin',
      password_cambiado: true,
      nombre: 'Juan',
      apellidos: 'Perez',
      box: 'CF',
      email: 'j@j.com',
      es_superadmin: false,
      box_id: 1,
    });
    const bcrypt = require('bcrypt');
    bcrypt.compare.mockResolvedValue(true);
    mockJwt.sign.mockReturnValue('valid-token' as any);

    const result = await loginUsuario('12345', 'pass');

    expect(result.token).toBe('valid-token');
    expect(result.needsPasswordChange).toBe(false);
    expect(result.user.rol).toBe('admin');
  });
});
