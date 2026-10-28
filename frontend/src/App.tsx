import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { Landing } from './landing/Landing';
import { NoEncontrada } from './NoEncontrada';

// El panel se descarga solo al entrar a /admin, con su propio CSS.
const PanelAdmin = lazy(() => import('./admin/AdminApp'));
// El seguimiento de un turno llega por un enlace suelto: tampoco carga la landing.
const Seguimiento = lazy(() => import('./seguimiento/PaginaSeguimiento'));
// Una página por servicio (/servicios/:id): también se descarga aparte, con su SEO propio.
const PaginaServicio = lazy(() => import('./landing/PaginaServicio'));

function CargandoPanel() {
  return (
    <div className="cargando-pagina" role="status">
      Cargando el panel…
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<CargandoPanel />}>
            <PanelAdmin />
          </Suspense>
        }
      />
      <Route
        path="/turno/:id"
        element={
          <Suspense fallback={<div className="cargando-pagina" role="status">Buscando tu turno…</div>}>
            <Seguimiento />
          </Suspense>
        }
      />
      <Route
        path="/servicios/:id"
        element={
          <Suspense fallback={<div className="cargando-pagina" role="status">Cargando el servicio…</div>}>
            <PaginaServicio />
          </Suspense>
        }
      />
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
    </ErrorBoundary>
  );
}
