import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { mensajeDeError, setEventoActiva } from '../api/client';
import AppShell from '../components/layout/AppShell';
import { Alert, EmptyState, Panel, Spinner } from '../components/ui';
import GruposEventos from '../components/eventos/GruposEventos';
import type { Evento } from '../types';

/**
 * Panel del organizador: los eventos que administra.
 *
 * Comparte los bloques y las tarjetas con la portada publica; lo unico que
 * cambia es a donde llevan (aqui, a administrar el evento).
 */
export default function EventosPage() {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Evento[]>('/eventos')
      .then((res) => setEventos(res.data))
      .catch((err) => setError(mensajeDeError(err, 'No se pudieron cargar los eventos')))
      .finally(() => setCargando(false));
  }, []);

  return (
    <AppShell title="Eventos" subtitle="Las que organizas, por fecha">
      {cargando ? (
        <Spinner label="Cargando eventos..." />
      ) : (
        <div className="space-y-8 animate-fade-in">
          {error && (
            <Alert tone="error" onDismiss={() => setError('')}>
              {error}
            </Alert>
          )}

          {eventos.length === 0 && !error ? (
            <Panel>
              <EmptyState
                icon={Trophy}
                title="Todavia no tienes eventos"
                description="Cuando actives tu cuenta desde el correo te creamos una de ejemplo para empezar."
              />
            </Panel>
          ) : (
            // Abrir un evento la fija como activa: a partir de ahi
            // todas las pantallas de administracion trabajan sobre ella.
            <GruposEventos
              eventos={eventos}
              destino={() => '/admin'}
              alElegir={(c) => {
                setEventoActiva(c.id, c.nombre);
                navigate('/admin');
              }}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
