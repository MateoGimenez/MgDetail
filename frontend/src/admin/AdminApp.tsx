import { useCallback, useEffect, useState } from 'react';
import { sesionActual } from '../api/admin';
import { esAbortado } from '../api/client';
import { Icono } from '../components/Icono';
import { Login } from './Login';
import { Panel } from './Panel';
import './admin.css';

type Sesion =
  | { estado: 'verificando' }
  | { estado: 'anonima'; aviso?: string }
  | { estado: 'activa'; email: string }
  | { estado: 'error'; mensaje: string };

export default function AdminApp() {
  const [sesion, setSesion] = useState<Sesion>({ estado: 'verificando' });
  const [intento, setIntento] = useState(0);

  // Título de la pestaña mientras se usa el panel (el de index.html es el de la landing).
  useEffect(() => {
    const anterior = document.title;
    document.title = 'Panel · MgDetailing';
    return () => {
      document.title = anterior;
    };
  }, []);

  useEffect(() => {
    const control = new AbortController();
    sesionActual(control.signal)
      .then((email) => {
        setSesion(email ? { estado: 'activa', email } : { estado: 'anonima' });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        setSesion({
          estado: 'error',
          mensaje: error instanceof Error ? error.message : 'No pudimos conectarnos con el servidor.',
        });
      });
    return () => {
      control.abort();
    };
  }, [intento]);

  const alVencerSesion = useCallback(() => {
    setSesion({ estado: 'anonima', aviso: 'Tu sesión venció. Ingresá de nuevo.' });
  }, []);

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      {sesion.estado === 'verificando' && (
        <div className="admin-pantalla">
          <p className="admin-pantalla__texto" role="status">
            Verificando tu sesión…
          </p>
        </div>
      )}
      {sesion.estado === 'error' && (
        <div className="admin-pantalla">
          <div className="admin-pantalla__caja" role="alert">
            <Icono nombre="alerta" tamano={28} />
            <h1 className="admin-pantalla__titulo">No pudimos abrir el panel</h1>
            <p>{sesion.mensaje}</p>
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => {
                setSesion({ estado: 'verificando' });
                setIntento((n) => n + 1);
              }}
            >
              <Icono nombre="refrescar" tamano={18} />
              Reintentar
            </button>
          </div>
        </div>
      )}
      {sesion.estado === 'anonima' && (
        <Login
          aviso={sesion.aviso}
          alIngresar={(email) => {
            setSesion({ estado: 'activa', email });
          }}
        />
      )}
      {sesion.estado === 'activa' && (
        <Panel
          email={sesion.email}
          alSalir={() => {
            setSesion({ estado: 'anonima' });
          }}
          alVencerSesion={alVencerSesion}
        />
      )}
    </>
  );
}
