import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Tags } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SkeletonList,
} from '../../components/ui';
import type { Categoria } from '../../types';
import { dedupCategorias } from '../../utils/formato';

// ── Form state (Opción B: solo perfil de participación) ──

const FORM_VACIO = {
  nombre: '',
  genero: '' as '' | 'Masculino' | 'Femenino' | 'Mixto',
  tipo_participacion: '' as '' | 'Individual' | 'Escalado' | 'Duplas' | 'Equipos' | 'Relevos',
};

type FormState = typeof FORM_VACIO;

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [erroresForm, setErroresForm] = useState<Partial<Record<keyof FormState, string>>>({});
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [aEliminar, setAEliminar] = useState<Categoria | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    try {
      const res = await api.get<Categoria[]>('/categories');
      setCategorias(dedupCategorias(Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las categorías'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return categorias;
    return categorias.filter((c) =>
      `${c.nombre} ${c.genero} ${c.tipo_participacion}`.toLowerCase().includes(termino)
    );
  }, [categorias, busqueda]);

  function abrirCreacion() {
    setEditando(null);
    setForm({ ...FORM_VACIO });
    setErroresForm({});
    setErrorForm('');
    setFormAbierto(true);
  }

  function abrirEdicion(cat: Categoria) {
    setEditando(cat);
    setForm({
      nombre: cat.nombre,
      genero: cat.genero,
      tipo_participacion: cat.tipo_participacion,
    });
    setErroresForm({});
    setErrorForm('');
    setFormAbierto(true);
  }

  function validarForm(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio';
    else if (form.nombre.trim().length > 100) errs.nombre = 'Máximo 100 caracteres';
    if (!form.genero) errs.genero = 'El género es obligatorio';
    if (!form.tipo_participacion) errs.tipo_participacion = 'El tipo de participación es obligatorio';

    setErroresForm(errs);
    return Object.keys(errs).length === 0;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm('');
    if (!validarForm()) return;
    setGuardando(true);

    const cuerpo = {
      nombre: form.nombre.trim(),
      genero: form.genero as 'Masculino' | 'Femenino' | 'Mixto',
      tipo_participacion: form.tipo_participacion as 'Individual' | 'Escalado' | 'Duplas' | 'Equipos' | 'Relevos',
    };

    try {
      if (editando) {
        await api.put(`/categories/${editando.id}`, cuerpo);
      } else {
        await api.post('/categories', cuerpo);
      }
      setFormAbierto(false);
      await cargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err, 'No se pudo guardar la categoría'));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/categories/${aEliminar.id}`);
      setAEliminar(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar la categoría'));
      setAEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  return (
    <AppShell
      title="Categorías"
      subtitle="Define el perfil de participación. Los pesos y reps por categoría se configuran en cada competencia."
      actions={
        <Button size="sm" onClick={abrirCreacion}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nueva categoría
        </Button>
      }
    >
      {/* Buscador */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hyrox-mist pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar por nombre, género o tipo de participación..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl bg-white/[0.04] border border-white/[0.08] text-hyrox-paper placeholder:text-hyrox-mist focus:outline-none focus:ring-2 focus:ring-hyrox-primary/50"
        />
      </div>

      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      {cargando ? (
        <SkeletonList rows={4} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Sin categorías"
          description={busqueda ? 'No hay resultados para tu búsqueda.' : 'Crea la primera categoría del evento.'}
          action={!busqueda ? <Button onClick={abrirCreacion}><Plus className="w-4 h-4" />Nueva categoría</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((cat) => (
            <CategoriaCard
              key={cat.id}
              categoria={cat}
              onEditar={() => abrirEdicion(cat)}
              onEliminar={() => setAEliminar(cat)}
            />
          ))}
        </div>
      )}

      {/* Modal de creación / edición */}
      <Modal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        title={editando ? 'Editar categoría' : 'Nueva categoría'}
      >
        <form onSubmit={guardar} className="space-y-4" noValidate>
          <Field
            label="Nombre de la categoría (nivel / división)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: RX, Scaled, Elite, Master..."
            required
            error={erroresForm.nombre}
          />

          <div>
            <label className="block text-xs font-semibold text-hyrox-mist uppercase tracking-wider mb-1.5">
              Género <span className="text-red-400">*</span>
            </label>
            <select
              value={form.genero}
              onChange={(e) => setForm({ ...form, genero: e.target.value as FormState['genero'] })}
              className="input-field"
              required
            >
              <option value="">Selecciona un género</option>
              <option value="Masculino">Masculino</option>
              <option value="Femenino">Femenino</option>
              <option value="Mixto">Mixto</option>
            </select>
            {erroresForm.genero && (
              <p className="mt-1 text-xs text-red-400">{erroresForm.genero}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-hyrox-mist uppercase tracking-wider mb-1.5">
              Tipo de Participación <span className="text-red-400">*</span>
            </label>
            <select
              value={form.tipo_participacion}
              onChange={(e) => setForm({ ...form, tipo_participacion: e.target.value as FormState['tipo_participacion'] })}
              className="input-field"
              required
            >
              <option value="">Selecciona un tipo de participación</option>
              <option value="Individual">Individual</option>
              <option value="Escalado">Escalado</option>
              <option value="Duplas">Duplas</option>
              <option value="Equipos">Equipos</option>
              <option value="Relevos">Relevos</option>
            </select>
            {erroresForm.tipo_participacion && (
              <p className="mt-1 text-xs text-red-400">{erroresForm.tipo_participacion}</p>
            )}
          </div>

          <p className="text-xs text-hyrox-mist/70 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            Los pesos, distancias y repeticiones ya no viven aquí: se definen por categoría
            dentro de cada competencia, en sus estaciones y movimientos.
          </p>

          {errorForm && <Alert tone="error">{errorForm}</Alert>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardando}>
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmar eliminación */}
      <ConfirmDialog
        open={!!aEliminar}
        title="Eliminar categoría"
        message={
          aEliminar
            ? `¿Eliminar "${aEliminar.nombre} (${aEliminar.genero})"?${
                (aEliminar.total_participantes ?? 0) > 0
                  ? ` Tiene ${aEliminar.total_participantes} atleta(s) asignado(s). Debes reasignarlos antes de eliminar.`
                  : ' Esta acción no se puede deshacer.'
              }`
            : ''
        }
        confirmLabel="Eliminar"
        loading={eliminando}
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
        tone={(aEliminar?.total_participantes ?? 0) === 0 ? 'danger' : 'primary'}
      />
    </AppShell>
  );
}

function CategoriaCard({
  categoria,
  onEditar,
  onEliminar,
}: {
  categoria: Categoria;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const tieneAtletas = (categoria.total_participantes ?? 0) > 0;

  return (
    <div className="surface p-4 flex flex-col gap-3">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-hyrox-paper truncate">{categoria.nombre}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                categoria.genero === 'Femenino'
                  ? 'bg-pink-500/15 text-pink-300'
                  : categoria.genero === 'Mixto'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-blue-500/15 text-blue-300'
              }`}
            >
              {categoria.genero}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300">
              {categoria.tipo_participacion}
            </span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <IconButton
            icon={Pencil}
            label="Editar categoría"
            size="sm"
            onClick={onEditar}
          />
          <IconButton
            icon={Trash2}
            label="Eliminar categoría"
            size="sm"
            variant="danger"
            onClick={onEliminar}
            disabled={tieneAtletas}
            title={tieneAtletas ? `Tiene ${categoria.total_participantes} atleta(s). Reasígnalos antes de eliminar.` : undefined}
          />
        </div>
      </div>

      {/* Atletas */}
      {tieneAtletas && (
        <p className="text-xs text-hyrox-mist">
          {categoria.total_participantes} atleta{categoria.total_participantes !== 1 ? 's' : ''} asignado{categoria.total_participantes !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
