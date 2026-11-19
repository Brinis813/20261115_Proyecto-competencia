import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, Volume2 } from 'lucide-react';
import { useSocket } from '../../contexts/SocketContext';
import { useBeep } from '../../hooks/useBeep';
import { useCompetenciaStartStore } from '../../stores/competenciaStartStore';
import { Button } from '../ui';

/**
 * Reloj sincronizado del heat en la pantalla del juez.
 *
 * - Cuenta regresiva visual + auditiva derivada del t0 del servidor.
 * - Beeps reglamentarios sintetizados (sin archivos externos):
 *   3-2-1 corto grave (440 Hz / 0.1 s), arranque largo agudo (880 Hz / 0.6 s),
 *   time cap sostenido agudo (990 Hz / 1.5 s).
 * - Botón "Re-sincronizar" (respaldo manual) + re-anclaje automático:
 *   periódico cada 30 s, al reconectar, por deriva >800 ms y al volver
 *   de segundo plano. Todo silencioso: sin etiquetas para el juez.
 * - En pausa muestra el segundo congelado; al abortar desaparece (vuelta a espera).
 */
export default function CompetenciaStartBanner({ competenciaId }: { competenciaId: number }) {
  const { socket } = useSocket();
  const { beep } = useBeep();
  const fase = useCompetenciaStartStore((s) => s.fase);
  const elapsedMs = useCompetenciaStartStore((s) => s.elapsedMs);
  const snapshot = useCompetenciaStartStore((s) => s.snapshot);
  const sincronizando = useCompetenciaStartStore((s) => s.sincronizando);
  const aviso = useCompetenciaStartStore((s) => s.aviso);
  const inicioManual = useCompetenciaStartStore((s) => s.inicioManual);

  const [ahora, setAhora] = useState(() => Date.now());
  const fasePrevia = useRef(fase);
  const ultimoSeg = useRef<number | null>(null);

  useEffect(() => {
    if (!socket) return;
    return useCompetenciaStartStore.getState().conectar(socket, competenciaId);
  }, [socket, competenciaId]);

  // Reloj local para pintar la cuenta atrás (el disparo real sale del store).
  useEffect(() => {
    if (fase !== 'cuenta_regresiva') return;
    const id = setInterval(() => setAhora(Date.now()), 200);
    return () => clearInterval(id);
  }, [fase]);

  const t0 = snapshot?.startTimeServer ?? null;
  const offset = useCompetenciaStartStore.getState().offsetMs;
  const restanteSeg =
    t0 != null && fase === 'cuenta_regresiva'
      ? Math.max(0, Math.ceil((t0 - (ahora + offset)) / 1000))
      : null;

  // Beeps de la cuenta regresiva: 3-2-1 corto y grave.
  useEffect(() => {
    if (restanteSeg == null) {
      ultimoSeg.current = null;
      return;
    }
    if (restanteSeg !== ultimoSeg.current) {
      ultimoSeg.current = restanteSeg;
      if (restanteSeg <= 3 && restanteSeg >= 1) beep(440, 100);
    }
  }, [restanteSeg, beep]);

  // Beeps de transición de fase (una sola vez por cambio).
  useEffect(() => {
    const anterior = fasePrevia.current;
    fasePrevia.current = fase;
    if (anterior === fase) return;
    if (fase === 'en_curso' && (anterior === 'cuenta_regresiva' || anterior === 'pausado')) {
      beep(880, 600); // ¡Arranque! largo y agudo (bocina)
    } else if (fase === 'capado') {
      beep(990, 1500); // Time cap: sostenido agudo → a registrar reps
    } else if (fase === 'pausado') {
      beep(520, 120);
      setTimeout(() => beep(520, 120), 200);
    }
  }, [fase, beep]);

  if (!snapshot && fase === 'espera') return null; // sin arranque: medición clásica

  const esManual = snapshot?.tipoArranque === 'manual_juez';

  return (
    <section className="surface-raised p-4 text-center space-y-2" aria-live="polite">
      {fase === 'armado' && esManual && !inicioManual && (
        <>
          <p className="eyebrow">Heat armado · arranque manual</p>
          <p className="text-xs text-hyrox-mist">
            A la bocina del admin, pulsa iniciar. Funciona sin internet.
          </p>
          <Button
            variant="success"
            onClick={() => useCompetenciaStartStore.getState().iniciarLocal()}
            className="min-h-[3.5rem] text-lg w-full"
          >
            <Play className="w-6 h-6" aria-hidden="true" />
            Iniciar
          </Button>
        </>
      )}

      {fase === 'armado' && !esManual && (
        <>
          <p className="eyebrow">Heat armado</p>
          <p className="text-xs text-hyrox-mist">
            {snapshot?.programadoParaMs
              ? `Inicio programado: ${new Date(snapshot.programadoParaMs).toLocaleTimeString()}`
              : 'Esperando la hora de inicio…'}
          </p>
        </>
      )}

      {fase === 'cuenta_regresiva' && (
        <>
          <p className="eyebrow">El heat inicia en</p>
          <p className="timer-display text-6xl" role="timer">
            {restanteSeg}
          </p>
        </>
      )}

      {(fase === 'en_curso' || fase === 'capado' || fase === 'pausado') && (
        <p className="timer-display text-5xl" role="timer">
          {formatoReloj(elapsedMs)}
        </p>
      )}

      {fase === 'pausado' && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-hyrox-warning">
          <Pause className="w-4 h-4" aria-hidden="true" />
          HEAT EN PAUSA — cronómetro congelado
        </p>
      )}

      {fase === 'capado' && (
        <p className="text-sm font-bold text-hyrox-danger">
          TIME CAP alcanzado — solo se registran repeticiones (capado).
        </p>
      )}

      {fase === 'finalizado' && (
        <p className="text-sm font-bold text-hyrox-mist">Heat finalizado por el administrador.</p>
      )}

      {aviso && <p className="text-2xs text-hyrox-warning">{aviso}</p>}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() =>
            useCompetenciaStartStore.getState().forzarSincronizacion(socket, competenciaId)
          }
          disabled={sincronizando || fase === 'espera'}
          className="inline-flex items-center gap-1.5 text-2xs text-hyrox-mist underline underline-offset-2 disabled:opacity-40 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          {sincronizando ? 'Sincronizando…' : 'Re-sincronizar con la competencia'}
        </button>
        <button
          type="button"
          onClick={() => beep(660, 150)}
          title="Probar sonido (también activa el audio del navegador)"
          className="inline-flex items-center gap-1.5 text-2xs text-hyrox-mist underline underline-offset-2 cursor-pointer"
        >
          <Volume2 className="w-3 h-3" aria-hidden="true" />
          Probar sonido
        </button>
      </div>
    </section>
  );
}

/** MM:SS.CS como el cronómetro del juez. */
function formatoReloj(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const mm = String(Math.floor(total / 60000)).padStart(2, '0');
  const ss = String(Math.floor((total % 60000) / 1000)).padStart(2, '0');
  const cs = String(Math.floor((total % 1000) / 10)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
}
