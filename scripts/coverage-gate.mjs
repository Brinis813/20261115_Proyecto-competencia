/**
 * Puerta de cobertura del repositorio.
 *
 * Dos reglas, una sola fuente de verdad:
 *  1. Suelo global: ningún paquete baja de los porcentajes de `.coverage-floors.json`.
 *  2. Código tocado: cada archivo modificado en la rama debe tener >= 80 % de líneas
 *     cubiertas. Un archivo nuevo sin pruebas falla aquí.
 *
 * Uso:  node scripts/coverage-gate.mjs <frontend|backend> [ref-base]
 * Base por defecto: origin/main (o el valor de COVERAGE_BASE).
 *
 * Sale con código 1 y explica qué falla; no arregla nada por su cuenta.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIFF_FLOOR = 80;
const MIN_FILE_LINES = 20; // un archivo diminuto no se juzga por porcentaje
const METRICS = ['lines', 'statements', 'functions', 'branches'];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = process.argv[2];
const base = process.argv[3] || process.env.COVERAGE_BASE || 'origin/main';

if (!pkg || !['frontend', 'backend'].includes(pkg)) {
  console.error('Uso: node scripts/coverage-gate.mjs <frontend|backend> [ref-base]');
  process.exit(2);
}

const summaryPath = resolve(root, pkg, 'coverage', 'coverage-summary.json');
const floorsPath = resolve(root, '.coverage-floors.json');

if (!existsSync(summaryPath)) {
  console.error(
    `No existe ${relative(root, summaryPath)}. Ejecuta las pruebas con cobertura primero.`,
  );
  process.exit(2);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const floors = JSON.parse(readFileSync(floorsPath, 'utf8'))[pkg];

const total = summary.total;
if (!total) {
  console.error('coverage-summary.json no trae el bloque "total".');
  process.exit(2);
}

const failures = [];

// 1. Suelo global.
for (const metric of METRICS) {
  const real = total[metric]?.pct ?? 0;
  const floor = floors[metric];
  if (typeof floor === 'number' && real + 1e-9 < floor) {
    failures.push(
      `Suelo global de ${metric}: ${real.toFixed(2)} % < ${floor} %. ` +
        'El suelo no se baja: se añaden pruebas o se enmienda la constitución.',
    );
  }
}

// 2. Archivos tocados en la rama.
function changedFiles() {
  try {
    // Compara la base con el árbol de trabajo (en CI el árbol es HEAD, así que es igual):
    // así la puerta también funciona con cambios todavía sin commitear.
    const staged = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return [...new Set([...staged, ...untracked])];
  } catch {
    console.warn(
      `Aviso: no se pudo comparar con "${base}". Se omite la regla de archivos tocados. ` +
        'Define COVERAGE_BASE con una referencia válida.',
    );
    return [];
  }
}

const prefix = `${pkg}/`;
for (const file of changedFiles()) {
  if (!file.startsWith(prefix)) continue;
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) continue;
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file)) continue;
  if (file.includes('__tests__') || /\.(test|spec)\./.test(file)) continue;

  const entry = summary[absolute] || summary[absolute.replace(/\//g, '\\')];
  if (!entry) continue; // no se mide (tipos, configuración, contenido estático)

  const lines = entry.lines;
  if (lines.total < MIN_FILE_LINES) continue;
  if (lines.pct + 1e-9 < DIFF_FLOOR) {
    failures.push(
      `Archivo tocado por debajo del ${DIFF_FLOOR} %: ${file.replace(prefix, '')} ` +
        `(${lines.pct.toFixed(1)} % de ${lines.total} líneas).`,
    );
  }
}

if (failures.length) {
  console.error(`\nCobertura insuficiente en ${pkg}:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('');
  process.exit(1);
}

const bits = METRICS.filter((m) => typeof floors[m] === 'number')
  .map((m) => `${m} ${total[m].pct.toFixed(2)} % (suelo ${floors[m]} %)`)
  .join(' · ');
console.log(`Cobertura ${pkg} dentro de la política: ${bits}`);
