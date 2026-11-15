import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CronometroView from '../components/judge/CronometroView';

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockReset = vi.fn();
let mockElapsed = 0;
let mockRunning = false;
vi.mock('../hooks/useTimer', () => ({
  useTimer: () => ({
    elapsed: mockElapsed,
    isRunning: mockRunning,
    start: mockStart,
    stop: mockStop,
    reset: mockReset,
    formatTime: (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`,
  }),
}));

vi.mock('../components/ui', () => ({
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

function props(base = {}) {
  return {
    cap: 0,
    checklistCompleto: true,
    congelado: false,
    penalizacionSeg: 0,
    modoCap: false,
    tiempoTomado: false,
    onCap: vi.fn(),
    onEstado: vi.fn(),
    onSolicitarInicio: vi.fn(),
    onReiniciar: vi.fn(),
    onNoRep: vi.fn(),
    onVuelta: vi.fn(),
    onDesempate: vi.fn(),
    ...base,
  };
}

describe('CronometroView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElapsed = 0;
    mockRunning = false;
  });

  it('muestra el reloj y reporta estado detenido sin marca', () => {
    const onEstado = vi.fn();
    render(<CronometroView {...props({ onEstado })} />);
    expect(screen.getByText('Cronometro')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(onEstado).toHaveBeenCalledWith({ enMarcha: false, conMarca: false });
  });

  it('al alcanzar el tope detiene solo y avisa onCap', () => {
    const onCap = vi.fn();
    mockElapsed = 120000;
    mockRunning = true;
    render(<CronometroView {...props({ cap: 120, onCap })} />);
    expect(mockStop).toHaveBeenCalled();
    expect(onCap).toHaveBeenCalledTimes(1);
  });

  it('con penalización muestra el total a enviar', () => {
    mockElapsed = 60000;
    render(<CronometroView {...props({ penalizacionSeg: 5 })} />);
    expect(screen.getByText(/\+ 5 s de penalizacion/)).toBeInTheDocument();
  });

  it('congelado deshabilita el inicio', () => {
    render(<CronometroView {...props({ congelado: true })} />);
    expect(screen.getByRole('button', { name: /iniciar/i })).toBeDisabled();
  });
});
