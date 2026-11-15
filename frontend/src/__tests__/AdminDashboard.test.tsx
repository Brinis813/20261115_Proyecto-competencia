import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/layout/AppShell', () => ({
  default: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid="app-shell">
      {title && <h1>{title}</h1>}
      {children}
    </div>
  ),
}));

vi.mock('../components/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  cx: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('../components/eventos/PortadaEditor', () => ({
  default: () => <div data-testid="portada-editor" />,
}));

vi.mock('../types', () => ({
  ETIQUETA_SCORING: {
    POINTS_ACCUMULATION: 'Puntos acumulados',
    WINNER_PER_COMPETENCIA: 'Ganador por competencia',
  },
  ETIQUETA_TIEBREAK_GLOBAL: {
    NONE: 'Sin desempate',
    BEST_INDIVIDUAL_RANK: 'Mejores puestos',
    DESIGNATED_TIEBREAK_COMPETENCIA: 'Competencia designada',
    LAST_COMPETENCIA_SCORE: 'Ultima competencia',
  },
}));

const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
  getEventoActiva: () => null,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import AdminDashboard from '../pages/admin/AdminDashboard';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url === '/competencias') return Promise.resolve({ data: [] });
      if (url === '/users/jueces') return Promise.resolve({ data: [] });
      if (url === '/users/participantes') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('shows skeleton divs before data loads', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AdminDashboard />, { wrapper });
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders stat cards after loading', async () => {
    render(<AdminDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Competencias')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Jueces').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Atletas').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('En vivo')).toBeInTheDocument();
  });

  it('renders metrics with correct values', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/competencias') return Promise.resolve({ data: [{ id: 1 }, { id: 2 }] });
      if (url === '/users/jueces') return Promise.resolve({ data: [{ id: 1 }] });
      if (url === '/users/participantes') return Promise.resolve({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
      return Promise.resolve({ data: [] });
    });
    render(<AdminDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders quick access section', async () => {
    render(<AdminDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Accesos rapidos')).toBeInTheDocument();
    });
  });

  it('shows empty state when no competencias exist', async () => {
    render(<AdminDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/todavia no has creado/i)).toBeInTheDocument();
    });
  });
});
