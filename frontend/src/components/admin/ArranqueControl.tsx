import { useEffect, useState } from 'react';
import {
  Ban,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Hand,
  Pause,
  Play,
  Square,
  Timer,
} from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { Alert, Button, ConfirmDialog, Field } from '../ui';
import type { ModoArranque, CompetenciaStartPayload } from '../../types';

const ETIQUETA_ESTADO: Record<string, string> = {
  armado: 'Armado',
  cuenta_regresiva: 'Cuenta regresiva',
  en_curso: 'En curso',
  pausado: 'En pausa',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

/**
 * Arranque sincronizado desde la tarjeta de la competencia.
 *
 * El admin elige el modo y el backend persiste el t0 y lo difunde por
 * Socket.IO a la sala de la competencia. Incluye los comandos de emergencia:
 * pausa global, reanudar, finalizar y abortar (resetea los relojes a 00:00).
 */
export default function ArranqueControl({ competenciaId, competenciaNombre }: { competenciaId: number; competenciaNombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<CompetenciaStartPayload | null>(null);
  const [cargando, setCargando] = useState(false);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [countdownSeg, setCountdownSeg] = useState(10);
  const [programadoPara, setProgramadoPara] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  // Confirmación previa a las acciones de emergencia: pausar congela el heat
  // completo y abortar resetea los relojes, ninguna debe salir por un toque.
  const [confirmar, setConfirmar] = useState<'pausar' | 'reanudar' | 'fin' | 'abortar' | null>(null);

  // El estado se precarga al montar para que la insignia (Armado, En curso…)
  // se vea sin abrir el panel. Solo lee; no arma nada solo.
  useEffect(() => {
    let vivo = true;
    api
      .get<CompetenciaStartPayload | null>(`/competencias/${competenciaId}/arranque`)
      .then((res) => {
        if (vivo) setEstado(res.data);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [competenciaId]);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const res = await api.get<CompetenciaStartPayload | null>(`/competencias/${competenciaId}/arranque`);
      setEstado(res.data);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el arranque'));
    } finally {
      setCargando(false);
    }
  }

  function alternar() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente) void cargar();
  }

  async function accionar(clave: string, peticion: () => Promise<unknown>, ok: string) {
    setAccionando(clave);
    setError('');
    setExito('');
    try {
      await peticion();
      setExito(ok);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo completar la acción'));
    } finally {
      setAccionando(null);
    }
  }

  const armar = (modo: ModoArranque) =>
    accionar(modo, () => {
      if (modo === 'cuenta_regresiva') {
        return api.post(`/competencias/${competenciaId}/arranque`, { modo, countdownSeg });
      }
      if (modo === 'programado') {
        const ms = new Date(programadoPara).getTime();
        if (!programadoPara || !Number.isFinite(ms)) {
          return Promise.reject(new Error('Elige la fecha y hora del arranque'));
        }
        return api.post(`/competencias/${competenciaId}/arranque`, { modo, programadoParaMs: ms });
      }
      return api.post(`/competencias/${competenciaId}/arranque`, { modo });
    }, 'Orden emitida a los jueces');

  const activo = estado != null && ['armado', 'cuenta_regresiva', 'en_curso', 'pausado'].includes(estado.estado);

  /** Ejecuta la acción de emergencia ya confirmada por el admin. */
  function confirmarAccion() {
    if (confirmar === 'pausar') {
      void accionar('pausar', () => api.post(`/competencias/${competenciaId}/arranque/pausa`), 'Heat en pausa: jueces congelados');
    } else if (confirmar === 'reanudar') {
      void accionar('reanudar', () => api.post(`/competencias/${competenciaId}/arranque/reanudar`), 'Heat reanudado');
    } else if (confirmar === 'fin') {
      void accionar('fin', () => api.post(`/competencias/${competenciaId}/arranque/fin`), 'Heat finalizado');
    } else if (confirmar === 'abortar') {
      void accionar('abortar', () => api.delete(`/competencias/${competenciaId}/arranque`), 'Heat abortado: relojes a 00:00');
    }
    setConfirmar(null);
  }

  const TEXTOS_CONFIRMAR = {
    pausar: {
      titulo: `Pausar “${competenciaNombre}”`,
      mensaje:
        'Se congelan los cronómetros y el registro de todos los jueces (repeticiones, pesos, tiempos y envíos). Lo ya anotado se conserva y continúa al reanudar.',
      boton: 'Pausar heat',
    },
    reanudar: {
      titulo: `Reanudar “${competenciaNombre}”`,
      mensaje: 'El heat continúa desde el segundo donde se pausó y los jueces pueden seguir registrando.',
      boton: 'Reanudar heat',
    },
    fin: {
      titulo: `Finalizar “${competenciaNombre}”`,
      mensaje: 'Se detienen los cronómetros de los jueces. Úsalo cuando el heat terminó y ya no se registra más.',
      boton: 'Finalizar heat',
    },
    abortar: {
      titulo: `Abortar “${competenciaNombre}”`,
      mensaje: 'Resetea los relojes a 00:00 y saca a los jueces del heat. Los resultados ya guardados no se borran.',
      boton: 'Abortar y resetear',
    },
  } as const;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <Timer className="w-4 h-4 text-hyrox-primary shrink-0" aria-hidden="true" />
        <span className="text-xs font-bold text-hyrox-paper flex-1">Arranque sincronizado</span>
        {estado && <span className="badge-gray">{ETIQUETA_ESTADO[estado.estado] ?? estado.estado}</span>}
        {abierto ? (
          <ChevronUp className="w-4 h-4 text-hyrox-mist shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 text-hyrox-mist shrink-0" aria-hidden="true" />
        )}
      </button>

      {abierto && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-white/[0.06]">
          {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
          {exito && <Alert tone="success" onDismiss={() => setExito('')}>{exito}</Alert>}

          {cargando ? (
            <p className="text-2xs text-hyrox-ghost py-2">Cargando estado…</p>
          ) : (
            <>
              {estado?.startTimeServer != null && (
                <p className="text-2xs text-hyrox-mist">
                  t0 servidor: {new Date(estado.startTimeServer).toLocaleTimeString()}
                  {estado.timeCapMs != null && (
                    <> · cap a los {Math.round(estado.timeCapMs / 60000)} min</>
                  )}
                  {estado.pausaAcumuladaMs > 0 && (
                    <> · en pausa {Math.round(estado.pausaAcumuladaMs / 1000)} s acumulados</>
                  )}
                </p>
              )}

              {!activo && (
                <div className="space-y-2.5">
                  <p className="text-2xs text-hyrox-mist">
                    Elige cómo inician los cronómetros de los jueces en este heat.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      icon={Play}
                      loading={accionando === 'directo'}
                      onClick={() => void armar('directo')}
                      title="Todos los jueces arrancan al mismo tiempo, ya"
                    >
                      Iniciar ya (todos)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Hand}
                      loading={accionando === 'manual_juez'}
                      onClick={() => void armar('manual_juez')}
                      title="Cada juez inicia su cronómetro por su cuenta"
                    >
                      Manual por juez
                    </Button>
                  </div>

                  <div className="flex items-end gap-2">
                    <Field
                      label="Cuenta regresiva (s)"
                      type="number"
                      min={3}
                      max={60}
                      value={countdownSeg}
                      onChange={(e) => setCountdownSeg(Number(e.target.value))}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Timer}
                      loading={accionando === 'cuenta_regresiva'}
                      onClick={() => void armar('cuenta_regresiva')}
                      className="mb-[1.35rem]"
                    >
                      Armar
                    </Button>
                  </div>

                  <div className="flex items-end gap-2">
                    <Field
                      label="Inicio programado"
                      type="datetime-local"
                      value={programadoPara}
                      onChange={(e) => setProgramadoPara(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={CalendarClock}
                      loading={accionando === 'programado'}
                      onClick={() => void armar('programado')}
                      className="mb-[1.35rem]"
                    >
                      Programar
                    </Button>
                  </div>
                </div>
              )}

              {activo && (
                <div className="space-y-2">
                  <p className="text-2xs text-hyrox-mist">
                    {estado?.estado === 'pausado'
                      ? 'Heat en pausa: los cronómetros están congelados.'
                      : `Heat ${ETIQUETA_ESTADO[estado?.estado ?? '']?.toLowerCase() ?? ''} en “${competenciaNombre}”.`}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {estado?.estado === 'pausado' ? (
                      <Button
                        size="sm"
                        variant="success"
                        icon={Play}
                        loading={accionando === 'reanudar'}
                        onClick={() => setConfirmar('reanudar')}
                      >
                        Reanudar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Pause}
                        loading={accionando === 'pausar'}
                        disabled={estado?.estado !== 'en_curso'}
                        onClick={() => setConfirmar('pausar')}
                      >
                        Pausar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Square}
                      loading={accionando === 'fin'}
                      onClick={() => setConfirmar('fin')}
                    >
                      Finalizar
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Ban}
                    loading={accionando === 'abortar'}
                    onClick={() => setConfirmar('abortar')}
                    className="w-full hover:text-hyrox-danger"
                  >
                    Abortar (reset a 00:00)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmar !== null}
        title={confirmar ? TEXTOS_CONFIRMAR[confirmar].titulo : ''}
        message={confirmar ? TEXTOS_CONFIRMAR[confirmar].mensaje : ''}
        confirmLabel={confirmar ? TEXTOS_CONFIRMAR[confirmar].boton : 'Confirmar'}
        tone={confirmar === 'reanudar' ? 'primary' : 'danger'}
        loading={accionando !== null}
        onConfirm={confirmarAccion}
        onCancel={() => setConfirmar(null)}
      />
    </div>
  );
}
