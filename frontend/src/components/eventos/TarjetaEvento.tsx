import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ChevronRight, Dumbbell, MapPin, Trophy, Users } from 'lucide-react';
import { cx } from '../ui';
import PortadaImagen from './PortadaImagen';
import type { Evento, EstadoEvento } from '../../types';

export const ETIQUETA_ESTADO: Record<EstadoEvento, { texto: string; clase: string }> = {
  en_curso: { texto: 'En vivo', clase: 'badge-green' },
  proxima: { texto: 'Proxima', clase: 'badge-orange' },
  pasada: { texto: 'Finalizada', clase: 'badge-gray' },
};

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Día y mes del inicio, para la insignia de fecha sobre la portada. */
export function fechaInsignia(iso: string): { dia: string; mes: string } {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const mes = MESES[Math.max(0, Math.min(11, (parseInt(m, 10) || 1) - 1))];
  return { dia: String(parseInt(d, 10) || d), mes: `${mes} ${y}` };
}

/** Fecha corta y legible; el backend manda AAAA-MM-DD. */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Rango de fechas, sin repetir el dia cuando el evento dura uno solo. */
export function rangoFechas(inicio: string, fin: string): string {
  return inicio === fin ? fechaCorta(inicio) : `${fechaCorta(inicio)} — ${fechaCorta(fin)}`;
}

/**
 * Tarjeta de un evento. La usan tanto la portada publica como el panel
 * del organizador, que solo se diferencian en a donde llevan.
 */
export default function TarjetaEvento({
  evento,
  destino,
  alElegir,
}: {
  evento: Evento;
  destino: string;
  alElegir?: (c: Evento) => void;
}) {
  const estado = ETIQUETA_ESTADO[evento.estado];
  const enVivo = evento.estado === 'en_curso';
  const { dia, mes } = fechaInsignia(evento.fecha_inicio);

  return (
    <Link
      to={destino}
      onClick={() => alElegir?.(evento)}
      className="group surface h-full overflow-hidden flex flex-col hover:border-hyrox-primary/35 hover:bg-white/[0.03] transition-colors duration-200"
    >
      {/* Portada con insignia de fecha y píldora de estado superpuestas,
          como en las apps de eventos: de un vistazo se ve cuándo es y si
          está en vivo (punto pulsante). */}
      <div className="relative">
        {evento.imagen_url ? (
          <PortadaImagen src={evento.imagen_url} alt={`Portada de ${evento.nombre}`} />
        ) : (
          <div
            aria-hidden="true"
            className="h-36 w-full bg-gradient-to-r from-hyrox-primary/25 via-hyrox-ember/15 to-hyrox-accent/20 grid place-items-center"
          >
            <Trophy className="w-8 h-8 text-hyrox-primary/50" />
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-xl bg-black/60 backdrop-blur-sm px-2.5 py-1.5 text-center leading-none border border-white/10">
          <span className="block font-display text-xl font-extrabold text-white">{dia}</span>
          <span className="mt-0.5 block text-2xs font-bold uppercase tracking-wide text-white/70">{mes}</span>
        </div>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {enVivo ? (
            <span className="badge-green !py-1">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hyrox-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-hyrox-accent" />
              </span>
              En vivo
            </span>
          ) : (
            <span className={estado.clase}>{estado.texto}</span>
          )}
          {evento.es_demo && <span className="badge badge-blue">Ejemplo</span>}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3 flex-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-bold text-hyrox-paper leading-tight">
            {evento.nombre}
          </h3>
          {evento.descripcion && (
            <p className="text-sm text-hyrox-mist mt-1.5 line-clamp-2">{evento.descripcion}</p>
          )}
        </div>
        <ChevronRight
          className="w-4 h-4 mt-1 shrink-0 text-hyrox-ghost group-hover:text-hyrox-primary group-hover:translate-x-0.5 transition-all duration-200"
          aria-hidden="true"
        />
      </div>

      <dl className="space-y-1.5 text-xs text-hyrox-mist">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 shrink-0 text-hyrox-ghost" aria-hidden="true" />
          <dd>{rangoFechas(evento.fecha_inicio, evento.fecha_fin)}</dd>
        </div>
        {evento.sede && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-hyrox-ghost" aria-hidden="true" />
            <dd className="truncate">{evento.sede}</dd>
          </div>
        )}
        {evento.box_nombre && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 shrink-0 text-hyrox-ghost" aria-hidden="true" />
            <dd className="truncate">{evento.box_nombre}</dd>
          </div>
        )}
      </dl>

      <div className={cx('flex items-center gap-4 pt-3 border-t border-white/[0.06] text-xs text-hyrox-mist')}>
        <span className="flex items-center gap-1.5">
          <Dumbbell className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
          {evento.total_competencias} Competencias
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
          {evento.total_atletas} atletas
        </span>
      </div>
      </div>
    </Link>
  );
}
