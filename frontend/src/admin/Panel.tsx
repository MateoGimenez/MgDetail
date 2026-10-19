import { useState } from 'react';
import { cerrarSesion } from '../api/admin';
import { ETIQUETA_ROL, type UsuarioSesion } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';
import { puedeGestionarUsuarios } from './permisos';
import { VistaTurnos } from './VistaTurnos';
import { VistaUsuarios } from './VistaUsuarios';

type Vista = 'turnos' | 'usuarios';

interface Props {
  usuario: UsuarioSesion;
  alSalir: () => void;
  alVencerSesion: (mensaje: string) => void;
}

/** Cáscara del panel: riel con quién está conectado y su rol, secciones y salir. */
export function Panel({ usuario, alSalir, alVencerSesion }: Props) {
  const [vista, setVista] = useState<Vista>('turnos');
  const gestionaUsuarios = puedeGestionarUsuarios(usuario.rol);
  const quien = usuario.nombre ?? usuario.email ?? 'Tu usuario';

  const salir = async () => {
    try {
      await cerrarSesion();
    } catch {
      // Aunque falle la red, se vuelve al ingreso: las cookies vencen solas.
    }
    alSalir();
  };

  return (
    <div className="panel">
      <header className="panel__riel">
        <div className="panel__riel-interior">
          <div className="panel__marca">
            <Logo tamano="chico" />
            <span className="panel__rotulo">Panel</span>
          </div>
          <div className="panel__usuario">
            <p className="panel__quien">
              <span className="panel__nombre">{quien}</span>
              <span className="panel__rol">{ETIQUETA_ROL[usuario.rol]}</span>
            </p>
            <button
              type="button"
              className="boton boton--fantasma boton--chico"
              onClick={() => {
                void salir();
              }}
            >
              <Icono nombre="salir" tamano={18} />
              Salir
            </button>
          </div>
        </div>
        {gestionaUsuarios && (
          <nav className="panel__secciones" aria-label="Secciones del panel">
            <ul role="list" className="panel__secciones-lista">
              {(
                [
                  ['turnos', 'Turnos'],
                  ['usuarios', 'Usuarios'],
                ] as const
              ).map(([valor, texto]) => (
                <li key={valor}>
                  <button
                    type="button"
                    className={vista === valor ? 'panel__seccion activa' : 'panel__seccion'}
                    aria-current={vista === valor ? 'page' : undefined}
                    onClick={() => {
                      setVista(valor);
                    }}
                  >
                    {texto}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="panel__trabajo">
        {vista === 'usuarios' && gestionaUsuarios ? (
          <VistaUsuarios idPropio={usuario.id} alVencerSesion={alVencerSesion} />
        ) : (
          <VistaTurnos rol={usuario.rol} alVencerSesion={alVencerSesion} />
        )}
      </main>
    </div>
  );
}
