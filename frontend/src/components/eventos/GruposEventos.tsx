import { useState } from 'react';
import { CalendarDays, ChevronDown, History, Radio } from 'lucide-react';
import { cx } from '../ui';
import TarjetaEvento from './TarjetaEvento';
import type { Evento } from '../../types';

/**
 * Los eventos repartidos en los tres bloques del panel: en curso,
 * proximas y pasadas.
 *
 * El backend ya devuelve la lista ordenada y con el estado calculado por
 * fechas, asi que aqui solo se separa y se pinta. Las pasadas van plegadas:
 * se consultan de vez en cuando y no deben empujar hacia abajo lo que se usa
 * a diario.
 */
export default function GruposEventos({
  eventos,
  destino,
  alElegir,
}: {
  eventos: Evento[];
  /** A donde lleva cada tarjeta. Cambia entre la portada y el panel. */
  destino: (c: Evento) => string;
  /** Se llama antes de navegar. Lo usa el panel para fijar el evento activa. */
  alElegir?: (c: Evento) => void;
}) {
  const [verPasadas, setVerPasadas] = useState(false);

  const enCurso = eventos.filter((c) => c.estado === 'en_curso');
  const proximas = eventos.filter((c) => c.estado === 'proxima');
  const pasadas = eventos.filter((c) => c.estado === 'pasada');

  return (
    <div className="space-y-8">
      <Grupo
        titulo="En curso"
        descripcion="Se estan disputando hoy"
        icono={Radio}
        acento="text-hyrox-accent"
        eventos={enCurso}
        destino={destino}
        alElegir={alElegir}
        vacio="Ningun evento esta en marcha ahora mismo."
        vivo
      />

      <Grupo
        titulo="Proximas"
        descripcion="Todavia no empiezan"
        icono={CalendarDays}
        acento="text-hyrox-primary"
        eventos={proximas}
        destino={destino}
        alElegir={alElegir}
        vacio="No hay ninguna programada."
      />

      {pasadas.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setVerPasadas((v) => !v)}
            aria-expanded={verPasadas}
            className="flex items-center gap-2.5 text-hyrox-mist hover:text-hyrox-paper transition-colors duration-200 cursor-pointer"
          >
            <History className="w-4.5 h-4.5" aria-hidden="true" />
            <span className="font-display text-lg font-bold">Pasadas</span>
            <span className="badge badge-gray">{pasadas.length}</span>
            <ChevronDown
              className={cx('w-4 h-4 transition-transform duration-200', verPasadas && 'rotate-180')}
              aria-hidden="true"
            />
          </button>

          {verPasadas && (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-4 animate-fade-in">
              {pasadas.map((c) => (
                <li key={c.id}>
                  <TarjetaEvento evento={c} destino={destino(c)} alElegir={alElegir} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  descripcion,
  icono: Icono,
  acento,
  eventos,
  destino,
  alElegir,
  vacio,
  vivo,
}: {
  titulo: string;
  descripcion: string;
  icono: typeof Radio;
  acento: string;
  eventos: Evento[];
  destino: (c: Evento) => string;
  alElegir?: (c: Evento) => void;
  vacio: string;
  /** Muestra el punto pulsante de "en vivo" cuando el grupo tiene eventos. */
  vivo?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <Icono className={cx('w-4.5 h-4.5', acento)} aria-hidden="true" />
        <h2 className="font-display text-lg font-bold text-hyrox-paper">{titulo}</h2>
        {vivo && eventos.length > 0 && (
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hyrox-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-hyrox-accent" />
          </span>
        )}
        <span className="badge badge-gray">{eventos.length}</span>
        <span className="text-xs text-hyrox-ghost hidden sm:inline">{descripcion}</span>
      </div>

      {eventos.length === 0 ? (
        <p className="text-sm text-hyrox-ghost">{vacio}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {eventos.map((c) => (
            <li key={c.id}>
              <TarjetaEvento evento={c} destino={destino(c)} alElegir={alElegir} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
