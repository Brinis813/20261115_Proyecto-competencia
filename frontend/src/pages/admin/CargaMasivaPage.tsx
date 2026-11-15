import { useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import { Alert, Button } from '../../components/ui';

interface ResultadoCarga {
  total: number;
  exitosos: number;
  fallidos: number;
  errores: Array<{ fila: number; cedula: string; mensaje: string }>;
  juecesCreados?: Array<{ nombre: string; cedula: string; password: string }>;
}

export default function CargaMasivaPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setArchivo(file);
    setResultado(null);
    setError('');
  }

  async function subir() {
    if (!archivo) return;
    setCargando(true);
    setError('');
    setResultado(null);

    const formData = new FormData();
    formData.append('archivo', archivo);

    try {
      const res = await api.post<ResultadoCarga>('/users/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultado(res.data);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo procesar el archivo'));
    } finally {
      setCargando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function copiarCredenciales(juez: { nombre: string; cedula: string; password: string }, idx: number) {
    const texto = `Nombre: ${juez.nombre}\nCédula: ${juez.cedula}\nContraseña temporal: ${juez.password}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(idx);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Fallback: mostrar en un alert
      window.prompt('Copia las credenciales:', texto);
    }
  }

  function descargarPlantilla(tipo: 'atletas' | 'mixto') {
    let csv: string;
    if (tipo === 'atletas') {
      csv = 'tipo,nombre,apellidos,cedula,box,fecha_nacimiento,email,categoria\n';
      csv += 'atleta,Juan,Pérez,1234567890,Box CrossFit,1995/03/15,juan@email.com,RX Masculino\n';
      csv += 'atleta,María,García,0987654321,Box Force,1998/07/22,,Scaled Femenino\n';
    } else {
      csv = 'tipo,nombre,apellidos,cedula,box,fecha_nacimiento,email,categoria\n';
      csv += 'atleta,Juan,Pérez,1234567890,Box CrossFit,1995/03/15,juan@email.com,RX Masculino\n';
      csv += 'atleta,María,García,0987654321,Box Force,1998/07/22,,Scaled Femenino\n';
      csv += 'juez,Carlos,López,5555555555,Box Elite,,,\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = tipo === 'atletas' ? 'plantilla_atletas.csv' : 'plantilla_atletas_y_jueces.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Carga Masiva"
      subtitle="Importar atletas y jueces desde un archivo CSV"
    >
      {/* Instrucciones */}
      <section className="surface p-5 mb-6">
        <h2 className="text-sm font-bold text-hyrox-paper mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-hyrox-primary" />
          Instrucciones
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-hyrox-mist">
          <li>Descarga una plantilla CSV o prepara tu archivo con los encabezados correctos.</li>
          <li>
            <strong className="text-hyrox-paper">Columnas para atletas:</strong>{' '}
            <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded">tipo, nombre, apellidos, cedula, box, fecha_nacimiento, email, categoria</code>
          </li>
          <li>
            <strong className="text-hyrox-paper">Columnas para jueces:</strong>{' '}
            <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded">tipo, nombre, apellidos, cedula, box</code>
          </li>
          <li>
            La columna <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded">tipo</code> debe ser{' '}
            <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded">atleta</code> o{' '}
            <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded">juez</code>. Si se omite, se asume atleta.
          </li>
          <li>Los jueces se crean con una contraseña temporal que deberán cambiar al ingresar.</li>
          <li>Las cédulas duplicadas se omiten con error (no se sobreescriben).</li>
        </ol>

        <div className="flex flex-wrap gap-3 mt-4">
          <Button variant="secondary" size="sm" onClick={() => descargarPlantilla('atletas')}>
            <FileText className="w-4 h-4" />
            Plantilla solo atletas
          </Button>
          <Button variant="secondary" size="sm" onClick={() => descargarPlantilla('mixto')}>
            <FileText className="w-4 h-4" />
            Plantilla atletas + jueces
          </Button>
        </div>
      </section>

      {/* Upload */}
      <section className="surface p-5 mb-6">
        <h2 className="text-sm font-bold text-hyrox-paper mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4 text-hyrox-primary" />
          Seleccionar archivo CSV
        </h2>

        <div className="flex items-center gap-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onSelect}
            className="block w-full text-sm text-hyrox-mist file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-hyrox-primary/15 file:text-hyrox-primary hover:file:bg-hyrox-primary/25 file:cursor-pointer"
          />
          <Button onClick={subir} loading={cargando} disabled={!archivo}>
            <Upload className="w-4 h-4" />
            Importar
          </Button>
        </div>

        {archivo && (
          <p className="mt-2 text-xs text-hyrox-mist">
            Archivo: <span className="text-hyrox-paper font-medium">{archivo.name}</span>{' '}
            ({(archivo.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </section>

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {/* Resultado */}
      {resultado && (
        <section className="surface p-5">
          <h2 className="text-sm font-bold text-hyrox-paper mb-3">Resultado de la importación</h2>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white/[0.04] rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-hyrox-paper">{resultado.total}</p>
              <p className="text-xs text-hyrox-mist">Total filas</p>
            </div>
            <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">{resultado.exitosos}</p>
              <p className="text-xs text-hyrox-mist">Exitosos</p>
            </div>
            <div className="bg-red-500/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{resultado.fallidos}</p>
              <p className="text-xs text-hyrox-mist">Fallidos</p>
            </div>
          </div>

          {/* Credenciales de jueces creados */}
          {resultado.juecesCreados && resultado.juecesCreados.length > 0 && (
            <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Credenciales de jueces (guárdalas, solo se muestran una vez)
              </h3>
              <div className="space-y-2">
                {resultado.juecesCreados.map((j, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2">
                    <div className="text-sm">
                      <span className="font-semibold text-hyrox-paper">{j.nombre}</span>
                      <span className="text-hyrox-mist mx-2">·</span>
                      <span className="text-hyrox-mist">CI: {j.cedula}</span>
                      <span className="text-hyrox-mist mx-2">·</span>
                      <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">{j.password}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => copiarCredenciales(j, idx)}
                      className="text-xs text-hyrox-primary hover:text-hyrox-accent transition-colors shrink-0"
                    >
                      {copiado === idx ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errores */}
          {resultado.errores.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
                Errores ({resultado.errores.length})
              </h3>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {resultado.errores.map((err, idx) => (
                  <p key={idx} className="text-xs text-red-300">
                    <span className="font-mono text-red-400">Fila {err.fila}</span>{' '}
                    (CI: {err.cedula}): {err.mensaje}
                  </p>
                ))}
              </div>
            </div>
          )}

          {resultado.fallidos === 0 && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm mt-2">
              <CheckCircle2 className="w-4 h-4" />
              Todos los registros se importaron correctamente.
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
