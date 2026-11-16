import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MovimientoRow from '../components/admin/MovimientoRow';
import { movimientoVacio } from '../utils/competenciaFormMapper';

vi.mock('../components/ui', () => ({
  IconButton: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => <button aria-label={label} onClick={onClick} disabled={disabled} />,
  cx: (...clases: Array<string | false | null | undefined>) => clases.filter(Boolean).join(' '),
}));

function props(base = {}) {
  return {
    conPeso: false,
    movimiento: { ...movimientoVacio(), nombre: 'Wall Balls', repeticiones: 20 },
    indice: 0,
    totalFilas: 2,
    arrastrando: false,
    error: undefined as string | undefined,
    onCambiar: vi.fn(),
    onQuitar: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    ...base,
  };
}

describe('MovimientoRow', () => {
  it('pinta nombre, medición y subcampo de repeticiones', () => {
    render(<MovimientoRow {...props()} />);
    expect(screen.getByLabelText('Nombre del movimiento')).toHaveValue('Wall Balls');
    expect(screen.getByLabelText('Repeticiones')).toHaveValue(20);
  });

  it('teclear el nombre llama onCambiar con el parcial', () => {
    const onCambiar = vi.fn();
    render(<MovimientoRow {...props({ onCambiar })} />);
    fireEvent.change(screen.getByLabelText('Nombre del movimiento'), {
      target: { value: 'Burpees' },
    });
    expect(onCambiar).toHaveBeenCalledWith({ nombre: 'Burpees' });
  });

  it('cambiar medición a distancia muestra unidad + distancia', () => {
    render(
      <MovimientoRow
        {...props({
          movimiento: {
            ...movimientoVacio(),
            nombre: 'Remo',
            tipo_medicion: 'distancia',
            distancia: 500,
          },
        })}
      />,
    );
    expect(screen.getByLabelText('Distancia')).toHaveValue(500);
  });

  it('quitar llama onQuitar; con una sola fila va deshabilitado', () => {
    const onQuitar = vi.fn();
    const { rerender } = render(<MovimientoRow {...props({ onQuitar })} />);
    fireEvent.click(screen.getByLabelText('Quitar movimiento'));
    expect(onQuitar).toHaveBeenCalledTimes(1);
    rerender(<MovimientoRow {...props({ onQuitar, totalFilas: 1 })} />);
    expect(screen.getByLabelText('Quitar movimiento')).toBeDisabled();
  });

  it('pinta el error de validación', () => {
    render(<MovimientoRow {...props({ error: 'Ponle nombre' })} />);
    expect(screen.getByLabelText('Nombre del movimiento')).toHaveAttribute('title', 'Ponle nombre');
  });
});
