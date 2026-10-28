import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Rol } from '../api/contract-panel';
import type { Vista } from '../lib/hoy';
import Proximamente from './Proximamente';
import { puedeGestionarUsuarios, puedeVerFinanzas } from './permisos';
import type { Filtro } from './useTurnos';
import type { Catalogo } from './useServicios';

/**
 * Registro de las secciones del panel (reportes/2026-10-27_17_finanzas-inventario-documentos.md): una sola lista con
 * la clave (la de `?vista=`), la etiqueta, si va en la barra principal, quién la ve y, en las que se cargan aparte, el
 * componente diferido. `Panel.tsx` arma la navegación y el contenido desde acá.
 *
 * Las secciones de siempre (Hoy, Turnos, Agenda, Disponibilidad, Servicios y Usuarios) las dibuja `Panel.tsx` con sus
 * propiedades particulares; las que traen `componente` reciben todas las mismas `PropsSeccion`.
 */

/** Lo que Panel le da a cada sección diferida. Las que no usan algo, lo ignoran. */
export interface PropsSeccion {
  rol: Rol;
  usuarioId: string;
  alVencerSesion: (mensaje: string) => void;
  /** Lleva a otra sección. `abrirCon` es un pedido para la sección de destino (por ejemplo 'bajo-stock' en Inventario). */
  irA: (vista: Vista, busqueda?: string, filtro?: Filtro, abrirCon?: string) => void;
  /** Catálogo de servicios del panel (nombres y "Desde"), ya cargado por Panel. */
  catalogo: Catalogo;
  nombreServicio: (id: string) => string;
  /** Con qué se abrió desde otra sección, si se abrió así; undefined al navegar con el menú. */
  abrirCon?: string;
}

export interface Seccion {
  clave: Vista;
  etiqueta: string;
  /** Va siempre a mano en la barra de abajo del celular; las demás se juntan en "Más". */
  principal: boolean;
  /** Quién la ve. La regla real la aplica el backend: acá solo se esconde lo que daría 403. */
  puede: (rol: Rol) => boolean;
  /** Componente cargado aparte. Sin él, `Panel.tsx` dibuja la sección con sus propiedades de siempre. */
  componente?: LazyExoticComponent<ComponentType<PropsSeccion>>;
}

const todos = () => true;

/*
 * Las secciones de Presupuestos e Inventario son de otro bloque de trabajo (F2) y viven en sus propias carpetas.
 * `import.meta.glob` devuelve vacío mientras el archivo no existe, así el build no se rompe: la sección muestra
 * "Próximamente" y, cuando el archivo aparece, se carga sola (aparte, con `lazy`). Acepta `export default` o el
 * export con nombre.
 */
type Modulo = Record<string, unknown>;
const modulosDeOtroBloque = import.meta.glob<Modulo>([
  './presupuestos/VistaPresupuestos.tsx',
  './inventario/VistaInventario.tsx',
]);

function diferidaSiExiste(ruta: string, nombreExport: string): LazyExoticComponent<ComponentType<PropsSeccion>> {
  const cargar = modulosDeOtroBloque[ruta];
  return lazy(async () => {
    if (!cargar) return { default: Proximamente as ComponentType<PropsSeccion> };
    const modulo = await cargar();
    const componente = modulo.default ?? modulo[nombreExport];
    return {
      default: (typeof componente === 'function' ? componente : Proximamente) as ComponentType<PropsSeccion>,
    };
  });
}

export const SECCIONES: readonly Seccion[] = [
  { clave: 'hoy', etiqueta: 'Hoy', principal: true, puede: todos },
  { clave: 'turnos', etiqueta: 'Turnos', principal: true, puede: todos },
  { clave: 'agenda', etiqueta: 'Agenda', principal: true, puede: todos },
  {
    clave: 'inventario',
    etiqueta: 'Inventario',
    principal: false,
    puede: todos,
    componente: diferidaSiExiste('./inventario/VistaInventario.tsx', 'VistaInventario'),
  },
  {
    clave: 'estadisticas',
    etiqueta: 'Estadísticas',
    principal: false,
    puede: todos,
    // Estadísticas se descarga aparte: quien no la abre no paga el peso de los gráficos.
    componente: lazy(() => import('./estadisticas/VistaEstadisticas')),
  },
  {
    clave: 'finanzas',
    etiqueta: 'Finanzas',
    principal: false,
    puede: puedeVerFinanzas,
    componente: lazy(() => import('./finanzas/VistaFinanzas')),
  },
  {
    clave: 'presupuestos',
    etiqueta: 'Presupuestos',
    principal: false,
    puede: (rol) => rol === 'superadmin' || rol === 'admin',
    componente: diferidaSiExiste('./presupuestos/VistaPresupuestos.tsx', 'VistaPresupuestos'),
  },
  {
    clave: 'disponibilidad',
    etiqueta: 'Disponibilidad',
    principal: false,
    puede: todos,
  },
  { clave: 'servicios', etiqueta: 'Servicios', principal: false, puede: todos },
  {
    clave: 'usuarios',
    etiqueta: 'Usuarios',
    principal: false,
    puede: puedeGestionarUsuarios,
  },
];

export function seccionDe(clave: Vista): Seccion {
  const seccion = SECCIONES.find((s) => s.clave === clave);
  if (!seccion) throw new RangeError(`Sección sin registrar: ${clave}`);
  return seccion;
}

/** Las secciones que ve este rol, en el orden de la navegación. */
export const seccionesVisibles = (rol: Rol): Seccion[] => SECCIONES.filter((s) => s.puede(rol));

/** Las claves de `?vista=` que este rol puede abrir (las demás caen en Hoy). */
export const vistasPermitidas = (rol: Rol): Vista[] => seccionesVisibles(rol).map((s) => s.clave);

/**
 * La navegación del celular: las secciones principales (barra de abajo) y el resto (hoja "Más"), ya filtradas por
 * rol. "Más" no aparece si no queda nada para meter adentro.
 */
export function navegacionPara(rol: Rol): {
  principales: Seccion[];
  mas: Seccion[];
} {
  const visibles = seccionesVisibles(rol);
  return {
    principales: visibles.filter((s) => s.principal),
    mas: visibles.filter((s) => !s.principal),
  };
}
