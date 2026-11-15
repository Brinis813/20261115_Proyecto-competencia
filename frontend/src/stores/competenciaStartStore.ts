import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import api from '../api/client';
import type { CompetenciaStartPayload } from '../types';

/**
 * Reloj sincronizado del heat (juez).
 *
 * El servidor es la única referencia: fija `startTimeServer` (t0) y el juez
 * mide su offset contra él. Todo deriva de una fórmula:
 * `elapsed = (Date.now() + offset) - t0`.
 *
 * - La pausa no necesita casos especiales: al reanudar, el servidor desplaza
 *   t0 hacia adelante por lo que duró, así la fórmula sigue valiendo.
 * - El tick no acumula: deriva de t0 en cada pasada (inmune a throttling).
 */

export type FaseReloj = 'espera' | 'armado' | 'cuenta_regresiva' | 'en_curso' | 'pausado' | 'capado' | 'finalizado';

export interface InicioManual {
  t0LocalMs: number;
  offsetMs: number;
}

interface CompetenciaStartState {
  competenciaId: number | null;
  snapshot: CompetenciaStartPayload | null;
  fase: FaseReloj;
  /** Offset: serverNow - clientNow. Positivo si el servidor va por delante. */
  offsetMs: number;
  elapsedMs: number;
  sincronizando: boolean;
  aviso: string | null;
  /** Solo modo manual/offline: cuándo pulsó Iniciar el juez. */
  inicioManual: InicioManual | null;
  /** Handle del tick; no reactivo (nunca se lee en render). */
  intervalo: ReturnType<typeof setInterval> | null;
  conectar: (socket: Socket, competenciaId: number) => () => void;
  aplicarSnapshot: (s: CompetenciaStartPayload) => void;
  medirOffset: (socket: Socket | null) => Promise<number>;
  /** Botón "Re-sincronizar" + auto al reconectar. */
  forzarSincronizacion: (socket: Socket | null, competenciaId: number) => Promise<void>;
  /** Modo manual: nace del dedo del juez; devuelve el t0 local para auditarlo. */
  iniciarLocal: () => number;
}

const UMBRAL_DERIVA_MS = 800;

// Version del ultimo snapshot aplicado, POR competencia: el global se pisaba
// al cambiar de competencia (o en StrictMode/tests con dos stores vivos).
const versionesVistas = new Map<number, number>();
const versionVistaDe = (competenciaId: number | null) => versionesVistas.get(competenciaId ?? -1) ?? -1;
const fijarVersionVista = (competenciaId: number | null, v: number) => {
  versionesVistas.set(competenciaId ?? -1, v);
};

const ahoraServidor = (offset: number) => Date.now() + offset;

export const useCompetenciaStartStore = create<CompetenciaStartState>((set, get) => {
  /** Detiene el tick del reloj (lee el handle del propio store, no de un global). */
  function detenerTick() {
    const h = get().intervalo;
    if (h) {
      clearInterval(h);
      set({ intervalo: null });
    }
  }

  /** Acopla el reloj local al t0 vigente (instantáneo, al segundo real). */
  function acoplar(t0: number, timeCapMs: number | null) {
    const elapsed = ahoraServidor(get().offsetMs) - t0;
    if (timeCapMs != null && elapsed >= timeCapMs) {
      detenerTick();
      set({ elapsedMs: timeCapMs, fase: 'capado' });
      return;
    }
    set({ fase: 'en_curso' });
    detenerTick();
    set({
      intervalo: setInterval(() => {
        const actual = ahoraServidor(get().offsetMs) - t0;
        if (timeCapMs != null && actual >= timeCapMs) {
          // TIME CAP: se congela en el tope; la fase cambia a capado.
          detenerTick();
          set({ elapsedMs: timeCapMs, fase: 'capado' });
          return;
        }
        set({ elapsedMs: Math.max(0, actual) });
      }, 100),
    });
  }

  return {
    competenciaId: null,
    snapshot: null,
    fase: 'espera',
    offsetMs: 0,
    elapsedMs: 0,
    sincronizando: false,
    aviso: null,
    inicioManual: null,
    intervalo: null,

    aplicarSnapshot: (s) => {
      const vista = versionVistaDe(get().competenciaId);
      if (s.version <= vista) return; // evento viejo o duplicado
      fijarVersionVista(get().competenciaId, s.version);
      set({ snapshot: s, aviso: null });
      // Afina el offset gratis con cada snapshot (una muestra, ponderada poco).
      if (Number.isFinite(s.serverNow)) {
        const muestra = s.serverNow - Date.now();
        if (Math.abs(muestra - get().offsetMs) < 5000) {
          set({ offsetMs: Math.round(get().offsetMs * 0.7 + muestra * 0.3) });
        }
      }

      if (s.estado === 'finalizado') {
        detenerTick();
        set({ fase: 'finalizado' });
        return;
      }
      if (s.estado === 'cancelado') {
        // ABORTAR: relojes a 00:00 y vuelta al estado inicial.
        detenerTick();
        set({ fase: 'espera', elapsedMs: 0, snapshot: null, inicioManual: null });
        fijarVersionVista(get().competenciaId, -1);
        return;
      }
      if (s.estado === 'pausado') {
        // PAUSA: se congela en el segundo exacto de la pausa.
        detenerTick();
        const t0 = s.startTimeServer ?? ahoraServidor(get().offsetMs);
        const congelado = s.pausadoEnMs != null ? Math.max(0, s.pausadoEnMs - t0) : get().elapsedMs;
        set({ fase: 'pausado', elapsedMs: congelado });
        return;
      }
      const t0 = s.startTimeServer;
      if (t0 == null) {
        set({ fase: 'armado' }); // modo manual: espera el dedo del juez
        return;
      }
      if (t0 - ahoraServidor(get().offsetMs) > 0) set({ fase: 'cuenta_regresiva' });
      else acoplar(t0, s.timeCapMs); // llegamos tarde: entrar ya acoplado
    },

    medirOffset: async (socket) => {
      // Mediana de las muestras con menor RTT (las más limpias).
      const muestras: { rtt: number; off: number }[] = [];
      if (socket?.connected) {
        for (let i = 0; i < 8; i++) {
          try {
            const t1 = Date.now();
            const res = (await socket
              .timeout(3000)
              .emitWithAck('time:sync', { t1 })) as { t2: number; t3: number };
            const t4 = Date.now();
            muestras.push({ rtt: t4 - t1, off: ((res.t2 - t1) + (res.t3 - t4)) / 2 });
          } catch {
            /* muestra perdida: se sigue con las demás */
          }
          await new Promise((r) => setTimeout(r, 120));
        }
      }
      // Sin socket (o sin muestras): una muestra REST contra el snapshot.
      if (muestras.length === 0 && get().competenciaId != null) {
        try {
          const { data } = await api.get<CompetenciaStartPayload>(`/competencias/${get().competenciaId}/arranque`);
          if (data && Number.isFinite(data.serverNow)) {
            muestras.push({ rtt: 0, off: data.serverNow - Date.now() });
          }
        } catch {
          /* sin red: se conserva el último offset */
        }
      }
      if (muestras.length === 0) return get().offsetMs;
      muestras.sort((a, b) => a.rtt - b.rtt);
      const mejores = muestras
        .slice(0, Math.max(1, Math.floor(muestras.length / 2)))
        .map((m) => m.off)
        .sort((a, b) => a - b);
      const mediana = Math.round(mejores[Math.floor(mejores.length / 2)]);
      set({ offsetMs: mediana });
      return mediana;
    },

    forzarSincronizacion: async (socket, competenciaId) => {
      // Silenciosa por diseño: el juez no debe ver etiquetas de resync
      // (ni manual ni automatico). Solo se avisa si NO hay conexion,
      // que si requiere su atencion. El spinner "Sincronizando…" sigue
      // dando feedback mientras dura la operacion.
      set({ sincronizando: true, aviso: null });
      try {
        await get().medirOffset(socket);
        // Doble vía: ACK por socket y fallback REST (vale con el socket a medio morir).
        let snap: CompetenciaStartPayload | null = null;
        try {
          snap = socket?.connected
            ? ((await socket.timeout(4000).emitWithAck('competencia:resync', { competenciaId })) as CompetenciaStartPayload)
            : null;
        } catch {
          snap = null;
        }
        snap ??= (await api.get<CompetenciaStartPayload>(`/competencias/${competenciaId}/arranque`)).data;
        if (!snap) return;
        // Todo pasa por aplicarSnapshot SIN inflar la version: su guard
        // (`s.version <= vista` → descartar) protege de que un REST viejo
        // pise un snapshot socket mas nuevo. El offset ya se refresco arriba
        // y el tick lo lee en vivo, asi que descartar es seguro.
        get().aplicarSnapshot(snap);
        // Sin etiqueta de exito: el re-anclaje es invisible para el juez.
      } catch {
        set({ aviso: 'Sin conexión: se conserva el reloj local' });
      } finally {
        set({ sincronizando: false });
      }
    },

    iniciarLocal: () => {
      // Modo manual/offline: el reloj nace del dedo del juez, no de la red.
      const t0Local = Date.now();
      const offset = get().offsetMs;
      set({ inicioManual: { t0LocalMs: t0Local, offsetMs: offset } });
      acoplar(t0Local - offset, get().snapshot?.timeCapMs ?? null);
      return t0Local;
    },

    conectar: (socket, competenciaId) => {
      fijarVersionVista(competenciaId, -1);
      set({
        competenciaId,
        snapshot: null,
        fase: 'espera',
        elapsedMs: 0,
        aviso: null,
        inicioManual: null,
      });
      // 1. Snapshot por REST al abrir (funciona incluso sin socket).
      void api
        .get<CompetenciaStartPayload>(`/competencias/${competenciaId}/arranque`)
        .then((r) => {
          if (r.data) get().aplicarSnapshot(r.data);
        })
        .catch(() => undefined);
      // 2. Offset inicial en segundo plano.
      void get().medirOffset(socket);
      // 3. En vivo por socket: hay que ENTRAR a la room (el servidor no
      // re-agrega solo tras una reconexión, así que se re-emite al conectar).
      const unirse = () => {
        if (socket.connected) socket.emit('join-competencia', competenciaId);
      };
      unirse();
      const alSnapshot = (s: CompetenciaStartPayload) => get().aplicarSnapshot(s);
      // 'connect' también dispara en cada reconexión: si había heat en curso,
      // se re-acopla solo ("forzar sincronización automática").
      const alConectar = () => {
        unirse();
        const { snapshot, fase } = get();
        if (snapshot?.startTimeServer != null && (fase === 'en_curso' || fase === 'cuenta_regresiva' || fase === 'pausado')) {
          void get().forzarSincronizacion(socket, competenciaId);
        }
      };
      socket.on('competencia:start', alSnapshot);
      socket.on('connect', alConectar);
      // 4. Vigilancia de deriva cada 10 s + al volver de background.
      const vigilar = setInterval(() => {
        const { snapshot, fase } = get();
        if (fase !== 'en_curso' || snapshot?.startTimeServer == null) return;
        const t0 = snapshot.startTimeServer;
        void api
          .get<CompetenciaStartPayload>(`/competencias/${competenciaId}/arranque`)
          .then((r) => {
            const esperado = (r.data?.serverNow ?? Date.now()) - t0;
            if (Math.abs(esperado - get().elapsedMs) > UMBRAL_DERIVA_MS) {
              void get().forzarSincronizacion(socket, competenciaId);
            }
          })
          .catch(() => undefined);
      }, 10_000);
      const alVisible = () => {
        if (document.visibilityState === 'visible' && get().fase === 'en_curso') {
          void get().forzarSincronizacion(socket, competenciaId);
        }
      };
      document.addEventListener('visibilitychange', alVisible);
      // 5. Re-anclaje periodico silencioso cada 60 s mientras el heat corre:
      // el offset se mantiene fresco y el juez nunca necesita el boton.
      // (60 s, no 30: cada ciclo son ~8 time:sync + 1 resync + 1 REST por
      // juez; con 20 jueces en curso serian 300+ req/min a 30 s.)
      const autoResync = setInterval(() => {
        const { snapshot, fase } = get();
        if (fase !== 'en_curso' || snapshot?.startTimeServer == null) return;
        void get().forzarSincronizacion(socket, competenciaId);
      }, 60_000);
      return () => {
        detenerTick();
        clearInterval(vigilar);
        clearInterval(autoResync);
        document.removeEventListener('visibilitychange', alVisible);
        socket.off('competencia:start', alSnapshot);
        socket.off('connect', alConectar);
        socket.emit('leave-competencia', competenciaId);
      };
    },
  };
});
