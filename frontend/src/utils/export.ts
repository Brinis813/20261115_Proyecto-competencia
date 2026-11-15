import {
  formatearValor,
  unidadDeWod,
  type Asignacion,
  type Juez,
  type LeaderboardWod,
  type LeaderboardEntry,
  type Participante,
  type ResultadoFila,
} from '../types';

/**
 * Exportación de resultados (CSV para Excel + datos del informe final).
 *
 * Todo se genera en el cliente a partir de los endpoints que ya existen
 * (resultados por Competencia, asignaciones, jueces, atletas y leaderboard), así que
 * no hace falta nada nuevo en el backend. El CSV lleva BOM para que Excel
 * abra bien los acentos.
 */

/**
 * Escapa una celda: comillas dobles si contiene separador, comilla o salto.
 * Además neutraliza inyección CSV (fórmulas Excel): celdas que empiezan por
 * `=`, `+`, `-`, `@`, tab o salto se prefijan con `'` para que Excel las
 * trate como texto (OWASP: CSV Injection).
 */
export function escaparCSV(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const neutro = /^[=+\-@\t\r\n]/.test(texto) ? `'${texto}` : texto;
  return /[",;\n\r]/.test(neutro) ? `"${neutro.replace(/"/g, '""')}"` : neutro;
}

/** Une filas en texto CSV (con BOM para que Excel abra bien los acentos). */
export function csvTexto(filas: unknown[][]): string {
  const BOM = String.fromCharCode(0xfeff);
  return BOM + filas.map((f) => f.map(escaparCSV).join(',')).join('\r\n');
}

/** Descarga un texto como archivo. */
export function descargarTexto(nombre: string, texto: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([texto], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo con fecha y hora: base_20260917_0930.csv */
export function nombreArchivo(base: string, extension: string): string {
  const ahora = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}`;
  const hora = `${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
  const limpio = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'informe';
  return `${limpio}_${fecha}_${hora}.${extension}`;
}

/** Estado legible de una medición. */
export function textoEstado(fila: Pick<ResultadoFila, 'abandono' | 'capado'>): string {
  if (fila.abandono) return 'DNF';
  if (fila.capado) return 'No terminó (CAP)';
  return 'Finalizado';
}

/** Juez de una medición según las asignaciones (exacta por WOD, si no la general). */
export function juezDeMedicion(
  asignaciones: Asignacion[],
  participanteId: number,
  wodId: number
): string {
  const exacta = asignaciones.find(
    (a) => a.participante_id === participanteId && a.wod_id === wodId
  );
  const general = asignaciones.find(
    (a) => a.participante_id === participanteId && a.wod_id == null
  );
  const elegida = exacta ?? general;
  if (!elegida?.Usuario) return '';
  return `${elegida.Usuario.nombre} ${elegida.Usuario.apellidos}`.trim();
}

export function mapaBoxAtletas(participantes: Participante[]): Map<number, string> {
  return new Map(participantes.map((p) => [p.id, p.box ?? '']));
}

const CABECERA_RESULTADOS = [
  'Competencia',
  'Wod',
  'Ejercicio',
  'Medición',
  'Atleta',
  'Cédula',
  'Box',
  'Categoría',
  'Marca',
  'Puntos',
  'Estado',
  'Juez',
  'Registrado',
];

/** Filas de mediciones de una competencia, ordenadas por WOD y puntos. */
export function filasResultadosCompetencia(
  competenciaNombre: string,
  wods: LeaderboardWod[],
  filas: ResultadoFila[],
  asignaciones: Asignacion[],
  boxPorAtleta: Map<number, string>
): unknown[][] {
  const wodPorId = new Map(wods.map((c) => [c.id, c]));
  const ordenadas = [...filas].sort((a, b) => {
    const oa = wodPorId.get(a.wod_id)?.orden ?? 0;
    const ob = wodPorId.get(b.wod_id)?.orden ?? 0;
    if (oa !== ob) return oa - ob;
    return b.puntos_calculados - a.puntos_calculados;
  });

  return ordenadas.map((f) => {
    const wod = wodPorId.get(f.wod_id);
    return [
      competenciaNombre,
      wod?.orden ?? '',
      wod?.nombre_ejercicio ?? '',
      wod?.tipo_medicion ?? '',
      `${f.nombre} ${f.apellidos}`.trim(),
      f.cedula,
      boxPorAtleta.get(f.participante_id) ?? '',
      f.categoria ?? '',
      formatearValor(f.valor_bruto, wod?.tipo_medicion ?? 'repeticiones', f.abandono, f.capado, unidadDeWod(wod)),
      f.puntos_calculados,
      textoEstado(f),
      juezDeMedicion(asignaciones, f.participante_id, f.wod_id),
      f.timestamp_servidor ?? '',
    ];
  });
}

/** CSV de las mediciones de una competencia (botón en Resultados). */
export function csvResultadosCompetencia(
  competenciaNombre: string,
  wods: LeaderboardWod[],
  filas: ResultadoFila[],
  asignaciones: Asignacion[],
  participantes: Participante[]
): string {
  return csvTexto([
    CABECERA_RESULTADOS,
    ...filasResultadosCompetencia(competenciaNombre, wods, filas, asignaciones, mapaBoxAtletas(participantes)),
  ]);
}

export interface DatosInforme {
  evento: { nombre: string; sede?: string | null; fecha_inicio?: string; fecha_fin?: string };
  competencias: Array<{ id: number; nombre: string }>;
  wodsPorCompetencia: Map<number, LeaderboardWod[]>;
  filasPorCompetencia: Map<number, ResultadoFila[]>;
  asignacionesPorCompetencia: Map<number, Asignacion[]>;
  jueces: Juez[];
  participantes: Participante[];
  general: LeaderboardEntry[] | null;
  clasificacionPorCompetencia: Map<number, LeaderboardEntry[]>;
}

/** CSV del informe final del evento, por secciones. */
export function csvInformeEvento(datos: DatosInforme): string {
  const filas: unknown[][] = [];
  const seccion = (titulo: string) => {
    if (filas.length > 0) filas.push([]);
    filas.push([titulo]);
  };

  const boxPorAtleta = mapaBoxAtletas(datos.participantes);

  seccion('INFORME FINAL');
  filas.push(['Evento', datos.evento.nombre]);
  filas.push(['Sede', datos.evento.sede ?? '']);
  filas.push(['Desde', datos.evento.fecha_inicio ?? '']);
  filas.push(['Hasta', datos.evento.fecha_fin ?? '']);
  filas.push(['Exportado el', new Date().toLocaleString()]);

  if (datos.general && datos.general.length > 0) {
    seccion('CLASIFICACIÓN GENERAL');
    filas.push(['Puesto', 'Atleta', 'Cédula', 'Box', 'Categoría', 'Puntos', 'Empate']);
    for (const e of datos.general) {
      filas.push([
        e.puesto,
        `${e.nombre} ${e.apellidos}`.trim(),
        e.cedula,
        e.box ?? '',
        e.categoria ?? '',
        e.puntos_total,
        e.comparte_puesto ? 'Sí' : 'No',
      ]);
    }
  }

  for (const competencia of datos.competencias) {
    const clasificacion = datos.clasificacionPorCompetencia.get(competencia.id) ?? [];
    if (clasificacion.length > 0) {
      seccion(`CLASIFICACIÓN · ${competencia.nombre}`);
      filas.push(['Puesto', 'Atleta', 'Cédula', 'Box', 'Categoría', 'Puntos', 'Empate']);
      for (const e of clasificacion) {
        filas.push([
          e.puesto,
          `${e.nombre} ${e.apellidos}`.trim(),
          e.cedula,
          e.box ?? '',
          e.categoria ?? '',
          e.puntos_total,
          e.comparte_puesto ? 'Sí' : 'No',
        ]);
      }
    }

    seccion(`RESULTADOS · ${competencia.nombre}`);
    filas.push(CABECERA_RESULTADOS);
    filas.push(
      ...filasResultadosCompetencia(
        competencia.nombre,
        datos.wodsPorCompetencia.get(competencia.id) ?? [],
        datos.filasPorCompetencia.get(competencia.id) ?? [],
        datos.asignacionesPorCompetencia.get(competencia.id) ?? [],
        boxPorAtleta
      )
    );
  }

  seccion('JUECES');
  filas.push(['Juez', 'Cédula', 'Box', 'Atletas asignados']);
  const asignadosPorJuez = new Map<number, Set<number>>();
  for (const lista of datos.asignacionesPorCompetencia.values()) {
    for (const a of lista) {
      const set = asignadosPorJuez.get(a.usuario_id) ?? new Set<number>();
      set.add(a.participante_id);
      asignadosPorJuez.set(a.usuario_id, set);
    }
  }
  for (const juez of datos.jueces) {
    filas.push([
      `${juez.nombre} ${juez.apellidos}`.trim(),
      juez.cedula,
      juez.box ?? '',
      asignadosPorJuez.get(juez.id)?.size ?? 0,
    ]);
  }

  seccion('ASIGNACIONES JUEZ - ATLETA');
  filas.push(['Competencia', 'WOD', 'Juez', 'Atleta', 'Cédula atleta']);
  const competenciaPorId = new Map(datos.competencias.map((w) => [w.id, w.nombre]));
  for (const [competenciaId, lista] of datos.asignacionesPorCompetencia) {
    const wods = new Map((datos.wodsPorCompetencia.get(competenciaId) ?? []).map((c) => [c.id, c]));
    const ordenadas = [...lista].sort((a, b) => {
      const oa = a.wod_id == null ? 0 : (wods.get(a.wod_id)?.orden ?? 0);
      const ob = b.wod_id == null ? 0 : (wods.get(b.wod_id)?.orden ?? 0);
      if (oa !== ob) return oa - ob;
      return (a.Participante?.apellidos ?? '').localeCompare(b.Participante?.apellidos ?? '');
    });
    for (const a of ordenadas) {
      const wod = a.wod_id == null ? null : wods.get(a.wod_id);
      filas.push([
        competenciaPorId.get(competenciaId) ?? '',
        wod ? `${wod.orden}. ${wod.nombre_ejercicio}` : 'Todos los WODs',
        a.Usuario ? `${a.Usuario.nombre} ${a.Usuario.apellidos}`.trim() : '',
        a.Participante ? `${a.Participante.nombre} ${a.Participante.apellidos}`.trim() : '',
        a.Participante?.cedula ?? '',
      ]);
    }
  }

  seccion('ATLETAS');
  filas.push(['Atleta', 'Cédula', 'Box', 'Categoría']);
  const atletasOrdenados = [...datos.participantes].sort((a, b) =>
    `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`)
  );
  for (const p of atletasOrdenados) {
    filas.push([`${p.nombre} ${p.apellidos}`.trim(), p.cedula, p.box ?? '', p.categoria ?? '']);
  }

  return csvTexto(filas);
}
