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
  Button: ({
    children,
    onClick,
    loading,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  EmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="empty-state">
      {title && <span>{title}</span>}
      {description && <p>{description}</p>}
    </div>
  ),
  IconButton: ({ label, onClick }: { label?: string; onClick?: () => void }) => (
    <button aria-label={label} onClick={onClick}>
      icon
    </button>
  ),
  Select: ({
    label,
    children,
    value,
    onChange,
  }: {
    label?: string;
    children: React.ReactNode;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  }) => (
    <div>
      <label>{label}</label>
      <select value={value} onChange={onChange}>
        {children}
      </select>
    </div>
  ),
  SkeletonList: () => <div data-testid="skeleton-list" />,
  Spinner: () => <div data-testid="spinner" />,
  cx: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  mensajeDeError: (_err: unknown, fallback: string) => fallback,
}));

import AsignacionesPage from '../pages/admin/AsignacionesPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('AsignacionesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<AsignacionesPage />, { wrapper });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders empty state when no competencias exist', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<AsignacionesPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/no hay competencias/i)).toBeInTheDocument();
  });

  it('renders competencia selector with list', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, nombre: 'WOD 1', wods: [], divisiones: [] },
        { id: 2, nombre: 'WOD 2', wods: [], divisiones: [] },
      ],
    });
    render(<AsignacionesPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('WOD 1')).toBeInTheDocument();
    });
    expect(screen.getByText('WOD 2')).toBeInTheDocument();
  });

  it('renders AppShell with correct title', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<AsignacionesPage />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Asignaciones' })).toBeInTheDocument();
  });

  it('renders competencia list header', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<AsignacionesPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Competencias')).toBeInTheDocument();
    });
  });
});
