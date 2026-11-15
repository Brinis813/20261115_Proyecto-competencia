import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineSync } from '../hooks/useOfflineSync';

const mockPost = vi.fn();
vi.mock('../api/client', () => ({
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

const base = {
  participante_id: 10,
  wod_id: 1,
  valor_bruto: '120',
  abandono: false,
};

function errorConEstado(estado: number | undefined, message = '') {
  const err: Record<string, unknown> = {};
  if (estado !== undefined) {
    err.response = { status: estado, data: { message } };
  }
  return err;
}

describe('useOfflineSync: nunca encola 400/422 (y clasifica el resto)', () => {
  // Vaciar el store (no deleteDatabase: se bloquearía por las conexiones
  // abiertas de los hooks ya montados).
  async function vaciarCola() {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('competition-offline', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('resultados-pendientes')) {
          req.result.createObjectStore('resultados-pendientes', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('resultados-pendientes', 'readwrite');
      tx.objectStore('resultados-pendientes').clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  beforeEach(async () => {
    mockPost.mockReset();
    await vaciarCola();
  });

  async function pendienteTrasSync(fallo: unknown) {
    mockPost.mockRejectedValueOnce(fallo);
    const { result, unmount } = renderHook(() => useOfflineSync());
    await act(async () => {
      await result.current.savePending({ ...base });
    });
    await act(async () => {
      await result.current.syncPending();
    });
    const n = result.current.pendingCount;
    unmount();
    return n;
  }

  it('400 validación → se descarta (reintentar no ayuda)', async () => {
    expect(await pendienteTrasSync(errorConEstado(400, 'Datos invalidos'))).toBe(0);
  });

  it('422 → se descarta', async () => {
    expect(await pendienteTrasSync(errorConEstado(422, 'No procesable'))).toBe(0);
  });

  it('403/404 → se descartan', async () => {
    expect(await pendienteTrasSync(errorConEstado(403, 'Sin acceso'))).toBe(0);
    expect(await pendienteTrasSync(errorConEstado(404, 'No existe'))).toBe(0);
  });

  it('409 duplicado ("ya tiene") → se descarta para no atascar la cola', async () => {
    expect(
      await pendienteTrasSync(errorConEstado(409, 'El participante ya tiene un resultado registrado'))
    ).toBe(0);
  });

  it('409 de pausa → se conserva (entra al reanudar)', async () => {
    expect(await pendienteTrasSync(errorConEstado(409, 'Heat en pausa'))).toBe(1);
  });

  it('429 → se conserva y respeta backoff', async () => {
    expect(await pendienteTrasSync(errorConEstado(429, 'Demasiadas peticiones'))).toBe(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('fallo de red (sin respuesta) → se conserva', async () => {
    expect(await pendienteTrasSync(errorConEstado(undefined))).toBe(1);
  });

  it('500 → se conserva para el siguiente intento', async () => {
    expect(await pendienteTrasSync(errorConEstado(500, 'Error interno'))).toBe(1);
  });

  it('éxito → se elimina de la cola', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });
    const { result, unmount } = renderHook(() => useOfflineSync());
    await act(async () => {
      await result.current.savePending({ ...base });
    });
    await act(async () => {
      await result.current.syncPending();
    });
    expect(result.current.pendingCount).toBe(0);
    unmount();
  });
});
