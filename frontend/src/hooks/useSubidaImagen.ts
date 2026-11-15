import { useEffect, useRef, useState } from 'react';
import api, { mensajeDeError } from '../api/client';

export const TIPOS_VALIDOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_MB_IMAGEN = 5;

/** Valida tipo y tamaño. Devuelve el mensaje de error, o null si vale. */
export function validarArchivoImagen(archivo: File): string | null {
  if (!TIPOS_VALIDOS_IMAGEN.includes(archivo.type)) {
    return 'Solo se admiten imágenes JPG, PNG o WebP';
  }
  if (archivo.size > MAX_MB_IMAGEN * 1024 * 1024) {
    return `La imagen supera los ${MAX_MB_IMAGEN} MB`;
  }
  return null;
}

/** Vista previa temporal de un archivo seleccionado (se revoca sola). */
export function useVistaPrevia(archivo: File | null): string | null {
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  useEffect(() => {
    if (!archivo) {
      setVistaPrevia(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  return vistaPrevia;
}

export interface PersistenciaImagen {
  /** Lee el estado actual: URL y título para los textos. */
  cargar: () => Promise<{ url: string | null; titulo: string }>;
  /** Sube el archivo y devuelve la URL final (o null). */
  guardar: (archivo: File) => Promise<string | null>;
  /** Elimina la imagen actual. */
  quitar: () => Promise<void>;
}

/**
 * Máquina de subida de imagen compartida (portada de evento, portada de
 * competencia): validación, vista previa, guardar y quitar idénticos; solo
 * cambia la persistencia inyectada. Sin lógica visual: el JSX queda en cada
 * componente.
 */
export function useSubidaImagen(persistencia: PersistenciaImagen) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const vistaPrevia = useVistaPrevia(seleccion);
  const refPersistencia = useRef(persistencia);
  refPersistencia.current = persistencia;

  useEffect(() => {
    refPersistencia.current
      .cargar()
      .then((res) => {
        setImagenUrl(res.url);
        setTitulo(res.titulo);
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la imagen')))
      .finally(() => setCargando(false));
    // Solo al montar: la persistencia se lee por ref para no recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;
    setError('');
    setExito('');
    if (!archivo) {
      setSeleccion(null);
      return;
    }
    const fallo = validarArchivoImagen(archivo);
    if (fallo) {
      setError(fallo);
      setSeleccion(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setSeleccion(archivo);
  }

  async function guardar() {
    if (!seleccion) return;
    setGuardando(true);
    setError('');
    setExito('');
    try {
      const url = await refPersistencia.current.guardar(seleccion);
      setImagenUrl(url);
      setSeleccion(null);
      if (inputRef.current) inputRef.current.value = '';
      setExito('Imagen actualizada');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo subir la imagen'));
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    setEliminando(true);
    setError('');
    setExito('');
    try {
      await refPersistencia.current.quitar();
      setImagenUrl(null);
      setExito('Imagen eliminada');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar la imagen'));
    } finally {
      setEliminando(false);
    }
  }

  return {
    inputRef,
    imagenUrl,
    titulo,
    cargando,
    seleccion,
    vistaPrevia,
    guardando,
    eliminando,
    error,
    exito,
    setError,
    setExito,
    onElegir,
    guardar,
    quitar,
  };
}

/** Subida de un archivo a un endpoint multipart que devuelve `{imagen_url}`. */
export async function subirArchivoImagen(
  endpoint: string,
  archivo: File,
  metodo: 'post' | 'put' = 'post'
): Promise<string | null> {
  const datos = new FormData();
  datos.append('imagen', archivo);
  const res =
    metodo === 'put'
      ? await api.put<{ imagen_url: string | null }>(endpoint, datos, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      : await api.post<{ imagen_url: string | null }>(endpoint, datos, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
  return res.data.imagen_url;
}
