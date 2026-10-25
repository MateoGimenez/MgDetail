/**
 * Tarjetas plegables de la lista de Turnos, en funciones puras. El estado vive en la vista (no en cada tarjeta) y va
 * por id de turno, así sobrevive a las recargas de la lista (Actualizar, cambiar de página, guardar un cambio).
 *
 * - `base`: cómo se ve una tarjeta que nadie tocó. null = según el ancho (plegada en el celular, abierta en pantalla
 *   ancha); "Expandir todas" / "Plegar todas" la fijan.
 * - `elegidas`: lo que se eligió a mano para una tarjeta, que gana sobre la base.
 */
export interface EstadoPlegado {
  readonly base: boolean | null;
  readonly elegidas: ReadonlyMap<string, boolean>;
}

export const PLEGADO_INICIAL: EstadoPlegado = { base: null, elegidas: new Map() };

/** true si la tarjeta se ve expandida. `ancha`: pantalla ancha (ahí arrancan abiertas). */
export function estaExpandida(estado: EstadoPlegado, id: string, ancha: boolean): boolean {
  return estado.elegidas.get(id) ?? estado.base ?? ancha;
}

/** Tocar la cabecera de una tarjeta: la abre si estaba plegada y al revés. Las demás no cambian. */
export function alternar(estado: EstadoPlegado, id: string, ancha: boolean): EstadoPlegado {
  const elegidas = new Map(estado.elegidas);
  elegidas.set(id, !estaExpandida(estado, id, ancha));
  return { base: estado.base, elegidas };
}

/** "Expandir todas": todas abiertas, también las de las páginas que se carguen después. */
export function expandirTodas(): EstadoPlegado {
  return { base: true, elegidas: new Map() };
}

/**
 * "Plegar todas". Una tarjeta abierta con algo a medio escribir (nota en edición, elegir fecha) queda abierta: así
 * lo escrito no se esconde sin querer. Si ya estaba plegada, sigue plegada (su contenido tampoco se pierde: plegar
 * solo lo oculta).
 */
export function plegarTodas(estado: EstadoPlegado, ancha: boolean, conBorrador: ReadonlySet<string>): EstadoPlegado {
  const elegidas = new Map<string, boolean>();
  for (const id of conBorrador) {
    if (estaExpandida(estado, id, ancha)) elegidas.set(id, true);
  }
  return { base: false, elegidas };
}

/** true si alguna de las tarjetas a la vista está plegada (el control ofrece "Expandir todas"). */
export function hayPlegadas(estado: EstadoPlegado, ids: readonly string[], ancha: boolean): boolean {
  return ids.some((id) => !estaExpandida(estado, id, ancha));
}

/** El conjunto con `id` agregado o sacado; el mismo objeto si no cambia (para no re-renderizar de más). */
export function conMarca(conjunto: ReadonlySet<string>, id: string, valor: boolean): ReadonlySet<string> {
  if (conjunto.has(id) === valor) return conjunto;
  const nuevo = new Set(conjunto);
  if (valor) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
}
