/**
 * Tema de la web pública: oscuro (por defecto, la cara de la marca) o claro.
 *
 * - El oscuro no lleva atributo; el claro pone `data-tema="claro"` en <html> y
 *   base.css redefine las variables semánticas bajo `:root[data-tema='claro']`.
 * - La elección se guarda en localStorage. Si el navegador no deja leer ni
 *   guardar (modo privado, almacenamiento bloqueado), igual funciona en la visita.
 * - Antes de pintar, `public/tema-inicial.js` aplica lo guardado (sin parpadeo).
 *   Usa la misma clave, el mismo color de barra y la misma regla de rutas que este
 *   módulo; `tema.test.ts` comprueba que no se separen.
 * - El panel /admin tiene su propio esquema y nunca recibe el tema claro.
 */

export type Tema = 'oscuro' | 'claro';

export const CLAVE_TEMA = 'mg-tema';
export const TEMA_POR_DEFECTO: Tema = 'oscuro';

/** Color de la barra del navegador en el celular (`<meta name="theme-color">`). */
export const COLOR_BARRA: Readonly<Record<Tema, string>> = {
  oscuro: '#14171a',
  claro: '#f7f8f9',
};

type Lector = Pick<Storage, 'getItem'>;
type Escritor = Pick<Storage, 'setItem'>;

/** Mínimo del documento que se toca (permite probarlo sin navegador). */
export interface DocumentoTema {
  documentElement: {
    getAttribute(nombre: string): string | null;
    setAttribute(nombre: string, valor: string): void;
    removeAttribute(nombre: string): void;
  };
  querySelector(selector: string): { setAttribute(nombre: string, valor: string): void } | null;
}

export function esTema(valor: unknown): valor is Tema {
  return valor === 'oscuro' || valor === 'claro';
}

/** localStorage, o null si el navegador no lo deja usar (el solo acceso puede tirar error). */
export function almacenLocal(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Lo guardado, o el tema por defecto si no hay nada, no es válido o no se puede leer. */
export function leerTemaGuardado(almacen: Lector | null = almacenLocal()): Tema {
  if (!almacen) return TEMA_POR_DEFECTO;
  try {
    const valor = almacen.getItem(CLAVE_TEMA);
    return esTema(valor) ? valor : TEMA_POR_DEFECTO;
  } catch {
    return TEMA_POR_DEFECTO;
  }
}

/** Guarda la elección. Devuelve false si no se pudo (la visita sigue con el tema elegido). */
export function guardarTema(tema: Tema, almacen: Escritor | null = almacenLocal()): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(CLAVE_TEMA, tema);
    return true;
  } catch {
    return false;
  }
}

/** El panel /admin queda fuera: tiene su propio esquema (riel grafito y área clara). */
export function rutaConTema(ruta: string): boolean {
  return !/^\/admin(?:\/|$)/i.test(ruta);
}

export function temaDelDocumento(doc: Pick<DocumentoTema, 'documentElement'>): Tema {
  return doc.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro';
}

/** Pone o quita el atributo en <html> y ajusta el color de la barra del navegador. */
export function aplicarTema(tema: Tema, doc: DocumentoTema): void {
  if (tema === 'claro') doc.documentElement.setAttribute('data-tema', 'claro');
  else doc.documentElement.removeAttribute('data-tema');
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema]);
}

/* ---------- Estado compartido para React (useSyncExternalStore) ---------- */

const oyentes = new Set<() => void>();

export function suscribirTema(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Tema que se ve ahora (el atributo de <html> es la única fuente de verdad). */
export function temaActual(): Tema {
  return typeof document === 'undefined' ? TEMA_POR_DEFECTO : temaDelDocumento(document);
}

/** Cambia el tema de la página, lo recuerda y avisa a quien lo esté mostrando. */
export function elegirTema(tema: Tema): void {
  aplicarTema(tema, document);
  guardarTema(tema);
  oyentes.forEach((oyente) => {
    oyente();
  });
}

/**
 * Vuelve a aplicar lo guardado. Para cuando la página pública se monta después de
 * haber entrado por /admin (ahí el script inicial no lo aplica).
 */
export function sincronizarTema(): void {
  if (!rutaConTema(window.location.pathname)) return;
  const guardado = leerTemaGuardado();
  if (guardado !== temaActual()) {
    aplicarTema(guardado, document);
    oyentes.forEach((oyente) => {
      oyente();
    });
  }
}
