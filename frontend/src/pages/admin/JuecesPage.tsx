import { useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
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
import type { Juez } from '../../types';

const FORM_VACIO = { nombre: '', apellidos: '', cedula: '', box: '' };

export default function JuecesPage() {
  const [jueces, setJueces] = useState<Juez[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  /** Contrasena temporal recien generada; solo se muestra una vez. */
  const [credencial, setCredencial] = useState<{
    nombre: string;
    cedula: string;
    password: string;
  } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [aEliminar, setAEliminar] = useState<Juez | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const [aResetear, setAResetear] = useState<Juez | null>(null);
  const [reseteando, setReseteando] = useState(false);

  async function cargar() {
    try {
      const res = await api.get<Juez[]>('/users/jueces');
      setJueces(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los jueces'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const res = await api.post('/users/jueces', form);
      setCredencial({
        nombre: `${form.nombre} ${form.apellidos}`,
        cedula: form.cedula,
        password: res.data.tempPassword,
      });
      setForm(FORM_VACIO);
      setFormAbierto(false);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo crear el juez'));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/users/jueces/${aEliminar.id}`);
      setAEliminar(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar el juez'));
    } finally {
      setEliminando(false);
    }
  }

  async function resetear() {
    if (!aResetear) return;
    setReseteando(true);
    setError('');
    try {
      const res = await api.post(`/users/jueces/${aResetear.id}/reset-password`);
      setCredencial({
        nombre: res.data.nombre ?? `${aResetear.nombre} ${aResetear.apellidos}`,
        cedula: res.data.cedula ?? aResetear.cedula,
        password: res.data.tempPassword,
      });
      setAResetear(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo resetear la contraseña'));
    } finally {
      setReseteando(false);
    }
  }

  async function copiarCredencial() {
    if (!credencial) return;
    try {
      await navigator.clipboard.writeText(
        `Cedula: ${credencial.cedula}\nContrasena temporal: ${credencial.password}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('El navegador no permitio copiar. Anota la contrasena manualmente.');
    }
  }

  return (
    <AppShell
      title="Jueces"
      subtitle="Quienes registran las mediciones"
      actions={
        <Button size="sm" icon={Plus} onClick={() => setFormAbierto(true)}>
          <span className="hidden sm:inline">Nuevo juez</span>
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

      <section className="surface overflow-hidden max-w-4xl">
        <header className="panel-header">
          <h2 className="eyebrow">{jueces.length} jueces registrados</h2>
        </header>

        {cargando ? (
          <SkeletonList rows={4} />
        ) : jueces.length === 0 ? (
          <EmptyState
            icon={UserX}
            title="Aun no hay jueces"
            description="Crea un juez para que pueda cronometrar y registrar resultados."
            action={
              <Button icon={Plus} onClick={() => setFormAbierto(true)}>
                Crear juez
              </Button>
            }
          />
        ) : (
          <ul className="divide-hairline">
            {jueces.map((juez) => (
              <li key={juez.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-info/12 text-hyrox-info shrink-0">
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-hyrox-paper truncate">
                    {juez.nombre} {juez.apellidos}
                  </p>
                  <p className="text-2xs text-hyrox-mist truncate">
                    C.I. {juez.cedula} · {juez.box}
                  </p>
                </div>
                <IconButton
                  icon={KeyRound}
                  label={`Resetear contraseña de ${juez.nombre} ${juez.apellidos}`}
                  onClick={() => setAResetear(juez)}
                  className="hover:text-hyrox-warning hover:bg-hyrox-warning/10"
                />
                <IconButton
                  icon={Trash2}
                  label={`Eliminar a ${juez.nombre} ${juez.apellidos}`}
                  onClick={() => setAEliminar(juez)}
                  className="hover:text-hyrox-danger hover:bg-hyrox-danger/10"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------- Alta de juez ------------------------- */}
      <Modal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        title="Nuevo juez"
        description="Se generara una contrasena temporal que debera cambiar al entrar."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Button>
            <Button form="form-juez" type="submit" loading={guardando}>
              Crear juez
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4">
            <Alert tone="error" onDismiss={() => setError('')}>
              {error}
            </Alert>
          </div>
        )}
        <form id="form-juez" onSubmit={crear} className="grid sm:grid-cols-2 gap-4">
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
            hint="Sera su usuario para entrar"
            required
          />
          <Field
            label="Box o gimnasio"
            value={form.box}
            onChange={(e) => setForm({ ...form, box: e.target.value })}
            required
          />
        </form>
      </Modal>

      {/* ------------------ Contrasena temporal generada ------------------ */}
      <Modal
        open={credencial !== null}
        onClose={() => setCredencial(null)}
        title="Credenciales del juez"
        description="Anota estos datos: la contrasena no se volvera a mostrar."
        size="sm"
        footer={
          <Button onClick={() => setCredencial(null)} fullWidth>
            Entendido
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            Esta contrasena es de un solo uso: al entrar, el juez debera definir la suya.
          </Alert>

          <div className="surface-inset p-4 space-y-3">
            <div>
              <p className="eyebrow mb-1">Juez</p>
              <p className="text-sm font-semibold text-hyrox-paper">{credencial?.nombre}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Cedula</p>
              <p className="font-mono text-sm text-hyrox-paper">{credencial?.cedula}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Contrasena temporal</p>
              <p className="font-mono text-lg font-bold text-hyrox-primary break-all">
                {credencial?.password}
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            icon={copiado ? KeyRound : Copy}
            onClick={copiarCredencial}
            fullWidth
          >
            {copiado ? 'Copiado' : 'Copiar credenciales'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={aResetear !== null}
        title="Resetear contraseña"
        message={`Se generará una contraseña temporal nueva para ${aResetear?.nombre ?? ''} ${aResetear?.apellidos ?? ''}. La actual dejará de funcionar y deberá cambiarla al entrar. Sus asignaciones y resultados no se tocan.`}
        confirmLabel="Generar nueva"
        loading={reseteando}
        onConfirm={resetear}
        onCancel={() => setAResetear(null)}
      />

      <ConfirmDialog
        open={aEliminar !== null}
        title="Eliminar juez"
        message={`Se eliminara a ${aEliminar?.nombre ?? ''} ${aEliminar?.apellidos ?? ''} y todas sus asignaciones. Los resultados que ya registro tambien se borraran.`}
        confirmLabel="Eliminar"
        loading={eliminando}
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
      />
    </AppShell>
  );
}
