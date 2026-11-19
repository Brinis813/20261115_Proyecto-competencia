import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ContadorSerie, { porRondaDe } from '../components/judge/ContadorSerie';
import type { MovimientoObjetivo } from '../components/judge/ContadorEsquema';

// userEvent se cuelga con timers falsos en este entorno; con fake timers
// activos se usan eventos síncronos (fireEvent) en todo el archivo.
afterEach(() => {
  vi.useRealTimers();
});

const repeticiones = (nombre: string, objetivo: number): MovimientoObjetivo => ({
  nombre,
  objetivo,
});

describe('porRondaDe', () => {
  it('reparte el total del for_time entre las rondas', () => {
    expect(porRondaDe([repeticiones('A', 12), repeticiones('B', 0)], 4, true)).toEqual([3, 0]);
  });

  it('en AMRAP el objetivo ya viene por ronda', () => {
    expect(porRondaDe([repeticiones('A', 12)], 4, false)).toEqual([12]);
  });

  it('toma una ronda cuando el total no sirve', () => {
    expect(porRondaDe([repeticiones('A', 10)], 0, true)).toEqual([10]);
    expect(porRondaDe([repeticiones('A', 10)], -3, true)).toEqual([10]);
  });

  it('redondea las fracciones de ronda', () => {
    expect(porRondaDe([repeticiones('A', 12)], 2.6, true)).toEqual([4]);
  });
});

interface Props {
  movimientos: MovimientoObjetivo[];
  conteos?: number[];
  rondasTotal?: number;
  esTiempo?: boolean;
  permitirExceder?: boolean;
  deshabilitado?: boolean;
  onCambiar?: (conteos: number[]) => void;
}

/** Arnés con estado real: el componente es controlado por el padre. */
function Arnés({
  movimientos,
  conteos: iniciales = [],
  rondasTotal = 1,
  esTiempo = false,
  permitirExceder,
  deshabilitado,
  onCambiar = vi.fn(),
}: Props) {
  const [conteos, setConteos] = useState<number[]>(iniciales);
  return (
    <ContadorSerie
      movimientos={movimientos}
      conteos={conteos}
      onCambiar={(c) => {
        onCambiar(c);
        setConteos(c);
      }}
      deshabilitado={deshabilitado}
      esTiempo={esTiempo}
      rondasTotal={rondasTotal}
      permitirExceder={permitirExceder}
    />
  );
}

function Montar(props: Props) {
  const onCambiar = props.onCambiar ?? vi.fn();
  const utils = render(<Arnés {...props} onCambiar={onCambiar} />);
  return { onCambiar, ...utils };
}

describe('ContadorSerie — repeticiones', () => {
  it('muestra el paso actual, la ronda y el total', () => {
    Montar({
      movimientos: [repeticiones('Burpees', 5), repeticiones('Box', 10)],
      conteos: [2, 3],
    });
    expect(screen.getByText('Ejercicio 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Ronda 1/1')).toBeInTheDocument();
    expect(screen.getByText('Burpees')).toBeInTheDocument();
    expect(screen.getByText('Total: 5 reps · Ronda 1/1')).toBeInTheDocument();
  });

  it('suma y resta de una en una sin bajar de cero', () => {
    const { onCambiar } = Montar({ movimientos: [repeticiones('Burpees', 5)] });
    expect(screen.getByRole('button', { name: 'Restar repetición' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    expect(onCambiar).toHaveBeenLastCalledWith([1]);
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    expect(onCambiar).toHaveBeenLastCalledWith([2]);

    fireEvent.click(screen.getByRole('button', { name: 'Restar repetición' }));
    expect(onCambiar).toHaveBeenLastCalledWith([1]);
  });

  it('al cumplir el objetivo se marca completo y se avanza solo', () => {
    vi.useFakeTimers();
    const { onCambiar } = Montar({
      movimientos: [repeticiones('Burpees', 2), repeticiones('Box', 1)],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));

    expect(screen.getByText('Completo — puedes avanzar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sumar repetición/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeEnabled();
    // Aun no: el avance espera el respiro de 750 ms.
    expect(screen.getByText('Ejercicio 1 de 2')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(onCambiar).toHaveBeenLastCalledWith([2]);
    expect(screen.getByText('Ejercicio 2 de 2')).toBeInTheDocument();
  });

  it('navega a mano con Siguiente y Anterior', () => {
    const { onCambiar } = Montar({
      movimientos: [repeticiones('Burpees', 2), repeticiones('Box', 1)],
      conteos: [2, 0],
    });
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByText('Ejercicio 2 de 2')).toBeInTheDocument();
    // Último paso: ya no hay a dónde ir más allá.
    expect(screen.getByRole('button', { name: /último ejercicio/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Ejercicio 1 de 2')).toBeInTheDocument();
    // De vuelta en el primer paso: no hay nada antes, así que vuelve a estar bloqueado.
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    // Navegar a mano no cambia los conteos.
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('la Siguiente sigue muerta mientras el paso no esté completo', () => {
    Montar({ movimientos: [repeticiones('Burpees', 2), repeticiones('Box', 1)] });
    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    expect(siguiente).toBeDisabled();
    expect(siguiente).toHaveAttribute('title', 'Completa 2 reps para avanzar');
  });

  it('reparte el paso entre rondas y arrastra lo ya hecho', () => {
    vi.useFakeTimers();
    const { onCambiar } = Montar({
      movimientos: [repeticiones('Burpees', 2)],
      rondasTotal: 2,
    });
    expect(screen.getByText('Ronda 1/2')).toBeInTheDocument();
    expect(screen.getByText('paso 1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(screen.getByText('Ronda 2/2')).toBeInTheDocument();
    expect(screen.getByText('paso 2/2')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Ronda 2 de 2')).toHaveLength(2);

    // La ronda 2 parte de lo hecho en la 1.
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    expect(onCambiar).toHaveBeenLastCalledWith([3]);
    expect(screen.getByText('Total: 3 reps · Ronda 2/2')).toBeInTheDocument();
  });

  it('en for_time reparte el total entre las rondas', () => {
    Montar({
      movimientos: [repeticiones('Burpees', 12)],
      rondasTotal: 4,
      esTiempo: true,
    });
    expect(screen.getByRole('button', { name: /siguiente/i })).toHaveAttribute(
      'title',
      'Completa 3 reps para avanzar',
    );
  });

  it('en AMRAP superable no se auto-avanza y se puede seguir sumando', () => {
    vi.useFakeTimers();
    Montar({
      movimientos: [repeticiones('Burpees', 1), repeticiones('Box', 1)],
      permitirExceder: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    expect(screen.getByRole('button', { name: /sumar repetición/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Ejercicio 1 de 2')).toBeInTheDocument();
  });

  it('con la pausa puesta no se toca nada', () => {
    const { onCambiar } = Montar({
      movimientos: [repeticiones('Burpees', 5)],
      deshabilitado: true,
    });
    expect(screen.getByRole('button', { name: 'Sumar repetición' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restar repetición' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('tolera una lista de movimientos vacia', () => {
    const { onCambiar } = Montar({ movimientos: [] });
    expect(screen.getByText('Ejercicio 0 de 0')).toBeInTheDocument();
    expect(screen.getByText('Movimiento 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sumar repetición' }));
    expect(onCambiar).toHaveBeenLastCalledWith([1]);
  });
});

describe('ContadorSerie — tiempo', () => {
  const plancha: MovimientoObjetivo = {
    nombre: 'Plancha',
    objetivo: 60,
    tipo_medicion: 'tiempo',
  };

  it('muestra el objetivo, la barra de progreso y la ayuda', () => {
    Montar({ movimientos: [plancha] });
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '0');
    expect(barra).toHaveAttribute('aria-valuemax', '60');
    expect(barra).toHaveAttribute('aria-label', 'Plancha: 00:00 de 01:00 minutos');
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeEnabled();
    expect(screen.getByText(/se anota solo y se avanza/)).toBeInTheDocument();
  });

  it('arranca el mini-cronómetro, lo detiene y anota los segundos', () => {
    vi.useFakeTimers();
    const { onCambiar } = Montar({ movimientos: [plancha] });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    expect(screen.getByRole('button', { name: /detener y anotar/i })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:03');

    fireEvent.click(screen.getByRole('button', { name: /detener y anotar/i }));
    expect(onCambiar).toHaveBeenLastCalledWith([3]);
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument();
  });

  it('auto-anota al cumplirse el tiempo y deja el objetivo visto', () => {
    const objetivo: MovimientoObjetivo = { ...plancha, objetivo: 2 };
    vi.useFakeTimers();
    const { onCambiar } = Montar({ movimientos: [objetivo] });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onCambiar).toHaveBeenLastCalledWith([2]);
    expect(screen.getByRole('timer')).toHaveTextContent('00:02');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    // Vuelta al botón de inicio: el juez puede corregir si hizo falta.
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument();
  });

  it('teclea el tiempo a mano y respeta el tope del ejercicio', () => {
    const { onCambiar } = Montar({ movimientos: [plancha] });
    const campo = screen.getByLabelText('Plancha en segundos');
    fireEvent.change(campo, { target: { value: '45' } });
    expect(onCambiar).toHaveBeenLastCalledWith([45]);
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.change(campo, { target: { value: '999' } });
    expect(onCambiar).toHaveBeenLastCalledWith([60]);
  });

  it('el crono continúa desde lo tecleado a mano', () => {
    vi.useFakeTimers();
    Montar({ movimientos: [plancha] });
    fireEvent.change(screen.getByLabelText('Plancha en segundos'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    expect(screen.getByRole('timer')).toHaveTextContent('00:10');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:12');
  });

  it('reinicia el crono a cero', () => {
    vi.useFakeTimers();
    Montar({ movimientos: [plancha] });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:04');

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar cronómetro' }));
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument();
  });

  it('con la pausa puesta el crono se congela donde iba', () => {
    vi.useFakeTimers();
    const { rerender } = Montar({ movimientos: [plancha] });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    rerender(<Arnés movimientos={[plancha]} deshabilitado />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:03');
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeDisabled();
  });

  it('el Iniciar queda muerto al completar el tiempo', () => {
    Montar({ movimientos: [plancha] });
    fireEvent.change(screen.getByLabelText('Plancha en segundos'), { target: { value: '60' } });
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeDisabled();
  });

  it('cambiar de paso reinicia el crono', () => {
    vi.useFakeTimers();
    const pasos: MovimientoObjetivo[] = [plancha, { ...plancha, nombre: 'Plan', objetivo: 90 }];
    Montar({ movimientos: pasos, permitirExceder: true });

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:02');

    fireEvent.change(screen.getByLabelText('Plancha en segundos'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.getByText('Ejercicio 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument();
  });
});

describe('ContadorSerie — otras medidas', () => {
  it('en peso sube de 1.25 en 1.25 y acepta carga directa', () => {
    const cargada: MovimientoObjetivo = {
      nombre: 'Cargada',
      objetivo: 40,
      tipo_medicion: 'peso',
    };
    const { onCambiar, unmount } = Montar({ movimientos: [cargada] });
    expect(screen.getByText('0.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(onCambiar).toHaveBeenLastCalledWith([1.25]);
    // El total del ejercicio y el del control pintan la misma carga.
    expect(screen.getAllByText('1.3')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Restar' }));
    expect(onCambiar).toHaveBeenLastCalledWith([0]);

    // Carga directa: se acepta, pero el objetivo (40 kg) es el tope si no se permite exceder.
    fireEvent.change(screen.getByLabelText('Cargada en kg'), { target: { value: '55' } });
    expect(onCambiar).toHaveBeenLastCalledWith([40]);

    // Con permiso de exceder, la carga tecleada se respeta tal cual.
    unmount();
    const conExceder = Montar({ movimientos: [cargada], permitirExceder: true });
    fireEvent.change(screen.getByLabelText('Cargada en kg'), { target: { value: '55' } });
    expect(conExceder.onCambiar).toHaveBeenLastCalledWith([55]);
  });

  it('en distancia usa la unidad del movimiento', () => {
    const paseo: MovimientoObjetivo = {
      nombre: 'Paseo',
      objetivo: 100,
      tipo_medicion: 'distancia',
      unidad_distancia: 'km',
    };
    const { onCambiar } = Montar({ movimientos: [paseo] });
    expect(screen.getByText('km')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Paseo en km'), { target: { value: '7' } });
    expect(onCambiar).toHaveBeenLastCalledWith([7]);
  });

  it('en calorias usa la unidad de energia', () => {
    const bici: MovimientoObjetivo = {
      nombre: 'Bici',
      objetivo: 50,
      tipo_medicion: 'calorías',
      unidad_energia: 'cal',
    };
    const { onCambiar } = Montar({ movimientos: [bici] });
    expect(screen.getByText('cal')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bici - calorías quemadas en cal'), {
      target: { value: '30' },
    });
    expect(onCambiar).toHaveBeenLastCalledWith([30]);
  });

  it('en tiempo sin objetivo no se auto-anota', () => {
    vi.useFakeTimers();
    const sinObjetivo: MovimientoObjetivo = {
      nombre: 'Libre',
      objetivo: 0,
      tipo_medicion: 'tiempo',
    };
    const { onCambiar } = Montar({ movimientos: [sinObjetivo] });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('timer')).toHaveTextContent('00:05');
  });
});
