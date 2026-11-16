import { FormEvent, useEffect, useState } from 'react';
import { Building2, MapPin, Pencil, Plus, Trash2, Trophy, UserCog } from 'lucide-react';
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
  Panel,
  SkeletonList,
} from '../../components/ui';
import type { Box } from '../../types';

const FORM_VACIO = { nombre: '', ciudad: '' };

/**
 * Boxes: la organización que agrupa eventos y administradores.
 *
 * Solo llega aquí el administrador general. Un administrador de box no puede
 * crear boxes ni cambiarse de sitio, porque el box ES su permiso.
 */
export default function BoxesPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Box | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Box | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    try {
      const { data } = await api.get<Box[]>('/boxes');
      setBoxes(data);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los boxes'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormAbierto(true);
  }

  function abrirEdicion(box: Box) {
    setEditando(box);
    setForm({ nombre: box.nombre, ciudad: box.ciudad ?? '' });
    setFormAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);

    const cuerpo = { nombre: form.nombre.trim(), ciudad: form.ciudad.trim() || null };

    try {
      if (editando) await api.put(`/boxes/${editando.id}`, cuerpo);
      else await api.post('/boxes', cuerpo);
      setFormAbierto(false);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el box'));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/boxes/${aEliminar.id}`);
      setAEliminar(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar el box'));
      setAEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  return (
    <AppShell
      title="Boxes"
      subtitle="Organizaciones que montan eventos"
      actions={
        <Button size="sm" icon={Plus} onClick={abrirNuevo}>
          <span className="hidden sm:inline">Nuevo box</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error && (
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {cargando ? (
          <Panel>
            <SkeletonList rows={4} />
          </Panel>
        ) : boxes.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Building2}
              title="Todavia no hay boxes"
              description="Crea el primero y luego asigna administradores y eventos."
              action={
                <Button icon={Plus} onClick={abrirNuevo}>
                  Nuevo box
                </Button>
              }
            />
          </Panel>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {boxes.map((box) => (
              <li key={box.id}>
                <Panel className="h-full p-5 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                      <Building2 className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-lg font-bold text-hyrox-paper truncate">
                        {box.nombre}
                      </h3>
                      {box.ciudad && (
                        <p className="flex items-center gap-1.5 text-xs text-hyrox-mist mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
                          {box.ciudad}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton
                        icon={Pencil}
                        label={`Editar ${box.nombre}`}
                        onClick={() => abrirEdicion(box)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Eliminar ${box.nombre}`}
                        onClick={() => setAEliminar(box)}
                        className="hover:text-hyrox-danger hover:bg-hyrox-danger/10"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-3 border-t border-white/[0.06] text-xs text-hyrox-mist">
                    <span className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
                      {box.total_eventos} eventos
                    </span>
                    <span className="flex items-center gap-1.5">
                      <UserCog className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
                      {box.total_administradores} admins
                    </span>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        title={editando ? 'Editar box' : 'Nuevo box'}
        description="El box agrupa eventos y define quien puede administrarlas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={guardando} disabled={!form.nombre.trim()}>
              {editando ? 'Guardar cambios' : 'Crear box'}
            </Button>
          </>
        }
      >
        <form onSubmit={guardar} className="space-y-4">
          <Field
            label="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Box Central"
            required
          />
          <Field
            label="Ciudad"
            value={form.ciudad}
            onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
            placeholder="Bogota"
            hint="Opcional. Ayuda a distinguir boxes con nombres parecidos."
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!aEliminar}
        onCancel={() => setAEliminar(null)}
        onConfirm={eliminar}
        title="Eliminar box"
        message={`Se eliminara "${aEliminar?.nombre}". Solo se puede si no le quedan eventos ni usuarios.`}
        confirmLabel="Eliminar"
        loading={eliminando}
      />
    </AppShell>
  );
}
