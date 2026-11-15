import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Link2, Search, Trash2, UserCheck, Users } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Select,
  SkeletonList,
  Spinner,
  cx,
} from '../../components/ui';
import type { Asignacion, Wod, Juez, Participante, Competencia } from '../../types';
import { formatearCategorias } from '../../utils/formato';

/**
 * Vincula jueces y atletas a una competencia, estacion por estacion.
 *
 * Sin Competencia en la URL muestra el selector; con Competencia, el panel de asignacion.
 * Tener el id en la ruta permite volver directamente desde la lista de Competencias.
 */
export default function AsignacionesPage() {
  const { competenciaId } = useParams();
  return competenciaId ? <PanelAsignacion competenciaId={Number(competenciaId)} /> : <SelectorCompetencia />;
}

/* ------------------------------------------------------------------ */

function SelectorCompetencia() {
  const navigate = useNavigate();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get<Competencia[]>('/competencias')
      .then((res) => setCompetencias(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCompetencias([]))
      .finally(() => setCargando(false));
  }, []);

  return (
    <AppShell title="Asignaciones" subtitle="Elige la competencia que vas a organizar">
      <section className="surface overflow-hidden max-w-2xl">
        <header className="panel-header">
          <h2 className="eyebrow">Competencias</h2>
        </header>

        {cargando ? (
          <SkeletonList rows={3} />
        ) : competencias.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No hay Competencias"
            description="Crea una competencia antes de asignar jueces y atletas."
            action={<Button onClick={() => navigate('/admin/competencias/nuevo')}>Crear Competencia</Button>}
          />
        ) : (
          <ul className="divide-hairline">
            {competencias.map((competencia) => (
              <li key={competencia.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/asignaciones/${competencia.id}`)}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                    <ClipboardList className="w-4.5 h-4.5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-hyrox-paper truncate">{competencia.nombre}</span>
                    <span className="block text-xs text-hyrox-mist">{competencia.wods?.length ?? 0} wods</span>
                    <span className="block text-2xs text-hyrox-ghost truncate">
                      Categorias: {formatearCategorias(competencia.divisiones)}
                    </span>
                  </span>
                  <span className="text-hyrox-ghost" aria-hidden="true">
                    &rsaquo;
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

const TODOS = 'todos';

/**
 * Empareja jueces y atletas respetando el orden de seleccion.
 *
 *  - Wod especifico: 1 juez ↔ 1 atleta. Debe haber la misma cantidad
 *    (cada estacion simultanea necesita su propio instructor).
 *  - Todos los WODs (Competencia seguido): un mismo juez puede seguir a varios
 *    atletas, asi que se admite un solo juez para todos los seleccionados.
 *
 * Devuelve null cuando la seleccion es ambigua.
 */
function calcularPares(
  jueces: number[],
  atletas: number[],
  permitirUnJuez: boolean
): Array<{ usuario_id: number; participante_id: number }> | null {
  if (jueces.length === 0 || atletas.length === 0) return [];
  if (permitirUnJuez && jueces.length === 1)
    return atletas.map((a) => ({ usuario_id: jueces[0], participante_id: a }));
  if (jueces.length === atletas.length)
    return jueces.map((j, i) => ({ usuario_id: j, participante_id: atletas[i] }));
  return null;
}

function PanelAsignacion({ competenciaId }: { competenciaId: number }) {
  const navigate = useNavigate();

  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  const [jueces, setJueces] = useState<Juez[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  // El WOD de destino: 'todos' guarda wod_id = null.
  const [wodSel, setWodSel] = useState<string>(TODOS);
  // Se guardan como arrays para conservar el orden de seleccion (emparejamiento).
  const [juecesSel, setJuecesSel] = useState<number[]>([]);
  const [atletasSel, setAtletasSel] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState('');

  const [aEliminar, setAEliminar] = useState<Asignacion | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const wods: Wod[] = useMemo(
    () => [...(competencia?.wods ?? [])].sort((a, b) => a.orden - b.orden),
    [competencia]
  );

  const cargar = useCallback(async () => {
    try {
      const [competenciaRes, juecesRes, partRes, asigRes] = await Promise.all([
        api.get<Competencia>(`/competencias/${competenciaId}`),
        api.get<Juez[]>('/users/jueces'),
        api.get<Participante[]>('/users/participantes'),
        api.get<Asignacion[]>(`/competencias/${competenciaId}/assignments`),
      ]);
      setCompetencia(competenciaRes.data);
      setJueces(juecesRes.data ?? []);
      setParticipantes(partRes.data ?? []);
      setAsignaciones(asigRes.data ?? []);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las asignaciones'));
    } finally {
      setCargando(false);
    }
  }, [competenciaId]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [competenciaId, cargar]);

  const atletasFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return participantes;
    return participantes.filter((p) =>
      `${p.nombre} ${p.apellidos} ${p.cedula} ${p.box}`.toLowerCase().includes(termino)
    );
  }, [participantes, busqueda]);

  const esTodos = wodSel === TODOS;

  // Atletas que ya tienen juez en el ambito seleccionado (WOD o "todos").
  const atletasYaAsignados = useMemo(() => {
    const cid = esTodos ? null : Number(wodSel);
    return new Set(asignaciones.filter((a) => a.wod_id === cid).map((a) => a.participante_id));
  }, [asignaciones, wodSel, esTodos]);

  // En un WOD concreto un juez no puede repetirse (no puede estar en dos
  // atletas a la vez): si ya esta asignado ahi, se bloquea. En "todos" (Competencia
  // seguido) si puede cubrir varios atletas, asi que no se bloquea.
  const juecesBloqueados = useMemo(() => {
    if (esTodos) return new Set<number>();
    const cid = Number(wodSel);
    return new Set(asignaciones.filter((a) => a.wod_id === cid).map((a) => a.usuario_id));
  }, [asignaciones, wodSel, esTodos]);

  const juezPorId = useMemo(() => new Map(jueces.map((j) => [j.id, j])), [jueces]);
  const atletaPorId = useMemo(() => new Map(participantes.map((p) => [p.id, p])), [participantes]);

  const pares = useMemo(
    () => calcularPares(juecesSel, atletasSel, esTodos),
    [juecesSel, atletasSel, esTodos]
  );

  function alternarOrdenado(lista: number[], setter: (l: number[]) => void, id: number) {
    setter(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  // Al cambiar de WOD, la seleccion previa deja de tener sentido (cambian
  // los jueces bloqueados y el modo de emparejamiento).
  function cambiarWod(valor: string) {
    setWodSel(valor);
    setJuecesSel([]);
    setAtletasSel([]);
  }

  // Asignaciones agrupadas por WOD, cada una como "atleta -> su juez".
  const gruposAsignacion = useMemo(() => {
    const porScope = new Map<string, { titulo: string; orden: number; filas: Asignacion[] }>();
    for (const a of asignaciones) {
      const clave = a.wod_id == null ? TODOS : String(a.wod_id);
      if (!porScope.has(clave)) {
        porScope.set(clave, {
          titulo: a.Wod
            ? `WOD ${a.Wod.orden} · ${a.Wod.nombre_ejercicio}`
            : 'Todos los WODs',
          orden: a.Wod ? a.Wod.orden : 999,
          filas: [],
        });
      }
      porScope.get(clave)!.filas.push(a);
    }
    for (const g of porScope.values()) {
      g.filas.sort((x, y) =>
        `${x.Participante?.apellidos} ${x.Participante?.nombre}`.localeCompare(
          `${y.Participante?.apellidos} ${y.Participante?.nombre}`
        )
      );
    }
    return [...porScope.values()].sort((x, y) => x.orden - y.orden);
  }, [asignaciones]);

  async function asignar() {
    if (!pares || pares.length === 0) return;
    setError('');
    setExito('');
    setGuardando(true);
    try {
      const { data } = await api.post('/competencias/assign', {
        competencia_id: competenciaId,
        wod_id: wodSel === TODOS ? null : Number(wodSel),
        pares,
      });
      setJuecesSel([]);
      setAtletasSel([]);
      setExito(`${data?.total ?? pares.length} asignaciones guardadas. La clasificacion ya se actualizo.`);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron guardar las asignaciones'));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarAsignacion() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/competencias/assignments/${aEliminar.id}`);
      setAEliminar(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar la asignacion'));
    } finally {
      setEliminando(false);
    }
  }

  if (cargando) {
    return (
      <AppShell title="Asignaciones">
        <Spinner />
      </AppShell>
    );
  }

  const ambitoTexto = wodSel === TODOS ? 'todos los WODs' : 'este wod';
  const paresAmbiguos = pares === null;
  const puedeAsignar = !paresAmbiguos && (pares?.length ?? 0) > 0;

  return (
    <AppShell
      title={competencia?.nombre ?? 'Asignaciones'}
      subtitle="Empareja un juez con cada atleta, estacion por estacion"
      actions={
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/admin/asignaciones')}>
          <span className="hidden sm:inline">Competencias</span>
        </Button>
      }
    >
      <div className="max-w-6xl space-y-4">
        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
        {exito && <Alert tone="success" onDismiss={() => setExito('')}>{exito}</Alert>}

        {/* --------------------------- Wod --------------------------- */}
        <section className="surface p-4 sm:p-5">
          <Select label="WOD a asignar" value={wodSel} onChange={(e) => cambiarWod(e.target.value)}>
            <option value={TODOS}>Todos los WODs (Competencia seguido: un juez cubre todas las estaciones)</option>
            {wods.map((c) => (
              <option key={c.id} value={String(c.id)}>
                Wod {c.orden} · {c.nombre_ejercicio}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-2xs text-hyrox-ghost">
            {esTodos
              ? 'Competencia seguido: puedes poner un mismo juez para todos los atletas, o emparejar 1 a 1.'
              : 'Estacion simultanea: un juez por atleta. Un juez ya asignado aqui queda bloqueado, y reasignar un atleta sobrescribe su juez anterior.'}
          </p>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* --------------------------- Jueces --------------------------- */}
          <section className="surface overflow-hidden">
            <header className="panel-header">
              <h2 className="eyebrow">Jueces · {juecesSel.length} seleccionados</h2>
            </header>

            {jueces.length === 0 ? (
              <EmptyState icon={UserCheck} title="No hay jueces registrados" />
            ) : (
              <ul className="divide-hairline max-h-80 overflow-y-auto">
                {jueces.map((juez) => {
                  const bloqueado = juecesBloqueados.has(juez.id);
                  return (
                    <FilaSeleccion
                      key={juez.id}
                      seleccionado={juecesSel.includes(juez.id)}
                      orden={juecesSel.indexOf(juez.id) + 1 || undefined}
                      disabled={bloqueado}
                      onToggle={() => !bloqueado && alternarOrdenado(juecesSel, setJuecesSel, juez.id)}
                      titulo={`${juez.nombre} ${juez.apellidos}`}
                      subtitulo={`C.I. ${juez.cedula} · ${juez.box}`}
                      etiqueta={bloqueado ? 'Ya en este WOD' : undefined}
                    />
                  );
                })}
              </ul>
            )}
          </section>

          {/* --------------------------- Atletas --------------------------- */}
          <section className="surface overflow-hidden">
            <header className="panel-header flex-col sm:flex-row items-stretch sm:items-center">
              <h2 className="eyebrow shrink-0">Atletas · {atletasSel.length} seleccionados</h2>
              <div className="relative sm:w-52">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hyrox-ghost pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar"
                  aria-label="Buscar atleta"
                  className="input-field pl-9 text-sm"
                />
              </div>
            </header>

            {atletasFiltrados.length === 0 ? (
              <EmptyState icon={Users} title="Sin atletas" description="No hay atletas que coincidan." />
            ) : (
              <ul className="divide-hairline max-h-80 overflow-y-auto">
                {atletasFiltrados.map((atleta) => (
                  <FilaSeleccion
                    key={atleta.id}
                    seleccionado={atletasSel.includes(atleta.id)}
                    orden={atletasSel.indexOf(atleta.id) + 1 || undefined}
                    onToggle={() => alternarOrdenado(atletasSel, setAtletasSel, atleta.id)}
                    titulo={`${atleta.nombre} ${atleta.apellidos}`}
                    subtitulo={`C.I. ${atleta.cedula} · ${atleta.box}`}
                    etiqueta={atletasYaAsignados.has(atleta.id) ? 'Ya asignado' : undefined}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* --------------------- Vista previa de parejas --------------------- */}
        <section className="surface p-4 space-y-3">
          {paresAmbiguos ? (
            <Alert tone="warning">
              {esTodos
                ? 'Selecciona un solo juez para varios atletas, o la misma cantidad de jueces y atletas para emparejarlos en orden.'
                : 'Selecciona la misma cantidad de jueces y atletas: en un WOD cada atleta necesita su propio juez.'}
            </Alert>
          ) : (pares?.length ?? 0) > 0 ? (
            <>
              <h3 className="eyebrow">Se crearan estas parejas en {ambitoTexto}</h3>
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {pares!.map((p, i) => {
                  const j = juezPorId.get(p.usuario_id);
                  const a = atletaPorId.get(p.participante_id);
                  return (
                    <li
                      key={`${p.usuario_id}-${p.participante_id}`}
                      className="flex items-center gap-2 text-sm text-hyrox-paper bg-white/[0.03] rounded-lg px-3 py-2"
                    >
                      <span className="font-mono text-2xs text-hyrox-ghost w-5 shrink-0">{i + 1}</span>
                      <span className="truncate">
                        <span className="text-hyrox-mist">{j ? `${j.nombre} ${j.apellidos}` : 'Juez'}</span>
                        <span className="text-hyrox-primary mx-1.5" aria-hidden="true">
                          &harr;
                        </span>
                        {a ? `${a.nombre} ${a.apellidos}` : 'Atleta'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-xs text-hyrox-mist">Selecciona jueces y atletas para formar las parejas.</p>
          )}

          <div className="flex justify-end pt-1">
            <Button icon={Link2} onClick={asignar} loading={guardando} disabled={!puedeAsignar}>
              Asignar {puedeAsignar ? `${pares!.length} pareja${pares!.length > 1 ? 's' : ''}` : ''}
            </Button>
          </div>
        </section>

        {/* ---------------------- Asignaciones actuales ---------------------- */}
        <section className="space-y-3">
          <header className="flex items-center justify-between px-1">
            <h2 className="eyebrow">Asignaciones actuales · {asignaciones.length} vinculos</h2>
          </header>

          {asignaciones.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={ClipboardList}
                title="Sin asignaciones"
                description="Esta competencia no tiene jueces ni atletas asignados todavia."
              />
            </div>
          ) : (
            gruposAsignacion.map((grupo) => (
              <div key={grupo.titulo} className="surface overflow-hidden">
                <header className="panel-header">
                  <h3 className="text-sm font-bold text-hyrox-paper">{grupo.titulo}</h3>
                  <span className="badge-gray">{grupo.filas.length} atletas</span>
                </header>
                <ul className="divide-hairline">
                  {grupo.filas.map((asignacion) => (
                    <li key={asignacion.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-hyrox-paper truncate">
                          {asignacion.Participante?.nombre} {asignacion.Participante?.apellidos}
                        </span>
                        <span className="block text-2xs text-hyrox-ghost">
                          C.I. {asignacion.Participante?.cedula}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-hyrox-mist min-w-0">
                        <UserCheck className="w-3.5 h-3.5 text-hyrox-primary shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {asignacion.Usuario?.nombre} {asignacion.Usuario?.apellidos}
                        </span>
                      </span>
                      <IconButton
                        icon={Trash2}
                        label="Quitar asignacion"
                        onClick={() => setAEliminar(asignacion)}
                        className="hover:text-hyrox-danger hover:bg-hyrox-danger/10 shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>

      <ConfirmDialog
        open={aEliminar !== null}
        title="Quitar asignacion"
        message={`${aEliminar?.Participante?.nombre ?? 'El atleta'} dejara de estar a cargo de ${
          aEliminar?.Usuario?.nombre ?? 'este juez'
        }${aEliminar?.Wod ? ` en el WOD ${aEliminar.Wod.orden}` : ''}. Los resultados ya registrados se mantienen.`}
        confirmLabel="Quitar"
        loading={eliminando}
        onConfirm={eliminarAsignacion}
        onCancel={() => setAEliminar(null)}
      />
    </AppShell>
  );
}

function FilaSeleccion({
  seleccionado,
  orden,
  disabled,
  onToggle,
  titulo,
  subtitulo,
  etiqueta,
}: {
  seleccionado: boolean;
  orden?: number;
  disabled?: boolean;
  onToggle: () => void;
  titulo: string;
  subtitulo: string;
  etiqueta?: string;
}) {
  return (
    <li>
      <label
        className={cx(
          'flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors',
          disabled
            ? 'opacity-45 cursor-not-allowed'
            : cx('cursor-pointer', seleccionado ? 'bg-hyrox-primary/[0.08]' : 'hover:bg-white/[0.03]')
        )}
      >
        <input
          type="checkbox"
          checked={seleccionado}
          onChange={onToggle}
          disabled={disabled}
          className="w-5 h-5 rounded border-white/20 bg-white/[0.06] text-hyrox-primary focus:ring-hyrox-primary/40 cursor-pointer disabled:cursor-not-allowed shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-hyrox-paper truncate">{titulo}</span>
          <span className="block text-2xs text-hyrox-mist truncate">{subtitulo}</span>
        </span>
        {orden !== undefined && (
          <span className="grid place-items-center w-6 h-6 rounded-full bg-hyrox-primary/15 text-hyrox-primary font-mono text-2xs font-bold shrink-0">
            {orden}
          </span>
        )}
        {etiqueta && <span className="badge-gray shrink-0">{etiqueta}</span>}
      </label>
    </li>
  );
}
