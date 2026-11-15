import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/layout/AppShell', () => ({
  default: ({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) => (
    <div data-testid="app-shell">
      {title && <h1>{title}</h1>}
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}));

vi.mock('../components/ui', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
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

import JuezCompetenciasPage from '../pages/judge/JuezCompetenciasPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('JuezCompetenciasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra skeleton mientras carga', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<JuezCompetenciasPage />, { wrapper });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Medir' })).toBeInTheDocument();
  });

  it('muestra empty state sin competencias', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<JuezCompetenciasPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/no tienes competencias/i)).toBeInTheDocument();
  });

  it('lista competencias con wods y categorias', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, nombre: 'Evento 1', wods: [{ id: 1 }, { id: 2 }], divisiones: ['RX', 'Scaled'] },
        { id: 2, nombre: 'Evento 2', wods: [], divisiones: [] },
      ],
    });
    render(<JuezCompetenciasPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Evento 1')).toBeInTheDocument();
    });
    expect(screen.getByText('2 wods')).toBeInTheDocument();
    expect(screen.getByText(/RX · Scaled/)).toBeInTheDocument();
    expect(screen.getByText('Evento 2')).toBeInTheDocument();
    expect(screen.getByText(/Sin categorias/)).toBeInTheDocument();
    // Enlaces hacia el paso 2 del flujo
    expect(screen.getByText('Evento 1').closest('a')).toHaveAttribute('href', '/juez/1');
  });

  it('muestra error si falla la carga', async () => {
    mockGet.mockRejectedValue(new Error('red'));
    render(<JuezCompetenciasPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('No se pudieron cargar las competencias')).toBeInTheDocument();
  });

  it('tolera payload no-array', async () => {
    mockGet.mockResolvedValue({ data: null });
    render(<JuezCompetenciasPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});
