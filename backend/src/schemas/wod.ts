import { z } from 'zod';

/**
 * Esquemas Zod de WODs y esquemas de medición guiada (scorecards).
 *
 * Fuente única de validación del payload de Competencias: las rutas
 * (`routes/competencias.ts`) validan con estos esquemas antes de llegar al
 * servicio, que persiste dentro de una transacción Sequelize.
 *
 * Se aceptan los 6 tipos de MEDICIÓN del formulario (incluido
 * `time_trial_splits`); el servicio los normaliza al enum físico de la BD
 * (`tiempo` + `esquema.modalidad = 'time_trial_splits'`).
 */

export const MEDICIONES = [
  'tiempo',
  'repeticiones',
  'peso',
  'distancia',
  'calorías',
  'time_trial_splits',
] as const;

export type MedicionInput = (typeof MEDICIONES)[number];

/** Modalidad de scorecard que cada medición exige en el esquema. */
export const MODALIDAD_DE_MEDICION = {
  tiempo: 'for_time',
  repeticiones: 'amrap',
  peso: 'max_load',
  distancia: null,
  calorías: 'amrap',
  time_trial_splits: 'time_trial_splits',
} as const;

const movimientoSchema = z.object({
  nombre: z.string().trim().min(1, 'El movimiento necesita nombre').max(100),
  // Tipo de medición para este movimiento individual.
  tipo_medicion: z.enum(['tiempo', 'repeticiones', 'peso', 'distancia', 'calorías']).optional(),
  // Puntaje asignado a este movimiento.
  puntaje: z.number().int().min(0).max(10000).optional(),
  // Reps objetivo por división (clave = etiqueta de categoría, ej. "RX Masculino").
  // Acotado a 100 divisiones: sin tope, un payload gigante quema CPU.
  reps: z.record(z.number().int().min(0, 'Las reps no pueden ser negativas').max(100000)).refine(
    (r) => Object.keys(r).length <= 100,
    'Demasiadas divisiones en reps (max 100)'
  ),
  // Carga prescrita por división, con las mismas claves que `reps`.
  // Ausente o 0 = el movimiento no lleva peso (carrera, burpees, remo...).
  peso: z
    .record(z.number().min(0, 'El peso no puede ser negativo').max(5000))
    .refine((r) => Object.keys(r).length <= 100, 'Demasiadas divisiones en peso (max 100)')
    .optional(),
  // Unidad de `peso`. Es del movimiento, no de la división.
  // kg/lb = carga; kcal/cal = meta de energía (WODs por calorías).
  unidad_peso: z.enum(['kg', 'lb', 'kcal', 'cal']).optional(),
  // Para tiempo: duración en segundos.
  duracion_seg: z.number().int().min(0).max(86400).optional(),
  // Para repeticiones: cantidad de repeticiones.
  repeticiones: z.number().int().min(0).max(100000).optional(),
  // Para peso: número de intentos.
  intentos: z.number().int().min(1).max(20).optional(),
  // Para distancia: unidad y valor.
  unidad_distancia: z.enum(['m', 'km', 'mi']).optional(),
  distancia: z.number().min(0).max(100000).optional(),
  // Para calorías: unidad y valor.
  unidad_energia: z.enum(['kcal', 'cal']).optional(),
  calorias: z.number().int().min(0).max(10000).optional(),
});

/**
 * Esquema de medición guiada (opcional por WOD).
 * Opción B: la matriz de métricas por categoría vive aquí —
 * `movimientos[].reps/peso` llevan una entrada por división de la competencia.
 * `movimientos_por_division` permite además listas independientes por categoría
 * (distinto ejercicio, medición y cantidades); prevalece sobre `movimientos`.
 */
type MovimientoValidado = z.infer<typeof movimientoSchema>;
interface ListaMovimientos {
  lista: MovimientoValidado[];
  etiqueta: string;
}
export const esquemaWodSchema = z
  .object({
    modalidad: z.enum(['for_time', 'amrap', 'max_load', 'time_trial_splits']),
    rondas: z.number().int().min(1).max(100).optional(),
    movimientos: z.array(movimientoSchema).min(1).max(30).optional(),
    // Movimientos independientes por división: cada categoría trae su propia
    // lista (distinto ejercicio, medición y cantidades). Prevalece sobre
    // `movimientos` cuando la división del atleta existe aquí.
    movimientos_por_division: z
      .record(z.array(movimientoSchema).min(1).max(30))
      .refine((r) => Object.keys(r).length <= 100, 'Demasiadas divisiones (max 100)')
      .optional(),
    intentos: z.number().int().min(1).max(20).optional(),
    segmentos: z
      .array(
        z.object({
          numero: z.number().int().min(1).optional(),
          nombre: z.string().trim().min(1).max(150),
          tipo: z.enum(['carrera', 'ejercicio', 'transicion']),
          duracion_estimada_ms: z.number().int().min(0).max(86400000),
          distancia: z.string().trim().max(50).optional(),
        })
      )
      .max(50)
      .optional(),
    // Meta de distancia a recorrer, en unidades de `unidad_distancia`
    // (solo WODs de distancia; informativa, no activa scorecard).
    // Número único o matriz por división (etiqueta de categoría).
    distancia_meta: z
      .union([
        z.number().min(0).max(1000000),
        z
          .record(z.number().min(0).max(1000000))
          .refine((r) => Object.keys(r).length <= 100, 'Demasiadas divisiones (max 100)'),
      ])
      .optional(),
  })
  .nullable()
  .optional()
  .superRefine((esquema, ctx) => {
    if (!esquema) return;
    // Integridad del movimiento: cada clave de `peso` debe existir en `reps`
    // (misma división), y los nombres no se repiten dentro del WOD.
    const listas: ListaMovimientos[] = [
      ...(esquema.movimientos ? [{ lista: esquema.movimientos, etiqueta: '' }] : []),
      ...Object.entries(esquema.movimientos_por_division ?? {}).map(([div, lista]) => ({
        lista,
        etiqueta: ` [${div}]`,
      })),
    ];
    for (const { lista, etiqueta } of listas) {
      for (const m of lista) {
        const enReps = new Set(Object.keys(m.reps ?? {}));
        for (const clave of Object.keys(m.peso ?? {})) {
          if (!enReps.has(clave)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `El movimiento "${m.nombre}"${etiqueta} define peso para "${clave}" sin reps en esa división`,
            });
          }
        }
      }
      const nombres = lista.map((m) => m.nombre.trim().toLowerCase());
      if (new Set(nombres).size !== nombres.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Los movimientos del WOD${etiqueta} no pueden repetirse`,
        });
      }
    }
  });

export const wodSchema = z.object({
  id: z.number().int().positive().optional(),
  orden: z.number().int().min(1),
  nombre_ejercicio: z.string().trim().min(1, 'El nombre del ejercicio es obligatorio').max(150),
  // Los 6 tipos del formulario; el servicio normaliza al enum físico.
  tipo_medicion: z.enum(MEDICIONES),
  // Unidad de la marca cuando tipo_medicion=distancia. m = metros, km = kilómetros, mi = millas.
  unidad_distancia: z.enum(['m', 'km', 'mi']).optional(),
  // Foto del WOD (URL devuelta por POST /competencias/wod-imagen). null = sin imagen.
  // Solo ruta interna o http(s): ni `javascript:`, ni `file:`, ni esquemas raros.
  imagen_url: z
    .string()
    .trim()
    .max(500)
    .refine(
      (u) => u === '' || u.startsWith('/api/uploads/') || /^https?:\/\/[^/]+/i.test(u),
      'La imagen debe ser una ruta /api/uploads/ o una URL http(s)'
    )
    .nullable()
    .optional(),
  tiempo_estimado_duracion: z.number().int().min(0).max(86400),
  // Tope de tiempo OPCIONAL por ejercicio, en segundos (0 / ausente = sin tope).
  // La duración general vive en competencias.duracion_minutos; este campo solo
  // se usa cuando un ejercicio concreto necesita su propio tope.
  tiempo_cap: z.number().int().min(0).max(86400).nullable().optional(),
  esquema: esquemaWodSchema,
  puntaje_maximo: z.number().int().min(1).max(10000),
}).superRefine((wod, ctx) => {
  // La meta de distancia solo tiene sentido en WODs de distancia.
  if (wod.esquema?.distancia_meta !== undefined && wod.tipo_medicion !== 'distancia') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La distancia meta solo aplica a ejercicios de distancia',
    });
  }
});

export type WodValidado = z.infer<typeof wodSchema>;
