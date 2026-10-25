import { describe, expect, it } from 'vitest';
import scriptInicial from '../../public/tema-inicial.js?raw';
import {
  aplicarTema,
  CLAVE_TEMA,
  COLOR_BARRA,
  guardarTema,
  leerTemaGuardado,
  rutaConTema,
  TEMA_POR_DEFECTO,
  temaDelDocumento,
  type DocumentoTema,
} from './tema';

/** Almacenamiento en memoria, como localStorage. */
function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
  };
}

/** Almacenamiento bloqueado (modo privado de algunos navegadores, cookies bloqueadas). */
const bloqueado = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

/** Documento falso: <html> con sus atributos y la meta theme-color. */
function documento(colorInicial = COLOR_BARRA.oscuro) {
  const atributos = new Map<string, string>();
  const meta = { content: colorInicial };
  const doc: DocumentoTema = {
    documentElement: {
      getAttribute: (nombre) => atributos.get(nombre) ?? null,
      setAttribute: (nombre, valor) => {
        atributos.set(nombre, valor);
      },
      removeAttribute: (nombre) => {
        atributos.delete(nombre);
      },
    },
    querySelector: (selector) =>
      selector === 'meta[name="theme-color"]'
        ? {
            setAttribute: (_nombre: string, valor: string) => {
              meta.content = valor;
            },
          }
        : null,
  };
  return { doc, atributos, meta };
}

describe('tema: lectura y escritura segura', () => {
  it('por defecto es oscuro: sin nada guardado, sin almacenamiento o con un valor desconocido', () => {
    expect(TEMA_POR_DEFECTO).toBe('oscuro');
    expect(leerTemaGuardado(almacen())).toBe('oscuro');
    expect(leerTemaGuardado(null)).toBe('oscuro');
    expect(leerTemaGuardado(almacen({ [CLAVE_TEMA]: 'sepia' }))).toBe('oscuro');
  });

  it('lee el tema guardado', () => {
    expect(leerTemaGuardado(almacen({ [CLAVE_TEMA]: 'claro' }))).toBe('claro');
    expect(leerTemaGuardado(almacen({ [CLAVE_TEMA]: 'oscuro' }))).toBe('oscuro');
  });

  it('si el navegador no deja leer, queda oscuro y no tira error', () => {
    expect(leerTemaGuardado(bloqueado)).toBe('oscuro');
  });

  it('guarda la elección y avisa si no pudo', () => {
    const memoria = almacen();
    expect(guardarTema('claro', memoria)).toBe(true);
    expect(memoria.datos.get(CLAVE_TEMA)).toBe('claro');
    expect(guardarTema('claro', bloqueado)).toBe(false);
    expect(guardarTema('claro', null)).toBe(false);
  });
});

describe('tema: aplicar al documento', () => {
  it('claro pone data-tema y el color claro de la barra; oscuro los saca', () => {
    const { doc, atributos, meta } = documento();
    aplicarTema('claro', doc);
    expect(atributos.get('data-tema')).toBe('claro');
    expect(meta.content).toBe(COLOR_BARRA.claro);
    expect(temaDelDocumento(doc)).toBe('claro');

    aplicarTema('oscuro', doc);
    expect(atributos.has('data-tema')).toBe(false);
    expect(meta.content).toBe(COLOR_BARRA.oscuro);
    expect(temaDelDocumento(doc)).toBe('oscuro');
  });

  it('el panel /admin queda fuera del tema; el resto de la web, no', () => {
    expect(rutaConTema('/')).toBe(true);
    expect(rutaConTema('/turno/abc')).toBe(true);
    expect(rutaConTema('/no-existe')).toBe(true);
    expect(rutaConTema('/administracion')).toBe(true);
    expect(rutaConTema('/admin')).toBe(false);
    expect(rutaConTema('/admin/')).toBe(false);
    expect(rutaConTema('/admin/turnos')).toBe(false);
  });
});

describe('script inicial (public/tema-inicial.js)', () => {
  /** Corre el script con un window y un document falsos. */
  function correr(ruta: string, almacenamiento: { getItem(clave: string): string | null }) {
    const { doc, atributos, meta } = documento();
    const ventana = { location: { pathname: ruta }, localStorage: almacenamiento };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- es el archivo real del sitio, sin datos externos
    const ejecutar = new Function('window', 'document', scriptInicial) as (w: unknown, d: unknown) => void;
    ejecutar(ventana, doc);
    return { atributos, meta };
  }

  it('aplica el claro guardado antes de pintar, con la misma clave y el mismo color que el módulo', () => {
    const { atributos, meta } = correr('/', almacen({ [CLAVE_TEMA]: 'claro' }));
    expect(atributos.get('data-tema')).toBe('claro');
    expect(meta.content).toBe(COLOR_BARRA.claro);
  });

  it('sin elección guardada (o con oscuro) no toca nada', () => {
    expect(correr('/', almacen()).atributos.size).toBe(0);
    expect(correr('/', almacen({ [CLAVE_TEMA]: 'oscuro' })).atributos.size).toBe(0);
  });

  it('en /admin no aplica el tema claro', () => {
    expect(correr('/admin/turnos', almacen({ [CLAVE_TEMA]: 'claro' })).atributos.size).toBe(0);
  });

  it('si el almacenamiento está bloqueado no rompe la carga', () => {
    expect(() => correr('/', bloqueado)).not.toThrow();
    expect(correr('/', bloqueado).atributos.size).toBe(0);
  });
});
