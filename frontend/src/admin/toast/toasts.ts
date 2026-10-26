/**
 * Avisos que aparecen y se van solos (reportes/2026-10-26_13_panel-pulido-y-app.md → "Toasts"), como un reducer
 * puro: el éxito se va solo a los ~4 s, el error queda hasta cerrarlo y nunca hay más de 3 a la vez.
 */

export type TipoToast = 'exito' | 'error';

export interface Toast {
  id: number;
  tipo: TipoToast;
  texto: string;
}

export interface EstadoToasts {
  /** Del más viejo al más nuevo. */
  items: readonly Toast[];
  siguiente: number;
}

export type AccionToast =
  | { tipo: 'agregar'; toast: { tipo: TipoToast; texto: string } }
  | { tipo: 'cerrar'; id: number }
  | { tipo: 'limpiar' };

export const MAXIMO_TOASTS = 3;
/** Cuánto dura un aviso de éxito en pantalla. */
export const DURACION_EXITO_MS = 4000;

export const TOASTS_INICIAL: EstadoToasts = { items: [], siguiente: 1 };

/** Un aviso de éxito se cierra solo; un error no. */
export const seCierraSolo = (toast: Toast) => toast.tipo === 'exito';

/**
 * Suma un aviso. El mismo texto repetido no se apila: reemplaza al anterior (y vuelve a empezar su tiempo). Si pasa
 * el máximo se descarta el más viejo de los éxitos y, si no hay éxitos, el error más viejo.
 */
export function reducirToasts(estado: EstadoToasts, accion: AccionToast): EstadoToasts {
  switch (accion.tipo) {
    case 'agregar': {
      const texto = accion.toast.texto.trim();
      if (texto === '') return estado;
      const nuevo: Toast = { id: estado.siguiente, tipo: accion.toast.tipo, texto };
      let items = [...estado.items.filter((t) => !(t.tipo === nuevo.tipo && t.texto === nuevo.texto)), nuevo];
      while (items.length > MAXIMO_TOASTS) {
        const descartado = items.find((t) => t.tipo === 'exito' && t.id !== nuevo.id) ?? items[0];
        items = items.filter((t) => t !== descartado);
      }
      return { items, siguiente: estado.siguiente + 1 };
    }
    case 'cerrar':
      return estado.items.some((t) => t.id === accion.id)
        ? { ...estado, items: estado.items.filter((t) => t.id !== accion.id) }
        : estado;
    case 'limpiar':
      return estado.items.length === 0 ? estado : { ...estado, items: [] };
  }
}
