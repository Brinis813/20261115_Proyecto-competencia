import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/layout/Brand', () => ({
  default: () => <div data-testid="brand" />,
}));

const navigateFn = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, replace, state }: { to: string; replace?: boolean; state?: unknown }) => {
      navigateFn(to, { replace, state });
      return null;
    },
  };
});

const { mockUseAuthFn } = vi.hoisted(() => ({
  mockUseAuthFn: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuthFn(...args),
  rutaInicial: (rol: string) => {
    if (rol === 'admin') return '/eventos';
    if (rol === 'juez') return '/juez';
    return '/participante';
  },
  debeCambiarPassword: (user: { rol: string; password_cambiado: boolean }) =>
    user.rol !== 'participante' && !user.password_cambiado,
}));

import ProtectedRoute from '../components/ProtectedRoute';

const adminUser = {
  id: 1,
  nombre: 'A',
  apellidos: 'B',
  cedula: '123',
  box: 'Box1',
  rol: 'admin' as const,
  password_cambiado: true,
};

const participanteUser = {
  id: 3,
  nombre: 'P',
  apellidos: 'X',
  cedula: '789',
  box: 'Box1',
  rol: 'participante' as const,
  password_cambiado: true,
};

const adminNeedPassword = {
  ...adminUser,
  password_cambiado: false,
};

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    vi.clearAllMocks();
    mockUseAuthFn.mockReturnValue({ user: adminUser, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute allowedRoles={['admin']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it('redirects to /login when not authenticated', () => {
    vi.clearAllMocks();
    mockUseAuthFn.mockReturnValue({ user: null, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(navigateFn).toHaveBeenCalledWith('/login', { replace: true, state: { from: '/' } });
  });

  it('redirects to role home when role not in allowedRoles', () => {
    vi.clearAllMocks();
    mockUseAuthFn.mockReturnValue({ user: participanteUser, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute allowedRoles={['admin']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(navigateFn).toHaveBeenCalledWith('/participante', { replace: true });
  });

  it('shows loading spinner while auth is loading', () => {
    vi.clearAllMocks();
    mockUseAuthFn.mockReturnValue({ user: null, loading: true });
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Comprobando la sesion')).toBeInTheDocument();
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it('redirects to /cambiar-password when password not changed', () => {
    vi.clearAllMocks();
    mockUseAuthFn.mockReturnValue({ user: adminNeedPassword, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute allowedRoles={['admin']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(navigateFn).toHaveBeenCalledWith('/cambiar-password', { replace: true });
  });
});
