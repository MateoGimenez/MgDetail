import { createContext, useContext } from 'react';
import type { ServicioPublico } from '../api/contract';
import { buscarServicio, serviciosDeRespaldo } from '../data/servicios';
import type { Servicio } from '../types';

/**
 * Catálogo que muestra la landing, compartido por Servicios, el arranque del Hero, el formulario de turno, su
 * resumen, el éxito y las preguntas frecuentes.
 * - cargando: todavía no respondió GET /api/servicios; se muestra el respaldo (los precios esperan).
 * - api: lo que respondió el backend, con sus precios.
 * - respaldo: la API falló; queda src/data/servicios.ts, sin precios.
 * - vacio: la API respondió bien pero no hay ningún servicio activo. NO se usa el respaldo (el backend rechazaría
 *   esos turnos): la landing avisa que por ahora no hay turnos online y lleva a WhatsApp o Instagram.
 */
export type EstadoCatalogo = 'cargando' | 'api' | 'respaldo' | 'vacio';

export interface Catalogo {
  readonly estado: EstadoCatalogo;
  readonly servicios: readonly Servicio[];
}

export const CATALOGO_CARGANDO: Catalogo = { estado: 'cargando', servicios: serviciosDeRespaldo };
export const CATALOGO_RESPALDO: Catalogo = { estado: 'respaldo', servicios: serviciosDeRespaldo };

export const CATALOGO_VACIO: Catalogo = { estado: 'vacio', servicios: [] };

/**
 * Respuesta de la API → catálogo. Una lista vacía es una respuesta válida (el dueño desactivó todo): no se
 * reemplaza por el respaldo, porque esos servicios no se pueden reservar.
 */
export function catalogoDeLaApi(servicios: readonly ServicioPublico[]): Catalogo {
  return servicios.length > 0 ? { estado: 'api', servicios } : CATALOGO_VACIO;
}

export const CatalogoContexto = createContext<Catalogo>(CATALOGO_CARGANDO);

export function useCatalogo() {
  const catalogo = useContext(CatalogoContexto);
  return {
    ...catalogo,
    buscar: (id: string) => buscarServicio(id, catalogo.servicios),
  };
}
