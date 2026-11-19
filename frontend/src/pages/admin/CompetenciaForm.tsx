import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Dumbbell, ListPlus, Trash2 } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  IconButton,
  Select,
  Spinner,
} from '../../components/ui';
import ImagenWod from '../../components/admin/ImagenWod';
import MovimientoRow from '../../components/admin/MovimientoRow';
import PortadaCompetencia from '../../components/admin/PortadaCompetencia';
import type {
  Categoria,
  Competencia,
  CompetenciaTieBreakPolicy,
  TipoMedicion,
  TipoParticipacion,
  UnidadDistancia,
} from '../../types';
import { DIVISION_GENERAL } from '../../types';
import { dedupCategorias } from '../../utils/formato';
import {
  esquemaDesdeUI,
  movimientoVacio,
  seleccionarAlEnfocar,
  uid,
  wodVacio,
  type MovimientoUI,
  type WodUI,
} from '../../utils/competenciaFormMapper';

/* ------------------------------------------------------------------ */
/* Jerarquía visual de 3 niveles                                       */
/* Nivel 1 (marrón): competencia + lista de WODs + botón + AÑADIR      */
/* Nivel 2 (rojo): cabecera de cada WOD (nombre/formato, medición,     */
/*   puntaje)                                                          */
/* Nivel 3 (verde + amarillo): movimientos × categorías y botón        */
/*   + Añadir movimiento                                               */
/* ------------------------------------------------------------------ */

/** Formatos sugeridos para el nombre del WOD. */
const FORMATOS = ['AMRAP', 'EMOM', 'For Time', 'Chipper'] as const;

/** Descripción corta de cada formato, como ayuda bajo el campo. */
const DESCRIPCION_FORMATO: Record<string, string> = {
  amrap: 'Tantas rondas y repeticiones como sea posible en el tiempo fijado.',
  emom: 'Cada minuto en el minuto: completa la tarea antes de que acabe el minuto.',
  'for time': 'Completa todo el trabajo lo más rápido posible.',
  chipper: 'Completa cada ejercicio una sola vez, por orden, lo más rápido posible.',
};

function etiquetaCategoria(categoria: Pick<Categoria, 'nombre' | 'genero'>): string {
  return `${categoria.nombre} ${categoria.genero}`.trim();
}

/** Crea o edita una competencia con sus WODs en una sola pantalla. */
export default function CompetenciaForm() {
  const { competenciaId } = useParams();
  const navigate = useNavigate();
  const esEdicion = Boolean(competenciaId);

  const [cargando, setCargando] = useState(esEdicion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  /** Errores por campo al guardar (clave → mensaje). Resaltan el cuadro exacto. */
  const [errores, setErrores] = useState<Record<string, string>>({});

  // ---- Nivel 1: datos de la competencia ----
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [estado, setEstado] = useState<Competencia['estado']>('activo');
  const [tipoFlujo, setTipoFlujo] = useState<Competencia['tipo_flujo']>('en_serie');
  const [tipoPublicacion, setTipoPublicacion] =
    useState<Competencia['tipo_publicacion']>('tiempo_real');
  const [tipoParticipacion, setTipoParticipacion] = useState<TipoParticipacion>('Individual');
  const [duracionMinutos, setDuracionMinutos] = useState(0);
  const [rondas, setRondas] = useState(1);
  const [tiebreakPolicy, setTiebreakPolicy] = useState<CompetenciaTieBreakPolicy>(
    'DESIGNATED_CIRCUIT_SPLIT',
  );
  const [wodDesempateId, setWodDesempateId] = useState<number | null>(null);
  const [divisionesRaw, setDivisionesRaw] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaIds, setCategoriaIds] = useState<number[]>([]);
  const [imagenesWod, setImagenesWod] = useState<Record<string, string | null>>({});
  const [wods, setWods] = useState<WodUI[]>([wodVacio()]);

  const divisiones =
    categoriaIds.length > 0
      ? [...new Set(categorias.filter((c) => categoriaIds.includes(c.id)).map(etiquetaCategoria))]
      : [
          ...new Set(
            divisionesRaw
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean),
          ),
        ];
  const columnas = divisiones.length > 0 ? divisiones : [DIVISION_GENERAL];

  useEffect(() => {
    api
      .get<Categoria[]>('/categories')
      .then((res) => setCategorias(dedupCategorias(Array.isArray(res.data) ? res.data : [])))
      .catch(() => setCategorias([]));
  }, []);

  function alternarCategoria(id: number) {
    setCategoriaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ---- Carga en edición: del canónico de vuelta a la UI ----
  useEffect(() => {
    if (!esEdicion) return;
    api
      .get<Competencia>(`/competencias/${competenciaId}`)
      .then((res) => {
        const c = res.data;
        setNombre(c.nombre);
        setDescripcion(c.descripcion ?? '');
        setEstado(c.estado ?? 'activo');
        setTipoFlujo(c.tipo_flujo);
        setTipoPublicacion(c.tipo_publicacion);
        setTipoParticipacion(c.tipo_participacion ?? 'Individual');
        setDuracionMinutos(c.duracion_minutos ?? 0);
        setRondas(Number(c.rondas) >= 1 ? Math.min(100, Math.round(Number(c.rondas))) : 1);
        setTiebreakPolicy(c.tiebreak_policy ?? 'DESIGNATED_CIRCUIT_SPLIT');
        setWodDesempateId(c.wod_desempate_id ?? null);
        setDivisionesRaw(
          ((c.divisiones ?? []) as unknown[])
            .map(
              (d) => String((d as Record<string, string>)?.nombre ?? d ?? '').trim() || String(d),
            )
            .filter(Boolean)
            .join(', '),
        );
        setCategoriaIds([...new Set((c.categorias ?? []).map((cat) => cat.id))]);
        const imgs: Record<string, string | null> = {};
        const etiquetasCargadas = (c.categorias ?? []).map((cat) =>
          `${cat.nombre} ${cat.genero}`.trim(),
        );
        const divsCargadas: string[] = ((c.divisiones ?? []) as unknown[])
          .map((d) => {
            if (typeof d === 'string') return d.trim();
            if (d && typeof d === 'object') {
              const o = d as Record<string, unknown>;
              return `${typeof o.nombre === 'string' ? o.nombre.trim() : ''} ${typeof o.genero === 'string' ? o.genero.trim() : ''}`.trim();
            }
            return '';
          })
          .filter(Boolean);
        const colsBase = (etiquetasCargadas.length > 0 ? etiquetasCargadas : divsCargadas).filter(
          Boolean,
        );
        const colsFallback = colsBase.length > 0 ? colsBase : [DIVISION_GENERAL];
        // Divisiones vigentes de la competencia (categorías mandan; si no hay,
        // el texto libre legacy; si tampoco, General). Las bandas de cada WOD
        // se construyen sobre ESTAS: las claves obsoletas del esquema
        // (categoría eliminada/renombrada) se reconcilian aquí en vez de
        // quedar como estado invisible que luego revienta el guardado con 400.
        const divsVigentes = colsBase;
        const metaADistancias = (meta: unknown): Record<string, number> => {
          const aCanon = (clave: string): string | null => {
            const k = clave.trim().toLowerCase();
            const hit = colsFallback.find((d) => d.trim().toLowerCase() === k);
            if (hit) return hit;
            // Sin divisiones vigentes todo colapsa a General (igual que el backend).
            if (colsFallback.length === 1 && colsFallback[0] === DIVISION_GENERAL)
              return DIVISION_GENERAL;
            return null;
          };
          if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
            const rec: Record<string, number> = {};
            for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
              const n = Number(v) || 0;
              if (n <= 0) continue;
              const c = aCanon(k);
              if (c === null) continue;
              rec[c] = Math.max(rec[c] ?? 0, n);
            }
            return rec;
          }
          const n = Number(meta) || 0;
          return n > 0 ? Object.fromEntries(colsFallback.map((d) => [d, n])) : {};
        };
        const cargados: WodUI[] = (c.wods ?? [])
          .sort((a, b) => a.orden - b.orden)
          .map((w) => {
            const modalidad = w.esquema?.modalidad;
            const medicion: TipoMedicion =
              modalidad === 'time_trial_splits'
                ? 'time_trial_splits'
                : modalidad === 'max_load'
                  ? 'peso'
                  : modalidad === 'amrap'
                    ? w.tipo_medicion === 'calorías'
                      ? 'calorías'
                      : 'repeticiones'
                    : modalidad === 'for_time'
                      ? 'tiempo'
                      : (
                            [
                              'tiempo',
                              'repeticiones',
                              'peso',
                              'distancia',
                              'calorías',
                            ] as TipoMedicion[]
                          ).includes(w.tipo_medicion as TipoMedicion)
                        ? (w.tipo_medicion as TipoMedicion)
                        : 'tiempo';
            const movsBase =
              w.esquema && 'movimientos' in w.esquema && (w.esquema.movimientos ?? []).length > 0
                ? (w.esquema.movimientos ?? [])
                : [];
            const porDivision: Record<string, (typeof movsBase)[number][]> =
              w.esquema && 'movimientos_por_division' in (w.esquema ?? {})
                ? ((
                    w.esquema as {
                      movimientos_por_division?: Record<string, (typeof movsBase)[number][]>;
                    }
                  ).movimientos_por_division ?? {})
                : {};
            const divsEsquema =
              Object.keys(porDivision).length > 0
                ? Object.keys(porDivision)
                : ((w.esquema && 'movimientos' in w.esquema && w.esquema.movimientos?.length
                    ? [...new Set(w.esquema.movimientos.flatMap((m) => Object.keys(m.reps ?? {})))]
                    : []) as string[]);
            // Las divisiones vigentes mandan: si la competencia tiene
            // categorías, las claves obsoletas del esquema se descartan (el
            // backend las poda igual al guardar). Solo sin categorías se
            // respetan las claves guardadas para no perder el trabajo.
            const cols =
              divsVigentes.length > 0
                ? divsVigentes
                : divsEsquema.length > 0
                  ? divsEsquema
                  : [DIVISION_GENERAL];
            const porDivisionNorm = new Map(
              Object.entries(porDivision).map(([k, v]) => [k.trim().toLowerCase(), v] as const),
            );
            const clave = `wod-${w.id}`;
            imgs[clave] = w.imagen_url ?? null;
            const aUI = (m: (typeof movsBase)[number], division: string): MovimientoUI => {
              // Búsqueda insensible a caja: el esquema legacy puede traer la
              // división con otra capitalización ("rx masculino" vs "Rx Masculino").
              const buscarEn = (mapa: Record<string, number> | undefined): number => {
                if (!mapa) return 0;
                const k = Object.keys(mapa).find(
                  (x) => x.trim().toLowerCase() === division.trim().toLowerCase(),
                );
                return Math.max(0, Number(k !== undefined ? mapa[k] : 0) || 0);
              };
              return {
                clave: uid('mov'),
                nombre: m.nombre,
                tipo_medicion: (m.tipo_medicion as TipoMedicion) || medicion,
                puntaje: m.puntaje ?? 0,
                duracionSeg: m.duracion_seg ?? 0,
                repeticiones:
                  m.repeticiones ??
                  Math.max(0, Math.round(buscarEn(m.reps as Record<string, number> | undefined))),
                intentos: m.intentos ?? 3,
                unidad_distancia: (m.unidad_distancia as UnidadDistancia) || 'm',
                distancia: m.distancia ?? 0,
                unidad_energia: (m.unidad_energia as 'kcal' | 'cal') || 'kcal',
                calorias: m.calorias ?? 0,
                peso: buscarEn(m.peso as Record<string, number> | undefined),
                unidad_peso: m.unidad_peso ?? 'kg',
              };
            };
            // Listas independientes por categoría: si el esquema ya trae
            // movimientos_por_division se usan tal cual; si es legacy
            // (lista compartida), se expande una copia por división para que
            // cada categoría parta de los mismos valores pero edite los suyos.
            const movimientosPorCategoria: Record<string, MovimientoUI[]> = {};
            if (Object.keys(porDivision).length > 0) {
              for (const d of cols) {
                const lista = porDivisionNorm.get(d.trim().toLowerCase()) ?? [];
                movimientosPorCategoria[d] =
                  lista.length > 0 ? lista.map((m) => aUI(m, d)) : [movimientoVacio()];
              }
            } else if (movsBase.length > 0) {
              for (const d of cols) movimientosPorCategoria[d] = movsBase.map((m) => aUI(m, d));
            } else {
              for (const d of cols) movimientosPorCategoria[d] = [movimientoVacio()];
            }
            return {
              clave,
              id: w.id,
              nombre: w.nombre_ejercicio,
              medicion,
              puntaje_maximo: w.puntaje_maximo,
              unidad_distancia: (w.unidad_distancia === 'km' || w.unidad_distancia === 'mi'
                ? w.unidad_distancia
                : 'm') as UnidadDistancia,
              duracionMin: Math.max(0, Number((w.tiempo_estimado_duracion / 60).toFixed(2)) || 0),
              capMin: Math.max(0, Number(((w.tiempo_cap ?? 0) / 60).toFixed(2)) || 0),
              distancias: metaADistancias(w.esquema?.distancia_meta),
              intentos:
                w.esquema && 'intentos' in w.esquema && Number(w.esquema.intentos) >= 1
                  ? Number(w.esquema.intentos)
                  : 3,
              conPeso: [...movsBase, ...Object.values(porDivision).flat()].some((m) =>
                Object.values(m.peso ?? {}).some((v) => Number(v) > 0),
              ),
              movimientosPorCategoria,
            } satisfies WodUI;
          });
        setImagenesWod(imgs);
        setWods(cargados.length > 0 ? cargados : [wodVacio()]);
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la competencia')))
      .finally(() => setCargando(false));
  }, [competenciaId, esEdicion]);

  function actualizarWod(clave: string, cambios: Partial<WodUI>) {
    setWods((prev) => prev.map((w) => (w.clave === clave ? { ...w, ...cambios } : w)));
  }

  function actualizarMovimiento(
    claveWod: string,
    division: string,
    claveMov: string,
    cambios: Partial<MovimientoUI>,
  ) {
    setWods((prev) =>
      prev.map((w) =>
        w.clave === claveWod
          ? {
              ...w,
              movimientosPorCategoria: {
                ...w.movimientosPorCategoria,
                [division]: (w.movimientosPorCategoria[division] ?? []).map((m) =>
                  m.clave === claveMov ? { ...m, ...cambios } : m,
                ),
              },
            }
          : w,
      ),
    );
  }

  function anadirMovimiento(claveWod: string, division: string) {
    setWods((prev) =>
      prev.map((w) =>
        w.clave === claveWod
          ? {
              ...w,
              movimientosPorCategoria: {
                ...w.movimientosPorCategoria,
                [division]: [...(w.movimientosPorCategoria[division] ?? []), movimientoVacio()],
              },
            }
          : w,
      ),
    );
  }

  function quitarMovimiento(claveWod: string, division: string, claveMov: string) {
    setWods((prev) =>
      prev.map((w) => {
        if (w.clave !== claveWod) return w;
        const lista = (w.movimientosPorCategoria[division] ?? []).filter(
          (x) => x.clave !== claveMov,
        );
        return {
          ...w,
          movimientosPorCategoria: {
            ...w.movimientosPorCategoria,
            [division]: lista.length > 0 ? lista : [movimientoVacio()],
          },
        };
      }),
    );
  }

  /** Limpia todos los movimientos de una categoría dentro del WOD (la caneca
   *  junto al nombre de la categoría). Deja una fila vacía para volver a
   *  cargar; si la categoría ya no compite, quítala de las casillas de arriba. */
  function limpiarBanda(claveWod: string, division: string) {
    setWods((prev) =>
      prev.map((w) =>
        w.clave === claveWod
          ? {
              ...w,
              movimientosPorCategoria: {
                ...w.movimientosPorCategoria,
                [division]: [movimientoVacio()],
              },
            }
          : w,
      ),
    );
    setBandaALimpiar(null);
  }

  const [wodDragIndex, setWodDragIndex] = useState<number | null>(null);
  const [movDrag, setMovDrag] = useState<{
    wodClave: string;
    division: string;
    index: number;
  } | null>(null);
  /** Banda pendiente de limpiar (caneca junto al nombre de la categoría). */
  const [bandaALimpiar, setBandaALimpiar] = useState<{ wodClave: string; division: string } | null>(
    null,
  );

  function onWodDragStart(e: React.DragEvent, index: number) {
    setWodDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onWodDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onWodDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (wodDragIndex === null || wodDragIndex === targetIndex) return;
    setWods((prev) => {
      const copia = [...prev];
      const [movido] = copia.splice(wodDragIndex, 1);
      copia.splice(targetIndex, 0, movido);
      return copia;
    });
    setWodDragIndex(null);
  }

  function onMovDragStart(e: React.DragEvent, wodClave: string, division: string, index: number) {
    setMovDrag({ wodClave, division, index });
    e.dataTransfer.effectAllowed = 'move';
  }

  function onMovDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onMovDrop(e: React.DragEvent, wodClave: string, division: string, targetIndex: number) {
    e.preventDefault();
    if (
      !movDrag ||
      movDrag.wodClave !== wodClave ||
      movDrag.division !== division ||
      movDrag.index === targetIndex
    )
      return;
    setWods((prev) =>
      prev.map((w) => {
        if (w.clave !== wodClave) return w;
        const copia = [...(w.movimientosPorCategoria[division] ?? [])];
        const [movido] = copia.splice(movDrag.index, 1);
        copia.splice(targetIndex, 0, movido);
        return {
          ...w,
          movimientosPorCategoria: { ...w.movimientosPorCategoria, [division]: copia },
        };
      }),
    );
    setMovDrag(null);
  }

  function onMovDragEnd() {
    setMovDrag(null);
  }

  function onWodDragEnd() {
    setWodDragIndex(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Valida obligatorios y resalta cada cuadro pendiente.
    const fallos: Record<string, string> = {};
    const anclas: Record<string, string> = {};
    if (!nombre.trim()) {
      fallos['nombre'] = 'La competencia necesita un nombre';
      anclas['nombre'] = 'nombre';
    }
    wods.forEach((w, i) => {
      const etiqueta = `Ejercicio ${i + 1}`;
      if (!w.nombre.trim()) {
        fallos[`wod-${w.clave}-nombre`] = `${etiqueta}: ponle nombre o formato`;
        anclas[`wod-${w.clave}-nombre`] = `nombre-${w.clave}`;
      }
      if (!(Number(w.puntaje_maximo) >= 1)) {
        fallos[`wod-${w.clave}-puntaje`] = `${etiqueta}: puntaje mínimo 1`;
        anclas[`wod-${w.clave}-puntaje`] = `wod-${w.clave}-puntaje`;
      }
      // Cada categoría trae su propia lista de movimientos (libres entre sí):
      // TODAS las filas deben tener nombre (no se descarta ninguna en silencio),
      // sin duplicados por categoría, y la suma de puntajes de cada categoría
      // debe igualar el puntaje máximo único del WOD.
      const listas = columnas.map((d) => ({
        division: d,
        filas: (w.movimientosPorCategoria[d] ?? []) as MovimientoUI[],
      }));
      const conNombre = listas.map(({ division, filas }) => ({
        division,
        movs: filas.filter((m) => m.nombre.trim()),
      }));
      if (conNombre.every(({ movs }) => movs.length === 0)) {
        fallos[`wod-${w.clave}-mov-vacio`] =
          `${etiqueta}: agrega al menos un movimiento con nombre en una categoría`;
        anclas[`wod-${w.clave}-mov-vacio`] = `nombre-${w.clave}`;
      }
      for (const { division, filas } of listas) {
        // Sin movimientos con nombre la categoría no viajaría en el esquema y
        // el juez caería al formato anterior: se exige contenido por categoría.
        const movs = filas.filter((m) => m.nombre.trim());
        if (movs.length === 0) {
          fallos[`wod-${w.clave}-mov-vacio-${division}`] =
            `${etiqueta} [${division}]: agrega al menos un movimiento con nombre o quita la categoría`;
          if (!anclas[`wod-${w.clave}-mov-vacio`])
            anclas[`wod-${w.clave}-mov-vacio`] = `nombre-${w.clave}`;
          continue;
        }
        // Cada fila de la categoría debe tener nombre: ni vacías ni a medias.
        filas.forEach((m, j) => {
          if (!m.nombre.trim()) {
            fallos[`wod-${w.clave}-mov-${m.clave}`] =
              `${etiqueta} [${division}], movimiento ${j + 1}: ponle nombre o quítalo`;
            if (!anclas[`wod-${w.clave}-mov-${m.clave}`])
              anclas[`wod-${w.clave}-mov-${m.clave}`] = `mov-${m.clave}`;
          }
        });
        const vistos = new Set<string>();
        movs.forEach((m, j) => {
          const bajo = m.nombre.trim().toLowerCase();
          if (vistos.has(bajo)) {
            fallos[`wod-${w.clave}-mov-${m.clave}`] =
              `${etiqueta} [${division}]: el movimiento "${m.nombre.trim()}" está repetido`;
            anclas[`wod-${w.clave}-mov-${m.clave}`] = `mov-${m.clave}`;
          }
          vistos.add(bajo);
          void j;
        });
        // Puntaje máximo único global: cada categoría con contenido debe
        // repartir sus puntajes para sumar el máximo del WOD.
        const sumaPuntajes = movs.reduce((sum, m) => sum + (Number(m.puntaje) || 0), 0);
        if (sumaPuntajes !== Number(w.puntaje_maximo)) {
          fallos[`wod-${w.clave}-puntaje-${division}`] =
            `${etiqueta} [${division}]: suma de puntajes (${sumaPuntajes}) ≠ puntaje máximo (${w.puntaje_maximo})`;
          if (!anclas[`wod-${w.clave}-puntaje`])
            anclas[`wod-${w.clave}-puntaje`] = `wod-${w.clave}-puntaje`;
        }
      }
    });
    if (wods.filter((w) => w.nombre.trim()).length === 0) {
      fallos['wods'] = 'Agrega al menos un WOD con nombre';
    }
    setErrores(fallos);
    const claves = Object.keys(fallos);
    if (claves.length > 0) {
      setError('Revisa los campos resaltados: falta información obligatoria');
      const primero = anclas[claves[0]] ?? 'nombre';
      requestAnimationFrame(() => {
        document.getElementById(primero)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    const validos = wods.filter((w) => w.nombre.trim());

    // El orden sale de la posición en la lista: nunca hay dos con igual número.
    const cuerpo = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      tipo_flujo: tipoFlujo,
      tipo_publicacion: tipoPublicacion,
      tipo_participacion: tipoParticipacion,
      duracion_minutos: Number(duracionMinutos) > 0 ? Math.round(Number(duracionMinutos)) : null,
      rondas: Math.min(100, Math.max(1, Math.round(Number(rondas) || 1))),
      estado,
      divisiones,
      tiebreak_policy: tiebreakPolicy,
      // El designado solo vale con WODs ya guardados (tienen id) y con la
      // política "WOD designado"; en otro caso se manda null para limpiar.
      wod_desempate_id: tiebreakPolicy === 'DESIGNATED_CIRCUIT_SPLIT' ? wodDesempateId : null,
      categoria_ids: categoriaIds,
      wods: validos.map((w, i) => ({
        ...(w.id ? { id: w.id } : {}),
        orden: i + 1,
        nombre_ejercicio: w.nombre.trim(),
        tipo_medicion: w.medicion,
        unidad_distancia: w.unidad_distancia,
        imagen_url: imagenesWod[w.clave] ?? null,
        tiempo_estimado_duracion: Math.max(0, Math.round(Number(w.duracionMin) * 60) || 0),
        tiempo_cap:
          w.medicion === 'tiempo' || w.medicion === 'time_trial_splits'
            ? Math.max(0, Math.round(Number(w.capMin) * 60) || 0)
            : 0,
        esquema: esquemaDesdeUI(w, divisiones),
        puntaje_maximo: Math.max(1, Math.round(Number(w.puntaje_maximo)) || 100),
      })),
    };

    setGuardando(true);
    try {
      if (esEdicion) await api.put(`/competencias/${competenciaId}`, cuerpo);
      else await api.post('/competencias', cuerpo);
      navigate('/admin/competencias');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la competencia'));
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <AppShell title="Cargando competencia">
        <Spinner label="Cargando la competencia..." />
      </AppShell>
    );
  }

  const wodsGuardados = wods.filter((w) => w.id);

  return (
    <AppShell
      title={esEdicion ? 'Editar competencia' : 'Nueva competencia'}
      subtitle={esEdicion ? nombre : 'Define los WODs y cómo se puntúan'}
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate('/admin/competencias')}
        >
          <span className="hidden sm:inline">Competencias</span>
        </Button>
      }
    >
      <form onSubmit={(e) => void guardar(e)} className="max-w-4xl space-y-4">
        {error && (
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* ================= Nivel 1: competencia ================= */}
        <section className="surface p-4 sm:p-5">
          <h2 className="eyebrow">Datos de la competencia</h2>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <Field
              label="Nombre"
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              maxLength={150}
              placeholder="Competencia 1"
              error={errores['nombre']}
            />
            <Select
              label="Estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as Competencia['estado'])}
            >
              <option value="borrador">Borrador (oculto al público)</option>
              <option value="activo">Activo</option>
              <option value="finalizado">Finalizado</option>
            </Select>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="campo-descripcion">
              Descripción
            </label>
            <textarea
              id="campo-descripcion"
              className="input-field"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={2000}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select
              label="Participación"
              value={tipoParticipacion}
              onChange={(e) => setTipoParticipacion(e.target.value as TipoParticipacion)}
            >
              {(
                ['Individual', 'Relevos', 'Duplas', 'Equipos', 'Escalado'] as TipoParticipacion[]
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              label="Flujo"
              value={tipoFlujo}
              onChange={(e) => setTipoFlujo(e.target.value as Competencia['tipo_flujo'])}
            >
              <option value="en_serie">En serie</option>
              <option value="estaciones_simultaneas">Estaciones simultáneas</option>
            </Select>
            <Select
              label="Publicación"
              value={tipoPublicacion}
              onChange={(e) =>
                setTipoPublicacion(e.target.value as Competencia['tipo_publicacion'])
              }
            >
              <option value="tiempo_real">Tiempo real</option>
              <option value="al_finalizar_circuito">Al finalizar</option>
            </Select>
            <Select
              label="Desempate"
              value={tiebreakPolicy}
              onChange={(e) => {
                const politica = e.target.value as CompetenciaTieBreakPolicy;
                setTiebreakPolicy(politica);
                // Sin WOD designado no hay nada que designar: se limpia.
                if (politica !== 'DESIGNATED_CIRCUIT_SPLIT') setWodDesempateId(null);
              }}
            >
              <option value="DESIGNATED_CIRCUIT_SPLIT">WOD designado</option>
              <option value="TIEBREAK_MARK">Marca de desempate</option>
              <option value="NONE">Sin desempate</option>
            </Select>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field
              label="Duración (min)"
              type="number"
              min={0}
              max={1440}
              value={duracionMinutos}
              onFocus={seleccionarAlEnfocar}
              onChange={(e) => setDuracionMinutos(Number(e.target.value))}
              hint="0 = sin tope"
            />
            <Field
              label="Rondas"
              type="number"
              min={1}
              max={100}
              value={rondas}
              onFocus={seleccionarAlEnfocar}
              onChange={(e) => setRondas(Number(e.target.value))}
              hint="Multiplica las reps"
            />
            {/* Solo con política "WOD designado": en el resto no hay nada que elegir. */}
            {esEdicion && tiebreakPolicy === 'DESIGNATED_CIRCUIT_SPLIT' && (
              <Select
                label="WOD desempate"
                value={wodDesempateId ?? ''}
                onChange={(e) => setWodDesempateId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Ninguno</option>
                {wodsGuardados.map((w) => (
                  <option key={w.clave} value={w.id}>
                    WOD {wods.indexOf(w) + 1} · {w.nombre || '(sin nombre)'}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="mt-3">
            <span className="label">Categorías de la competencia</span>
            {categorias.length === 0 ? (
              <div className="mt-1">
                <Field
                  label="Divisiones (texto libre)"
                  value={divisionesRaw}
                  onChange={(e) => setDivisionesRaw(e.target.value)}
                  hint="Separadas por comas. Sin categorías se usa GENERAL."
                />
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <label
                    key={c.id}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-hyrox-paper has-checked:border-hyrox-primary/60 has-checked:bg-hyrox-primary/10"
                  >
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                      checked={categoriaIds.includes(c.id)}
                      onChange={() => alternarCategoria(c.id)}
                    />
                    {etiquetaCategoria(c)}
                  </label>
                ))}
              </div>
            )}
          </div>
          {/* Portada de la competencia (requiere que exista: solo en edición). */}
          {esEdicion && competenciaId ? (
            <PortadaCompetencia competenciaId={Number(competenciaId)} />
          ) : (
            <p className="field-hint mt-3">
              La portada se sube después de crear la competencia, desde Editar.
            </p>
          )}
          {/* Formato y puntaje por WOD dentro de Datos de la competencia */}
          <div className="mt-4 space-y-3">
            {wods.map((w) => (
              <div
                key={w.clave}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
              >
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Select
                      label="Formato"
                      id={`nombre-${w.clave}`}
                      value={w.nombre}
                      onChange={(e) => actualizarWod(w.clave, { nombre: e.target.value })}
                      error={errores[`wod-${w.clave}-nombre`]}
                    >
                      {FORMATOS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                    {DESCRIPCION_FORMATO[w.nombre.trim().toLowerCase()] && (
                      <p className="field-hint mt-1">
                        {DESCRIPCION_FORMATO[w.nombre.trim().toLowerCase()]}
                      </p>
                    )}
                    {errores[`wod-${w.clave}-nombre`] && (
                      <p className="field-error mt-1" role="alert">
                        {errores[`wod-${w.clave}-nombre`]}
                      </p>
                    )}
                  </div>
                  <Field
                    label="Puntaje máximo"
                    id={`wod-${w.clave}-puntaje`}
                    type="number"
                    min={1}
                    max={10000}
                    value={w.puntaje_maximo}
                    onFocus={seleccionarAlEnfocar}
                    onChange={(e) =>
                      actualizarWod(w.clave, { puntaje_maximo: Number(e.target.value) })
                    }
                    hint="Puntos del 1er puesto"
                    error={errores[`wod-${w.clave}-puntaje`]}
                  />
                </div>

                {/* Foto del WOD: se ve en el panel del juez y en el leaderboard. */}
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <ImagenWod
                    value={imagenesWod[w.clave] ?? null}
                    onChange={(url) => setImagenesWod((prev) => ({ ...prev, [w.clave]: url }))}
                    etiqueta={w.nombre.trim() || `WOD ${wods.indexOf(w) + 1}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ================= Nivel 1: lista de Ejercicios ================= */}
        <section className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"></div>

          <div className="mt-4 space-y-4">
            {wods.map((w, i) => (
              <article
                key={w.clave}
                draggable
                onDragStart={(e) => onWodDragStart(e, i)}
                onDragOver={onWodDragOver}
                onDrop={(e) => onWodDrop(e, i)}
                onDragEnd={onWodDragEnd}
                className={`rounded-2xl border bg-white/[0.02] p-3 sm:p-4 transition-opacity ${
                  wodDragIndex === i ? 'opacity-50 border-hyrox-primary/50' : 'border-white/[0.08]'
                }`}
              >
                {/* ================= Nivel 2: cabecera del WOD ================= */}
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
                  <div className="grid sm:grid-cols-3 gap-3 mb-4">
                    {w.medicion === 'distancia' && (
                      <Select
                        label="Unidad"
                        value={w.unidad_distancia}
                        onChange={(e) =>
                          actualizarWod(w.clave, {
                            unidad_distancia: e.target.value as UnidadDistancia,
                          })
                        }
                      >
                        <option value="m">Metros (m)</option>
                        <option value="km">Kilómetros (km)</option>
                        <option value="mi">Millas (mi)</option>
                      </Select>
                    )}
                    {w.medicion === 'peso' && (
                      <Field
                        label="Intentos"
                        type="number"
                        min={1}
                        max={20}
                        value={w.intentos}
                        onFocus={seleccionarAlEnfocar}
                        onChange={(e) =>
                          actualizarWod(w.clave, { intentos: Number(e.target.value) })
                        }
                        hint="Carga máxima"
                      />
                    )}
                    {(w.medicion === 'tiempo' || w.medicion === 'time_trial_splits') && (
                      <Field
                        label="Tope (min)"
                        type="number"
                        min={0}
                        step="0.5"
                        value={w.capMin}
                        onFocus={seleccionarAlEnfocar}
                        onChange={(e) => actualizarWod(w.clave, { capMin: Number(e.target.value) })}
                        hint="0 = sin tope"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-hyrox-paper">
                        <Dumbbell className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                        {w.medicion === 'calorías'
                          ? 'Calorías por categoría'
                          : w.medicion === 'distancia'
                            ? 'Distancia por categoría'
                            : 'Repeticiones por categoría'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {w.medicion !== 'calorías' && (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-hyrox-mist">
                          <input
                            type="checkbox"
                            className="accent-emerald-500"
                            checked={w.conPeso}
                            onChange={(e) => actualizarWod(w.clave, { conPeso: e.target.checked })}
                          />
                          Con peso (opcional)
                        </label>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <span
                      className="rounded-lg bg-hyrox-primary/15 px-2.5 py-1 text-base font-extrabold text-hyrox-primary"
                      aria-label="Ejercicios"
                    >
                      Ejercicios
                    </span>
                  </div>
                  <p className="field-hint mt-2">
                    Cada categoría tiene su propia lista: distinto ejercicio, medición y cantidades.
                    Las listas son libres entre categorías, pero todas las filas de cada categoría
                    deben tener nombre.
                  </p>
                  {/* Una banda por categoría con su propia lista independiente. */}
                  {columnas.map((d) => {
                    const lista = w.movimientosPorCategoria[d] ?? [];
                    return (
                      <div key={d} className="mt-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <p className="inline-block rounded-lg bg-emerald-500/15 px-2.5 py-1 text-base font-extrabold text-emerald-400 uppercase">
                              {d}
                            </p>
                            <IconButton
                              icon={Trash2}
                              label={`Limpiar movimientos de ${d}`}
                              title={`Limpiar movimientos de ${d}`}
                              size="sm"
                              onClick={() => setBandaALimpiar({ wodClave: w.clave, division: d })}
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              type="button"
                              size="sm"
                              icon={ListPlus}
                              onClick={() => anadirMovimiento(w.clave, d)}
                              className="bg-yellow-400 hover:bg-yellow-300 text-yellow-950 border-transparent"
                            >
                              Añadir movimiento
                            </Button>
                            <Button
                              type="submit"
                              size="sm"
                              loading={guardando}
                              disabled={!nombre.trim()}
                            >
                              Guardar cambios
                            </Button>
                          </div>
                        </div>
                        {errores[`wod-${w.clave}-puntaje-${d}`] && (
                          <p className="field-error mt-1" role="alert">
                            {errores[`wod-${w.clave}-puntaje-${d}`]}
                          </p>
                        )}
                        {errores[`wod-${w.clave}-mov-vacio-${d}`] && (
                          <p className="field-error mt-1" role="alert">
                            {errores[`wod-${w.clave}-mov-vacio-${d}`]}
                          </p>
                        )}
                        {lista.length === 0 && (
                          <p className="field-hint mt-1.5">
                            Sin movimientos en esta categoría. Usa «Añadir movimiento» para crear el
                            primero.
                          </p>
                        )}
                        {lista.map((m, mi) => (
                          <MovimientoRow
                            key={m.clave}
                            conPeso={w.conPeso}
                            movimiento={m}
                            indice={mi}
                            totalFilas={lista.length}
                            arrastrando={
                              movDrag?.wodClave === w.clave &&
                              movDrag?.division === d &&
                              movDrag?.index === mi
                            }
                            error={errores[`wod-${w.clave}-mov-${m.clave}`]}
                            onCambiar={(cambios) =>
                              actualizarMovimiento(w.clave, d, m.clave, cambios)
                            }
                            onQuitar={() => quitarMovimiento(w.clave, d, m.clave)}
                            onDragStart={(e, index) => onMovDragStart(e, w.clave, d, index)}
                            onDragOver={onMovDragOver}
                            onDrop={(e, index) => onMovDrop(e, w.clave, d, index)}
                            onDragEnd={onMovDragEnd}
                          />
                        ))}
                      </div>
                    );
                  })}
                  <p className="field-hint mt-2">
                    Peso 0 = sin carga / peso corporal. Total AMRAP = reps por ronda × rondas (
                    {rondas}) + reps parciales.
                  </p>
                  <div className="mt-3 flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => {
                        setWods((prev) =>
                          prev.length > 1 ? prev.filter((x) => x.clave !== w.clave) : prev,
                        );
                        setImagenesWod((prev) => {
                          if (!(w.clave in prev)) return prev;
                          const copia = { ...prev };
                          delete copia[w.clave];
                          return copia;
                        });
                      }}
                      disabled={wods.length <= 1}
                      className="text-red-400/80 hover:text-red-300"
                    >
                      Eliminar este WOD
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-end gap-2 pb-8">
          <Button type="button" variant="ghost" onClick={() => navigate('/admin/competencias')}>
            Cancelar
          </Button>
          <Button type="submit" loading={guardando} disabled={!nombre.trim()}>
            {esEdicion ? 'Guardar cambios' : 'Crear competencia'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={!!bandaALimpiar}
        title="Limpiar categoría"
        message={
          bandaALimpiar
            ? `¿Limpiar los movimientos de "${bandaALimpiar.division}" en este WOD? Quedará una fila vacía para volver a cargar. Si la categoría ya no compite, quítala de las casillas de arriba.`
            : ''
        }
        confirmLabel="Limpiar"
        onConfirm={() =>
          bandaALimpiar && limpiarBanda(bandaALimpiar.wodClave, bandaALimpiar.division)
        }
        onCancel={() => setBandaALimpiar(null)}
        tone="danger"
      />
    </AppShell>
  );
}
