import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import Brand from '../../components/layout/Brand';
import { Alert, Button, Field, PasswordField } from '../../components/ui';
import { REQUISITOS_PASSWORD, ListaRequisitos } from '../../components/auth/RequisitosPassword';

const FORM_VACIO = {
  nombre: '',
  apellidos: '',
  cedula: '',
  box: '',
  email: '',
  password: '',
};

/**
 * Alta de una cuenta de organizador.
 *
 * No inicia sesion al terminar: la cuenta queda pendiente de confirmar el
 * correo, y es ese enlace el que la activa y crea su evento de ejemplo.
 */
export default function RegistroPage() {
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ email: string; correoEnviado: boolean } | null>(null);

  const cumplePassword = REQUISITOS_PASSWORD.every((r) => r.cumple(form.password));
  const completo =
    form.nombre.trim() && form.apellidos.trim() && form.cedula.trim() && form.box.trim() && form.email.trim();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const { data } = await api.post<{ email: string; correoEnviado: boolean }>('/auth/registro', {
        ...form,
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
        cedula: form.cedula.trim(),
        box: form.box.trim(),
        email: form.email.trim(),
      });
      setEnviado(data);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo crear la cuenta'));
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <Pantalla>
        <div className="text-center animate-fade-in">
          <span className="grid place-items-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-hyrox-accent/12 text-hyrox-accent">
            <MailCheck className="w-7 h-7" aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-bold text-hyrox-paper">Revisa tu correo</h1>
          <p className="text-sm text-hyrox-mist mt-2">
            Enviamos un enlace a <span className="text-hyrox-paper font-semibold">{enviado.email}</span>.
            Ábrelo para activar tu cuenta; caduca en 24 horas.
          </p>

          {!enviado.correoEnviado && (
            <Alert tone="warning" className="mt-5 text-left">
              Esta instalación todavía no tiene servidor de correo configurado, así que el mensaje no
              salió. El enlace queda en el registro del servidor: pídeselo a quien la administra.
            </Alert>
          )}

          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-hyrox-primary hover:text-hyrox-ember transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Volver al acceso
          </Link>
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <h1 className="font-display text-2xl font-bold text-hyrox-paper text-center">Crea tu cuenta</h1>
      <p className="text-sm text-hyrox-mist text-center mt-1 mb-6">
        Al activarla te preparamos un evento de ejemplo para que empieces a trastear.
      </p>

      <form onSubmit={enviar} className="space-y-4" noValidate>
        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            autoComplete="given-name"
            required
          />
          <Field
            label="Apellidos"
            value={form.apellidos}
            onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
            autoComplete="family-name"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Cedula"
            value={form.cedula}
            onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            hint="Sera tu usuario para entrar"
            inputMode="numeric"
            required
          />
          <Field
            label="Box o gimnasio"
            value={form.box}
            onChange={(e) => setForm({ ...form, box: e.target.value })}
            required
          />
        </div>

        <Field
          label="Correo electronico"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="tu@correo.com"
          autoComplete="email"
          required
        />

        <div>
          <PasswordField
            label="Contrasena"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />
          <ListaRequisitos password={form.password} className="mt-3" />
        </div>

        <Button
          type="submit"
          fullWidth
          loading={enviando}
          disabled={!completo || !cumplePassword}
          icon={ArrowRight}
        >
          Crear cuenta
        </Button>
      </form>

      <p className="text-center text-sm text-hyrox-mist mt-6">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-hyrox-primary hover:text-hyrox-ember">
          Entra aqui
        </Link>
      </p>
    </Pantalla>
  );
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hyrox-void px-4 py-10 grid place-items-center">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Brand size="lg" />
        </div>
        <div className="surface p-6 sm:p-7">{children}</div>
      </div>
    </div>
  );
}
