import { useState } from 'react';
import { cerrarSesion } from '../api/admin';
import { ETIQUETA_ROL, type UsuarioSesion } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';
import { nombreDeServicio } from '../data/servicios';
import { puedeEditarCatalogo, puedeEditarDisponibilidad, puedeGestionarUsuarios } from './permisos';
import { useServicios } from './useServicios';
import { VistaAgenda } from './VistaAgenda';
import { VistaDisponibilidad } from './VistaDisponibilidad';
import { VistaServicios } from './VistaServicios';
import { VistaTurnos } from './VistaTurnos';
import { VistaUsuarios } from './VistaUsuarios';

type Vista = 'turnos' | 'agenda' | 'disponibilidad' | 'servicios' | 'usuarios';

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
  // El catálogo se carga una vez para todo el panel: Turnos lo usa para mostrar el nombre de cada servicio.
  const catalogo = useServicios(alVencerSesion);
  const nombreServicio = (id: string) => nombreDeServicio(id, catalogo.servicios ?? []);

  const secciones: readonly (readonly [Vista, string])[] = [
    ['turnos', 'Turnos'],
    ['agenda', 'Agenda'],
    ['disponibilidad', 'Disponibilidad'],
    ['servicios', 'Servicios'],
    ...(gestionaUsuarios ? ([['usuarios', 'Usuarios']] as const) : []),
  ];

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
        <nav className="panel__secciones" aria-label="Secciones del panel">
          <ul role="list" className="panel__secciones-lista">
            {secciones.map(([valor, texto]) => (
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
      </header>

      <main className="panel__trabajo">
        {vista === 'usuarios' && gestionaUsuarios ? (
          <VistaUsuarios idPropio={usuario.id} alVencerSesion={alVencerSesion} />
        ) : vista === 'agenda' ? (
          <VistaAgenda rol={usuario.rol} nombreServicio={nombreServicio} alVencerSesion={alVencerSesion} />
        ) : vista === 'disponibilidad' ? (
          <VistaDisponibilidad editable={puedeEditarDisponibilidad(usuario.rol)} alVencerSesion={alVencerSesion} />
        ) : vista === 'servicios' ? (
          <VistaServicios catalogo={catalogo} editable={puedeEditarCatalogo(usuario.rol)} />
        ) : (
          <VistaTurnos rol={usuario.rol} nombreServicio={nombreServicio} alVencerSesion={alVencerSesion} />
        )}
      </main>
    </div>
  );
}
