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
    <div data-testid="alert" data-tone={tone}>{children}</div>
  ),
  Button: ({ children, onClick, loading }: { children: React.ReactNode; onClick?: () => void; loading?: boolean }) => (
    <button onClick={onClick} disabled={loading}>{children}</button>
  ),
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  EmptyState: ({ title }: { title?: string }) => (
    <div data-testid="empty-state">{title && <span>{title}</span>}</div>
  ),
  Field: ({ label, type, value, onChange }: { label?: string; type?: string; value?: unknown; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div><label>{label}</label><input type={type} value={value as string} onChange={onChange} /></div>
  ),
  IconButton: ({ label }: { label?: string }) => <button aria-label={label}>icon</button>,
  Select: ({ label, children, value, onChange }: { label?: string; children: React.ReactNode; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }) => (
    <div><label>{label}</label><select value={value} onChange={onChange}>{children}</select></div>
  ),
  SkeletonList: () => <div data-testid="skeleton-list" />,
}));

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

import HeatsPage from '../pages/admin/HeatsPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('HeatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url === '/categories') return Promise.resolve({ data: [] });
      if (url === '/competencias') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { heats: [], sinAsignar: [] } });
    });
  });

  it('renders loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<HeatsPage />, { wrapper });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders page title', async () => {
    render(<HeatsPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Heats' })).toBeInTheDocument();
    });
  });

  it('renders category and competition selectors', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/categories') return Promise.resolve({ data: [{ id: 1, nombre: 'RX', genero: 'Masculino' }] });
      if (url === '/competencias') return Promise.resolve({ data: [{ id: 1, nombre: 'WOD 1' }] });
      return Promise.resolve({ data: { heats: [], sinAsignar: [] } });
    });
    render(<HeatsPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('RX Masculino')).toBeInTheDocument();
    });
    expect(screen.getByText('WOD 1')).toBeInTheDocument();
  });

  it('renders configuration section when category is selected', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/categories') return Promise.resolve({ data: [{ id: 1, nombre: 'RX', genero: 'Masculino' }] });
      if (url === '/competencias') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { heats: [], sinAsignar: [] } });
    });
    render(<HeatsPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Series de la categoría')).toBeInTheDocument();
    });
    expect(screen.getByText('Generar series')).toBeInTheDocument();
    expect(screen.getByText('Serie vacía')).toBeInTheDocument();
  });

  it('shows empty heats state when no series exist', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/categories') return Promise.resolve({ data: [{ id: 1, nombre: 'RX', genero: 'Masculino' }] });
      if (url === '/competencias') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { heats: [], sinAsignar: [] } });
    });
    render(<HeatsPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Series de la categoría')).toBeInTheDocument();
    });
  });
});
