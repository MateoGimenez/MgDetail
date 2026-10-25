import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Landing } from './landing/Landing';
import { NoEncontrada } from './NoEncontrada';

// El panel se descarga solo al entrar a /admin, con su propio CSS.
const PanelAdmin = lazy(() => import('./admin/AdminApp'));
// El seguimiento de un turno llega por un enlace suelto: tampoco carga la landing.
const Seguimiento = lazy(() => import('./seguimiento/PaginaSeguimiento'));

function CargandoPanel() {
  return (
    <div className="cargando-pagina" role="status">
      Cargando el panel…
    </div>
  );
}

export function App() {
  return (
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
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
