import { parsearValor, puntuarWod } from '../services/scoringEngine';

/**
 * El motor de puntuacion decide quien gana, asi que sus dos funciones puras
 * se prueban de forma aislada, sin base de datos.
 */

describe('parsearValor', () => {
  it('convierte MM:SS a milisegundos', () => {
    expect(parsearValor('03:20', 'tiempo')).toBe(200_000);
    expect(parsearValor('00:45', 'tiempo')).toBe(45_000);
  });

  it('admite centesimas con punto y con dos puntos', () => {
    expect(parsearValor('03:20.50', 'tiempo')).toBe(200_500);
    expect(parsearValor('03:20:50', 'tiempo')).toBe(200_500);
  });

  it('anota los tiempos de mas de una hora con los minutos por encima de 60', () => {
    // No hay tramo de horas: '01:00:00' seria ambiguo, asi que una hora se
    // escribe como 60 minutos.
    expect(parsearValor('60:00', 'tiempo')).toBe(3_600_000);
    expect(parsearValor('75:30', 'tiempo')).toBe(4_530_000);
  });

  it('acepta la coma decimal', () => {
    expect(parsearValor('03:20,50', 'tiempo')).toBe(200_500);
  });

  it('lee los valores no temporales como numeros', () => {
    expect(parsearValor('120', 'repeticiones')).toBe(120);
    expect(parsearValor('102.5', 'peso')).toBe(102.5);
    expect(parsearValor('500', 'distancia')).toBe(500);
  });

  it('devuelve 0 en lugar de NaN ante un valor corrupto', () => {
    expect(parsearValor('sin datos', 'repeticiones')).toBe(0);
  });
});

describe('puntuarWod', () => {
  const filas = (entradas: Array<[number, string]>, abandonos: number[] = []) =>
    entradas
      .map(([participante_id, valor_bruto]) => ({ participante_id, resultado_id: 0, valor_bruto, abandono: false }))
      .concat(abandonos.map((id) => ({ participante_id: id, resultado_id: 0, valor_bruto: 'ABANDONO', abandono: true })));

  it('en tiempo, gana el menor', () => {
    const resultado = puntuarWod(
      filas([
        [1, '05:00'],
        [2, '03:30'],
        [3, '04:15'],
      ]),
      'tiempo',
      100
    );

    expect(resultado.map((r) => r.participante_id)).toEqual([2, 3, 1]);
    expect(resultado.map((r) => r.puntos)).toEqual([100, 99, 98]);
  });

  it('en repeticiones y peso, gana el mayor', () => {
    const reps = puntuarWod(
      filas([
        [1, '80'],
        [2, '120'],
        [3, '95'],
      ]),
      'repeticiones',
      100
    );

    expect(reps.map((r) => r.participante_id)).toEqual([2, 3, 1]);
    expect(reps[0].puntos).toBe(100);
  });

  it('los empates comparten posicion y puntos', () => {
    const resultado = puntuarWod(
      filas([
        [1, '04:00'],
        [2, '04:00'],
        [3, '05:00'],
      ]),
      'tiempo',
      100
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(2)!.posicion).toBe(1);
    expect(porId.get(1)!.puntos).toBe(porId.get(2)!.puntos);

    // Tras dos empatados en 1.º, el siguiente es 3.º, no 2.º.
    expect(porId.get(3)!.posicion).toBe(3);
    expect(porId.get(3)!.puntos).toBe(98);
  });

  it('los abandonos quedan ultimos con 0 puntos', () => {
    const resultado = puntuarWod(
      filas(
        [
          [1, '04:00'],
          [2, '05:00'],
        ],
        [3]
      ),
      'tiempo',
      100
    );

    const dnf = resultado.find((r) => r.participante_id === 3)!;
    expect(dnf.puntos).toBe(0);
    expect(dnf.abandono).toBe(true);
    expect(dnf.posicion).toBe(3);
  });

  it('los puntos nunca bajan de cero aunque haya mas atletas que puntaje', () => {
    const entradas: Array<[number, string]> = Array.from({ length: 8 }, (_, i) => [i + 1, `${i + 1}0`]);
    const resultado = puntuarWod(filas(entradas), 'repeticiones', 3);

    expect(resultado.map((r) => r.puntos)).toEqual([3, 2, 1, 0, 0, 0, 0, 0]);
    expect(resultado.every((r) => r.puntos >= 0)).toBe(true);
  });

  it('respeta el puntaje maximo configurado en el WOD', () => {
    const resultado = puntuarWod(filas([[1, '10'], [2, '5']]), 'repeticiones', 50);
    expect(resultado[0].puntos).toBe(50);
    expect(resultado[1].puntos).toBe(49);
  });

  it('puntua correctamente time_trial_splits', () => {
    const resultado = puntuarWod(
      [
        {
          participante_id: 1,
          resultado_id: 0,
          valor_bruto: '300000',
          abandono: false,
          detalle: { splits: [{ segmento_numero: 1, segmento_nombre: 'A', tiempo_acumulado_ms: 300000, tiempo_parcial_ms: 300000 }] }
        },
        {
          participante_id: 2,
          resultado_id: 0,
          valor_bruto: '210000',
          abandono: false,
          detalle: { splits: [{ segmento_numero: 1, segmento_nombre: 'A', tiempo_acumulado_ms: 210000, tiempo_parcial_ms: 210000 }] }
        },
      ],
      'time_trial_splits',
      100
    );

    expect(resultado.map(r => r.participante_id)).toEqual([2, 1]);
    expect(resultado[0].valor).toBe(210000);
    expect(resultado[1].valor).toBe(300000);
  });

  it('puntua correctamente HYROX 8 segmentos, 3 atletas', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '300000', abandono: false, detalle: { splits: [{ segmento_numero: 8, segmento_nombre: 'Run8', tiempo_acumulado_ms: 300000, tiempo_parcial_ms: 30000 }] } },
        { participante_id: 2, resultado_id: 0, valor_bruto: '210000', abandono: false, detalle: { splits: [{ segmento_numero: 8, segmento_nombre: 'Run8', tiempo_acumulado_ms: 210000, tiempo_parcial_ms: 30000 }] } },
        { participante_id: 3, resultado_id: 0, valor_bruto: '250000', abandono: false, detalle: { splits: [{ segmento_numero: 8, segmento_nombre: 'Run8', tiempo_acumulado_ms: 250000, tiempo_parcial_ms: 30000 }] } },
      ],
      'time_trial_splits',
      100
    );

    expect(resultado.map(r => r.participante_id)).toEqual([2, 3, 1]);
    expect(resultado[0].puntos).toBe(100);
    expect(resultado[1].puntos).toBe(99);
    expect(resultado[2].puntos).toBe(98);
  });

  it('desempata correctamente en splits por segmento más rápido', () => {
    const resultado = puntuarWod(
      [
        {
          participante_id: 1,
          resultado_id: 0,
          valor_bruto: '300000',
          abandono: false,
          detalle: { splits: [
            { segmento_numero: 1, segmento_nombre: 'S1', tiempo_acumulado_ms: 20000, tiempo_parcial_ms: 20000 },
            { segmento_numero: 2, segmento_nombre: 'S2', tiempo_acumulado_ms: 300000, tiempo_parcial_ms: 280000 }
          ]}
        },
        {
          participante_id: 2,
          resultado_id: 0,
          valor_bruto: '300000',
          abandono: false,
          detalle: { splits: [
            { segmento_numero: 1, segmento_nombre: 'S1', tiempo_acumulado_ms: 15000, tiempo_parcial_ms: 15000 },
            { segmento_numero: 2, segmento_nombre: 'S2', tiempo_acumulado_ms: 300000, tiempo_parcial_ms: 285000 }
          ]}
        },
      ],
      'time_trial_splits',
      100
    );

    expect(resultado.map(r => r.participante_id)).toEqual([2, 1]);
  });

  it('devuelve una lista vacia si no hay resultados', () => {
    expect(puntuarWod([], 'tiempo', 100)).toEqual([]);
  });

  it('los capados van detras de los finalizadores y se ordenan por reps', () => {
    // 1 y 2 terminan; 3 y 4 no llegaron al tope y anotan reps (mas reps, mejor).
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '05:00', abandono: false },
        { participante_id: 2, resultado_id: 0, valor_bruto: '04:00', abandono: false },
        { participante_id: 3, resultado_id: 0, valor_bruto: '40', abandono: false, capado: true },
        { participante_id: 4, resultado_id: 0, valor_bruto: '55', abandono: false, capado: true },
      ],
      'tiempo',
      100
    );

    // Finalizadores primero (por tiempo), luego capados (por reps desc).
    expect(resultado.map((r) => r.participante_id)).toEqual([2, 1, 4, 3]);
    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(2)!.posicion).toBe(1);
    expect(porId.get(1)!.posicion).toBe(2);
    expect(porId.get(4)!.posicion).toBe(3); // capado con mas reps
    expect(porId.get(3)!.posicion).toBe(4);
    expect(porId.get(4)!.capado).toBe(true);
    expect(porId.get(4)!.puntos).toBe(98);
  });

  it('rompe el empate de reps con el desempate (menor es mejor)', () => {
    // Mismo total de reps; gana quien tiene menor tiempo de tie-break.
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '100', abandono: false, desempate: 65000 },
        { participante_id: 2, resultado_id: 0, valor_bruto: '100', abandono: false, desempate: 58000 },
        { participante_id: 3, resultado_id: 0, valor_bruto: '90', abandono: false },
      ],
      'repeticiones',
      100
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(2)!.posicion).toBe(1); // mismo valor, menor desempate
    expect(porId.get(1)!.posicion).toBe(2);
    expect(porId.get(3)!.posicion).toBe(3);
    expect(porId.get(2)!.puntos).toBe(100);
    expect(porId.get(1)!.puntos).toBe(99);
  });

  it('sin desempate, el empate exacto de valor comparte posicion', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '100', abandono: false },
        { participante_id: 2, resultado_id: 0, valor_bruto: '100', abandono: false },
      ],
      'repeticiones',
      100
    );
    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(2)!.posicion).toBe(1);
  });

  it('capados por encima solo de los abandonos', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '04:00', abandono: false },
        { participante_id: 2, resultado_id: 0, valor_bruto: '30', abandono: false, capado: true },
        { participante_id: 3, resultado_id: 0, valor_bruto: 'ABANDONO', abandono: true },
      ],
      'tiempo',
      100
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(2)!.posicion).toBe(2);
    expect(porId.get(3)!.posicion).toBe(3);
    expect(porId.get(3)!.puntos).toBe(0);
    expect(porId.get(3)!.abandono).toBe(true);
  });

  it('las calorías se ordenan descendente (mayor es mejor)', () => {
    // Nuevo tipo de medición: calorías
    const resultado = puntuarWod(
      [
        { participante_id: 1, valor_bruto: '420', abandono: false },
        { participante_id: 2, valor_bruto: '380', abandono: false },
        { participante_id: 3, valor_bruto: '350', abandono: false },
      ],
      'calorías',
      100
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1); // mayor valor, primera posición
    expect(porId.get(2)!.posicion).toBe(2);
    expect(porId.get(3)!.posicion).toBe(3); // menor valor, última posición
    expect(porId.get(1)!.puntos).toBe(100);
    expect(porId.get(2)!.puntos).toBe(99);
    expect(porId.get(3)!.puntos).toBe(98);
  });

  it('los desqualificados (DSQ) van al final con 0 puntos', () => {
    // Nuevo estado: disqualificado
    const resultado = puntuarWod(
      [
        { participante_id: 1, valor_bruto: '100', abandono: false },
        { participante_id: 2, valor_bruto: '90', abandono: false, disqualificado: true },
        { participante_id: 3, valor_bruto: '85', abandono: false },
      ],
      'repeticiones',
      100
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(3)!.posicion).toBe(2);
    expect(porId.get(2)!.posicion).toBe(3); // DSQ al final
    expect(porId.get(1)!.puntos).toBe(100);
    expect(porId.get(3)!.puntos).toBe(99);
    expect(porId.get(2)!.puntos).toBe(0); // DSQ = 0 puntos
  });

  it('DSQ y DNF comparten posición final', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, valor_bruto: '100', abandono: false },
        { participante_id: 2, valor_bruto: 'DNF', abandono: true },
        { participante_id: 3, valor_bruto: '0', abandono: false, disqualificado: true },
      ],
      'repeticiones',
      100
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(2)!.posicion).toBe(2); // DNF posición final
    expect(porId.get(3)!.posicion).toBe(2); // DSQ comparte posición con DNF
    expect(porId.get(2)!.puntos).toBe(0);
    expect(porId.get(3)!.puntos).toBe(0);
  });

  it('NONE ignora el desempate: misma marca = mismo puesto y mismos puntos', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '100', abandono: false, desempate: 65000 },
        { participante_id: 2, resultado_id: 0, valor_bruto: '100', abandono: false, desempate: 58000 },
        { participante_id: 3, resultado_id: 0, valor_bruto: '90', abandono: false },
      ],
      'repeticiones',
      100,
      'NONE'
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(2)!.posicion).toBe(1);
    expect(porId.get(1)!.puntos).toBe(100);
    expect(porId.get(2)!.puntos).toBe(100);
    expect(porId.get(3)!.posicion).toBe(3); // salta el 2.º (ranking 1,1,3)
    expect(porId.get(3)!.puntos).toBe(98);
  });

  it('TIEBREAK_MARK ordena capados por la marca del juez (parcial más rápido)', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '04:00', abandono: false },
        { participante_id: 2, resultado_id: 0, valor_bruto: '40', abandono: false, capado: true, desempate: 240000 },
        { participante_id: 3, resultado_id: 0, valor_bruto: '40', abandono: false, capado: true, desempate: 210000 },
      ],
      'tiempo',
      100,
      'TIEBREAK_MARK'
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(1)!.posicion).toBe(1);
    expect(porId.get(3)!.posicion).toBe(2); // mismas reps, marca menor
    expect(porId.get(2)!.posicion).toBe(3);
  });

  it('TIEBREAK_MARK premia la marca más temprana en max load', () => {
    const resultado = puntuarWod(
      [
        { participante_id: 1, resultado_id: 0, valor_bruto: '120', abandono: false, desempate: 3 },
        { participante_id: 2, resultado_id: 0, valor_bruto: '120', abandono: false, desempate: 1 },
      ],
      'peso',
      100,
      'TIEBREAK_MARK'
    );

    const porId = new Map(resultado.map((r) => [r.participante_id, r]));
    expect(porId.get(2)!.posicion).toBe(1); // misma carga, marca menor
    expect(porId.get(1)!.posicion).toBe(2);
  });
});
