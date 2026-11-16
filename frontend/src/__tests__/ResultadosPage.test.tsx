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
  Alert: ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
    <div data-testid="alert" data-tone={tone}>
      {children}
    </div>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  EmptyState: ({ title }: { title?: string }) => (
    <div data-testid="empty-state">{title && <span>{title}</span>}</div>
  ),
  IconButton: ({ label, onClick }: { label?: string; onClick?: () => void }) => (
    <button aria-label={label} onClick={onClick}>
      icon
    </button>
  ),
  SkeletonList: ({ rows: _rows }: { rows?: number }) => <div data-testid="skeleton-list" />,
  Spinner: () => <div data-testid="spinner" />,
  cx: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('../utils/export', () => ({
  csvResultadosCompetencia: vi.fn(),
  descargarTexto: vi.fn(),
  nombreArchivo: vi.fn(),
}));

const mockNavigate = vi.fn();
const mockGet = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

vi.mock('../api/client', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
  mensajeDeError: (_err: unknown, fallback: string) => fallback,
}));

import ResultadosPage from '../pages/admin/ResultadosPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('ResultadosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ResultadosPage />, { wrapper });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders empty state when no competencias exist', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<ResultadosPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/no hay competencias/i)).toBeInTheDocument();
  });

  it('renders competencia list when data loads', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, nombre: 'WOD 1', wods: [], divisiones: [] },
        { id: 2, nombre: 'WOD 2', wods: [], divisiones: [] },
      ],
    });
    render(<ResultadosPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('WOD 1')).toBeInTheDocument();
    });
    expect(screen.getByText('WOD 2')).toBeInTheDocument();
  });

  it('renders AppShell with correct title', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ResultadosPage />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
  });

  it('renders competencia selector header', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<ResultadosPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Competencias')).toBeInTheDocument();
    });
  });
});
