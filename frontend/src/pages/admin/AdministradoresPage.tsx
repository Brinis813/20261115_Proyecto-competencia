import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Building2, Copy, Plus, UserCog } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Modal,
  Panel,
  PanelHeader,
  Select,
  SkeletonList,
} from '../../components/ui';
import type { Administrador, Box } from '../../types';

const FORM_VACIO = { nombre: '', apellidos: '', cedula: '', email: '', box_id: '' };

/**
 * Administradores de box.
 *
 * Solo entra aquí el administrador general. Cada administrador que se crea
 * queda atado a un box y, a partir de ahí, solo puede tocar los eventos
 * de ese box.
 */
export default function AdministradoresPage() {
  const [admins, setAdmins] = useState<Administrador[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [credenciales, setCredenciales] = useState<{
    nombre: string;
    cedula: string;
    password: string;
  } | null>(null);

  async function cargar() {
    try {
      const [resAdmins, resBoxes] = await Promise.all([
        api.get<Administrador[]>('/users/admins'),
        api.get<Box[]>('/boxes'),
      ]);
      setAdmins(resAdmins.data);
      setBoxes(resBoxes.data);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los administradores'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);

    try {
      const { data } = await api.post<{ usuario: Administrador; tempPassword: string }>(
        '/users/admins',
        {
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          cedula: form.cedula.trim(),
          email: form.email.trim() || null,
          box_id: Number(form.box_id),
        },
      );

      setFormAbierto(false);
      setForm(FORM_VACIO);
      setCredenciales({
        nombre: `${data.usuario.nombre} ${data.usuario.apellidos}`,
        cedula: data.usuario.cedula,
        password: data.tempPassword,
      });
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo crear el administrador'));
    } finally {
      setGuardando(false);
    }
  }

  const completo = form.nombre.trim() && form.apellidos.trim() && form.cedula.trim() && form.box_id;

  return (
    <AppShell
      title="Administradores"
      subtitle="Quien gestiona cada box"
      actions={
        <Button
          size="sm"
          icon={Plus}
          onClick={() => setFormAbierto(true)}
          disabled={boxes.length === 0}
        >
          <span className="hidden sm:inline">Nuevo administrador</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error && (
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {!cargando && boxes.length === 0 && (
          <Alert tone="warning">
            Todavia no hay boxes. Crea uno en la pantalla de Boxes antes de dar de alta a un
            administrador: cada administrador tiene que pertenecer a uno.
          </Alert>
        )}

        <Panel>
          <PanelHeader
            title={`${admins.length} administradores`}
            subtitle="Cada uno solo ve los eventos de su box"
            icon={UserCog}
          />

          {cargando ? (
            <SkeletonList rows={4} />
          ) : admins.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title="Todavia no hay administradores de box"
              description="El administrador general puede crear uno y asignarlo a un box."
            />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {admins.map((admin) => (
                <li key={admin.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-primary/12 text-hyrox-primary text-xs font-bold shrink-0">
                    {admin.nombre[0]}
                    {admin.apellidos[0]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-hyrox-paper truncate">
                      {admin.nombre} {admin.apellidos}
                    </p>
                    <p className="text-2xs text-hyrox-ghost font-mono">
                      C.I. {admin.cedula}
                      {admin.email && ` · ${admin.email}`}
                    </p>
                  </div>

                  <span className="badge badge-gray shrink-0">
                    <Building2 className="w-3 h-3" aria-hidden="true" />
                    {admin.boxDetalle?.nombre ?? 'Sin box'}
                  </span>

                  {!admin.password_cambiado && (
                    <span className="badge badge-amber shrink-0 hidden sm:inline-flex">
                      Sin estrenar
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Modal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        title="Nuevo administrador"
        description="Se generara una contrasena temporal que debera cambiar al entrar."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={guardando} disabled={!completo}>
              Crear administrador
            </Button>
          </>
        }
      >
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
            <Field
              label="Apellidos"
              value={form.apellidos}
              onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
              required
            />
          </div>

          <Field
            label="Cedula"
            value={form.cedula}
            onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            hint="Sera su usuario para entrar"
            required
          />

          <Field
            label="Correo electronico"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="admin@correo.com"
            hint="Opcional"
          />

          <Select
            label="Box"
            value={form.box_id}
            onChange={(e) => setForm({ ...form, box_id: e.target.value })}
            required
          >
            <option value="">Elige el box</option>
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.nombre}
                {box.ciudad ? ` · ${box.ciudad}` : ''}
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      {/* La contrasena temporal se muestra una sola vez, igual que con los jueces. */}
      <Modal
        open={!!credenciales}
        onClose={() => setCredenciales(null)}
        title="Administrador creado"
        description="Anota estos datos: la contrasena no se vuelve a mostrar."
        size="sm"
        footer={<Button onClick={() => setCredenciales(null)}>Entendido</Button>}
      >
        {credenciales && (
          <div className="space-y-4">
            <Alert tone="warning">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              Esta contrasena es de un solo uso: al entrar, tendra que definir la suya.
            </Alert>

            <dl className="surface-inset p-4 space-y-3">
              <div>
                <dt className="eyebrow">Administrador</dt>
                <dd className="text-sm font-semibold text-hyrox-paper">{credenciales.nombre}</dd>
              </div>
              <div>
                <dt className="eyebrow">Cedula</dt>
                <dd className="font-mono text-sm text-hyrox-paper">{credenciales.cedula}</dd>
              </div>
              <div>
                <dt className="eyebrow">Contrasena temporal</dt>
                <dd className="font-mono text-sm font-bold text-hyrox-primary break-all">
                  {credenciales.password}
                </dd>
              </div>
            </dl>

            <Button
              variant="secondary"
              fullWidth
              icon={Copy}
              onClick={() =>
                navigator.clipboard?.writeText(
                  `Cedula: ${credenciales.cedula}\nContrasena: ${credenciales.password}`,
                )
              }
            >
              Copiar credenciales
            </Button>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
