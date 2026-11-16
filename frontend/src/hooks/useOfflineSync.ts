import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';

interface ResultadoPendiente {
  id: string;
  participante_id: number;
  wod_id: number;
  valor_bruto: string;
  abandono: boolean;
  /** No termino antes del tope de tiempo: valor_bruto son las reps hechas. */
  capado?: boolean;
  /** Descalificado (DSQ): 0 puntos, posicion final. */
  disqualificado?: boolean;
  /** Desglose de la medicion guiada (conteos, splits, intentos). */
  detalle?: unknown;
  /** Criterio de desempate dentro del WOD (menor es mejor). */
  desempate?: number | null;
  /** La medicion es el desempate designado de la competencia. */
  es_desempate?: boolean;
  timestamp: string;
  /** Intentos fallidos; tras varios se descarta para no bloquear la cola. */
  intentos?: number;
}

const DB_NAME = 'competition-offline';
const STORE = 'resultados-pendientes';
const MAX_INTENTOS = 5;
// Área 4: throttle del sync offline — intervalo mínimo entre sincronizaciones y
// backoff ante 429, para no saturar MySQL/Socket con reintentos en bucle.
const MIN_INTERVALO_SYNC_MS = 15 * 1000;
const BACKOFF_429_MS = 60 * 1000;

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NAME, 1);
    peticion.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

function comoPromesa<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

/**
 * Cola de resultados que no se pudieron enviar.
 *
 * En un gimnasio la cobertura falla constantemente, asi que las mediciones se
 * guardan en IndexedDB y se reenvian al recuperar la conexion. Un 409 (ya
 * existe medicion) no se reintenta: fallaria siempre y dejaria la cola
 * atascada bloqueando los resultados que si son validos.
 */
export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const sincronizando = useRef(false);
  const ultimoSync = useRef(0);
  const castigo429Hasta = useRef(0);

  const contar = useCallback(async () => {
    try {
      const db = await abrirDB();
      const total = await comoPromesa(db.transaction(STORE, 'readonly').objectStore(STORE).count());
      setPendingCount(total);
    } catch {
      // Navegacion privada o IndexedDB deshabilitado: se sigue sin cola offline.
    }
  }, []);

  const savePending = useCallback(
    async (resultado: Omit<ResultadoPendiente, 'id' | 'timestamp' | 'intentos'>) => {
      const db = await abrirDB();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        ...resultado,
        id: `pendiente-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        intentos: 0,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await contar();
    },
    [contar],
  );

  const syncPending = useCallback(async () => {
    if (!navigator.onLine || sincronizando.current) return;
    // Throttle: ni en cascada de eventos 'online' ni en reintentos manuales.
    const ahora = Date.now();
    if (ahora - ultimoSync.current < MIN_INTERVALO_SYNC_MS) return;
    if (ahora < castigo429Hasta.current) return;
    ultimoSync.current = ahora;
    sincronizando.current = true;
    setIsSyncing(true);

    try {
      const db = await abrirDB();
      const items = await comoPromesa<ResultadoPendiente[]>(
        db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
      );

      for (const item of items) {
        let eliminar = false;

        try {
          await api.post('/results', {
            participante_id: item.participante_id,
            wod_id: item.wod_id,
            valor_bruto: item.valor_bruto,
            abandono: item.abandono,
            capado: item.capado,
            disqualificado: item.disqualificado,
            detalle: item.detalle,
            desempate: item.desempate,
            es_desempate: item.es_desempate,
          });
          eliminar = true;
        } catch (err: any) {
          const estado = err?.response?.status;
          const mensaje = String(err?.response?.data?.message ?? '');
          // 429: backoff — el servidor pidió calma, se respeta 60 s.
          if (estado === 429) castigo429Hasta.current = Date.now() + BACKOFF_429_MS;
          // Conflicto real (ya existe), validacion o permisos: reintentar no ayuda.
          // OJO: el 409 de "heat en pausa" SI es reintentable (tras reanudar
          // entra); solo se descarta el 409 de duplicado.
          eliminar =
            estado === 403 ||
            estado === 404 ||
            estado === 400 ||
            estado === 422 ||
            (estado === 409 && mensaje.includes('ya tiene'));
          if (!eliminar && (item.intentos ?? 0) + 1 >= MAX_INTENTOS) eliminar = true;
        }

        // Cada operacion abre su propia transaccion: las de IndexedDB se
        // cierran solas en cuanto se cede el hilo en un await.
        const tx = db.transaction(STORE, 'readwrite');
        if (eliminar) tx.objectStore(STORE).delete(item.id);
        else tx.objectStore(STORE).put({ ...item, intentos: (item.intentos ?? 0) + 1 });
      }

      await contar();
    } catch {
      // Se reintentara en la siguiente reconexion.
    } finally {
      sincronizando.current = false;
      setIsSyncing(false);
    }
  }, [contar]);

  useEffect(() => {
    contar();
    // Al recuperar la red la cola se vacia sola.
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, [contar, syncPending]);

  return { pendingCount, savePending, syncPending, isSyncing };
}
