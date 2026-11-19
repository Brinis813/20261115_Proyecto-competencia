import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, CalendarClock, Clock, Flag, Plus, Trash2, Users, X } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Select,
  SkeletonList,
} from '../../components/ui';
import type { Categoria, VistaHeats, Competencia } from '../../types';
import { dedupCategorias } from '../../utils/formato';

function etiquetaCategoria(c: Pick<Categoria, 'nombre' | 'genero'>): string {
  return `${c.nombre} ${c.genero}`.trim();
}

/**
 * Heats globales por categoría: series estables (heat + carril fijos por
 * atleta para todo el evento) con cronograma por Competencia (auto o manual).
 */
export default function HeatsPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [competenciaId, setCompetenciaId] = useState<number | null>(null);

  const [vista, setVista] = useState<VistaHeats | null>(null);
  const [cargandoBase, setCargandoBase] = useState(true);
  const [cargandoHeats, setCargandoHeats] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  // Configuración de series.
  const [capacidad, setCapacidad] = useState(8);
  const [modo, setModo] = useState<'alfabetico' | 'aleatorio'>('alfabetico');
  const [accionando, setAccionando] = useState<string | null>(null);
  const [confirmarGenerar, setConfirmarGenerar] = useState(false);
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);

  // Programación horaria.
  const [modoHorario, setModoHorario] = useState<'auto' | 'manual'>('auto');
  const [horaHeat1, setHoraHeat1] = useState('09:00');
  const [transicion, setTransicion] = useState(5);
  const [horasManual, setHorasManual] = useState<Record<number, string>>({});
  const [guardandoHorario, setGuardandoHorario] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Categoria[]>('/categories'), api.get<Competencia[]>('/competencias')])
      .then(([resCat, resCompetencias]) => {
        const cats = dedupCategorias(Array.isArray(resCat.data) ? resCat.data : []);
        setCategorias(cats);
        setCompetencias(Array.isArray(resCompetencias.data) ? resCompetencias.data : []);
        if (cats.length > 0) setCategoriaId(cats[0].id);
      })
      .catch((err) =>
        setError(mensajeDeError(err, 'No se pudieron cargar categorías ni Competencias')),
      )
      .finally(() => setCargandoBase(false));
  }, []);

  const cargar = useCallback(async () => {
    if (!categoriaId) {
      setVista(null);
      return;
    }
    setCargandoHeats(true);
    try {
      const res = await api.get<VistaHeats>('/heats', {
        params: {
          categoria_id: categoriaId,
          ...(competenciaId ? { competencia_id: competenciaId } : {}),
        },
      });
      setVista(res.data);
      // Las horas manuales parten de lo programado (editable por serie).
      const mapa: Record<number, string> = {};
      for (const h of res.data.heats) {
        if (h.hora_inicio) mapa[h.id] = h.hora_inicio;
      }
      setHorasManual(mapa);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los heats'));
    } finally {
      setCargandoHeats(false);
    }
  }, [categoriaId, competenciaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function mutar(clave: string, peticion: Promise<unknown>, ok: string) {
    setAccionando(clave);
    setError('');
    setExito('');
    try {
      await peticion;
      setExito(ok);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo completar la acción'));
    } finally {
      setAccionando(null);
    }
  }

  const generar = () =>
    categoriaId &&
    mutar(
      'generar',
      api.post('/heats/generar', { categoria_id: categoriaId, capacidad_maxima: capacidad, modo }),
      'Series generadas',
    );

  const heatVacio = () =>
    categoriaId &&
    mutar(
      'vacio',
      api.post('/heats', { categoria_id: categoriaId, capacidad_maxima: capacidad }),
      'Serie vacía creada',
    );

  const limpiar = () =>
    categoriaId &&
    mutar('limpiar', api.delete(`/heats/categoria/${categoriaId}`), 'Series eliminadas');

  const mover = (participanteId: number, heatId: number) =>
    mutar(
      `mover-${participanteId}`,
      api.post('/heats/mover', { participante_id: participanteId, heat_id: heatId }),
      'Atleta movido de serie',
    );

  const quitar = (participanteId: number) =>
    categoriaId &&
    mutar(
      `quitar-${participanteId}`,
      api.delete(`/heats/asignacion/${participanteId}`, {
        data: { categoria_id: categoriaId },
      }),
      'Atleta fuera de series',
    );

  const eliminarHeat = (heatId: number) =>
    mutar(`del-${heatId}`, api.delete(`/heats/${heatId}`), 'Serie eliminada');

  async function guardarHorarioAuto() {
    if (!categoriaId || !competenciaId) return;
    setGuardandoHorario(true);
    setError('');
    setExito('');
    try {
      const res = await api.post<{ sinDuracion: boolean }>('/heats/horarios/auto', {
        categoria_id: categoriaId,
        competencia_id: competenciaId,
        hora_heat_1: horaHeat1,
        transicion_min: transicion,
      });
      setExito(
        res.data.sinDuracion
          ? 'Horario calculado solo con la transición: la competencia no tiene duración definida'
          : 'Horario calculado y guardado',
      );
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el horario'));
    } finally {
      setGuardandoHorario(false);
    }
  }

  async function guardarHorarioManual() {
    if (!categoriaId || !competenciaId || !vista) return;
    const faltan = vista.heats.filter((h) => !horasManual[h.id]);
    if (faltan.length > 0) {
      setError(`Falta la hora del Heat ${faltan.map((h) => h.numero).join(', ')}`);
      return;
    }
    setGuardandoHorario(true);
    setError('');
    setExito('');
    try {
      await api.post('/heats/horarios/manual', {
        categoria_id: categoriaId,
        competencia_id: competenciaId,
        horarios: vista.heats.map((h) => ({ heat_id: h.id, hora_inicio: horasManual[h.id] })),
      });
      setExito('Horario guardado');
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el horario'));
    } finally {
      setGuardandoHorario(false);
    }
  }

  const competenciaSel = competencias.find((w) => w.id === competenciaId) ?? null;
  const hayHeats = (vista?.heats.length ?? 0) > 0;

  return (
    <AppShell
      title="Heats"
      subtitle="Series globales por categoría, con cronograma por Competencia"
    >
      <div className="max-w-6xl space-y-4">
        {error && (
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}
        {exito && (
          <Alert tone="success" onDismiss={() => setExito('')}>
            {exito}
          </Alert>
        )}

        {cargandoBase ? (
          <div className="surface">
            <SkeletonList rows={4} />
          </div>
        ) : (
          <>
            {/* Selectores */}
            <section className="surface p-4 sm:p-5 grid sm:grid-cols-2 gap-3">
              <Select
                label="Categoría"
                value={categoriaId === null ? '' : String(categoriaId)}
                onChange={(e) =>
                  setCategoriaId(e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">Elige una categoría…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {etiquetaCategoria(c)}
                  </option>
                ))}
              </Select>
              <Select
                label="Competencia para el cronograma"
                value={competenciaId === null ? '' : String(competenciaId)}
                onChange={(e) =>
                  setCompetenciaId(e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">Sin Competencia (solo series)…</option>
                {competencias.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.nombre}
                  </option>
                ))}
              </Select>
            </section>

            {categoriaId && (
              <>
                {/* Configuración */}
                <section className="surface p-4 sm:p-5">
                  <h2 className="eyebrow mb-3">Series de la categoría</h2>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <Field
                      label="Capacidad máxima por heat"
                      type="number"
                      min={1}
                      max={50}
                      value={capacidad}
                      onChange={(e) => setCapacidad(Number(e.target.value))}
                      className="sm:w-44 shrink-0 [&_input]:w-full"
                    />
                    <Select
                      label="Orden automático"
                      value={modo}
                      onChange={(e) => setModo(e.target.value as 'alfabetico' | 'aleatorio')}
                      className="sm:w-48 shrink-0 [&_select]:w-full"
                    >
                      <option value="alfabetico">Alfabético</option>
                      <option value="aleatorio">Aleatorio</option>
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon={Flag}
                        loading={accionando === 'generar'}
                        onClick={() => (hayHeats ? setConfirmarGenerar(true) : void generar())}
                      >
                        Generar series
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Plus}
                        loading={accionando === 'vacio'}
                        onClick={() => void heatVacio()}
                      >
                        Serie vacía
                      </Button>
                      {hayHeats && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          loading={accionando === 'limpiar'}
                          onClick={() => setConfirmarLimpiar(true)}
                          className="hover:text-hyrox-danger"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>
                  </div>
                  {hayHeats && (
                    <p className="field-hint mt-2">
                      Generar de nuevo reemplaza las series y sus horarios de esta categoría.
                    </p>
                  )}
                </section>

                {/* Cronograma por Competencia */}
                {competenciaId && (
                  <section className="surface p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h2 className="eyebrow flex-1">Cronograma · {competenciaSel?.nombre}</h2>
                      <div
                        className="flex rounded-xl border border-white/10 overflow-hidden"
                        role="group"
                        aria-label="Modo de horario"
                      >
                        {(['auto', 'manual'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setModoHorario(m)}
                            aria-pressed={modoHorario === m}
                            className={`px-3.5 h-9 text-xs font-bold transition-colors cursor-pointer ${
                              modoHorario === m
                                ? 'bg-hyrox-primary/20 text-hyrox-primary'
                                : 'text-hyrox-mist hover:text-hyrox-paper'
                            }`}
                          >
                            {m === 'auto' ? 'Automático' : 'Manual'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!hayHeats ? (
                      <p className="text-xs text-hyrox-mist">
                        Primero arma las series de la categoría.
                      </p>
                    ) : modoHorario === 'auto' ? (
                      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                        <Field
                          label="Hora del Heat 1"
                          type="time"
                          value={horaHeat1}
                          onChange={(e) => setHoraHeat1(e.target.value)}
                          className="sm:max-w-[10rem]"
                        />
                        <Field
                          label="Transición entre heats (min)"
                          type="number"
                          min={0}
                          max={180}
                          value={transicion}
                          onChange={(e) => setTransicion(Number(e.target.value))}
                          className="sm:max-w-[14rem]"
                          hint={
                            competenciaSel?.duracion_minutos
                              ? `competencia: ${competenciaSel.duracion_minutos} min + transición`
                              : 'La competencia no tiene duración: solo se suma la transición'
                          }
                        />
                        <Button
                          size="sm"
                          icon={CalendarClock}
                          loading={guardandoHorario}
                          onClick={() => void guardarHorarioAuto()}
                          className="sm:mb-[1.35rem]"
                        >
                          Calcular y guardar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {(vista?.heats ?? []).map((h) => (
                            <Field
                              key={h.id}
                              label={`Heat ${h.numero}`}
                              type="time"
                              value={horasManual[h.id] ?? ''}
                              onChange={(e) =>
                                setHorasManual((prev) => ({ ...prev, [h.id]: e.target.value }))
                              }
                            />
                          ))}
                        </div>
                        <Button
                          size="sm"
                          icon={CalendarClock}
                          loading={guardandoHorario}
                          onClick={() => void guardarHorarioManual()}
                        >
                          Guardar horarios
                        </Button>
                      </div>
                    )}
                  </section>
                )}

                {/* Series */}
                {cargandoHeats ? (
                  <div className="surface">
                    <SkeletonList rows={3} />
                  </div>
                ) : !hayHeats ? (
                  <div className="surface">
                    <EmptyState
                      icon={Flag}
                      title="Sin series"
                      description="Genera las series automáticamente o crea series vacías y asigna atletas a mano."
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2 items-start">
                    {vista!.heats.map((heat) => (
                      <section key={heat.id} className="surface overflow-hidden">
                        <header className="panel-header">
                          <div>
                            <h3 className="eyebrow">
                              Heat {heat.numero} · {heat.ocupados}/{heat.capacidad_maxima}
                            </h3>
                            {heat.hora_inicio ? (
                              <p className="text-2xs text-hyrox-primary font-mono mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                {heat.hora_inicio}
                                {competenciaSel && ` · ${competenciaSel.nombre}`}
                              </p>
                            ) : (
                              competenciaId && (
                                <p className="text-2xs text-hyrox-ghost mt-0.5">
                                  Sin hora en esta competencia
                                </p>
                              )
                            )}
                          </div>
                          <IconButton
                            icon={Trash2}
                            label={`Eliminar Heat ${heat.numero}`}
                            onClick={() => void eliminarHeat(heat.id)}
                            className="hover:text-hyrox-danger hover:bg-hyrox-danger/10"
                          />
                        </header>
                        {heat.participantes.length === 0 ? (
                          <p className="px-5 py-4 text-xs text-hyrox-ghost">Serie vacía.</p>
                        ) : (
                          <ul className="divide-hairline">
                            {heat.participantes.map((p) => (
                              <FilaAtleta
                                key={p.id}
                                nombre={`${p.nombre} ${p.apellidos}`.trim()}
                                detalle={`C.I. ${p.cedula}${p.box ? ` · ${p.box}` : ''}`}
                                carril={p.carril_numero}
                                heats={vista!.heats}
                                heatActual={heat.id}
                                moviendo={accionando === `mover-${p.id}`}
                                quitando={accionando === `quitar-${p.id}`}
                                onMover={(destino) => void mover(p.id, destino)}
                                onQuitar={() => void quitar(p.id)}
                              />
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}

                    {/* Bolsa de sin asignar */}
                    <section className="surface overflow-hidden">
                      <header className="panel-header">
                        <div>
                          <h3 className="eyebrow">Sin asignar · {vista?.sinAsignar.length ?? 0}</h3>
                          <p className="text-2xs text-hyrox-ghost mt-0.5">
                            Elige la serie destino por atleta
                          </p>
                        </div>
                        <Users className="w-4 h-4 text-hyrox-ghost" aria-hidden="true" />
                      </header>
                      {(vista?.sinAsignar.length ?? 0) === 0 ? (
                        <p className="px-5 py-4 text-xs text-hyrox-ghost">
                          Todos los atletas tienen serie.
                        </p>
                      ) : (
                        <ul className="divide-hairline max-h-96 overflow-y-auto">
                          {vista!.sinAsignar.map((p) => (
                            <FilaAtleta
                              key={p.id}
                              nombre={`${p.nombre} ${p.apellidos}`.trim()}
                              detalle={`C.I. ${p.cedula}${p.box ? ` · ${p.box}` : ''}`}
                              heats={vista!.heats}
                              moviendo={accionando === `mover-${p.id}`}
                              onMover={(destino) => void mover(p.id, destino)}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmarGenerar}
        title="Regenerar series"
        message="Se reemplazan las series y sus horarios de esta categoría. Los resultados registrados no se tocan (viven por WOD, no por heat)."
        confirmLabel="Regenerar"
        loading={accionando === 'generar'}
        onConfirm={() => {
          setConfirmarGenerar(false);
          void generar();
        }}
        onCancel={() => setConfirmarGenerar(false)}
      />
      <ConfirmDialog
        open={confirmarLimpiar}
        title="Limpiar series"
        message="Se eliminan todas las series, carriles y horarios de esta categoría. Los atletas quedan sin asignar."
        confirmLabel="Eliminar todo"
        tone="danger"
        loading={accionando === 'limpiar'}
        onConfirm={() => {
          setConfirmarLimpiar(false);
          void limpiar();
        }}
        onCancel={() => setConfirmarLimpiar(false)}
      />
    </AppShell>
  );
}

/** Fila de atleta con carril, mover a otra serie (dropdown) y quitar. */
function FilaAtleta({
  nombre,
  detalle,
  carril,
  heats,
  heatActual,
  moviendo,
  quitando,
  onMover,
  onQuitar,
}: {
  nombre: string;
  detalle: string;
  carril?: number;
  heats: VistaHeats['heats'];
  heatActual?: number;
  moviendo?: boolean;
  quitando?: boolean;
  onMover: (heatId: number) => void;
  onQuitar?: () => void;
}) {
  const [destino, setDestino] = useState<string>('');

  return (
    <li className="flex items-center gap-2.5 px-4 py-2.5">
      {carril != null && (
        <span
          title={`Carril ${carril}`}
          className="grid place-items-center w-7 h-7 rounded-lg bg-hyrox-primary/12 font-mono text-xs font-bold text-hyrox-primary shrink-0"
        >
          {carril}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-hyrox-paper truncate">{nombre}</span>
        <span className="block text-2xs text-hyrox-ghost truncate">{detalle}</span>
      </span>
      <select
        aria-label={`Mover a ${nombre}`}
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
        disabled={moviendo}
        className="h-9 max-w-[7.5rem] text-xs rounded-lg px-2 cursor-pointer shrink-0"
      >
        <option value="">Mover…</option>
        {heats
          .filter((h) => h.id !== heatActual)
          .map((h) => (
            <option key={h.id} value={String(h.id)}>
              Heat {h.numero} ({h.ocupados}/{h.capacidad_maxima})
            </option>
          ))}
      </select>
      <button
        type="button"
        onClick={() => destino && onMover(Number(destino))}
        disabled={!destino || moviendo}
        title="Mover a la serie elegida"
        className="grid place-items-center w-9 h-9 rounded-lg border border-hyrox-primary/40 bg-hyrox-primary/12 text-hyrox-primary hover:bg-hyrox-primary/20 active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
      >
        <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      {onQuitar && (
        <IconButton
          icon={X}
          label={`Quitar a ${nombre} de la serie`}
          onClick={onQuitar}
          disabled={quitando}
          className="hover:text-hyrox-danger hover:bg-hyrox-danger/10"
        />
      )}
    </li>
  );
}
