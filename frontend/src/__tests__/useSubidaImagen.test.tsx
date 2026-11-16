import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, fireEvent, render, screen } from '@testing-library/react';
import {
  MAX_MB_IMAGEN,
  validarArchivoImagen,
  useVistaPrevia,
  useSubidaImagen,
} from '../hooks/useSubidaImagen';

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  mensajeDeError: (err: unknown, porDefecto = 'Error') =>
    (err as { message?: string })?.message ?? porDefecto,
}));

const jpg = (size = 100) => new File([new Uint8Array(size)], 'foto.jpg', { type: 'image/jpeg' });

describe('validarArchivoImagen', () => {
  it('acepta JPG/PNG/WebP dentro del límite', () => {
    expect(validarArchivoImagen(jpg())).toBeNull();
    expect(
      validarArchivoImagen(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })),
    ).toBeNull();
    expect(
      validarArchivoImagen(new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' })),
    ).toBeNull();
  });

  it('rechaza tipos no admitidos', () => {
    expect(validarArchivoImagen(new File(['x'], 'a.gif', { type: 'image/gif' }))).toMatch(/JPG/i);
    expect(
      validarArchivoImagen(new File(['x'], 'a.exe', { type: 'application/octet-stream' })),
    ).toMatch(/JPG/i);
  });

  it('rechaza más de 5 MB (y acepta el borde)', () => {
    expect(validarArchivoImagen(jpg(MAX_MB_IMAGEN * 1024 * 1024 + 1))).toMatch(/supera/i);
    expect(validarArchivoImagen(jpg(MAX_MB_IMAGEN * 1024 * 1024))).toBeNull();
  });
});

describe('useVistaPrevia', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:previa');
    URL.revokeObjectURL = vi.fn();
  });

  it('crea y revoca el objectURL al cambiar/limpiar', () => {
    const { result, rerender, unmount } = renderHook(
      ({ f }: { f: File | null }) => useVistaPrevia(f),
      {
        initialProps: { f: null as File | null },
      },
    );
    expect(result.current).toBeNull();
    const archivo = jpg();
    rerender({ f: archivo });
    expect(URL.createObjectURL).toHaveBeenCalledWith(archivo);
    expect(result.current).toBe('blob:previa');
    rerender({ f: null });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa');
    expect(result.current).toBeNull();
    unmount();
  });
});

describe('useSubidaImagen', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:previa');
    URL.revokeObjectURL = vi.fn();
  });

  const persistencia = {
    cargar: async () => ({ url: '/api/uploads/x/1.jpg' as string | null, titulo: 'Evento' }),
    guardar: async () => '/api/uploads/x/2.jpg' as string | null,
    quitar: async () => {},
  };

  it('carga el estado inicial', async () => {
    const { result } = renderHook(() => useSubidaImagen(persistencia));
    await act(async () => {});
    expect(result.current.imagenUrl).toBe('/api/uploads/x/1.jpg');
    expect(result.current.titulo).toBe('Evento');
    expect(result.current.cargando).toBe(false);
  });

  it('onElegir inválido muestra error sin subir', async () => {
    const guardar = vi.fn();
    const { result } = renderHook(() => useSubidaImagen({ ...persistencia, guardar }));
    await act(async () => {});
    render(<input data-testid="f" type="file" onChange={result.current.onElegir} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId('f'), {
        target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
      });
    });
    expect(result.current.error).toMatch(/JPG/i);
    expect(result.current.seleccion).toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('guardar/quitar actualizan la URL', async () => {
    const { result } = renderHook(() => useSubidaImagen(persistencia));
    await act(async () => {});
    render(<input data-testid="f" type="file" onChange={result.current.onElegir} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId('f'), { target: { files: [jpg()] } });
    });
    expect(result.current.seleccion).not.toBeNull();
    await act(async () => {
      await result.current.guardar();
    });
    expect(result.current.imagenUrl).toBe('/api/uploads/x/2.jpg');
    expect(result.current.seleccion).toBeNull();
    await act(async () => {
      await result.current.quitar();
    });
    expect(result.current.imagenUrl).toBeNull();
  });
});
