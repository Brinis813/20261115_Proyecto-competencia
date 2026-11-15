import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/layout/AppShell', () => ({
  default: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid="app-shell">
      {title && <h1>{title}</h1>}
      {children}
    </div>
  ),
}));

vi.mock('../components/ui', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  EmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="empty-state">
      {title && <span>{title}</span>}
      {description && <p>{description}</p>}
    </div>
  ),
  SkeletonList: () => <div data-testid="skeleton-list" />,
}));

const mockGet = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
  mensajeDeError: (_err: unknown, fallback: string) => fallback,
}));

import JuezWodsPage from '../pages/judge/JuezWodsPage';

function wrapperCompetencia1({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/juez/1']}>
      <Routes>
        <Route path="/juez/:competenciaId" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

const competenciaConWods = {
  id: 1,
  nombre: 'Evento 1',
  divisiones: ['RX'],
  wods: [
    {
      id: 10,
      orden: 2,
      nombre_ejercicio: 'Row',
      tipo_medicion: 'repeticiones',
      puntaje_maximo: 100,
      imagen_url: null,
    },
    {
      id: 11,
      orden: 1,
      nombre_ejercicio: 'Fran',
      tipo_medicion: 'tiempo',
      puntaje_maximo: 50,
      imagen_url: null,
    },
  ],
};

describe('JuezWodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra skeleton mientras carga', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('ordena wods por orden y muestra medicion y puntaje', async () => {
    mockGet.mockResolvedValue({ data: [competenciaConWods] });
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    await waitFor(() => {
      expect(screen.getByText('Fran')).toBeInTheDocument();
    });
    const items = screen.getAllByRole('link');
    expect(items[0]).toHaveAttribute('href', '/juez/1/11');
    expect(items[1]).toHaveAttribute('href', '/juez/1/10');
    expect(screen.getByText(/Max 50 pts/)).toBeInTheDocument();
    expect(screen.getByText(/Max 100 pts/)).toBeInTheDocument();
  });

  it('muestra detalle de distancia con metas por categoria', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          ...competenciaConWods,
          id: 1,
          wods: [
            {
              id: 20,
              orden: 1,
              nombre_ejercicio: 'Run',
              tipo_medicion: 'distancia',
              unidad_distancia: 'km',
              puntaje_maximo: 100,
              imagen_url: 'http://img/wod.jpg',
              esquema: { distancia_meta: { RX: 5, Scaled: 3 } },
            },
          ],
        },
      ],
    });
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    await waitFor(() => {
      expect(screen.getByText('Run')).toBeInTheDocument();
    });
    expect(screen.getByText(/kilómetros/)).toBeInTheDocument();
    expect(screen.getByText(/RX: 5 km/)).toBeInTheDocument();
  });

  it('muestra meta numerica de distancia en metros', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          ...competenciaConWods,
          wods: [
            {
              id: 21,
              orden: 1,
              nombre_ejercicio: 'Sprint',
              tipo_medicion: 'distancia',
              unidad_distancia: 'm',
              puntaje_maximo: 10,
              imagen_url: null,
              esquema: { distancia_meta: 400 },
            },
          ],
        },
      ],
    });
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    await waitFor(() => {
      expect(screen.getByText(/meta 400 m/)).toBeInTheDocument();
    });
  });

  it('error si no esta asignado a la competencia', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 2, nombre: 'Otra', wods: [] }] });
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    await waitFor(() => {
      expect(screen.getByTestId('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/no estas asignado/i)).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('error si falla la carga', async () => {
    mockGet.mockRejectedValue(new Error('red'));
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    await waitFor(() => {
      expect(screen.getByTestId('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('No se pudo cargar la competencia')).toBeInTheDocument();
  });

  it('muestra empty state si la competencia no tiene wods', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 1, nombre: 'Vacia', divisiones: null, wods: [] }] });
    render(<JuezWodsPage />, { wrapper: wrapperCompetencia1 });
    await waitFor(() => {
      expect(screen.getByText(/no tiene wods/i)).toBeInTheDocument();
    });
  });
});
