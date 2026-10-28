import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/**
 * Última red: si algo falla al dibujar, la persona ve un mensaje con una salida (en vez de una página en blanco).
 * Sin datos del error en pantalla.
 */
export class ErrorBoundary extends Component<Props, { fallo: boolean }> {
  override state = { fallo: false };

  static getDerivedStateFromError(): { fallo: boolean } {
    return { fallo: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error al dibujar la página', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="cargando-pagina" role="alert">
        <p>Algo salió mal al mostrar esta página.</p>
        <p>
          {/* Enlace común (no del router): recarga todo y sale del error. */}
          <a href="/">Volver al inicio</a>
        </p>
      </div>
    );
  }
}
