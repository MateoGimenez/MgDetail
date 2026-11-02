/**
 * A dónde van los pedidos a la API.
 *
 * - Sin VITE_API_URL (desarrollo, o un solo servicio que sirve web + API): rutas relativas `/api/...`, mismo origen.
 * - Con VITE_API_URL (producción con el frontend como Static Site y la API aparte, ej. https://api.mgdetail.com.ar):
 *   `https://api.mgdetail.com.ar/api/...`. Las cookies de sesión viven en el dominio de la API; como web y API son
 *   del mismo sitio (mgdetail.com.ar), viajan con `credentials: 'include'` aunque sean SameSite=Strict.
 *
 * La variable se valida al compilar (vite.config.ts): acá ya llega limpia o vacía.
 */

/** Normaliza el valor de VITE_API_URL: solo el origen (esquema + host + puerto), sin barra final. Vacío → ''. */
export function origenDeLaApi(valor: string | undefined): string {
  const limpio = (valor ?? '').trim();
  if (limpio === '') return '';
  return new URL(limpio).origin;
}

const ORIGEN = origenDeLaApi(import.meta.env.VITE_API_URL);

/** Prefijo de todas las rutas de la API. */
export const API_BASE = `${ORIGEN}/api`;

/**
 * Con la API en otro origen hay que pedir que viajen las cookies (`include`); en el mismo origen alcanza
 * `same-origin`, que además nunca las manda a otro lado.
 */
export const API_CREDENTIALS: RequestCredentials = ORIGEN === '' ? 'same-origin' : 'include';
