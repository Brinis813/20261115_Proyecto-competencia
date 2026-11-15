import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { OfflineBanner } from './components/layout/ConnectionBadge';
import BotonAyuda from './components/layout/BotonAyuda';

// H7: Lazy loading de todas las páginas — solo se descarga el código cuando el usuario navega ahí.
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ChangePasswordPage = lazy(() => import('./pages/auth/ChangePasswordPage'));
const RegistroPage = lazy(() => import('./pages/auth/RegistroPage'));
const VerificarPage = lazy(() => import('./pages/auth/VerificarPage'));
const EventosPage = lazy(() => import('./pages/EventosPage'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const JuecesPage = lazy(() => import('./pages/admin/JuecesPage'));
const ParticipantesPage = lazy(() => import('./pages/admin/ParticipantesPage'));
const CategoriasPage = lazy(() => import('./pages/admin/CategoriasPage'));
const CompetenciasPage = lazy(() => import('./pages/admin/CompetenciasPage'));
const CompetenciaForm = lazy(() => import('./pages/admin/CompetenciaForm'));
const AsignacionesPage = lazy(() => import('./pages/admin/AsignacionesPage'));
const HeatsPage = lazy(() => import('./pages/admin/HeatsPage'));
const ResultadosPage = lazy(() => import('./pages/admin/ResultadosPage'));
const CargaMasivaPage = lazy(() => import('./pages/admin/CargaMasivaPage'));
const InformeFinalPage = lazy(() => import('./pages/admin/InformeFinalPage'));
const BoxesPage = lazy(() => import('./pages/admin/BoxesPage'));
const AdministradoresPage = lazy(() => import('./pages/admin/AdministradoresPage'));

const JuezCompetenciasPage = lazy(() => import('./pages/judge/JuezCompetenciasPage'));
const JuezWodsPage = lazy(() => import('./pages/judge/JuezWodsPage'));
const JuezMedicionPage = lazy(() => import('./pages/judge/JuezMedicionPage'));
const ClasificacionPage = lazy(() => import('./pages/judge/ClasificacionPage'));

const ParticipantePage = lazy(() => import('./pages/participant/ParticipantePage'));

const PortadaPage = lazy(() => import('./pages/public/PortadaPage'));
const EventoPublicoPage = lazy(() => import('./pages/public/EventoPublicoPage'));
const EventoLeaderboardPage = lazy(() => import('./pages/public/EventoLeaderboardPage'));
const LeaderboardPage = lazy(() => import('./pages/public/LeaderboardPage'));

const HelpPage = lazy(() => import('./pages/HelpPage'));
const HomeRedirect = lazy(() => import('./pages/HomeRedirect'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

/**
 * Mapa de rutas de la aplicacion.
 *
 * Cada pantalla tiene URL propia y se puede compartir o recargar: la del
 * leaderboard de una competencia sirve para dejarla fija en la pantalla del evento, y
 * la del juez lleva la competencia y el WOD en la ruta para poder retomar la
 * medicion tras un reinicio del navegador.
 */
/** Loader de Suspense para lazy-loaded pages. */
function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    // Los future flags activan desde ya el comportamiento de React Router v7,
    // asi que la migracion no traera sorpresas (y desaparecen sus avisos).
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SocketProvider>
          <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* --- Publico --- */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegistroPage />} />
            <Route path="/verificar" element={<VerificarPage />} />
            {/* La portada lista los eventos; dentro de cada una estan
                sus competencias, y dentro de cada competencia su clasificacion. */}
            <Route path="/inicio" element={<PortadaPage />} />
            <Route path="/eventos/:eventoId" element={<EventoPublicoPage />} />
            <Route path="/leaderboard/evento/:eventoId" element={<EventoLeaderboardPage />} />
            <Route path="/leaderboard" element={<Navigate to="/inicio" replace />} />
            <Route path="/leaderboard/:competenciaId" element={<LeaderboardPage />} />

            {/* --- Cuenta --- */}
            <Route
              path="/cambiar-password"
              element={
                <ProtectedRoute allowedRoles={['admin', 'juez']}>
                  <ChangePasswordPage />
                </ProtectedRoute>
              }
            />

            {/* --- Eventos: primera pantalla de un administrador --- */}
            <Route
              path="/eventos"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <EventosPage />
                </ProtectedRoute>
              }
            />

            {/* --- Solo el administrador general --- */}
            <Route
              path="/admin/boxes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <BoxesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/administradores"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdministradoresPage />
                </ProtectedRoute>
              }
            />

            {/* --- Administracion --- */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/jueces"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <JuecesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/participantes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ParticipantesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/categorias"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CategoriasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/competencias"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CompetenciasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/competencias/nuevo"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CompetenciaForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/competencias/:competenciaId"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CompetenciaForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/asignaciones"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AsignacionesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/asignaciones/:competenciaId"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AsignacionesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/heats"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <HeatsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/resultados"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ResultadosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/resultados/:competenciaId"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ResultadosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/carga-masiva"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CargaMasivaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/informe"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <InformeFinalPage />
                </ProtectedRoute>
              }
            />

            {/* --- Juez --- */}
            <Route
              path="/juez"
              element={
                <ProtectedRoute allowedRoles={['admin', 'juez']}>
                  <JuezCompetenciasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/juez/:competenciaId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'juez']}>
                  <JuezWodsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/juez/:competenciaId/:wodId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'juez']}>
                  <JuezMedicionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clasificacion"
              element={
                <ProtectedRoute allowedRoles={['admin', 'juez']}>
                  <ClasificacionPage />
                </ProtectedRoute>
              }
            />

            {/* --- Atleta --- */}
            <Route
              path="/participante"
              element={
                <ProtectedRoute allowedRoles={['participante', 'admin']}>
                  <ParticipantePage />
                </ProtectedRoute>
              }
            />

            {/* --- Ayuda (cualquier rol con sesion) --- */}
            <Route
              path="/ayuda"
              element={
                <ProtectedRoute>
                  <HelpPage />
                </ProtectedRoute>
              }
            />

            {/* --- Raiz y compatibilidad con las URLs anteriores --- */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/change-password" element={<Navigate to="/cambiar-password" replace />} />
            <Route path="/admin/users" element={<Navigate to="/admin/jueces" replace />} />
            <Route path="/admin/assignments" element={<Navigate to="/admin/asignaciones" replace />} />
            <Route path="/judge/*" element={<Navigate to="/juez" replace />} />
            <Route path="/participant" element={<Navigate to="/participante" replace />} />
            <Route path="/leaderboard/competencia/:competenciaId" element={<RedirigirLeaderboard />} />
            {/* Typo frecuente: se tipea "leadboard" sin las letras "er". */}
            <Route path="/leadboard" element={<Navigate to="/leaderboard" replace />} />
            <Route path="/leadboard/*" element={<Navigate to="/leaderboard" replace />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>

          <BotonAyuda />
          <OfflineBanner />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function RedirigirLeaderboard() {
  const { competenciaId } = useParams();
  return <Navigate to={`/leaderboard/${competenciaId}`} replace />;
}
