import React from 'react';
import { Flag, RotateCcw, Save } from 'lucide-react';
import { Button, cx } from '../ui';
import { useSplitTimer } from '../../hooks/useSplitTimer';
import type { Wod, EsquemaWod, Participante, SplitRegistro } from '../../types';

interface Props {
  wod: Wod;
  participante: Participante;
  esquema: EsquemaWod;
  splits: SplitRegistro[];
  onSplitsChange: (splits: SplitRegistro[]) => void;
  onSave: () => void;
  /** Pausa global del admin: congela cronómetro y registro sin perder lo anotado. */
  enPausa?: boolean;
}

/** Milisegundos a MM:SS.cc, el formato con el que se leen los splits. */
function formatearMs(ms: number): string {
  const centesimas = Math.floor((ms % 1000) / 10);
  const totalSegundos = Math.floor(ms / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}.${String(centesimas).padStart(2, '0')}`;
}

/**
 * Medicion por segmentos (HYROX): el juez arranca el cronometro y marca el
 * final de cada segmento. El tiempo parcial se deduce del acumulado anterior,
 * de modo que no puede haber descuadres entre parciales y total.
 */
export default function ContadorSegmentos({
  wod,
  participante,
  esquema,
  splits,
  onSplitsChange,
  onSave,
  enPausa,
}: Props): React.ReactElement {
  const segmentos = esquema.segmentos ?? [];
  const completados = splits.length;
  const terminado = segmentos.length > 0 && completados >= segmentos.length;

  // El cronometro se detiene solo al marcar el ultimo segmento, y se congela
  // mientras el admin mantiene el heat en pausa (al reanudar sigue desde ahí).
  const cronometro = useSplitTimer(!terminado && !enPausa);
  const tiempoMostrado = terminado ? splits[splits.length - 1].tiempo_acumulado_ms : cronometro;

  function marcarSegmento() {
    const segmento = segmentos[completados];
    if (!segmento) return;
    const acumulado = cronometro;
    const previo = splits[completados - 1]?.tiempo_acumulado_ms ?? 0;
    onSplitsChange([
      ...splits,
      {
        segmento_numero: segmento.numero,
        segmento_nombre: segmento.nombre,
        tiempo_acumulado_ms: acumulado,
        tiempo_parcial_ms: Math.max(0, acumulado - previo),
      },
    ]);
  }

  function deshacerUltimo() {
    onSplitsChange(splits.slice(0, -1));
  }

  if (segmentos.length === 0) {
    return (
      <p className="text-sm text-hyrox-ghost">
        Este WOD no tiene segmentos definidos. Configuralos en el editor de la competencia.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="eyebrow">{wod.nombre_ejercicio}</h3>
        <p className="text-2xs text-hyrox-ghost mt-0.5">
          {participante.nombre} {participante.apellidos} · {completados} de {segmentos.length} segmentos
        </p>
      </div>

      {/* Cronometro: es lo que el juez mira, asi que va grande y en monoespaciada. */}
      <div
        className="text-center py-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
        role="timer"
        aria-live="off"
      >
        <span className="font-mono text-4xl font-bold tabular-nums text-hyrox-paper">
          {formatearMs(tiempoMostrado)}
        </span>
        <p className="text-2xs text-hyrox-ghost mt-1">
          {terminado ? 'Recorrido completado' : `Siguiente: ${segmentos[completados].nombre}`}
        </p>
      </div>

      <ol className="space-y-1.5">
        {segmentos.map((segmento, indice) => {
          const split = splits[indice];
          const esActual = !terminado && indice === completados;
          return (
            <li
              key={segmento.numero}
              className={cx(
                'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                split
                  ? 'border-hyrox-primary/30 bg-hyrox-primary/[0.07]'
                  : esActual
                    ? 'border-hyrox-primary/50 bg-hyrox-primary/10'
                    : 'border-white/[0.06] bg-white/[0.02] opacity-60'
              )}
            >
              <span className="grid place-items-center w-6 h-6 rounded-md bg-white/[0.06] font-mono text-2xs shrink-0">
                {segmento.numero}
              </span>
              <span className="flex-1 min-w-0 truncate text-hyrox-paper">
                {segmento.nombre}
                {segmento.distancia && <span className="text-hyrox-ghost"> · {segmento.distancia}</span>}
              </span>
              {split && (
                <span className="font-mono text-2xs tabular-nums text-hyrox-mist shrink-0">
                  +{formatearMs(split.tiempo_parcial_ms)} · {formatearMs(split.tiempo_acumulado_ms)}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          icon={Flag}
          onClick={marcarSegmento}
          disabled={terminado || enPausa}
          className="flex-1"
        >
          {terminado ? 'Segmentos completados' : 'Marcar segmento'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon={RotateCcw}
          onClick={deshacerUltimo}
          disabled={completados === 0 || enPausa}
        >
          Deshacer
        </Button>
      </div>

      <Button type="button" icon={Save} onClick={onSave} disabled={completados === 0 || enPausa} className="w-full">
        Guardar resultado
      </Button>
    </div>
  );
}
