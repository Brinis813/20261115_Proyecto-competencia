import { Component, type ReactNode } from 'react';
import { reportarErrorFrontend } from '../api/client';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // En producción el error viaja al log del backend (POST /api/errores);
    // la consola solo en desarrollo para no ensuciar la del juez.
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    } else {
      reportarErrorFrontend(error, { fuente: 'ErrorBoundary', stack: errorInfo.componentStack });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
          <div className="max-w-md rounded-lg bg-white p-8 shadow-lg">
            <div className="mb-4 text-5xl">⚠️</div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Algo salió mal</h1>
            <p className="mb-6 text-gray-600">
              Ha ocurrido un error inesperado. Puedes intentar recargar la página o volver al
              inicio.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Detalles del error
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-gray-100 p-3 text-xs text-red-600">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 transition-colors"
              >
                Recargar página
              </button>
              <button
                onClick={this.handleGoHome}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
