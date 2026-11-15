import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/layout/Brand', () => ({
  default: () => <div data-testid="brand" />,
}));

const { mockLoginFn, mockLoginParticipanteFn, mockUseAuthFn } = vi.hoisted(() => ({
  mockLoginFn: vi.fn(),
  mockLoginParticipanteFn: vi.fn(),
  mockUseAuthFn: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuthFn(),
  destinoTrasLogin: (user: { rol: string; password_cambiado: boolean }) => {
    if (user.rol !== 'participante' && !user.password_cambiado) return '/cambiar-password';
    if (user.rol === 'admin') return '/eventos';
    if (user.rol === 'juez') return '/juez';
    return '/participante';
  },
}));

vi.mock('../api/client', () => ({
  mensajeDeError: (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message;
    return fallback;
  },
}));

import LoginPage from '../pages/auth/LoginPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthFn.mockReturnValue({
      user: null,
      loading: false,
      login: mockLoginFn,
      loginParticipante: mockLoginParticipanteFn,
    });
  });

  it('renders login form with cedula and password fields', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByLabelText('Cedula')).toBeInTheDocument();
    expect(screen.getByLabelText('Contrasena')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('renders staff and athlete tabs', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByRole('tab', { name: /admin \/ juez/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /atleta/i })).toBeInTheDocument();
  });

  it('calls login API on form submit with valid data', async () => {
    const user = userEvent.setup();
    mockLoginFn.mockResolvedValue(undefined);

    render(<LoginPage />, { wrapper });

    await user.type(screen.getByLabelText('Cedula'), '1234567890');
    await user.type(screen.getByLabelText('Contrasena'), 'password123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(mockLoginFn).toHaveBeenCalledWith('1234567890', 'password123');
  });

  it('shows error message on failed login', async () => {
    const user = userEvent.setup();
    mockLoginFn.mockRejectedValue(new Error('Credenciales invalidas'));

    render(<LoginPage />, { wrapper });

    await user.type(screen.getByLabelText('Cedula'), '1234567890');
    await user.type(screen.getByLabelText('Contrasena'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('Credenciales invalidas')).toBeInTheDocument();
  });

  it('switches to athlete mode and shows birth date field', async () => {
    const user = userEvent.setup();
    render(<LoginPage />, { wrapper });

    await user.click(screen.getByRole('tab', { name: /atleta/i }));

    expect(screen.getByLabelText('Fecha de nacimiento')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contrasena')).not.toBeInTheDocument();
  });

  it('calls loginParticipante in athlete mode', async () => {
    const user = userEvent.setup();
    mockLoginParticipanteFn.mockResolvedValue(undefined);

    render(<LoginPage />, { wrapper });

    await user.click(screen.getByRole('tab', { name: /atleta/i }));
    await user.type(screen.getByLabelText('Cedula'), '1234567890');
    await user.type(screen.getByLabelText('Fecha de nacimiento'), '1990/05/15');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(mockLoginParticipanteFn).toHaveBeenCalledWith('1234567890', '1990/05/15');
  });

  it('redirects to home when already logged in', () => {
    mockUseAuthFn.mockReturnValue({
      user: { id: 1, rol: 'admin', password_cambiado: true },
      loading: false,
      login: mockLoginFn,
      loginParticipante: mockLoginParticipanteFn,
    });

    render(<LoginPage />, { wrapper });
    expect(screen.queryByLabelText('Cedula')).not.toBeInTheDocument();
  });

  it('displays links for registration and leaderboard', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByRole('link', { name: /crea tu cuenta/i })).toHaveAttribute('href', '/registro');
    expect(screen.getByRole('link', { name: /ver clasificacion en vivo/i })).toHaveAttribute('href', '/inicio');
  });
});
