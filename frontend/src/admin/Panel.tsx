import { Suspense, useState } from 'react';
import { cerrarSesion } from '../api/admin';
import { type UsuarioSesion } from '../api/contract-panel';
import { Logo } from '../components/Logo';
import { nombreDeServicio } from '../data/servicios';
import { desuscribirDispositivo } from '../pwa/avisos';
import { resolverVista, type Vista } from '../lib/hoy';
import { ContextoCobro } from './cobro/contextoCobro';
import { NavegacionPanel } from './NavegacionPanel';
import { BotonPerfil, HojaPerfil } from './navegacion/PerfilPanel';
import { puedeEditarCatalogo, puedeEditarDisponibilidad, puedeGestionarUsuarios } from './permisos';
import { navegacionPara, seccionDe, vistasPermitidas, type PropsSeccion } from './secciones';
import { useConsulta } from './usePantallaAncha';
import { useServicios } from './useServicios';
import type { Filtro } from './useTurnos';
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

/**
 * Cáscara del panel: encabezado limpio (marca y avatar de perfil), navegación de secciones (barra de abajo en el
 * celular, fila en la compu) y el menú de perfil con nombre, rol, ajustes de la app y Salir.
 */
export function Panel({ usuario, alSalir, alVencerSesion }: Props) {
  const gestionaUsuarios = puedeGestionarUsuarios(usuario.rol);
  // Se abre en Hoy, o en la vista de `?vista=` (accesos directos de la app) si es válida y este rol la puede ver.
  const [vista, setVista] = useState<Vista>(() =>
    resolverVista(new URLSearchParams(window.location.search).get('vista'), vistasPermitidas(usuario.rol)),
  );
  // Desde Hoy, "Abrir" lleva a Turnos con el nombre ya buscado; se cambia de `key` para que Turnos arranque de cero.
  const [busquedaTurnos, setBusquedaTurnos] = useState<{
    texto: string;
    clave: number;
    filtro?: Filtro;
  } | null>(null);
  // `filtro` abre Turnos en esa pestaña (el aviso de Hoy "sin cobro cargado" lleva a Completadas).
  // `abrirCon` es un pedido para la sección de destino (por ejemplo 'bajo-stock' al ir a Inventario desde Hoy).
  const [pedido, setPedido] = useState<{
    vista: Vista;
    valor: string;
    clave: number;
  } | null>(null);
  const irA = (destino: Vista, busqueda?: string, filtro?: Filtro, abrirCon?: string) => {
    setBusquedaTurnos((previa) =>
      busqueda || filtro ? { texto: busqueda ?? '', clave: (previa?.clave ?? 0) + 1, filtro } : null,
    );
    setPedido((previo) => (abrirCon ? { vista: destino, valor: abrirCon, clave: (previo?.clave ?? 0) + 1 } : null));
    setVista(destino);
  };
  const quien = usuario.nombre ?? usuario.email ?? 'Tu usuario';
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const pantallaAncha = useConsulta('(min-width: 1180px)');
  // El catálogo se carga una vez para todo el panel: Turnos lo usa para mostrar el nombre de cada servicio.
  const catalogo = useServicios(alVencerSesion);
  const nombreServicio = (id: string) => nombreDeServicio(id, catalogo.servicios ?? []);
  // Lo que la tarjeta de un turno necesita para completar con cobro: quién está logueado y el "Desde" de cada servicio.
  const datosDeCobro = {
    usuarioId: usuario.id,
    precioDesde: (id: string) => catalogo.servicios?.find((x) => x.id === id)?.precioDesde ?? null,
    alVencerSesion,
  };

  // Las diez secciones salen del registro (secciones.ts), filtradas por rol: las principales y las de "Más".
  const { principales, mas } = navegacionPara(usuario.rol);
  const seccionActual = seccionDe(vista);
  const Diferida = seccionActual.puede(usuario.rol) ? seccionActual.componente : undefined;
  const propsSeccion: PropsSeccion = {
    rol: usuario.rol,
    usuarioId: usuario.id,
    alVencerSesion,
    irA,
    catalogo,
    nombreServicio,
    abrirCon: pedido?.vista === vista ? pedido.valor : undefined,
  };

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
    <ContextoCobro.Provider value={datosDeCobro}>
      <div className={pantallaAncha ? 'panel' : 'panel panel--barra'}>
        <header className="panel__riel">
          <div className="panel__riel-interior">
            <div className="panel__marca">
              <Logo tamano="chico" />
              <span className="panel__rotulo">Panel</span>
            </div>
            <BotonPerfil
              quien={quien}
              abierto={perfilAbierto}
              alAbrir={() => {
                setPerfilAbierto(true);
              }}
            />
          </div>
          {pantallaAncha && (
            <NavegacionPanel
              principales={principales}
              mas={mas}
              vista={vista}
              alElegir={irA}
              modo={pantallaAncha ? 'fila' : 'barra'}
            />
          )}
        </header>
        {!pantallaAncha && (
          <NavegacionPanel
            principales={principales}
            mas={mas}
            vista={vista}
            alElegir={irA}
            modo={pantallaAncha ? 'fila' : 'barra'}
          />
        )}
        <HojaPerfil
          abierta={perfilAbierto}
          alCerrar={() => {
            setPerfilAbierto(false);
          }}
          quien={quien}
          email={usuario.email}
          rol={usuario.rol}
          usuarioId={usuario.id}
          alVencerSesion={alVencerSesion}
          alSalir={() => {
            void salir();
          }}
        />

        <main className="panel__trabajo">
          {vista === 'usuarios' && gestionaUsuarios ? (
            <VistaUsuarios idPropio={usuario.id} alVencerSesion={alVencerSesion} />
          ) : Diferida ? (
            <Suspense fallback={<p className="panel__cargando">Cargando {seccionActual.etiqueta.toLowerCase()}…</p>}>
              <Diferida key={pedido?.vista === vista ? pedido.clave : 0} {...propsSeccion} />
            </Suspense>
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
              filtroInicial={busquedaTurnos?.filtro}
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
    </ContextoCobro.Provider>
  );
}
