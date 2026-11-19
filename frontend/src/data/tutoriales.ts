import {
  Tags,
  Dumbbell,
  UserCheck,
  Users,
  Upload,
  ClipboardList,
  ListChecks,
  Trophy,
  LogIn,
  KeyRound,
  Timer,
  Flag,
  WifiOff,
  User,
  type LucideIcon,
} from 'lucide-react';
import focos from './focos.json';

/**
 * Contenido de la seccion de ayuda.
 *
 * El texto sale de MANUAL_USUARIO.md: si el manual cambia, este archivo se
 * actualiza con el. Las capturas y los GIF viven en `public/ayuda/` y los
 * regenera el script de grabacion, asi que aqui solo se referencian por ruta.
 */

export type RolTutorial = 'admin' | 'juez' | 'participante';

export interface PasoTutorial {
  titulo: string;
  detalle: string;
  /** Captura del paso. Si el archivo no existe, el paso se muestra sin imagen. */
  imagen?: string;
  /** Aviso destacado bajo el paso, para lo que no conviene pasar por alto. */
  aviso?: string;
  /**
   * Donde se hace clic, en porcentaje del ancho y el alto de la captura.
   * Los pasos que solo ensenan el resultado de una accion no lo llevan.
   */
  foco?: { x: number; y: number };
}

export interface Tutorial {
  slug: string;
  titulo: string;
  resumen: string;
  rol: RolTutorial;
  icono: LucideIcon;
  /** Enlace directo a la pantalla que explica el tutorial. */
  ruta?: string;
  /** Animacion del flujo completo, montada a partir de las capturas. */
  gif?: string;
  pasos: PasoTutorial[];
}

/**
 * Ruta de la captura de un paso, con el numero a dos digitos.
 *
 * Van en JPEG: son fotos de pantalla con degradados, y en PNG pesaban tres
 * veces mas sin verse mejor.
 */
function captura(slug: string, n: number): string {
  return `/ayuda/${slug}/paso-${String(n).padStart(2, '0')}.jpg`;
}

/**
 * Punto de clic del paso, pasado de pixeles de la captura a porcentaje para
 * que siga cuadrando cuando la imagen se escala en pantalla.
 */
function foco(slug: string, n: number): { x: number; y: number } | undefined {
  const punto = (focos.puntos as Record<string, Record<string, number[]>>)[slug]?.[String(n)];
  if (!punto) return undefined;
  return {
    x: (punto[0] / focos.base.ancho) * 100,
    y: (punto[1] / focos.base.alto) * 100,
  };
}

/** Completa `imagen`, `foco` y `gif` siguiendo la convencion de public/ayuda. */
function conMedia(t: Omit<Tutorial, 'gif'>): Tutorial {
  return {
    ...t,
    gif: `/ayuda/${t.slug}.gif`,
    pasos: t.pasos.map((paso, i) => ({
      ...paso,
      imagen: paso.imagen ?? captura(t.slug, i + 1),
      foco: paso.foco ?? foco(t.slug, i + 1),
    })),
  };
}

export const TUTORIALES: Tutorial[] = [
  /* ---------------------------------------------------------------- */
  /* Administrador                                                     */
  /* ---------------------------------------------------------------- */
  conMedia({
    slug: 'entrar-y-cambiar-password',
    titulo: 'Entrar y cambiar la contraseña temporal',
    resumen:
      'El primer ingreso de administradores y jueces obliga a definir una contraseña propia.',
    rol: 'admin',
    icono: LogIn,
    ruta: '/login',
    pasos: [
      {
        titulo: 'Abre la pantalla de acceso',
        detalle:
          'Hay dos pestañas: «Admin / Juez», que pide cédula y contraseña, y «Atleta», que pide cédula y fecha de nacimiento. Para ver la clasificación no hace falta entrar: el enlace «Ver clasificación en vivo» lleva directo a la pantalla pública.',
      },
      {
        titulo: 'Escribe tu cédula y tu contraseña',
        detalle:
          'Administradores y jueces entran por la pestaña «Admin / Juez» con la contraseña que les entregó el organizador.',
      },
      {
        titulo: 'Define tu contraseña definitiva',
        detalle:
          'La primera vez, el sistema pide cambiar la contraseña temporal. La nueva debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial. Los requisitos se marcan en verde a medida que los cumples.',
        aviso:
          'No se puede saltar este paso escribiendo otra dirección a mano: hasta que la cambies, la aplicación vuelve siempre aquí.',
      },
    ],
  }),

  conMedia({
    slug: 'crear-categorias',
    titulo: 'Crear las categorías de participación',
    resumen: 'Lo primero de todo: definen el tipo de participación y los elementos que se miden.',
    rol: 'admin',
    icono: Tags,
    ruta: '/admin/categorias',
    pasos: [
      {
        titulo: 'Entra en Categorías y haz clic en «Nueva categoría»',
        detalle:
          'El orden de preparación importa: primero las categorías, luego la competencia, después los jueces y los atletas y, al final, las asignaciones.',
      },
      {
        titulo: 'Escribe el nombre y elige el género',
        detalle:
          'El nombre es el que verán jueces y público (Rx, Scaled, Elite…). El género es obligatorio: Masculino o Femenino.',
      },
      {
        titulo: 'Elige el tipo de participación',
        detalle:
          'Individual (un atleta por sí solo, la más común), Escalado (mismo evento con opciones facilitadas: pesos menores, distancias reducidas), Duplas (dos atletas comparten el mismo resultado) o Equipos (grupos de tres o más).',
      },
      {
        titulo: 'Define los elementos de medición',
        detalle:
          'Si la competencia mide peso (barra, mancuerna…), distancia (carrera, remo…), repeticiones (flexiones, sentadillas…) o calorías (remo, bici…), aquí defines qué valores están disponibles. Por ejemplo, la categoría RX Femenino con barras de 20 kg y 15 kg, remo de 500 m y 1000 m, y series de 10 y 20 calorías.',
        aviso:
          'Los elementos de medición son informativos: aparecen en la clasificación para que jueces y público entiendan qué se está midiendo.',
      },
      {
        titulo: 'Guarda la categoría',
        detalle:
          'Queda disponible al inscribir atletas y se muestra junto a su nombre en la clasificación.',
      },
    ],
  }),

  conMedia({
    slug: 'crear-competencia',
    titulo: 'Crear una competencia con sus wods',
    resumen: 'La competencia es la prueba; cada WOD es un ejercicio que se mide por separado.',
    rol: 'admin',
    icono: Dumbbell,
    ruta: '/admin/competencias',
    pasos: [
      {
        titulo: 'Entra en Competencias y haz clic en «Nueva competencia»',
        detalle: 'La lista muestra todos las competencias del evento con su estado.',
      },
      {
        titulo: 'Elige el formato y completa los datos',
        detalle:
          'Arriba se decide el formato: AMRAP (varios ejercicios con repeticiones, el juez anota rondas y repeticiones parciales) o WOD / HYROX (estaciones fijas con vueltas mínimas y un tiempo límite total). Debajo van el nombre y la descripción, que son lo que verán jueces y público, el tipo de participación y el time cap en minutos (0 = sin tope).',
      },
      {
        titulo: 'Elige el estado y cómo se publica',
        detalle:
          'Estado: Borrador no aparece ni en la pantalla pública ni para los jueces; Activo está en curso y visible para todos; Finalizado sigue visible, pero marcado como terminado. Al lado se elige el tipo de flujo (en serie o en paralelo), cuándo se publican los resultados y las divisiones, que agrupan la clasificación por Rx, Scaled, Master…',
      },
      {
        titulo: 'Añade los WODs',
        detalle:
          'Uno por cada ejercicio que se mide por separado. De cada uno defines el ejercicio (el nombre que verá el juez, por ejemplo «500m Row»), la medición (Tiempo, donde gana el menor; o Repeticiones, Peso, Distancia y Calorías, donde gana el mayor), el puntaje máximo (los puntos del primer puesto: con 100, el 1.º obtiene 100, el 2.º 99, y así) y la duración estimada, que es solo informativa.',
      },
      {
        titulo: 'Añade y ordena los demás wods',
        detalle:
          'El botón «Añadir» crea otro WOD y las flechas ↑ ↓ los reordenan. El orden de la lista es el orden del evento.',
      },
      {
        titulo: 'Guarda la competencia',
        detalle: 'Puedes editarlo más tarde y añadir o quitar wods mientras no tengan mediciones.',
        aviso:
          'No se puede borrar un WOD que ya tenga mediciones. Antes hay que resetearlas desde «Resultados».',
      },
    ],
  }),

  conMedia({
    slug: 'alta-jueces',
    titulo: 'Crear las cuentas de los jueces',
    resumen: 'Al guardar aparece una contraseña temporal que solo se muestra una vez.',
    rol: 'admin',
    icono: UserCheck,
    ruta: '/admin/jueces',
    pasos: [
      {
        titulo: 'Entra en Jueces y haz clic en «Nuevo juez»',
        detalle:
          'La lista muestra los jueces ya registrados y permite buscarlos por nombre o cédula.',
      },
      {
        titulo: 'Completa sus datos',
        detalle: 'Nombre, apellidos, cédula y box. La cédula es lo que usará para entrar.',
      },
      {
        titulo: 'Copia la contraseña temporal',
        detalle:
          'Al guardar, la aplicación muestra una contraseña temporal. Entrégasela al juez: él definirá la suya la primera vez que entre.',
        aviso:
          'Anótala o cópiala en ese momento: no se vuelve a mostrar. Si se pierde, hay que borrar el juez y crearlo otra vez, y con él se pierden sus asignaciones.',
      },
    ],
  }),

  conMedia({
    slug: 'inscribir-atletas',
    titulo: 'Inscribir a los atletas',
    resumen: 'La fecha de nacimiento del atleta es su contraseña: tiene que estar bien puesta.',
    rol: 'admin',
    icono: Users,
    ruta: '/admin/participantes',
    pasos: [
      {
        titulo: 'Entra en Participantes y haz clic en «Nuevo atleta»',
        detalle: 'El buscador de la lista filtra por nombre, cédula, box o categoría.',
      },
      {
        titulo: 'Completa sus datos',
        detalle:
          'Nombre, apellidos, cédula, fecha de nacimiento, box y correo electrónico. La categoría (RX Masculino, Scaled Femenino…) agrupa al atleta en la clasificación y en la propia lista de atletas.',
        aviso:
          'La fecha de nacimiento es la contraseña con la que el atleta entra a ver sus resultados. Un dato mal escrito lo deja fuera.',
      },
      {
        titulo: 'Guarda y revisa la lista',
        detalle:
          'El atleta ya existe, pero todavía no compite: hace falta asignarlo a una competencia.',
      },
    ],
  }),

  conMedia({
    slug: 'carga-masiva',
    titulo: 'Cargar atletas y jueces en bloque',
    resumen:
      'Un CSV para inscribir a muchas personas de una sola vez, sin escribirlas una por una.',
    rol: 'admin',
    icono: Upload,
    ruta: '/admin/carga-masiva',
    pasos: [
      {
        titulo: 'Entra en Carga masiva y descarga una plantilla',
        detalle:
          'Las instrucciones de la pantalla llevan las columnas exactas. Para atletas: tipo, nombre, apellidos, cedula, box, fecha_nacimiento, email y categoria. Para jueces basta con tipo, nombre, apellidos, cedula y box. Hay dos plantillas listas: «solo atletas» y «atletas + jueces».',
      },
      {
        titulo: 'Prepara el archivo y selecciónalo',
        detalle:
          'Una fila por persona. La columna tipo dice si es «atleta» o «juez»; si se omite, se asume atleta. Al elegir el archivo, la pantalla muestra su nombre y su tamaño antes de importar nada.',
        aviso:
          'Las cédulas duplicadas se omiten con error: no se sobrescribe a nadie que ya exista.',
      },
      {
        titulo: 'Importa y revisa el resultado',
        detalle:
          'El resumen indica el total de filas, cuántas entraron y cuántas fallaron, con el motivo de cada rechazo para que las corrijas y las vuelvas a subir. Si el archivo traía jueces, debajo aparecen sus contraseñas temporales.',
        aviso:
          'Esas contraseñas solo se muestran una vez. Cópialas antes de salir de la pantalla o habrá que volver a crear a esos jueces.',
      },
    ],
  }),

  conMedia({
    slug: 'asignaciones',
    titulo: 'Asignar jueces y atletas a una competencia',
    resumen: 'Sin asignación, ni el juez ve al atleta ni el atleta aparece en la clasificación.',
    rol: 'admin',
    icono: ClipboardList,
    ruta: '/admin/asignaciones',
    pasos: [
      {
        titulo: 'Entra en Asignaciones y elige la competencia',
        detalle: 'Cada competencia tiene sus propias asignaciones.',
      },
      {
        titulo: 'Elige el WOD a asignar',
        detalle:
          '«Todos los WODs» es el modo competencia seguida: el mismo juez acompaña al atleta por todas las estaciones. También puedes asignar un WOD concreto y repartir a los jueces estación por estación.',
      },
      {
        titulo: 'Marca los jueces y los atletas',
        detalle:
          'Solo hay dos combinaciones válidas: un único juez para varios atletas, o la misma cantidad de jueces que de atletas, que se emparejan en orden. Si marcas dos jueces y cinco atletas, la aplicación no deja continuar.',
      },
      {
        titulo: 'Revisa las parejas y haz clic en «Asignar»',
        detalle:
          'Antes de guardar aparece la lista de parejas que se van a crear, numeradas. Si algo no coincide, cambia la selección y la lista se recalcula.',
      },
      {
        titulo: 'Revisa las asignaciones actuales',
        detalle:
          'Debajo queda la lista de vínculos con el juez de cada atleta y una papelera para deshacerlos uno a uno. Puedes seguir asignando personas durante el evento: la pantalla de clasificación se actualiza sola, sin recargar.',
        aviso:
          'Un atleta no aparece en la clasificación hasta que está asignado. Si falta alguien, casi siempre es esto.',
      },
    ],
  }),

  conMedia({
    slug: 'corregir-resultados',
    titulo: 'Corregir una medición equivocada',
    resumen: 'Es la única forma de arreglar un error: los jueces no pueden sobrescribir.',
    rol: 'admin',
    icono: ListChecks,
    ruta: '/admin/resultados',
    pasos: [
      {
        titulo: 'Entra en Resultados y elige la competencia',
        detalle:
          'Verás los WODs de la competencia con las mediciones registradas hasta el momento.',
      },
      {
        titulo: 'Despliega el WOD',
        detalle:
          'Dentro aparece cada atleta agrupado por categoría, con su marca, los puntos que obtuvo y los abandonos marcados como DNF en rojo.',
      },
      {
        titulo: 'Haz clic en el botón ↺ del atleta y confirma',
        detalle:
          'La ventana dice a quién se le va a borrar la medición. Al confirmar, el juez puede volver a tomarla y la clasificación se recalcula al instante.',
      },
      {
        titulo: 'La medición desaparece de la lista',
        detalle:
          'El aviso verde confirma el reseteo y el contador de mediciones del WOD baja en uno.',
        aviso:
          'Resetear una medición es también lo que hay que hacer antes de poder borrar un WOD que ya tenga resultados.',
      },
    ],
  }),

  conMedia({
    slug: 'clasificacion-en-vivo',
    titulo: 'Proyectar la clasificación en vivo',
    resumen: 'La pantalla pública del evento: se actualiza sola y no pide contraseña.',
    rol: 'admin',
    icono: Trophy,
    ruta: '/leaderboard',
    pasos: [
      {
        titulo: 'Abre la portada y elige el evento',
        detalle:
          'La pantalla pública lista todas los eventos agrupadas por fecha: primero las que están en curso, luego las próximas y, plegadas al final, las pasadas. No pide contraseña, así que la puedes compartir con quien quieras.',
      },
      {
        titulo: 'Elige la competencia',
        detalle:
          'Dentro del evento están sus Competencias con el número de wods y las categorías que compiten. Los que siguen en borrador no aparecen aquí.',
      },
      {
        titulo: 'Sigue la clasificación',
        detalle: 'Se actualiza cada vez que un juez guarda una medición: no hay que recargar nada.',
      },
      {
        titulo: 'Lee los dos paneles',
        detalle:
          'El panel izquierdo es la clasificación general de la categoría elegida. El derecho muestra un WOD cada vez y va rotando solo; «Pausar rotación» lo detiene en el que estés viendo. Las etiquetas de categorías de arriba filtran la general, y «Rotar categorías» las va pasando solas. Las flechas verdes y rojas indican quién subió o bajó desde la última actualización.',
      },
      {
        titulo: 'Usa la pantalla completa para proyectar',
        detalle:
          'El botón de la esquina superior derecha oculta la cabecera. Para dejarla fija en la pantalla del evento, copia la dirección (por ejemplo …/leaderboard/1) y ábrela directamente en ese equipo.',
        aviso:
          'Si la etiqueta de la esquina dice «Sin tiempo real» o «Reconectando», hay un problema de red: los datos siguen siendo correctos al recargar, solo se pierde la actualización automática.',
      },
    ],
  }),

  /* ---------------------------------------------------------------- */
  /* Juez                                                              */
  /* ---------------------------------------------------------------- */
  conMedia({
    slug: 'juez-registrar-medicion',
    titulo: 'Registrar una medición',
    resumen: 'El flujo completo del juez: Competencia, WOD, atleta, cronómetro y guardado.',
    rol: 'juez',
    icono: Timer,
    ruta: '/juez',
    pasos: [
      {
        titulo: 'Elige la competencia',
        detalle: 'Solo aparecen las competencias en los que tienes al menos un atleta asignado.',
      },
      {
        titulo: 'Elige el WOD',
        detalle: 'Cada WOD se mide por separado y tiene su propio tipo de medición.',
      },
      {
        titulo: 'Busca al atleta por su cédula',
        detalle:
          'Antes de dejarte continuar, el sistema verifica que el atleta no tenga ya una medición en ese WOD y que otro juez no lo esté midiendo en ese momento. Si alguna falla, te lo dice y no deja seguir.',
      },
      {
        titulo: 'Repasa las comprobaciones previas',
        detalle:
          'Antes de arrancar hay una lista de verificación: peso de la barra, alturas y mediciones, cámara colocada y atleta en posición de inicio. El contador de la esquina (0/4) indica cuántas llevas marcadas.',
      },
      {
        titulo: 'Cronometra',
        detalle:
          'Botones «Iniciar» y «Detener»; el botón ↺ pone el cronómetro a cero. La pantalla no se apaga mientras corre. Con el reloj en marcha aparecen además «No-rep +5s», que suma la penalización sin detenerlo, «Vuelta» para marcar parciales y «Desempate».',
      },
      {
        titulo: 'Revisa el resultado en firme',
        detalle:
          'Al detener el cronómetro, la marca queda fijada debajo como «Resultado en firme» y se activa el botón de enviar. El formato de tiempo es MM:SS.CS; para más de una hora, minutos por encima de 60, como 75:30. En repeticiones, peso, distancia y calorías se anota solo el número, sin unidad.',
      },
      {
        titulo: 'Envía el resultado',
        detalle:
          'El teléfono vibra al confirmar y la pantalla vuelve a la lista de wods, lista para el siguiente atleta.',
        aviso:
          'Una medición guardada no se puede sobrescribir. Para corregirla, avisa al administrador: él la resetea desde «Resultados».',
      },
    ],
  }),

  conMedia({
    slug: 'juez-abandono',
    titulo: 'Registrar un abandono (DNF)',
    resumen: 'Cuando el atleta se retira por lesión o por salud.',
    rol: 'juez',
    icono: Flag,
    ruta: '/juez',
    pasos: [
      {
        titulo: 'Busca al atleta como en una medición normal',
        detalle: 'El abandono se registra desde la misma pantalla de medición, con su cédula.',
      },
      {
        titulo: 'Toca «Registrar abandono (lesión o salud)»',
        detalle:
          'Es el botón rojo del final, debajo de «Enviar resultado». No hace falta haber iniciado el cronómetro ni completar las comprobaciones previas.',
      },
      {
        titulo: 'Confirma',
        detalle:
          'La ventana dice a quién se va a registrar como DNF. El atleta queda último en ese WOD, con 0 puntos.',
        aviso: 'Pide confirmación porque solo un administrador puede deshacerlo.',
      },
      {
        titulo: 'La pantalla vuelve a los WODs',
        detalle: 'Igual que tras una medición normal, lista para el siguiente atleta.',
      },
    ],
  }),

  conMedia({
    slug: 'juez-sin-conexion',
    titulo: 'Seguir midiendo sin conexión',
    resumen: 'Si se cae la red, los resultados se guardan en el teléfono y se envían solos.',
    rol: 'juez',
    icono: WifiOff,
    ruta: '/juez',
    pasos: [
      {
        titulo: 'Reconoce el aviso rojo',
        detalle:
          'Aparece abajo en cuanto se pierde la conexión, y la etiqueta de la cabecera pasa a «Sin conexión». Puedes seguir midiendo con normalidad: la búsqueda del atleta y el guardado siguen funcionando.',
      },
      {
        titulo: 'Revisa el aviso amarillo',
        detalle:
          'Indica cuántos resultados quedan por enviar. Mientras no haya red solo informa; en cuanto vuelve la señal aparece junto a él el enlace «Enviar ahora», que fuerza el intento sin esperar.',
      },
      {
        titulo: 'Espera a que se vacíe la cola',
        detalle:
          'Al recuperar la señal los resultados salen solos, el aviso amarillo desaparece y la etiqueta vuelve a «En vivo».',
        aviso:
          'No cierres la sesión ni borres los datos del navegador mientras haya resultados pendientes: se perderían.',
      },
    ],
  }),

  /* ---------------------------------------------------------------- */
  /* Atleta                                                            */
  /* ---------------------------------------------------------------- */
  conMedia({
    slug: 'atleta-entrar',
    titulo: 'Entrar como atleta',
    resumen: 'Cédula y fecha de nacimiento; no hay contraseña que recordar.',
    rol: 'participante',
    icono: KeyRound,
    ruta: '/login',
    pasos: [
      {
        titulo: 'Abre la pestaña «Atleta» de la pantalla de acceso',
        detalle: 'Es la segunda pestaña, junto a «Admin / Juez».',
      },
      {
        titulo: 'Escribe tu cédula y tu fecha de nacimiento',
        detalle:
          'La fecha de nacimiento hace de contraseña. Es la que registró el organizador al inscribirte.',
        aviso:
          'Si no te deja entrar, pide al organizador que revise tu fecha de nacimiento en «Participantes».',
      },
    ],
  }),

  conMedia({
    slug: 'atleta-mis-resultados',
    titulo: 'Consultar mis resultados',
    resumen: 'Tu posición en cada competencia y el detalle WOD a WOD.',
    rol: 'participante',
    icono: User,
    ruta: '/participante',
    pasos: [
      {
        titulo: 'Mira tu posición y tus marcas',
        detalle:
          'Arriba, una tarjeta por Competencia con tu puesto, cuántos atletas compiten y los puntos acumulados. Debajo, el detalle WOD a WOD: tu marca y los puntos que te dio cada una. Van apareciendo conforme los jueces las registran, sin recargar.',
      },
      {
        titulo: 'Abre la clasificación completa',
        detalle:
          'El enlace «Ver clasificación» de cada competencia lleva a la pantalla pública: a la izquierda la general de tu categoría y a la derecha los resultados WOD a WOD, con los DNF marcados en rojo.',
      },
    ],
  }),
];

export const ETIQUETA_ROL: Record<RolTutorial, string> = {
  admin: 'Administrador',
  juez: 'Juez',
  participante: 'Atleta',
};

export interface PreguntaFrecuente {
  pregunta: string;
  respuesta: string;
}

export const PREGUNTAS_FRECUENTES: PreguntaFrecuente[] = [
  {
    pregunta: 'Un atleta no aparece en la clasificación.',
    respuesta:
      'No está asignado a esa competencia. Ve a «Asignaciones», elige la competencia y añádelo.',
  },
  {
    pregunta: 'Un juez no ve ningún Competencia.',
    respuesta:
      'No tiene asignaciones. Un juez solo ve las competencias en los que se le asignó al menos un atleta.',
  },
  {
    pregunta: 'Dos atletas tienen los mismos puntos.',
    respuesta:
      'Es correcto: los empates comparten posición y puntos. Si dos empatan en 1.º, el siguiente es 3.º. En el total, el empate se resuelve por el WOD de desempate de la competencia o, si no hay, por la mejor posición individual.',
  },
  {
    pregunta: 'La clasificación no se mueve.',
    respuesta:
      'Mira la etiqueta de la esquina superior derecha: si dice «Sin tiempo real» o «Reconectando», hay un problema de red. Los datos siguen siendo correctos al recargar; solo se pierde la actualización automática.',
  },
  {
    pregunta: 'Me equivoqué al anotar un resultado.',
    respuesta: 'El administrador lo resetea desde «Resultados» y el juez lo vuelve a tomar.',
  },
  {
    pregunta: 'Olvidé la contraseña de un juez.',
    respuesta:
      'Bórralo y créalo de nuevo: se generará una contraseña temporal nueva. Ojo: al borrarlo se pierden sus asignaciones y hay que rehacerlas.',
  },
];
