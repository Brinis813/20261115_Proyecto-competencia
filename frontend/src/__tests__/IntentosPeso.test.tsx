import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IntentosPeso, {
  totalDesdeEquipo,
  MAX_INTENTOS,
  BARRA_POR_DEFECTO,
  type IntentoPeso,
} from '../components/judge/IntentosPeso';

type Props = {
  intentos?: IntentoPeso[];
  peso?: number;
  barra?: number;
  discos?: string;
  unidad?: string;
  maxIntentos?: number;
  deshabilitado?: boolean;
  onRegistrar?: (valido: boolean) => void;
  onDeshacer?: () => void;
  onCambiarBarra?: (n: number) => void;
  onCambiarDiscos?: (s: string) => void;
};

/** Arnés con estado real: el componente es controlado por el padre. */
function Montar({
  intentos = [],
  peso = 0,
  barra = BARRA_POR_DEFECTO,
  discos = '',
  unidad = 'kg',
  maxIntentos = MAX_INTENTOS,
  deshabilitado,
  onRegistrar = vi.fn(),
  onDeshacer = vi.fn(),
  onCambiarBarra = vi.fn(),
  onCambiarDiscos = vi.fn(),
}: Props = {}) {
  function Arnés() {
    const [estado, setEstado] = useState({ intentos, peso, barra, discos });
    return (
      <IntentosPeso
        intentos={estado.intentos}
        peso={estado.peso}
        barra={estado.barra}
        discos={estado.discos}
        unidad={unidad}
        maxIntentos={maxIntentos}
        deshabilitado={deshabilitado}
        onCambiarPeso={(n) => setEstado((e) => ({ ...e, peso: n }))}
        onCambiarBarra={(n) => {
          onCambiarBarra(n);
          setEstado((e) => ({ ...e, barra: n }));
        }}
        onCambiarDiscos={(s) => {
          onCambiarDiscos(s);
          setEstado((e) => ({ ...e, discos: s }));
        }}
        onRegistrar={(valido) => {
          onRegistrar(valido);
          setEstado((e) => ({
            ...e,
            intentos: [...e.intentos, { peso: e.peso, valido }],
          }));
        }}
        onDeshacer={() => {
          onDeshacer();
          setEstado((e) => ({ ...e, intentos: e.intentos.slice(0, -1) }));
        }}
      />
    );
  }
  return render(<Arnés />);
}

/** Seccion "Mejor levantamiento", para no confundir con la lista de intentos. */
function mejorLevantamiento(): HTMLElement {
  return screen.getByText('Mejor levantamiento').closest('section') as HTMLElement;
}

/** Fila de la lista de intentos (#1, #2…). */
function filaIntento(n: number): HTMLElement {
  return screen.getByText(`#${n}`).closest('li') as HTMLElement;
}

describe('totalDesdeEquipo', () => {
  it('suma barra mas dos veces los discos por lado', () => {
    expect(totalDesdeEquipo(20, '25 + 15')).toBe(100);
    // "x" es separador, no multiplicacion: 25 y 10 por lado.
    expect(totalDesdeEquipo(BARRA_POR_DEFECTO, '25x10')).toBe(90);
    expect(totalDesdeEquipo(15, '25, 10')).toBe(85);
  });

  it('acepta multiplicadores y punto y coma', () => {
    expect(totalDesdeEquipo(10, '5*2;1')).toBe(26);
  });

  it('ignora lo no numerico y redondea a dos decimales', () => {
    expect(totalDesdeEquipo(20, 'abc')).toBeNull();
    expect(totalDesdeEquipo(20, '')).toBeNull();
    expect(totalDesdeEquipo(20, '10.005')).toBe(40.01);
  });

  it('descarta discos no positivos y tolera barra negativa', () => {
    expect(totalDesdeEquipo(-10, '10')).toBe(20);
    expect(totalDesdeEquipo(20, '0')).toBeNull();
  });
});

describe('IntentosPeso', () => {
  it('lista los intentos con su estado y el contador', () => {
    Montar({
      intentos: [
        { peso: 100, valido: true, barra: 20, discos: '25 + 15' },
        { peso: 90, valido: false },
      ],
      peso: 95,
    });
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(within(filaIntento(1)).getByText('100 kg')).toBeInTheDocument();
    expect(within(filaIntento(1)).getByText('Valido')).toBeInTheDocument();
    expect(within(filaIntento(2)).getByText('Nulo')).toBeInTheDocument();
    // El intento en curso muestra la carga propuesta y la etiqueta.
    expect(within(filaIntento(3)).getByText('95 kg')).toBeInTheDocument();
    expect(within(filaIntento(3)).getByText('En curso')).toBeInTheDocument();
    expect(within(filaIntento(3)).queryByText('Pendiente')).not.toBeInTheDocument();
    // Auditoria de equipo del intento registrado.
    expect(within(filaIntento(1)).getByText('barra 20 · 25 + 15 p/lado')).toBeInTheDocument();
  });

  it('muestra barra desconocida cuando el intento solo trae discos', () => {
    Montar({ intentos: [{ peso: 80, valido: true, discos: '25 + 15' }] });
    expect(within(filaIntento(1)).getByText('barra ? · 25 + 15 p/lado')).toBeInTheDocument();
  });

  it('sin equipo anotado no muestra la linea de barra', () => {
    Montar({ intentos: [{ peso: 80, valido: true }] });
    expect(within(filaIntento(1)).queryByText(/barra/)).not.toBeInTheDocument();
  });

  it('el mejor levantamiento es el mejor valido, no el ultimo', () => {
    Montar({
      intentos: [
        { peso: 120, valido: true },
        { peso: 95, valido: false },
      ],
    });
    expect(within(mejorLevantamiento()).getByText('120 kg')).toBeInTheDocument();
  });

  it('sin intentos validos el mejor queda en guiones', () => {
    Montar({ intentos: [{ peso: 90, valido: false }] });
    expect(within(mejorLevantamiento()).getByText('--')).toBeInTheDocument();
  });

  it('sube y baja la carga de 1.25 en 1.25 sin ruido de coma flotante', async () => {
    const user = userEvent.setup();
    Montar({ peso: 0.1 });
    await user.click(screen.getByRole('button', { name: 'Subir la carga' }));
    expect(screen.getByText('1.35')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bajar la carga' }));
    expect(screen.getByText('0.1')).toBeInTheDocument();
  });

  it('la baja queda deshabilitada en cero', () => {
    Montar({ peso: 0 });
    expect(screen.getByRole('button', { name: 'Bajar la carga' })).toBeDisabled();
  });

  it('ofrece incrementos rapidos', async () => {
    const user = userEvent.setup();
    Montar({ peso: 40 });
    await user.click(screen.getByRole('button', { name: '+2.5' }));
    expect(screen.getByText('42.5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+20' }));
    expect(screen.getByText('62.5')).toBeInTheDocument();
  });

  it('muestra el equivalente en libras cuando la unidad es kg', () => {
    Montar({ peso: 100 });
    expect(screen.getByText(/220 lb/)).toBeInTheDocument();
  });

  it('registra intentos hasta agotar los permitidos', async () => {
    const user = userEvent.setup();
    const onRegistrar = vi.fn();
    Montar({ peso: 100, onRegistrar });
    await user.click(screen.getByRole('button', { name: /valido/i }));
    expect(onRegistrar).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('1/3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nulo/i }));
    expect(onRegistrar).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('2/3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /valido/i }));
    expect(screen.getByText('3/3')).toBeInTheDocument();
    // Agotados: ya no queda seccion de carga para registrar mas.
    expect(screen.queryByText(/carga del intento/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /valido/i })).not.toBeInTheDocument();
  });

  it('los botones de registrar estan inertes sin carga', () => {
    Montar({ peso: 0 });
    expect(screen.getByRole('button', { name: /valido/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nulo/i })).toBeDisabled();
  });

  it('permite configurar mas intentos', () => {
    Montar({
      maxIntentos: 5,
      intentos: [
        { peso: 100, valido: true },
        { peso: 90, valido: false },
        { peso: 110, valido: true },
      ],
      peso: 95,
    });
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(filaIntento(5)).toBeInTheDocument();
    expect(within(filaIntento(5)).getByText('Pendiente')).toBeInTheDocument();
    // Sigue habiendo carga para el intento 4.
    expect(screen.getByText(/carga del intento 4/i)).toBeInTheDocument();
  });

  it('deshacer no aparece sin intentos', () => {
    Montar({ intentos: [] });
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument();
  });

  it('deshacer quita el ultimo intento', async () => {
    const user = userEvent.setup();
    const onDeshacer = vi.fn();
    Montar({ intentos: [{ peso: 100, valido: true }], onDeshacer });
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(onDeshacer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument();
  });

  it('aplica el total del equipo a la carga', async () => {
    const user = userEvent.setup();
    Montar({ barra: 20, discos: '25 + 15' });
    const boton = screen.getByRole('button', { name: /usar total en la carga/i });
    expect(boton).toHaveTextContent('(100 kg)');
    await user.click(boton);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('deshabilita el total del equipo si los discos no son validos', () => {
    Montar({ barra: 20, discos: 'abc' });
    expect(screen.getByRole('button', { name: /usar total en la carga/i })).toBeDisabled();
  });

  it('lee barra y discos desde sus campos', async () => {
    const user = userEvent.setup();
    const onCambiarBarra = vi.fn();
    const onCambiarDiscos = vi.fn();
    Montar({ onCambiarBarra, onCambiarDiscos });
    const campoBarra = screen.getByLabelText('Peso de la barra en kilogramos');
    await user.clear(campoBarra);
    await user.type(campoBarra, '15');
    expect(onCambiarBarra).toHaveBeenLastCalledWith(15);

    const campoDiscos = screen.getByLabelText(/discos por lado/i);
    await user.clear(campoDiscos);
    await user.type(campoDiscos, '25 + 15');
    expect(onCambiarDiscos).toHaveBeenLastCalledWith('25 + 15');
  });

  it('con la pausa puesta no se registra ni se toca la carga', () => {
    Montar({
      peso: 100,
      deshabilitado: true,
      intentos: [{ peso: 90, valido: true }],
    });
    expect(screen.getByRole('button', { name: /valido/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nulo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subir la carga' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar la carga' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+1.25' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
    expect(screen.getByLabelText('Peso de la barra en kilogramos')).toBeDisabled();
    expect(screen.getByLabelText(/discos por lado/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /usar total en la carga/i })).toBeDisabled();
  });

  it('acepta otra unidad de peso sin convertir a libras', () => {
    Montar({ peso: 100, unidad: 'lb' });
    expect(screen.getByText('lb')).toBeInTheDocument();
    expect(screen.queryByText(/220 lb/)).not.toBeInTheDocument();
  });
});
