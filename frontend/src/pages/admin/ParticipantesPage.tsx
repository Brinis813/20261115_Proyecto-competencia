import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react';
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
  Select,
  SkeletonList,
} from '../../components/ui';
import type { Categoria, Participante } from '../../types';
import { dedupCategorias } from '../../utils/formato';

const FORM_VACIO = {
  nombre: '',
  apellidos: '',
  cedula: '',
  box: '',
  fecha_nacimiento: '',
  email: '',
  categoria: '',
  categoria_id: '',
};

export default function ParticipantesPage() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Participante | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [aEliminar, setAEliminar] = useState<Participante | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    try {
      const [resP, resCat] = await Promise.all([
        api.get<Participante[]>('/users/participantes'),
        api.get<Categoria[]>('/categories'),
      ]);
      setParticipantes(Array.isArray(resP.data) ? resP.data : []);
      setCategorias(dedupCategorias(Array.isArray(resCat.data) ? resCat.data : []));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los participantes'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  // Busqueda en cliente: la lista de inscritos de un evento cabe de sobra en
  // memoria y evita un viaje al servidor por cada tecla.
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return participantes;
    return participantes.filter((p) =>
      `${p.nombre} ${p.apellidos} ${p.cedula} ${p.box} ${p.categoria ?? ''}`
        .toLowerCase()
        .includes(termino),
    );
  }, [participantes, busqueda]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Participante[]>();

    for (const participante of filtrados) {
      const categoria = participante.categoria?.trim() || 'Sin categoria';
      const lista = mapa.get(categoria) ?? [];
      lista.push(participante);
      mapa.set(categoria, lista);
    }

    return [...mapa.entries()].sort(([a], [b]) => {
      if (a === 'Sin categoria') return 1;
      if (b === 'Sin categoria') return -1;
      return a.localeCompare(b);
    });
  }, [filtrados]);

  function abrirCreacion() {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormAbierto(true);
  }

  function abrirEdicion(participante: Participante) {
    setEditando(participante);
    setForm({
      nombre: participante.nombre,
      apellidos: participante.apellidos,
      cedula: participante.cedula,
      box: participante.box,
      fecha_nacimiento: participante.fecha_nacimiento?.slice(0, 10).replace(/-/g, '/') ?? '',
      email: participante.email ?? '',
      categoria: participante.categoria ?? '',
      categoria_id: participante.categoria_id?.toString() ?? '',
    });
    setFormAbierto(true);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);

    const cuerpo = {
      ...form,
      categoria: form.categoria.trim() || null,
      // El select guarda el id como texto; la API espera un numero o null.
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
    };

    try {
      if (editando) {
        // La cedula identifica al atleta en el login: no se permite cambiarla.
        const { cedula: _cedula, ...editables } = cuerpo;
        await api.put(`/users/participantes/${editando.id}`, editables);
      } else {
        await api.post('/users/participantes', cuerpo);
      }
      setFormAbierto(false);
      setForm(FORM_VACIO);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el participante'));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/users/participantes/${aEliminar.id}`);
      setAEliminar(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar el participante'));
    } finally {
      setEliminando(false);
    }
  }

  return (
    <AppShell
      title="Atletas"
      subtitle="Participantes inscritos en el evento"
      actions={
        <Button size="sm" icon={Plus} onClick={abrirCreacion}>
          <span className="hidden sm:inline">Nuevo atleta</span>
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        </div>
      )}

      <section className="surface overflow-hidden max-w-5xl">
        <header className="panel-header flex-col sm:flex-row items-stretch sm:items-center">
          <h2 className="eyebrow shrink-0">
            {filtrados.length} de {participantes.length} atletas
          </h2>
          <div className="relative sm:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hyrox-ghost pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, cedula o box"
              aria-label="Buscar atleta"
              className="input-field pl-9 text-sm"
            />
          </div>
        </header>

        {cargando ? (
          <SkeletonList rows={5} />
        ) : participantes.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Aun no hay atletas inscritos"
            description="Inscribe participantes para poder asignarlos a una competencia."
            action={
              <Button icon={Plus} onClick={abrirCreacion}>
                Inscribir atleta
              </Button>
            }
          />
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Sin coincidencias"
            description={`Ningun atleta coincide con "${busqueda}".`}
          />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {grupos.map(([categoria, lista]) => (
              <section key={categoria}>
                <div className="px-4 sm:px-5 py-3 border-b border-white/[0.04] bg-white/[0.02] flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-hyrox-primary">
                    {categoria}
                  </h3>
                  <span className="text-2xs text-hyrox-ghost">{lista.length} atletas</span>
                </div>
                <ul className="divide-hairline">
                  {lista.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                      <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-accent/12 text-hyrox-accent text-2xs font-bold shrink-0">
                        {p.nombre[0]}
                        {p.apellidos[0]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-hyrox-paper truncate">
                          {p.nombre} {p.apellidos}
                        </p>
                        <p className="text-2xs text-hyrox-mist truncate">
                          C.I. {p.cedula} · {p.box}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="badge-gray hidden sm:inline-flex">
                          {p.categoria ?? 'Sin categoria'}
                        </span>
                        <IconButton
                          icon={Pencil}
                          label={`Editar a ${p.nombre}`}
                          onClick={() => abrirEdicion(p)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Eliminar a ${p.nombre}`}
                          onClick={() => setAEliminar(p)}
                          className="hover:text-hyrox-danger hover:bg-hyrox-danger/10"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        title={editando ? 'Editar atleta' : 'Nuevo atleta'}
        description={
          editando
            ? 'La cedula no se puede modificar porque es su credencial de acceso.'
            : 'El atleta entrara con su cedula y su fecha de nacimiento.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Button>
            <Button form="form-participante" type="submit" loading={guardando}>
              {editando ? 'Guardar cambios' : 'Inscribir atleta'}
            </Button>
          </>
        }
      >
        <form id="form-participante" onSubmit={guardar} className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            autoFocus
          />
          <Field
            label="Apellidos"
            value={form.apellidos}
            onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
            required
          />
          <Field
            label="Cedula"
            inputMode="numeric"
            value={form.cedula}
            onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            disabled={editando !== null}
            required
          />
          <Field
            label="Fecha de nacimiento"
            type="text"
            inputMode="numeric"
            value={form.fecha_nacimiento}
            onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
            placeholder="AAAA/MM/DD"
            hint="Es su contrasena de acceso. Formato: AAAA/MM/DD"
            maxLength={10}
            required
          />
          <Field
            label="Box o gimnasio"
            value={form.box}
            onChange={(e) => setForm({ ...form, box: e.target.value })}
            required
          />
          <Field
            label="Correo electrónico"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="atleta@email.com"
            hint="Opcional. Se enviarán los resultados al final."
          />
          {/* Se elige de las categorias dadas de alta: asi el atleta queda
              vinculado por id y el nombre se mantiene sincronizado. */}
          <Select
            label="Categoria"
            value={form.categoria_id}
            onChange={(e) => {
              const id = e.target.value;
              const categoria = categorias.find((c) => String(c.id) === id);
              setForm({
                ...form,
                categoria_id: id,
                // El leaderboard agrupa por texto, asi que se guarda tambien el nombre.
                categoria: categoria ? `${categoria.nombre} ${categoria.genero}` : '',
              });
            }}
          >
            <option value="">Sin categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre} {categoria.genero} · {categoria.tipo_participacion}
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      <ConfirmDialog
        open={aEliminar !== null}
        title="Eliminar atleta"
        message={`Se eliminara a ${aEliminar?.nombre ?? ''} ${aEliminar?.apellidos ?? ''} junto con todos sus resultados y asignaciones. No se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={eliminando}
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
      />
    </AppShell>
  );
}
