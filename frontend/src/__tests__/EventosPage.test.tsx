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

vi.mock('../components/eventos/GruposEventos', () => ({
  default: ({ eventos }: { eventos: unknown[] }) => (
    <div data-testid="grupos-eventos">{eventos.length} eventos</div>
  ),
}));

vi.mock('../components/ui', () => ({
  Alert: ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
    <div data-testid="alert" data-tone={tone}>{children}</div>
  ),
  EmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="empty-state">
      {title && <span>{title}</span>}
      {description && <p>{description}</p>}
    </div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="panel">{children}</div>,
  Spinner: ({ label }: { label?: string }) => <div data-testid="spinner">{label}</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGet = vi.fn();
vi.mock('../api/client', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
  mensajeDeError: (_err: unknown, fallback: string) => fallback,
  setEventoActiva: vi.fn(),
}));

import EventosPage from '../pages/EventosPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('EventosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<EventosPage />, { wrapper });
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders empty state when no events exist', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<EventosPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/todavia no tienes eventos/i)).toBeInTheDocument();
  });

  it('renders events list when events are loaded', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, nombre: 'Evento Test', estado: 'activo' },
        { id: 2, nombre: 'Evento 2', estado: 'borrador' },
      ],
    });
    render(<EventosPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('grupos-eventos')).toBeInTheDocument();
    });
    expect(screen.getByText('2 eventos')).toBeInTheDocument();
  });

  it('shows error alert on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<EventosPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/no se pudieron cargar los eventos/i)).toBeInTheDocument();
  });

  it('renders AppShell with correct title', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<EventosPage />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Eventos' })).toBeInTheDocument();
  });
});
