import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  Button: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  Field: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }) => (
    <div>
      <label>{label}</label>
      <input aria-label={label} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  ),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { nombre: 'Juez', apellidos: 'Uno' } }),
}));

vi.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ socket: null }),
}));

vi.mock('../hooks/useTimer', () => ({
  useTimer: () => ({
    elapsed: 0,
    isRunning: false,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    formatTime: () => '00:00.00',
  }),
}));

vi.mock('../hooks/useWakeLock', () => ({
  useWakeLock: () => ({ isSupported: false, request: vi.fn(), release: vi.fn() }),
}));

const mockSavePending = vi.fn();
const mockSyncPending = vi.fn();
vi.mock('../hooks/useOfflineSync', () => ({
  useOfflineSync: () => ({
    pendingCount: 0,
    savePending: mockSavePending,
    syncPending: mockSyncPending,
  }),
}));

vi.mock('../components/layout/ConnectionBadge', () => ({
  useEstaEnLinea: () => true,
}));

vi.mock('../components/judge/CuentaAtras', () => ({
  default: () => <div data-testid="cuenta-atras" />,
}));
vi.mock('../components/judge/ChecklistPrevio', () => ({
  default: () => <div data-testid="checklist" />,
  PUNTOS_CHECKLIST: ['a', 'b', 'c', 'd'],
}));
vi.mock('../components/judge/ContadorReps', () => ({
  default: () => <div data-testid="contador-reps" />,
}));
vi.mock('../components/judge/ContadorSegmentos', () => ({
  default: () => <div data-testid="contador-segmentos" />,
}));
vi.mock('../components/judge/ContadorEsquema', () => ({
  default: () => <div data-testid="contador-esquema" />,
}));
vi.mock('../components/judge/CompetenciaStartBanner', () => ({
  default: () => <div data-testid="start-banner" />,
}));
vi.mock('../components/judge/RegistroNoReps', () => ({
  default: () => <div data-testid="registro-noreps" />,
}));
vi.mock('../components/judge/IntentosPeso', () => ({
  default: () => <div data-testid="intentos-peso" />,
  MAX_INTENTOS: 3,
  BARRA_POR_DEFECTO: 20,
}));
vi.mock('../components/judge/TemporizadorIntervalos', () => ({
  default: () => <div data-testid="temporizador-intervalos" />,
  PRESETS: {
    emom: { etiqueta: 'EMOM 10', config: { segundosTrabajo: 60, segundosDescanso: 0, rondas: 10 } },
  },
}));

vi.mock('../stores/competenciaStartStore', () => ({
  useCompetenciaStartStore: (
    sel: (s: { snapshot: null; fase: string; inicioManual: null }) => unknown,
  ) => sel({ snapshot: null, fase: 'idle', inicioManual: null }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ competenciaId: '1', wodId: '10' }),
    useNavigate: () => vi.fn(),
  };
});

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  mensajeDeError: (err: any, fallback?: string) =>
    err?.response?.data?.message ?? fallback ?? 'Error',
}));

import JuezMedicionPage from '../pages/judge/JuezMedicionPage';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/juez/1/10']}>
      <Routes>
        <Route path="/juez/:competenciaId/:wodId" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

const wodTiempo = {
  id: 10,
  orden: 1,
  nombre_ejercicio: 'Fran',
  tipo_medicion: 'tiempo',
  puntaje_maximo: 100,
  tiempo_cap: 0,
  esquema: null,
  imagen_url: null,
};
const competenciaBase = {
  id: 1,
  nombre: 'Evento',
  divisiones: ['RX'],
  rondas: 1,
  wods: [wodTiempo],
};

describe('JuezMedicionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra error si no esta asignado al WOD', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 2, nombre: 'Otra', wods: [] }] });
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/no estas asignado/i)).toBeInTheDocument();
  });

  it('muestra error si falla la carga', async () => {
    mockGet.mockRejectedValue(new Error('red'));
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('No se pudo cargar el WOD')).toBeInTheDocument();
    });
  });

  it('carga el WOD y muestra el buscador de atleta', async () => {
    mockGet.mockResolvedValue({ data: [competenciaBase] });
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Identifica al atleta')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Fran' })).toBeInTheDocument();
    // Sin cedula el boton Buscar esta deshabilitado
    expect(screen.getByRole('button', { name: /buscar/i })).toBeDisabled();
  });

  it('buscar con exito pasa al paso medir (cronometro de tiempo)', async () => {
    mockGet.mockResolvedValue({ data: [competenciaBase] });
    mockPost.mockImplementation((url: string) => {
      if (url === '/participant/lookup') {
        return Promise.resolve({
          data: { id: 7, nombre: 'Ana', apellidos: 'Ruiz', cedula: '123', categoria: 'RX' },
        });
      }
      return Promise.resolve({ data: { exists: false } });
    });
    const user = userEvent.setup();
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Identifica al atleta')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/cedula del participante/i), '123');
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await waitFor(() => {
      expect(screen.getByText(/Ana Ruiz/)).toBeInTheDocument();
    });
    expect(screen.getByText('Cronometro')).toBeInTheDocument();
    expect(screen.getByTestId('checklist')).toBeInTheDocument();
  });

  it('buscar muestra error si ya tiene medicion', async () => {
    mockGet.mockResolvedValue({ data: [competenciaBase] });
    mockPost.mockImplementation((url: string) => {
      if (url === '/participant/lookup') {
        return Promise.resolve({
          data: { id: 7, nombre: 'Ana', apellidos: 'Ruiz', cedula: '123' },
        });
      }
      return Promise.resolve({ data: { exists: true, message: 'Ya tiene marca' } });
    });
    const user = userEvent.setup();
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Identifica al atleta')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/cedula del participante/i), '123');
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await waitFor(() => {
      expect(screen.getByText('Ya tiene marca')).toBeInTheDocument();
    });
  });

  it('buscar muestra error 404 si la cedula no existe', async () => {
    mockGet.mockResolvedValue({ data: [competenciaBase] });
    mockPost.mockRejectedValue({ response: { status: 404 } });
    const user = userEvent.setup();
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Identifica al atleta')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/cedula del participante/i), '999');
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await waitFor(() => {
      expect(screen.getByText(/ningun participante con esa cedula/i)).toBeInTheDocument();
    });
  });

  it('buscar muestra mensaje del servidor si 403 sin acceso (bug prod juez/8/19)', async () => {
    mockGet.mockResolvedValue({ data: [competenciaBase] });
    mockPost.mockRejectedValue({
      response: { status: 403, data: { message: 'No tienes acceso a este participante' } },
    });
    const user = userEvent.setup();
    render(<JuezMedicionPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Identifica al atleta')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/cedula del participante/i), '10203040');
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await waitFor(() => {
      expect(screen.getByText('No tienes acceso a este participante')).toBeInTheDocument();
    });
  });
});
