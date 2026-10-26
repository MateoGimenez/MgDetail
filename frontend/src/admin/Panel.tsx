import { useState } from 'react';
import { cerrarSesion } from '../api/admin';
import { ETIQUETA_ROL, type UsuarioSesion } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';
import { nombreDeServicio } from '../data/servicios';
import { BotonAjustes } from '../pwa/AjustesApp';
import { desuscribirDispositivo } from '../pwa/avisos';
import { VISTAS, resolverVista, type Vista } from '../lib/hoy';
import { puedeEditarCatalogo, puedeEditarDisponibilidad, puedeGestionarUsuarios } from './permisos';
import { useServicios } from './useServicios';
import { VistaAgenda } from './VistaAgenda';
import { VistaDisponibilidad } from './VistaDisponibilidad';
import { VistaHoy } from './VistaHoy';
import { VistaServicios } from './VistaServicios';
import { VistaTurnos } from './VistaTurnos';
import { VistaUsuarios } from './VistaUsuarios';

interface Props {
  usuario: UsuarioSesion;
  alSalir: () => void;
  alVencerSesion: (mensaje: string) => void;
}

/** Cáscara del panel: riel con quién está conectado y su rol, secciones y salir. */
export function Panel({ usuario, alSalir, alVencerSesion }: Props) {
  const gestionaUsuarios = puedeGestionarUsuarios(usuario.rol);
  // Se abre en Hoy, o en la vista de `?vista=` (accesos directos de la app) si es válida y este rol la puede ver.
  const [vista, setVista] = useState<Vista>(() =>
    resolverVista(
      new URLSearchParams(window.location.search).get('vista'),
      VISTAS.filter((v) => v !== 'usuarios' || gestionaUsuarios),
    ),
  );
  // Desde Hoy, "Abrir" lleva a Turnos con el nombre ya buscado; se cambia de `key` para que Turnos arranque de cero.
  const [busquedaTurnos, setBusquedaTurnos] = useState<{ texto: string; clave: number } | null>(null);
  const irA = (destino: Vista, busqueda?: string) => {
    setBusquedaTurnos((previa) => (busqueda ? { texto: busqueda, clave: (previa?.clave ?? 0) + 1 } : null));
    setVista(destino);
  };
  const quien = usuario.nombre ?? usuario.email ?? 'Tu usuario';
  // El catálogo se carga una vez para todo el panel: Turnos lo usa para mostrar el nombre de cada servicio.
  const catalogo = useServicios(alVencerSesion);
  const nombreServicio = (id: string) => nombreDeServicio(id, catalogo.servicios ?? []);

  const secciones: readonly (readonly [Vista, string])[] = [
    ['hoy', 'Hoy'],
    ['turnos', 'Turnos'],
    ['agenda', 'Agenda'],
    ['disponibilidad', 'Disponibilidad'],
    ['servicios', 'Servicios'],
    ...(gestionaUsuarios ? ([['usuarios', 'Usuarios']] as const) : []),
  ];

  const salir = async () => {
    // Este dispositivo deja de recibir avisos y se limpia el globito (antes de cerrar la sesión: hace falta estar
    // logueado para borrar la suscripción). No lanza ni demora más de unos segundos.
    await desuscribirDispositivo();
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
            <BotonAjustes alVencerSesion={alVencerSesion} usuarioId={usuario.id} />
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
                    if (valor !== vista) irA(valor);
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
        ) : vista === 'turnos' ? (
          <VistaTurnos
            key={busquedaTurnos?.clave ?? 0}
            rol={usuario.rol}
            busquedaInicial={busquedaTurnos?.texto}
            nombreServicio={nombreServicio}
            alVencerSesion={alVencerSesion}
          />
        ) : (
          <VistaHoy
            rol={usuario.rol}
            nombre={usuario.nombre ?? usuario.email ?? null}
            nombreServicio={nombreServicio}
            alVencerSesion={alVencerSesion}
            irA={irA}
          />
        )}
      </main>
    </div>
  );
}
