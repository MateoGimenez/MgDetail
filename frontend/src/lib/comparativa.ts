import type { Servicio } from '../types';

/**
 * Lógica de la comparativa de servicios (sin React). Todo sale de lo que el dueño cargó en el catálogo:
 * no se inventa ni se estima nada.
 *
 * Convención: un ítem de "Incluye" con la forma `Todo lo del <nombre de otro servicio>` (sin importar mayúsculas,
 * acentos ni espacios de más) se expande a la lista de ese servicio.
 */

/** Lo que necesita la comparativa de un servicio (un `Servicio` del catálogo cumple). */
export type ServicioComparable = Pick<Servicio, 'id' | 'nombre' | 'incluye' | 'precioDesde' | 'duracion' | 'destacado'>;

export interface Fila {
  /** Texto tal como lo escribió el dueño (el de la primera aparición). */
  readonly texto: string;
  readonly enA: boolean;
  readonly enB: boolean;
}

export interface Par {
  readonly a: string;
  readonly b: string;
}

export interface Diferencia {
  /** El servicio que suma cosas respecto del otro. */
  readonly mas: string;
  readonly menos: string;
  /** Lo que `mas` incluye y `menos` no, en el orden de la tabla. Nunca vacío. */
  readonly extras: readonly string[];
  /** Pesos de diferencia; null si falta algún precio o la diferencia no es positiva. */
  readonly pesos: number | null;
}

/** Minúsculas, sin acentos, sin puntuación en los bordes y con espacios simples: la clave para comparar textos. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g, '');
}

const TODO_LO_DE = /^todo lo (?:del|de la|de los|de las|de) (.+)$/;

/** Si el ítem es "Todo lo del X" y X es un servicio del catálogo, ese servicio; si no, undefined. */
function referencia(item: string, catalogo: readonly ServicioComparable[]): ServicioComparable | undefined {
  const resto = TODO_LO_DE.exec(normalizar(item))?.[1];
  if (resto === undefined) return undefined;
  return catalogo.find((s) => normalizar(s.nombre) === resto);
}

/**
 * La lista "Incluye" de un servicio con los "Todo lo del X" ya expandidos, sin ítems vacíos ni repetidos y en el
 * orden en que aparecen. Si dos servicios se referencian entre sí (o uno a sí mismo), cada uno se expande una sola
 * vez: no hay recursión infinita.
 */
export function expandirIncluye(servicio: ServicioComparable, catalogo: readonly ServicioComparable[]): string[] {
  const vistos = new Set<string>();
  const claves = new Set<string>();
  const salida: string[] = [];

  const recorrer = (actual: ServicioComparable) => {
    if (vistos.has(actual.id)) return;
    vistos.add(actual.id);
    for (const item of actual.incluye) {
      const otro = referencia(item, catalogo);
      if (otro) {
        recorrer(otro);
        continue;
      }
      const clave = normalizar(item);
      if (clave === '' || claves.has(clave)) continue;
      claves.add(clave);
      salida.push(item.trim());
    }
  };
  recorrer(servicio);
  return salida;
}

/**
 * Una fila por cosa que incluye alguno de los dos. Primero las de `a` (en su orden) y después las que solo tiene
 * `b`, así lo que comparten queda arriba y los extras de un servicio más completo, al final.
 */
export function armarFilas(a: ServicioComparable, b: ServicioComparable, catalogo: readonly ServicioComparable[]): Fila[] {
  const deA = expandirIncluye(a, catalogo);
  const deB = expandirIncluye(b, catalogo);
  const clavesA = new Set(deA.map(normalizar));
  const clavesB = new Set(deB.map(normalizar));
  return [
    ...deA.map((texto) => ({ texto, enA: true, enB: clavesB.has(normalizar(texto)) })),
    ...deB.filter((texto) => !clavesA.has(normalizar(texto))).map((texto) => ({ texto, enA: false, enB: true })),
  ];
}

/** Lo que incluye `lado` y el otro no. */
export function extrasDe(filas: readonly Fila[], lado: 'a' | 'b'): string[] {
  return filas.filter((f) => (lado === 'a' ? f.enA && !f.enB : f.enB && !f.enA)).map((f) => f.texto);
}

/** Diferencia de precio en pesos: solo con los dos precios cargados y si `mas` cuesta más; si no, null. */
export function diferenciaDePrecio(mas: ServicioComparable, menos: ServicioComparable): number | null {
  if (mas.precioDesde === null || menos.precioDesde === null) return null;
  const pesos = mas.precioDesde - menos.precioDesde;
  return pesos > 0 ? pesos : null;
}

/**
 * Qué suma un servicio respecto del otro: el que tiene más extras (si empatan, el segundo). Null si no hay
 * ninguna cosa de más (no se inventa una ventaja).
 */
export function diferencia(a: ServicioComparable, b: ServicioComparable, filas: readonly Fila[]): Diferencia | null {
  const extrasA = extrasDe(filas, 'a');
  const extrasB = extrasDe(filas, 'b');
  const gana = extrasA.length > extrasB.length ? a : b;
  const pierde = gana === a ? b : a;
  const extras = gana === a ? extrasA : extrasB;
  if (extras.length === 0) return null;
  return { mas: gana.id, menos: pierde.id, extras, pesos: diferenciaDePrecio(gana, pierde) };
}

/**
 * El par que se compara al abrir: el primer servicio que no es el destacado, y el destacado. Null si hay menos de
 * dos servicios o ninguno está destacado (en ese caso la comparativa no se muestra).
 */
export function parPorDefecto(servicios: readonly ServicioComparable[]): Par | null {
  if (servicios.length < 2) return null;
  const destacado = servicios.find((s) => s.destacado);
  const primero = servicios.find((s) => s !== destacado);
  if (!destacado || !primero) return null;
  return { a: primero.id, b: destacado.id };
}

/**
 * El par a mostrar según lo que eligió la persona. Si falta una elección, un id no existe (el catálogo cambió) o
 * los dos son el mismo, vuelve al par por defecto.
 */
export function resolverPar(servicios: readonly ServicioComparable[], elegido: Par | null): Par | null {
  const defecto = parPorDefecto(servicios);
  if (!defecto || !elegido) return defecto;
  const existe = (id: string) => servicios.some((s) => s.id === id);
  return existe(elegido.a) && existe(elegido.b) && elegido.a !== elegido.b ? elegido : defecto;
}

/** Cambia un lado del par; si se elige el servicio que ya estaba del otro lado, los dos se intercambian. */
export function elegirEnPar(par: Par, lado: 'a' | 'b', id: string): Par {
  if (lado === 'a') return id === par.b ? { a: id, b: par.a } : { a: id, b: par.b };
  return id === par.a ? { a: par.b, b: id } : { a: par.a, b: id };
}

/**
 * Separa las filas en lo que incluyen los dos (`comunes`, en el orden de la tabla) y lo que distingue a uno del
 * otro (`distintas`). La tabla muestra solo las distintas y junta las comunes en una fila desplegable.
 */
export function dividirFilas(filas: readonly Fila[]): { comunes: Fila[]; distintas: Fila[] } {
  return {
    comunes: filas.filter((f) => f.enA && f.enB),
    distintas: filas.filter((f) => f.enA !== f.enB),
  };
}
