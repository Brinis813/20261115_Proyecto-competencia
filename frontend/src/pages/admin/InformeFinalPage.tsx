import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import api, { getEventoActiva, mensajeDeError } from '../../api/client';
import { Alert, Button, EmptyState, Spinner } from '../../components/ui';
import {
  csvInformeEvento,
  descargarTexto,
  juezDeMedicion,
  nombreArchivo,
  textoEstado,
  type DatosInforme,
} from '../../utils/export';
import PortadaImagen from '../../components/eventos/PortadaImagen';
import {
  formatearValor,
  unidadDeWod,
  type Asignacion,
  type Juez,
  type LeaderboardWod,
  type LeaderboardEntry,
  type Participante,
  type ResultadoFila,
  type Competencia,
} from '../../types';

interface EventoPublico {
  id: number;
  nombre: string;
  sede: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  imagen_url?: string | null;
}

interface RespuestaEvento {
  evento: { id: number; nombre: string };
  general: LeaderboardEntry[] | null;
  porCompetencia: Array<{ competencia: { id: number; nombre: string }; leaderboard: LeaderboardEntry[] }>;
}

interface BloqueCompetencia {
  competencia: Competencia;
  wods: LeaderboardWod[];
  filas: ResultadoFila[];
  asignaciones: Asignacion[];
}

/**
 * Informe final del evento: atletas, jueces y puntuaciones.
 * - CSV: un archivo por secciones, listo para Excel.
 * - PDF: vista de impresión (el navegador la guarda como PDF).
 */
export default function InformeFinalPage() {
  const compId = getEventoActiva();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [evento, setEvento] = useState<EventoPublico | null>(null);
  const [jueces, setJueces] = useState<Juez[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [bloques, setBloques] = useState<BloqueCompetencia[]>([]);
  const [general, setGeneral] = useState<LeaderboardEntry[] | null>(null);
  const [clasificacionPorCompetencia, setClasificacionPorCompetencia] = useState<Map<number, LeaderboardEntry[]>>(new Map());

  const cargar = useCallback(async () => {
    if (!compId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const [resComp, resJueces, resAtletas, resCompetencias, resBoard] = await Promise.all([
        api.get<EventoPublico>(`/eventos/publicas/${compId}`),
        api.get<Juez[]>('/users/jueces'),
        api.get<Participante[]>('/users/participantes'),
        api.get<Competencia[]>('/competencias'),
        api.get<RespuestaEvento>(`/leaderboard/evento/${compId}`),
      ]);

      const competencias = (Array.isArray(resCompetencias.data) ? resCompetencias.data : []).sort((a, b) => a.id - b.id);
      setEvento(resComp.data);
      setJueces(Array.isArray(resJueces.data) ? resJueces.data : []);
      setParticipantes(Array.isArray(resAtletas.data) ? resAtletas.data : []);
      setGeneral(resBoard.data.general);
      setClasificacionPorCompetencia(new Map(resBoard.data.porCompetencia.map((p) => [p.competencia.id, p.leaderboard])));

      // El detalle por competencia se carga por separado: si una competencia falla no tumba el informe.
      const resultados = await Promise.all(
        competencias.map(async (competencia): Promise<BloqueCompetencia> => {
          const [res, asig] = await Promise.all([
            api.get<{ wods: LeaderboardWod[]; participantes: ResultadoFila[] }>(
              `/results/competencia/${competencia.id}`
            ),
            api.get<Asignacion[]>(`/competencias/${competencia.id}/assignments`),
          ]);
          return { competencia, wods: res.data.wods ?? [], filas: res.data.participantes ?? [], asignaciones: asig.data ?? [] };
        })
      );
      setBloques(resultados);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el informe'));
    } finally {
      setCargando(false);
    }
  }, [compId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El PDF que genera el navegador toma el nombre del documento.
  useEffect(() => {
    const anterior = document.title;
    if (evento) document.title = `Informe final - ${evento.nombre}`;
    return () => {
      document.title = anterior;
    };
  }, [evento]);

  function datosInforme(): DatosInforme | null {
    if (!evento) return null;
    return {
      evento,
      competencias: bloques.map((b) => ({ id: b.competencia.id, nombre: b.competencia.nombre })),
      wodsPorCompetencia: new Map(bloques.map((b) => [b.competencia.id, b.wods])),
      filasPorCompetencia: new Map(bloques.map((b) => [b.competencia.id, b.filas])),
      asignacionesPorCompetencia: new Map(bloques.map((b) => [b.competencia.id, b.asignaciones])),
      jueces,
      participantes,
      general,
      clasificacionPorCompetencia,
    };
  }

  function descargarCSV() {
    const datos = datosInforme();
    if (!datos || !evento) return;
    descargarTexto(
      nombreArchivo(`informe_${evento.nombre}`, 'csv'),
      csvInformeEvento(datos)
    );
  }

  if (!compId) {
    return (
      <div className="min-h-screen bg-hyrox-void px-4 py-10">
        <div className="max-w-xl mx-auto surface p-6 text-center">
          <FileText className="w-8 h-8 text-hyrox-primary mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold text-hyrox-paper mb-2">Informe final</h1>
          <p className="text-sm text-hyrox-mist mb-4">
            Elige primero el evento activa para generar su informe.
          </p>
          <Link to="/eventos" className="btn-primary btn-sm">
            Elegir evento
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hyrox-void">
      {/* Barra superior: no sale en la impresión */}
      <div className="no-print max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-hyrox-mist hover:text-hyrox-paper"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Panel
        </Link>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" icon={Download} onClick={descargarCSV} disabled={cargando || !evento}>
          CSV (Excel)
        </Button>
        <Button size="sm" icon={Printer} onClick={() => window.print()} disabled={cargando || !evento}>
          Imprimir / PDF
        </Button>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-10">
        {cargando ? (
          <div className="surface p-8">
            <Spinner label="Armando el informe..." />
          </div>
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : !evento ? (
          <div className="surface">
            <EmptyState icon={FileText} title="Sin datos" description="No se encontró el evento." />
          </div>
        ) : (
          <article className="print-sheet bg-white text-slate-900 rounded-2xl shadow-xl overflow-hidden">
            {/* Encabezado */}
            {evento.imagen_url && (
              <PortadaImagen
                src={evento.imagen_url}
                alt=""
                aspecto="aspect-[21/9]"
                tono="claro"
              />
            )}
            <header className="px-6 sm:px-8 pt-7 pb-5 border-b-2 border-slate-900">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Informe final</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">{evento.nombre}</h1>
              <p className="text-sm text-slate-600 mt-1">
                {[evento.sede, rangoCorto(evento.fecha_inicio, evento.fecha_fin)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Generado el {new Date().toLocaleString()} · {participantes.length} atletas · {jueces.length} jueces ·{' '}
                {bloques.length} Competencias
              </p>
            </header>

            <div className="px-6 sm:px-8 py-6 space-y-8">
              {/* Clasificación general */}
              {general && general.length > 0 && (
                <section>
                  <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] mb-3">
                    Clasificación general
                  </h2>
                  <Tabla
                    columnas={['Puesto', 'Atleta', 'Cédula', 'Box', 'Categoría', 'Puntos', 'Empate']}
                    filas={general.map((e) => [
                      e.puesto,
                      `${e.nombre} ${e.apellidos}`.trim(),
                      e.cedula,
                      e.box ?? '',
                      e.categoria ?? '',
                      `${e.puntos_total} pts`,
                      e.comparte_puesto ? 'Sí' : '',
                    ])}
                  />
                </section>
              )}

              {/* Detalle por Competencia */}
              {bloques.map((bloque) => {
                const clasificacion = clasificacionPorCompetencia.get(bloque.competencia.id) ?? [];
                return (
                  <section key={bloque.competencia.id}>
                    <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] mb-1">
                      {bloque.competencia.nombre}
                    </h2>
                    {bloque.competencia.descripcion && (
                      <p className="text-xs text-slate-600 mb-3">{bloque.competencia.descripcion}</p>
                    )}

                    {clasificacion.length > 0 && (
                      <>
                        <h3 className="text-xs font-bold text-slate-700 mt-3 mb-2">Clasificación</h3>
                        <Tabla
                          columnas={['Puesto', 'Atleta', 'Cédula', 'Categoría', 'Puntos']}
                          filas={clasificacion.map((e) => [
                            e.puesto,
                            `${e.nombre} ${e.apellidos}`.trim(),
                            e.cedula,
                            e.categoria ?? '',
                            `${e.puntos_total} pts`,
                          ])}
                        />
                      </>
                    )}

                    <h3 className="text-xs font-bold text-slate-700 mt-3 mb-2">
                      Mediciones por ejercicio y juez ({bloque.filas.length})
                    </h3>
                    {bloque.filas.length === 0 ? (
                      <p className="text-xs text-slate-500">Sin mediciones registradas.</p>
                    ) : (
                      <Tabla
                        columnas={['Ejercicio', 'Atleta', 'Marca', 'Puntos', 'Estado', 'Juez']}
                        filas={bloque.filas.map((f) => {
                          const wod = bloque.wods.find((c) => c.id === f.wod_id);
                          return [
                            wod ? `${wod.orden}. ${wod.nombre_ejercicio}` : '',
                            `${f.nombre} ${f.apellidos}`.trim(),
                            formatearValor(
                              f.valor_bruto,
                              wod?.tipo_medicion ?? 'repeticiones',
                              f.abandono,
                              f.capado,
                              unidadDeWod(wod)
                            ),
                            `${f.puntos_calculados} pts`,
                            textoEstado(f),
                            juezDeMedicion(bloque.asignaciones, f.participante_id, f.wod_id),
                          ];
                        })}
                      />
                    )}
                  </section>
                );
              })}

              {/* Jueces */}
              <section>
                <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] mb-3">
                  Jueces ({jueces.length})
                </h2>
                {jueces.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin jueces registrados.</p>
                ) : (
                  <Tabla
                    columnas={['Juez', 'Cédula', 'Box', 'Atletas asignados']}
                    filas={jueces.map((j) => {
                      const asignados = new Set<number>();
                      for (const b of bloques) {
                        for (const a of b.asignaciones) {
                          if (a.usuario_id === j.id) asignados.add(a.participante_id);
                        }
                      }
                      return [`${j.nombre} ${j.apellidos}`.trim(), j.cedula, j.box ?? '', asignados.size];
                    })}
                  />
                )}

                <h3 className="text-xs font-bold text-slate-700 mt-4 mb-2">Asignaciones juez - atleta</h3>
                <Tabla
                  columnas={['Competencia', 'WOD', 'Juez', 'Atleta']}
                  filas={bloques.flatMap((b) => {
                    const wods = new Map(b.wods.map((c) => [c.id, c]));
                    return b.asignaciones.map((a) => {
                      const wod = a.wod_id == null ? null : wods.get(a.wod_id);
                      return [
                        b.competencia.nombre,
                        wod ? `${wod.orden}. ${wod.nombre_ejercicio}` : 'Todos',
                        a.Usuario ? `${a.Usuario.nombre} ${a.Usuario.apellidos}`.trim() : '',
                        a.Participante ? `${a.Participante.nombre} ${a.Participante.apellidos}`.trim() : '',
                      ];
                    });
                  })}
                />
              </section>

              {/* Atletas */}
              <section>
                <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] mb-3">
                  Atletas ({participantes.length})
                </h2>
                <Tabla
                  columnas={['Atleta', 'Cédula', 'Box', 'Categoría']}
                  filas={[...participantes]
                    .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`))
                    .map((p) => [
                      `${p.nombre} ${p.apellidos}`.trim(),
                      p.cedula,
                      p.box ?? '',
                      p.categoria ?? '',
                    ])}
                />
              </section>

            </div>

            <footer className="px-6 sm:px-8 py-4 border-t border-slate-200 text-xs text-slate-500">
              Informe generado por la plataforma del evento.
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}

function rangoCorto(inicio: string, fin: string): string {
  try {
    const f = (iso: string) => new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString();
    return inicio === fin ? f(inicio) : `${f(inicio)} - ${f(fin)}`;
  } catch {
    return '';
  }
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: unknown[][] }) {
  if (filas.length === 0) return <p className="text-xs text-slate-500">Sin registros.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 text-left">
            {columnas.map((c) => (
              <th key={c} className="px-2.5 py-2 font-bold text-slate-700 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td key={j} className="px-2.5 py-1.5 text-slate-800 whitespace-nowrap">
                  {String(celda ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
