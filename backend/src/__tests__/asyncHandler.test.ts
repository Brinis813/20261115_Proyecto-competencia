import { asyncHandler } from '../middleware/asyncHandler';

describe('asyncHandler', () => {
  it('deja pasar la respuesta normal y no llama a next', async () => {
    const next = jest.fn();
    const req = {} as any;
    const res = { json: jest.fn() } as any;
    await new Promise<void>((resolve) => {
      asyncHandler(async (_req, res) => {
        res.json({ ok: true });
        resolve();
      })(req, res, next);
    });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('un rechazo fuera de try llega a next(err), no cuelga', async () => {
    const next = jest.fn();
    const fallo = new Error('MySQL caído');
    asyncHandler(async () => {
      throw fallo;
    })({} as any, {} as any, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(fallo);
  });
});
