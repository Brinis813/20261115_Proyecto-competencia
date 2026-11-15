import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Flag,
  Search,
  Send,
  Timer,
  UserCheck,
  XCircle,
} from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useEstaEnLinea } from '../../components/layout/ConnectionBadge';
import AppShell from '../../components/layout/AppShell';
import { Alert, Button, ConfirmDialog, Field } from '../../components/ui';
import CuentaAtras from '../../components/judge/CuentaAtras';
import ChecklistPrevio, { PUNTOS_CHECKLIST } from '../../components/judge/ChecklistPrevio';
import CronometroView, { type CronometroHandle, type EstadoCrono } from '../../components/judge/CronometroView';
import ContadorReps from '../../components/judge/ContadorReps';
import ContadorSegmentos from '../../components/judge/ContadorSegmentos';
import ContadorEsquema, { type MovimientoObjetivo } from '../../components/judge/ContadorEsquema';
import ContadorSerie from '../../components/judge/ContadorSerie';
import CompetenciaStartBanner from '../../components/judge/CompetenciaStartBanner';
import { useCompetenciaStartStore } from '../../stores/competenciaStartStore';
import RegistroNoReps, { type NoRep } from '../../components/judge/RegistroNoReps';
import IntentosPeso, { BARRA_POR_DEFECTO, MAX_INTENTOS, type IntentoPeso } from '../../components/judge/IntentosPeso';
import TemporizadorIntervalos, { PRESETS } from '../../components/judge/TemporizadorIntervalos';
import type { ConfigIntervalos } from '../../hooks/useIntervalTimer';
import {
  DIVISION_GENERAL,
  ETIQUETA_MEDICION,
  UNIDAD_MEDICION,
  unidadDeWod,
  type Wod,
  type DetalleMedicion,
  type Participante,
  type SplitRegistro,
  type Competencia,
} from '../../types';
import {
  PENALIZACION_NO_REP_SEG,
  construirDetalle,
  construirMovObjetivo,
  construirValorBruto,
  formatearCrono,
  formatoTope,
  mejorPesoDeIntentos,
  resolverDivision,
  rondasEfectivasMedicion,
  tiempoAms,
} from '../../utils/juezMedicion';

type Paso = 'buscar' | 'medir';

/**
 * Paso 3 del flujo del juez: identificar al atleta y registrar su medicion.
 *
 * La captura depende del tipo de WOD:
 *  - Tiempo: checklist previo, salida con cuenta atras y cronometro. El
 *    resultado lo fija el reloj (mas las penalizaciones por no-rep); el juez no
 *    puede teclearlo, solo enviarlo, para que nadie altere el registro. Si hay
 *    tope y el atleta no termina, se anota por repeticiones (capado).
 *  - Repeticiones: contador por movimiento (superable) o contador simple,
 *    con temporizador de intervalos opcional (EMOM/Tabata).
 *  - Calorías con esquema: registro por movimiento; sin esquema, el juez
 *    teclea manual el total quemado que marca la máquina (kcal).
 *  - Peso: intentos configurados; vale el mejor levantamiento valido.
 *  - Distancia sin esquema: el juez introduce la marca medida
 *    (la meta de distancia, si existe, es solo referencia).
 *  - Splits: registro tiempo por segmento.
 *
 * Las no-reps, las vueltas y la marca de desempate son ayudas de pantalla: solo
 * la penalizacion viaja al servidor, ya sumada dentro del tiempo final. El
 * resto es apoyo para el juez y no se guarda (ver README de la vista).
 *
 * La competencia y el WOD viajan en la URL, asi que si el navegador se reinicia
 * en mitad del evento basta con recargar para volver al mismo punto.
 */
export default function JuezMedicionPage() {
  const { competenciaId, wodId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const enLinea = useEstaEnLinea();

  // El cronómetro vive en CronometroView (su tick ~10/s ya no re-renderiza
  // esta página): aquí solo llegan transiciones y se lee el valor por ref.
  const cronoRef = useRef<CronometroHandle>(null);
  const [cronoEstado, setCronoEstado] = useState<EstadoCrono>({ enMarcha: false, conMarca: false });
  const onEstadoCrono = useCallback((s: EstadoCrono) => setCronoEstado(s), []);
  const { isSupported: wakeLockDisponible, request: pedirWakeLock, release: soltarWakeLock } = useWakeLock();
  const { pendingCount, savePending, syncPending } = useOfflineSync();

  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  const [wod, setWod] = useState<Wod | null>(null);
  const [paso, setPaso] = useState<Paso>('buscar');

  const [cedula, setCedula] = useState('');
  const [participante, setParticipante] = useState<Participante | null>(null);
  const [valor, setValor] = useState('');
  // Modo "no termino antes del tope": se registra por repeticiones.
  const [modoCap, setModoCap] = useState(false);
  const [reps, setReps] = useState(0);
  const [splits, setSplits] = useState<SplitRegistro[]>([]);
  // Conteo por movimiento cuando el WOD tiene esquema guiado (scorecard).
  const [conteoEsquema, setConteoEsquema] = useState<number[]>([]);

  // --- Ayudas de juzgado ---
  const [checklist, setChecklist] = useState<boolean[]>(() => PUNTOS_CHECKLIST.map(() => false));
  const [cuentaAtras, setCuentaAtras] = useState(false);
  const [noReps, setNoReps] = useState<NoRep[]>([]);
  const [vueltas, setVueltas] = useState<string[]>([]);
  const [desempate, setDesempate] = useState<string | null>(null);
  const [intentos, setIntentos] = useState<IntentoPeso[]>([]);
  const [pesoIntento, setPesoIntento] = useState(60);
  // Equipo en uso para la prueba de peso: se conserva entre atletas porque la
  // barra y los discos no cambian en cada intento.
  const [barraIntento, setBarraIntento] = useState(BARRA_POR_DEFECTO);
  const [discosIntento, setDiscosIntento] = useState('');
  const [modoIntervalos, setModoIntervalos] = useState(false);
  const [configIntervalos, setConfigIntervalos] = useState<ConfigIntervalos>(PRESETS.emom.config);
  const siguienteNoRepId = useRef(1);

  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarAbandono, setConfirmarAbandono] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  // Reloj sincronizado del heat (si el admin lo armó): bloquea la medición
  // hasta el arranque y fuerza el capado al vencer el time cap.
  const snapArranque = useCompetenciaStartStore((s) => s.snapshot);
  const faseReloj = useCompetenciaStartStore((s) => s.fase);
  const inicioManual = useCompetenciaStartStore((s) => s.inicioManual);
  const medicionBloqueada =
    snapArranque !== null &&
    (faseReloj === 'cuenta_regresiva' ||
      faseReloj === 'pausado' ||
      faseReloj === 'finalizado' ||
      (faseReloj === 'armado' &&
        (snapArranque.tipoArranque !== 'manual_juez' || !inicioManual)));

  // Pausa global del admin por novedad: se congela todo el registro (cronómetro
  // local, conteos, pesos) sin perder lo ya anotado; al reanudar sigue desde ahí.
  const enPausa = faseReloj === 'pausado';
  // El heat vencido (capado) o cerrado (finalizado) también congela la
  // captura —lo ya anotado se conserva y se puede enviar—, pero no el envío:
  // el servidor decide (409 si ya no admite). Sin heat ('espera') no congela.
  const registroCongelado = enPausa || faseReloj === 'capado' || faseReloj === 'finalizado';

  const tipo = wod?.tipo_medicion;
  const esTiempo = tipo === 'tiempo';
  const esReps = tipo === 'repeticiones';
  const esPeso = tipo === 'peso';
  const esSplits = tipo === 'time_trial_splits';
  const cap = wod?.tiempo_cap ?? 0;

  // --- Medicion guiada (scorecard) ---
  const esquema = wod?.esquema ?? null;
  const division = resolverDivision(participante?.categoria, competencia?.divisiones);
  // Listas independientes por categoría: si el esquema trae
  // movimientos_por_division para la división del atleta, esa lista prevalece
  // (distinto ejercicio, medición y cantidades por categoría).
  const movsEsquema =
    esquema?.movimientos_por_division?.[division] ??
    esquema?.movimientos_por_division?.[DIVISION_GENERAL] ??
    esquema?.movimientos ??
    [];
  // Las calorías con objetivo configurado se registran por movimiento
  // (cada ejercicio de calorías se teclea manual); sin esquema el juez
  // teclea manual el total quemado que marca la máquina (kcal).
  const esCalorias = tipo === 'calorías';
  const esCaloriasConEsquema = esCalorias && movsEsquema.length > 0;
  const esCaloriasSinEsquema = esCalorias && movsEsquema.length === 0;
  const esConteo = esReps || esCaloriasConEsquema;
  // Distancia y calorías sin esquema comparten captura manual del total.
  const esManual = !esTiempo && !esConteo && !esPeso && !esSplits;
  // Las rondas viven en la competencia; el esquema trae copia sincronizada (o el valor
  // original en Competencias anteriores a la columna).
  const rondasEsquema = rondasEfectivasMedicion(
    Number(competencia?.rondas) >= 1 ? Number(competencia?.rondas) : undefined,
    esquema?.rondas
  );
  // For Time: el objetivo es el trabajo total (reps x rondas) y topa el conteo.
  // AMRAP: el objetivo es la referencia por ronda; el atleta puede superarla.
  // Memoizado: el tick del cronómetro (10/s) no debe recalcular el scorecard.
  const movObjetivo: MovimientoObjetivo[] = useMemo(
    () => construirMovObjetivo(movsEsquema, division, esTiempo, rondasEsquema),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esquema, division, esTiempo, rondasEsquema]
  );
  // Solo aplica a For Time (tiempo) y AMRAP (reps o calorías con meta),
  // que es donde hay movimientos.
  const usaEsquema = movObjetivo.length > 0 && (esTiempo || esConteo);
  // En serie el juez ve un ejercicio a la vez con rondas X/N; en estaciones
  // simultáneas conserva la cuadrícula completa.
  const secuencial = competencia?.tipo_flujo === 'en_serie' && usaEsquema;
  const claveSerie = `${participante?.id ?? 'sin'}-${division}-${rondasEsquema}-${movObjetivo.length}`;
  const totalEsquema = useMemo(() => conteoEsquema.reduce((a, b) => a + b, 0), [conteoEsquema]);
  const objetivoEsquema = useMemo(() => movObjetivo.reduce((a, m) => a + m.objetivo, 0), [movObjetivo]);

  const checklistCompleto = checklist.every(Boolean);
  const penalizacionSeg = noReps.length * PENALIZACION_NO_REP_SEG;
  const mejorPeso = mejorPesoDeIntentos(intentos);

  // Al usar esquema, el total contado es la unica fuente de las reps.
  function cambiarConteoEsquema(nuevos: number[]) {
    setConteoEsquema(nuevos);
    setReps(nuevos.reduce((a, b) => a + b, 0));
  }

  /* ------------------------- Carga del WOD ------------------------- */

  useEffect(() => {
    api
      .get<Competencia[]>('/competencias/judge')
      .then((res) => {
        const w = (Array.isArray(res.data) ? res.data : []).find((x) => x.id === Number(competenciaId));
        const c = w?.wods?.find((x) => x.id === Number(wodId));
        if (!w || !c) {
          setError('No estas asignado a este WOD o ya no existe.');
          return;
        }
        setCompetencia(w);
        setWod(c);
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar el WOD')));
  }, [competenciaId, wodId]);

  /* --------------------------- Bloqueo de pantalla --------------------------- */

  // Durante toda la medicion la pantalla no debe apagarse: en las pruebas de
  // repeticiones o de peso no hay cronometro corriendo, pero el juez sigue
  // pendiente del atleta y perder la pantalla le costaria la cuenta.
  useEffect(() => {
    if (paso === 'medir' && wakeLockDisponible) pedirWakeLock();
    else soltarWakeLock();
  }, [paso, wakeLockDisponible, pedirWakeLock, soltarWakeLock]);

  /* ----------------------- Tope de tiempo automatico ----------------------- */

  // El tope (del WOD o del heat) lo gestiona CronometroView: al alcanzarlo
  // detiene solo y avisa con onCap para pasar a registrar por repeticiones.
  const alAlcanzarTope = useCallback(() => {
    setModoCap(true);
  }, []);

  // Time cap del heat (arranque sincronizado): congela el cronómetro local y
  // pasa al flujo de capado (solo reps), igual que con el tope por WOD.
  useEffect(() => {
    if (faseReloj === 'capado' && esTiempo && !modoCap) {
      cronoRef.current?.detener();
      setModoCap(true);
    }
  }, [faseReloj, esTiempo, modoCap]);

  /* ------------------------ Bloqueo del participante ------------------------ */

  const liberarParticipante = useCallback(() => {
    if (!socket?.connected || !participante || !wod) return;
    socket.emit('unlock-participant', {
      participante_id: participante.id,
      wod_id: wod.id,
    });
  }, [socket, participante, wod]);

  // Si el juez cierra la pestana sin guardar, el atleta debe quedar libre
  // para que otro juez pueda medirlo.
  useEffect(() => liberarParticipante, [liberarParticipante]);

  // Al reconectar, el servidor ya liberó nuestros bloqueos (limpieza en
  // disconnect): hay que re-registrar el lock del atleta en pantalla, con
  // ACK para detectar si otro juez lo tomó en la ventana sin conexión.
  useEffect(() => {
    if (!socket) return;
    const reBloquear = () => {
      if (!participante || !wod || paso !== 'medir') return;
      socket.emit(
        'lock-participant',
        {
          participante_id: participante.id,
          wod_id: wod.id,
          judgeName: `${user?.nombre ?? 'Juez'} ${user?.apellidos ?? ''}`.trim(),
        },
        (res?: { ok: boolean }) => {
          if (res && !res.ok) {
            setError('Se perdió el bloqueo del atleta en la reconexión: verifica que nadie más lo esté midiendo');
          }
        }
      );
    };
    socket.on('connect', reBloquear);
    return () => {
      socket.off('connect', reBloquear);
    };
  }, [socket, participante, wod, paso, user]);

  /* ------------------------------ Acciones ------------------------------ */

  function limpiarMedicion() {
    setValor('');
    setReps(0);
    setSplits([]);
    setConteoEsquema(movObjetivo.map(() => 0));
    setModoCap(false);
    setNoReps([]);
    setVueltas([]);
    setDesempate(null);
    setIntentos([]);
    setCuentaAtras(false);
    cronoRef.current?.reiniciar();
    setCronoEstado({ enMarcha: false, conMarca: false });
  }

  /** Anota una repeticion invalidada con la marca del momento. */
  function anotarNoRep() {
    if (registroCongelado) return; // congelado no se toca el registro
    const marca = esTiempo ? (cronoRef.current?.getTextoActual() ?? '') : `rep ${reps}`;
    const efecto = esTiempo ? `+${PENALIZACION_NO_REP_SEG} s` : '-1 rep';
    setNoReps((previas) => [...previas, { id: siguienteNoRepId.current++, marca, efecto }]);
    // En una prueba de repeticiones la no-rep descuenta del contador; en una de
    // tiempo el efecto es la penalizacion, que se suma al enviar.
    if (!esTiempo) setReps((n) => Math.max(0, n - 1));
    if (navigator.vibrate) navigator.vibrate(60);
  }

  function deshacerNoRep() {
    if (registroCongelado || noReps.length === 0) return;
    setNoReps((previas) => previas.slice(0, -1));
    if (!esTiempo) setReps((n) => n + 1);
  }

  const maxIntentos = esquema?.modalidad === 'max_load' ? esquema.intentos ?? MAX_INTENTOS : MAX_INTENTOS;

  function registrarIntento(valido: boolean) {
    if (registroCongelado || intentos.length >= maxIntentos) return;
    const discos = discosIntento.trim();
    setIntentos((previos) => [
      ...previos,
      { peso: pesoIntento, valido, barra: barraIntento, ...(discos ? { discos } : {}) },
    ]);
    if (navigator.vibrate) navigator.vibrate(40);
  }

  // --- Resumen de la prueba según su modalidad: qué debe registrar el juez ---
  // Meta de distancia de la división del atleta (número único o por división).
  // Memoizados: no dependen del tick del cronómetro.
  const metaDistancia: number | null = useMemo(() => {
    const meta = esquema?.distancia_meta;
    if (typeof meta === 'number') return meta > 0 ? meta : null;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const rec = meta as Record<string, unknown>;
      const claves = Object.keys(rec);
      const clave =
        claves.find((k) => k.trim().toLowerCase() === division.trim().toLowerCase()) ??
        claves.find((k) => k.trim().toLowerCase() === DIVISION_GENERAL.toLowerCase());
      const n = clave !== undefined ? Number(rec[clave]) : 0;
      return n > 0 ? n : null;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esquema, division]);

  const resumenPrueba: string[] = useMemo(() => {
    if (!tipo) return [];
    // For Time: el resultado lo fija el cronómetro; el conteo es el trabajo a completar.
    if (esTiempo) {
      const items = [cap > 0 ? `Tope ${formatoTope(cap)}` : 'Sin tope'];
      if (usaEsquema) {
        if (objetivoEsquema > 0) items.unshift(`Objetivo ${objetivoEsquema} reps`);
        if (rondasEsquema > 1) items.push(`Rondas ${rondasEsquema}`);
      }
      items.push(`No-rep +${PENALIZACION_NO_REP_SEG} s`);
      return items;
    }
    if (esSplits) {
      const n = esquema?.segmentos?.length ?? 0;
      return n > 0 ? [`${n} segmentos`, 'Menor tiempo gana'] : ['Registra cada segmento'];
    }
    // AMRAP (reps o calorías con meta): el contador puede superar la referencia.
    // En calorías cada ejercicio se teclea manual (lo que marca la máquina).
    if (esConteo) {
      const unidad = tipo === 'calorías' ? 'cal' : 'reps';
      const items: string[] = [];
      if (usaEsquema) {
        if (objetivoEsquema > 0) items.push(`Meta ${objetivoEsquema} ${unidad}`);
        if (rondasEsquema > 1) items.push(`Rondas ${rondasEsquema}`);
        items.push('Se puede superar la meta');
        if (tipo === 'calorías') items.push('Teclea las cal de cada ejercicio');
      } else {
        items.push('Cuenta las repeticiones una a una');
      }
      items.push('No-rep resta 1');
      return items;
    }
    // Carga máxima: vale el mejor intento válido, no el último.
    if (esPeso) {
      return [
        `Intentos ${maxIntentos}`,
        mejorPeso > 0 ? `Mejor ${mejorPeso} ${UNIDAD_MEDICION.peso}` : 'Sin marcas aún',
        'Vale el mejor válido',
      ];
    }
    // Distancia: captura manual de la marca lograda (la meta solo es referencia).
    if (tipo === 'distancia') {
      const u = unidadDeWod(wod);
      return [
        ...(metaDistancia !== null ? [`Meta de referencia ${metaDistancia} ${u}`] : []),
        'Mide la marca lograda',
        `Unidad ${u}`,
      ];
    }
    // Calorías sin esquema: el juez teclea manual el total quemado (kcal).
    if (esCaloriasSinEsquema) {
      return ['Unidad kcal', 'Teclea el total que marca la máquina'];
    }
    // Resto (genérico): captura manual del total.
    return ['Introduce el total'];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tipo,
    esTiempo,
    esSplits,
    esConteo,
    esPeso,
    esCaloriasSinEsquema,
    cap,
    usaEsquema,
    objetivoEsquema,
    rondasEsquema,
    esquema,
    maxIntentos,
    mejorPeso,
    metaDistancia,
    wod,
  ]);

  async function buscarParticipante(e?: React.FormEvent) {
    e?.preventDefault();
    if (!cedula.trim() || !wod) return;

    setError('');
    setExito('');
    setBuscando(true);

    try {
      const { data: atleta } = await api.post<Participante>('/participant/lookup', {
        cedula: cedula.trim(),
      });

      // Un WOD solo admite una medicion por atleta.
      const { data: revision } = await api.post('/results/check', {
        participante_id: atleta.id,
        wod_id: wod.id,
      });

      if (revision.exists) {
        setError(revision.message);
        return;
      }

      // Dos jueces no pueden medir al mismo atleta a la vez.
      // Fail-closed: si el socket no responde en 2.5 s, se asume bloqueado
      // y NO se avanza a medir (antes se asumia libre y dos jueces podian
      // medir al mismo atleta).
      if (socket?.connected) {
        const bloqueo = await new Promise<{ locked: boolean; message: string }>((resolve) => {
          const t = setTimeout(
            () => resolve({ locked: true, message: 'No se pudo verificar el bloqueo: comprueba tu conexion y reintenta' }),
            2500
          );
          socket.emit(
            'check-participant-lock',
            { participante_id: atleta.id, wod_id: wod.id },
            (respuesta: { locked: boolean; message: string }) => {
              clearTimeout(t);
              resolve(respuesta);
            }
          );
        });

        if (bloqueo.locked) {
          setError(bloqueo.message);
          return;
        }

        socket.emit('lock-participant', {
          participante_id: atleta.id,
          wod_id: wod.id,
          judgeName: `${user?.nombre ?? 'Juez'} ${user?.apellidos ?? ''}`.trim(),
        });
      }

      setParticipante(atleta);
      setPaso('medir');
      limpiarMedicion();
      // Cada atleta se comprueba de cero: la barra y las alturas cambian.
      setChecklist(PUNTOS_CHECKLIST.map(() => false));
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? 'No existe ningun participante con esa cedula'
          : mensajeDeError(err, 'No se pudo verificar el participante')
      );
    } finally {
      setBuscando(false);
    }
  }

  function volverABuscar() {
    liberarParticipante();
    setParticipante(null);
    setPaso('buscar');
    setCedula('');
    limpiarMedicion();
    setChecklist(PUNTOS_CHECKLIST.map(() => false));
  }

  /**
   * Registra el resultado. El valor bruto sale de la fuente que corresponde a
   * cada caso, nunca de un campo de texto libre en las pruebas de tiempo:
   *  - abandono -> 'ABANDONO'
   *  - capado   -> repeticiones hechas
   *  - tiempo   -> cronometro + penalizacion por no-reps
   *  - peso     -> mejor intento valido
   *  - reps     -> contador
   *  - resto    -> el numero introducido
   */
  async function guardar(abandono: boolean) {
    if (!participante || !wod) return;

    // Con el heat en pausa no se registra nada: se espera a la reanudación.
    if (faseReloj === 'pausado') {
      setError('El heat está en pausa: espera a que el administrador lo reanude');
      return;
    }

    // Captura manual (distancia / calorías sin esquema): el total tecleado
    // debe ser un número positivo (lo que marca la máquina).
    if (!abandono && esManual) {
      const n = parseFloat(valor.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        setError(
          tipo === 'calorías'
            ? 'Teclea manual las calorías quemadas antes de enviar'
            : 'Introduce el resultado antes de enviar'
        );
        return;
      }
    }

    // La penalizacion ya va sumada: el servidor recibe el tiempo definitivo.
    // El cronómetro vive en el hijo: se lee en firme por ref al enviar.
    const transcurrido = cronoRef.current?.getTranscurridoMs() ?? 0;
    const resuelto = construirValorBruto({
      abandono,
      esTiempo,
      modoCap,
      reps,
      elapsed: transcurrido,
      tiempoFinalFormateado: formatearCrono(transcurrido + penalizacionSeg * 1000),
      esPeso,
      mejorPeso,
      esSplits,
      splits,
      esConteo,
      valorManual: valor,
    });
    if ('error' in resuelto) {
      setError(resuelto.error);
      return;
    }
    const { valorBruto, capado } = resuelto;

    setError('');
    setGuardando(true);

    // Desglose para auditar la medicion guiada, y marca de desempate.
    // En modo manual se audita el arranque por dedo (tolerancia humana).
    const marcaManual = inicioManual
      ? { inicio_manual: true as const, t0_local_ms: inicioManual.t0LocalMs, offset_ms: inicioManual.offsetMs }
      : {};
    const detalle: DetalleMedicion | undefined = construirDetalle({
      abandono,
      esPeso,
      intentos,
      mejorPeso,
      esSplits,
      splits,
      usaEsquema,
      esTiempo,
      division,
      movObjetivo,
      conteoEsquema,
      totalEsquema,
      objetivoEsquema,
      rondasEsquema,
      capado,
      marcaManual,
    });
    // El desempate solo se captura hoy en las pruebas de tiempo.
    const desempateMs = esTiempo && !abandono ? tiempoAms(desempate) : null;

    const datos = {
      participante_id: participante.id,
      wod_id: wod.id,
      valor_bruto: valorBruto,
      abandono,
      capado,
      detalle,
      desempate: desempateMs,
    };

    try {
      if (enLinea) {
        await api.post('/results', datos);
        setExito(`Resultado de ${participante.nombre} guardado`);
      } else {
        await savePending(datos);
        setExito('Guardado en el dispositivo: se enviara al recuperar la conexion');
      }

      if (navigator.vibrate) navigator.vibrate(40);
      // Tras registrar, se vuelve a la lista de wods de la competencia.
      liberarParticipante();
      navigate(`/juez/${competenciaId}`);
    } catch (err: any) {
      // Solo los fallos de red/5xx/429 van a la cola offline. Un 400/422 es
      // un error de validacion (reintentarlo no ayuda y tras 5 intentos se
      // perdia en silencio): se muestra y el juez se queda en `medir`.
      // 409 de duplicado y 403/404 tampoco se encolan.
      const estado = err?.response?.status;
      if (estado === 409 || estado === 403 || estado === 404) {
        setError(mensajeDeError(err));
      } else if (!err?.response || estado >= 500 || estado === 429) {
        await savePending(datos);
        liberarParticipante();
        navigate(`/juez/${competenciaId}`);
      } else {
        setError(mensajeDeError(err));
      }
    } finally {
      setGuardando(false);
      setConfirmarAbandono(false);
    }
  }

  // El tiempo ya tomado (cronometro detenido) es el resultado en firme.
  const tiempoTomado = esTiempo && !cronoEstado.enMarcha && cronoEstado.conMarca && !modoCap;

  const botonAbandono = (
    <button
      type="button"
      onClick={() => setConfirmarAbandono(true)}
      className="w-full min-h-[2.75rem] flex items-center justify-center gap-2 rounded-xl border border-hyrox-danger/35 bg-hyrox-danger/10 text-hyrox-danger font-semibold text-sm hover:bg-hyrox-danger/20 transition-colors cursor-pointer"
    >
      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      Registrar abandono (lesion o salud)
    </button>
  );

  return (
    <AppShell
      title={wod?.nombre_ejercicio ?? 'Medicion'}
      subtitle={
        competencia
          ? `${competencia.nombre} · Wod ${wod?.orden ?? ''} · ${
              wod ? ETIQUETA_MEDICION[wod.tipo_medicion] : ''
            } · Categoria ${division}`
          : undefined
      }
      actions={
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(`/juez/${competenciaId}`)}>
          <span className="hidden sm:inline">Wods</span>
        </Button>
      }
    >
      <div className="max-w-2xl space-y-4">
        {pendingCount > 0 && (
          <Alert tone="warning">
            <span className="flex flex-wrap items-center gap-2">
              {pendingCount} resultado{pendingCount > 1 ? 's' : ''} pendiente
              {pendingCount > 1 ? 's' : ''} de enviar.
              {enLinea && (
                <button
                  type="button"
                  onClick={syncPending}
                  className="font-semibold underline underline-offset-2 cursor-pointer"
                >
                  Enviar ahora
                </button>
              )}
            </span>
          </Alert>
        )}

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

        {/* Reloj sincronizado del heat, si el admin lo armó. */}
        {competenciaId && <CompetenciaStartBanner competenciaId={Number(competenciaId)} />}

        {/* Pausa global por novedad: el registro queda congelado sin perder lo anotado. */}
        {enPausa && paso === 'medir' && (
          <Alert tone="warning">
            Heat en pausa por decisión del administrador. Cronómetro, conteos y pesos congelados: espera la
            reanudación, nada de lo anotado se ha perdido.
          </Alert>
        )}

        {/* Foto del WOD, si el admin le cargó una al crearlo. */}
        {wod?.imagen_url && (
          <img
            src={wod.imagen_url}
            alt={`Referencia de ${wod.nombre_ejercicio}`}
            className="w-full max-h-56 object-cover rounded-2xl border border-white/[0.08]"
          />
        )}

        {/* ------------------------- Buscar atleta ------------------------- */}
        {paso === 'buscar' && (
          <section className="surface p-5">
            <h2 className="text-base font-bold text-hyrox-paper mb-1">Identifica al atleta</h2>
            <p className="text-xs text-hyrox-mist mb-4">
              Introduce su cedula para comprobar que no tiene ya una medicion en este WOD.
            </p>

            <form onSubmit={buscarParticipante} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <Field
                label="Cedula del participante"
                className="flex-1"
                type="text"
                inputMode="numeric"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Numero de documento"
                autoFocus
              />
              <Button type="submit" icon={Search} loading={buscando} disabled={!cedula.trim() || medicionBloqueada} className="sm:w-auto">
                Buscar
              </Button>
            </form>
            {medicionBloqueada && (
              <p className="mt-2 text-2xs text-hyrox-warning">
                {faseReloj === 'cuenta_regresiva' && 'El heat arranca al terminar la cuenta regresiva.'}
                {faseReloj === 'armado' && 'El heat está armado: espera el arranque del administrador.'}
                {faseReloj === 'pausado' && 'El heat está en pausa: espera la reanudación.'}
                {faseReloj === 'finalizado' && 'El heat ya finalizó.'}
              </p>
            )}
          </section>
        )}

        {/* --------------------------- Medir --------------------------- */}
        {paso === 'medir' && participante && wod && (
          <>
            <section className="surface p-4 flex items-center gap-3">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-hyrox-accent/12 text-hyrox-accent shrink-0">
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-hyrox-paper truncate">
                  {participante.nombre} {participante.apellidos}
                </p>
                <p className="text-xs text-hyrox-mist truncate">
                  C.I. {participante.cedula}
                  {participante.box && ` · ${participante.box}`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={volverABuscar}>
                Cambiar
              </Button>
            </section>

            {/* Resumen de la prueba según su modalidad: qué debe registrar el juez. */}
            {resumenPrueba.length > 0 && (
              <section className="surface p-4" aria-label="Resumen de la prueba">
                <p className="eyebrow mb-2">La prueba · {wod ? ETIQUETA_MEDICION[wod.tipo_medicion] : ''}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {resumenPrueba.map((item) => (
                    <li
                      key={item}
                      className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1 text-xs text-hyrox-paper"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ===================== Wods de TIEMPO ===================== */}
            {esTiempo && (
              <>
                {/* El checklist se oculta una vez dada la salida: a partir de
                    ahi solo estorba entre el juez y los botones del reloj. */}
                {!cronoEstado.enMarcha && !cronoEstado.conMarca && !modoCap && (
                  <ChecklistPrevio
                    marcados={checklist}
                    onCambiar={(i) =>
                      setChecklist((previo) => previo.map((v, indice) => (indice === i ? !v : v)))
                    }
                  />
                )}

                <CronometroView
                  ref={cronoRef}
                  cap={cap}
                  checklistCompleto={checklistCompleto}
                  congelado={registroCongelado}
                  penalizacionSeg={penalizacionSeg}
                  modoCap={modoCap}
                  tiempoTomado={tiempoTomado}
                  onCap={alAlcanzarTope}
                  onEstado={onEstadoCrono}
                  onSolicitarInicio={() => setCuentaAtras(true)}
                  onReiniciar={limpiarMedicion}
                  onNoRep={anotarNoRep}
                  onVuelta={() => setVueltas((v) => [...v, cronoRef.current?.getTextoActual() ?? ''])}
                  onDesempate={() => setDesempate(cronoRef.current?.getTextoActual() ?? null)}
                />

                {/* En For Time con scorecard, el juez cuenta las reps por
                    movimiento mientras corre el reloj; al completar el objetivo,
                    detiene el cronometro y ese tiempo es el resultado. */}
                {usaEsquema && !modoCap && (
                  <>
                    {secuencial ? (
                      <ContadorSerie
                        key={claveSerie}
                        movimientos={movObjetivo}
                        conteos={conteoEsquema}
                        onCambiar={cambiarConteoEsquema}
                        deshabilitado={registroCongelado}
                        esTiempo
                        rondasTotal={rondasEsquema}
                      />
                    ) : (
                      <ContadorEsquema
                        movimientos={movObjetivo}
                        conteos={conteoEsquema}
                        onCambiar={cambiarConteoEsquema}
                        deshabilitado={registroCongelado}
                      />
                    )}
                    {objetivoEsquema > 0 && totalEsquema >= objetivoEsquema && (
                      <Alert tone="success">
                        Trabajo completo ({totalEsquema} reps). Detén el cronómetro para fijar el tiempo.
                      </Alert>
                    )}
                  </>
                )}

                {/* Vueltas y desempate son notas de apoyo: no se envian. */}
                {(vueltas.length > 0 || desempate) && (
                  <section className="surface p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="eyebrow">Marcas de referencia</p>
                      <span className="text-2xs text-hyrox-ghost">No se guardan</span>
                    </div>
                    {desempate && (
                      <p className="flex items-center justify-between text-sm mb-2">
                        <span className="text-hyrox-mist">Desempate</span>
                        <span className="font-mono font-bold text-hyrox-warning">{desempate}</span>
                      </p>
                    )}
                    {vueltas.map((marca, indice) => (
                      <p key={indice} className="flex items-center justify-between text-sm">
                        <span className="text-hyrox-mist">Vuelta {indice + 1}</span>
                        <span className="font-mono text-hyrox-paper">{marca}</span>
                      </p>
                    ))}
                  </section>
                )}

                {noReps.length > 0 && (
                  <RegistroNoReps
                    entradas={noReps}
                    resumen={`+${penalizacionSeg} s`}
                    onDeshacer={deshacerNoRep}
                  />
                )}

                <section className="surface p-5 space-y-4">
                  {!modoCap ? (
                    <>
                      <Button
                        icon={Send}
                        onClick={() => guardar(false)}
                        loading={guardando}
                        disabled={enPausa || !tiempoTomado}
                        fullWidth
                      >
                        Enviar resultado
                      </Button>

                      {cap > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            cronoRef.current?.detener();
                            setModoCap(true);
                          }}
                          disabled={registroCongelado}
                          className="w-full min-h-[2.75rem] flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-hyrox-mist font-semibold text-sm hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Flag className="w-4 h-4" aria-hidden="true" />
                          No termino antes del tope (registrar reps)
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-hyrox-mist">
                        El atleta no completo la prueba dentro del tope: anota las repeticiones que llego a hacer.
                      </p>
                      {usaEsquema ? (
                        secuencial ? (
                          <ContadorSerie
                            key={claveSerie}
                            movimientos={movObjetivo}
                            conteos={conteoEsquema}
                            onCambiar={cambiarConteoEsquema}
                            deshabilitado={registroCongelado}
                            esTiempo
                            rondasTotal={rondasEsquema}
                          />
                        ) : (
                          <ContadorEsquema
                            movimientos={movObjetivo}
                            conteos={conteoEsquema}
                            onCambiar={cambiarConteoEsquema}
                            deshabilitado={registroCongelado}
                          />
                        )
                      ) : (
                        <ContadorReps valor={reps} onCambiar={setReps} etiqueta="Reps antes del tope" />
                      )}
                      <Button
                        icon={Send}
                        onClick={() => guardar(false)}
                        loading={guardando}
                        disabled={enPausa || reps <= 0}
                        fullWidth
                      >
                        Enviar (no terminado)
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setModoCap(false);
                          setReps(0);
                        }}
                        className="w-full text-center text-2xs text-hyrox-ghost hover:text-hyrox-mist transition-colors cursor-pointer"
                      >
                        Volver al cronometro
                      </button>
                    </>
                  )}

                  {botonAbandono}
                </section>
              </>
            )}

            {/* ===================== Wods de SPLITS ===================== */}
            {esSplits && (
              <section className="surface p-5 space-y-4">
                <ContadorSegmentos
                  wod={wod}
                  participante={participante}
                  esquema={wod.esquema!}
                  splits={splits}
                  onSplitsChange={setSplits}
                  onSave={() => guardar(false)}
                  enPausa={registroCongelado}
                />
                {botonAbandono}
              </section>
            )}

            {/* ==================== Wods de REPETICIONES / CALORÍAS ==================== */}
            {esConteo && (
              <>
                {usaEsquema ? (
                  secuencial ? (
                    <ContadorSerie
                      key={claveSerie}
                      movimientos={movObjetivo}
                      conteos={conteoEsquema}
                      onCambiar={cambiarConteoEsquema}
                      permitirExceder
                      deshabilitado={registroCongelado}
                      esTiempo={false}
                      rondasTotal={rondasEsquema}
                    />
                  ) : (
                    <ContadorEsquema
                      movimientos={movObjetivo}
                      conteos={conteoEsquema}
                      onCambiar={cambiarConteoEsquema}
                      permitirExceder
                      deshabilitado={registroCongelado}
                    />
                  )
                ) : (
                  <ContadorReps
                    valor={reps}
                    onCambiar={setReps}
                    etiqueta={tipo === 'calorías' ? 'Calorías' : undefined}
                    deshabilitado={registroCongelado}
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={anotarNoRep}
                    disabled={registroCongelado || reps <= 0 || usaEsquema}
                    className="flex-1 min-w-[9rem] min-h-[3rem] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-hyrox-danger bg-hyrox-danger/12 text-hyrox-danger text-sm font-bold hover:bg-hyrox-danger/20 active:scale-95 transition disabled:opacity-30 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                    No-rep -1
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoIntervalos((v) => !v)}
                    className="flex-1 min-w-[9rem] min-h-[3rem] inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-hyrox-paper text-sm font-bold hover:bg-white/[0.07] transition cursor-pointer"
                  >
                    <Timer className="w-4 h-4" aria-hidden="true" />
                    {modoIntervalos ? 'Ocultar intervalos' : 'EMOM / Tabata'}
                  </button>
                </div>

                {modoIntervalos && (
                  <TemporizadorIntervalos config={configIntervalos} onCambiarConfig={setConfigIntervalos} />
                )}

                {noReps.length > 0 && (
                  <RegistroNoReps
                    entradas={noReps}
                    resumen={`-${noReps.length} rep${noReps.length > 1 ? 's' : ''}`}
                    onDeshacer={deshacerNoRep}
                  />
                )}

                <section className="surface p-5 space-y-4">
                  <Button icon={Send} onClick={() => guardar(false)} loading={guardando} disabled={enPausa || reps <= 0} fullWidth>
                    Enviar {reps} {tipo === 'calorías' ? 'cal' : 'repeticiones'}
                  </Button>
                  {botonAbandono}
                </section>
              </>
            )}

            {/* ======================= Wods de PESO ======================= */}
            {esPeso && (
              <>
                <IntentosPeso
                  intentos={intentos}
                  peso={pesoIntento}
                  onCambiarPeso={setPesoIntento}
                  onRegistrar={registrarIntento}
                  onDeshacer={() => { if (!registroCongelado) setIntentos((previos) => previos.slice(0, -1)); }}
                  unidad={UNIDAD_MEDICION.peso}
                  maxIntentos={maxIntentos}
                  deshabilitado={registroCongelado}
                  barra={barraIntento}
                  onCambiarBarra={setBarraIntento}
                  discos={discosIntento}
                  onCambiarDiscos={setDiscosIntento}
                />

                <section className="surface p-5 space-y-4">
                  <Button
                    icon={Send}
                    onClick={() => guardar(false)}
                    loading={guardando}
                    disabled={enPausa || mejorPeso <= 0}
                    fullWidth
                  >
                    Enviar {mejorPeso > 0 ? `${mejorPeso} ${UNIDAD_MEDICION.peso}` : 'resultado'}
                  </Button>
                  {botonAbandono}
                </section>
              </>
            )}

            {/* ============ Wods de DISTANCIA / CALORÍAS sin esquema (manual) ============ */}
            {esManual && (
              <section className="surface p-5 space-y-4">
                <Field
                  label={
                    wod.tipo_medicion === 'calorías'
                      ? 'Calorías quemadas (kcal)'
                      : `Resultado (${ETIQUETA_MEDICION[wod.tipo_medicion].toLowerCase()})`
                  }
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value.replace(',', '.'))}
                  placeholder={
                    wod.tipo_medicion === 'calorías' ? 'Ej. 120' : `Cantidad en ${unidadDeWod(wod)}`
                  }
                  hint={
                    registroCongelado
                      ? 'Registro congelado: espera la reanudación.'
                      : wod.tipo_medicion === 'calorías'
                        ? 'Teclea manual el total que marca la máquina. Solo el numero, sin unidad.'
                        : wod.tipo_medicion === 'distancia' && metaDistancia !== null
                          ? `Meta de referencia: ${metaDistancia} ${unidadDeWod(wod)} (informativa). Solo el numero, sin unidad.`
                          : 'Solo el numero, sin unidad'
                  }
                  disabled={registroCongelado}
                  className="font-mono text-lg"
                  autoFocus
                />

                <Button
                  icon={Send}
                  onClick={() => guardar(false)}
                  loading={guardando}
                  disabled={enPausa || !(parseFloat(valor.replace(',', '.')) > 0)}
                  fullWidth
                >
                  Enviar resultado
                </Button>

                {botonAbandono}
              </section>
            )}
          </>
        )}
      </div>

      <CuentaAtras
        activo={cuentaAtras}
        onCompletar={() => {
          setCuentaAtras(false);
          cronoRef.current?.iniciar();
        }}
        onCancelar={() => setCuentaAtras(false)}
      />

      <ConfirmDialog
        open={confirmarAbandono}
        title="Registrar abandono"
        message={`Se registrara a ${participante?.nombre ?? 'el atleta'} como DNF en este WOD, con 0 puntos. Esta accion solo puede deshacerla un administrador.`}
        confirmLabel="Registrar abandono"
        loading={guardando}
        onConfirm={() => guardar(true)}
        onCancel={() => setConfirmarAbandono(false)}
      />
    </AppShell>
  );
}
