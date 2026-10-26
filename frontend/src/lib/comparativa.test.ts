import { describe, expect, it } from 'vitest';
import {
  armarFilas,
  diferencia,
  diferenciaDePrecio,
  dividirFilas,
  elegirEnPar,
  expandirIncluye,
  extrasDe,
  normalizar,
  parPorDefecto,
  resolverPar,
  type ServicioComparable,
} from './comparativa';

function servicio(id: string, nombre: string, incluye: string[], extra: Partial<ServicioComparable> = {}): ServicioComparable {
  return { id, nombre, incluye, precioDesde: null, duracion: null, destacado: false, ...extra };
}

const basico = servicio('basico', 'Lavado Básico', ['Prelavado', 'Lavado a mano', 'Secado'], { precioDesde: 25000 });
const premium = servicio('premium', 'Lavado Premium', ['Todo lo del Lavado Básico', 'Tapizados', 'Sellador'], {
  precioDesde: 45000,
  destacado: true,
});
const pulido = servicio('pulido', 'Pulido', ['Corrección de pintura']);
const catalogo = [basico, premium, pulido];

describe('normalizar', () => {
  it('ignora mayúsculas, acentos y espacios de más', () => {
    expect(normalizar('  LAVADO   Básico. ')).toBe('lavado basico');
  });
});

describe('expandirIncluye', () => {
  it('reemplaza "Todo lo del X" por la lista de X, en su lugar', () => {
    expect(expandirIncluye(premium, catalogo)).toEqual(['Prelavado', 'Lavado a mano', 'Secado', 'Tapizados', 'Sellador']);
  });

  it('no distingue mayúsculas ni acentos, y acepta "de la/los/las"', () => {
    const a = servicio('a', 'Lavado Básico', ['x']);
    const b = servicio('b', 'Combo', ['TODO LO DEL lavado basico', 'Todo lo de la Lavado Basico', 'y']);
    expect(expandirIncluye(b, [a, b])).toEqual(['x', 'y']);
  });

  it('si el nombre no coincide con ningún servicio, queda como un ítem más', () => {
    const s = servicio('s', 'S', ['Todo lo del Fantasma', 'z']);
    expect(expandirIncluye(s, [s, basico])).toEqual(['Todo lo del Fantasma', 'z']);
  });

  it('expande en cadena (A incluye B, B incluye C)', () => {
    const c = servicio('c', 'C', ['c1']);
    const b = servicio('b', 'B', ['Todo lo del C', 'b1']);
    const a = servicio('a', 'A', ['Todo lo del B', 'a1']);
    expect(expandirIncluye(a, [a, b, c])).toEqual(['c1', 'b1', 'a1']);
  });

  it('no entra en bucle si dos servicios se referencian entre sí', () => {
    const a = servicio('a', 'Alfa', ['Todo lo del Beta', 'a1']);
    const b = servicio('b', 'Beta', ['Todo lo del Alfa', 'b1']);
    expect(expandirIncluye(a, [a, b])).toEqual(['b1', 'a1']);
    expect(expandirIncluye(b, [a, b])).toEqual(['a1', 'b1']);
  });

  it('un servicio que se referencia a sí mismo no se repite', () => {
    const a = servicio('a', 'Alfa', ['Todo lo del Alfa', 'a1']);
    expect(expandirIncluye(a, [a])).toEqual(['a1']);
  });

  it('descarta ítems vacíos y repetidos', () => {
    const s = servicio('s', 'S', ['Secado', '  ', 'secado ', 'Aspirado']);
    expect(expandirIncluye(s, [s])).toEqual(['Secado', 'Aspirado']);
  });

  it('lista vacía', () => {
    expect(expandirIncluye(servicio('s', 'S', []), [])).toEqual([]);
  });
});

describe('armarFilas', () => {
  it('marca lo compartido en los dos y los extras solo en el más completo', () => {
    expect(armarFilas(basico, premium, catalogo)).toEqual([
      { texto: 'Prelavado', enA: true, enB: true },
      { texto: 'Lavado a mano', enA: true, enB: true },
      { texto: 'Secado', enA: true, enB: true },
      { texto: 'Tapizados', enA: false, enB: true },
      { texto: 'Sellador', enA: false, enB: true },
    ]);
  });

  it('con el orden invertido conserva el orden de la lista del primero', () => {
    const filas = armarFilas(premium, basico, catalogo);
    expect(filas.map((f) => f.texto)).toEqual(['Prelavado', 'Lavado a mano', 'Secado', 'Tapizados', 'Sellador']);
    expect(filas.at(-1)).toEqual({ texto: 'Sellador', enA: true, enB: false });
  });

  it('servicios sin nada en común: las filas del primero y después las del segundo', () => {
    const filas = armarFilas(basico, pulido, catalogo);
    expect(filas).toHaveLength(4);
    expect(extrasDe(filas, 'b')).toEqual(['Corrección de pintura']);
  });

  it('listas vacías', () => {
    const vacio = servicio('v', 'Vacío', []);
    expect(armarFilas(vacio, vacio, [vacio])).toEqual([]);
  });

  it('ítems repetidos entre los dos con distinto formato son una sola fila', () => {
    const a = servicio('a', 'A', ['Secado con microfibra']);
    const b = servicio('b', 'B', ['secado con MICROFIBRA.']);
    expect(armarFilas(a, b, [a, b])).toEqual([{ texto: 'Secado con microfibra', enA: true, enB: true }]);
  });
});

describe('extrasDe y diferencia', () => {
  const filas = armarFilas(basico, premium, catalogo);

  it('extras de cada lado', () => {
    expect(extrasDe(filas, 'a')).toEqual([]);
    expect(extrasDe(filas, 'b')).toEqual(['Tapizados', 'Sellador']);
  });

  it('el más completo suma sus extras y la diferencia de precio', () => {
    expect(diferencia(basico, premium, filas)).toEqual({
      mas: 'premium',
      menos: 'basico',
      extras: ['Tapizados', 'Sellador'],
      pesos: 20000,
    });
  });

  it('es el mismo resultado con el orden de selección invertido', () => {
    const d = diferencia(premium, basico, armarFilas(premium, basico, catalogo));
    expect(d?.mas).toBe('premium');
    expect(d?.pesos).toBe(20000);
  });

  it('sin ninguna cosa de más no hay resumen', () => {
    const copia = servicio('c', 'Copia', [...basico.incluye]);
    expect(diferencia(basico, copia, armarFilas(basico, copia, [basico, copia]))).toBeNull();
  });

  it('sin precios cargados, no hay diferencia de pesos pero sí extras', () => {
    const sinPrecio = { ...premium, precioDesde: null };
    const d = diferencia(basico, sinPrecio, armarFilas(basico, sinPrecio, [basico, sinPrecio]));
    expect(d?.pesos).toBeNull();
    expect(d?.extras).toHaveLength(2);
  });
});

describe('diferenciaDePrecio', () => {
  it('solo con los dos precios y si es positiva', () => {
    expect(diferenciaDePrecio(premium, basico)).toBe(20000);
    expect(diferenciaDePrecio(basico, premium)).toBeNull();
    expect(diferenciaDePrecio({ ...premium, precioDesde: 25000 }, basico)).toBeNull();
    expect(diferenciaDePrecio({ ...premium, precioDesde: null }, basico)).toBeNull();
    expect(diferenciaDePrecio(premium, { ...basico, precioDesde: null })).toBeNull();
  });

  it('un precio en cero no inventa una diferencia', () => {
    expect(diferenciaDePrecio({ ...premium, precioDesde: 0 }, { ...basico, precioDesde: 0 })).toBeNull();
  });
});

describe('par por defecto y elección', () => {
  it('el primer servicio contra el destacado', () => {
    expect(parPorDefecto(catalogo)).toEqual({ a: 'basico', b: 'premium' });
  });

  it('si el destacado es el primero, usa el siguiente', () => {
    expect(parPorDefecto([premium, basico, pulido])).toEqual({ a: 'basico', b: 'premium' });
  });

  it('sin destacado o con menos de dos servicios no hay comparativa', () => {
    expect(parPorDefecto([basico, pulido])).toBeNull();
    expect(parPorDefecto([premium])).toBeNull();
    expect(parPorDefecto([])).toBeNull();
  });

  it('respeta una elección válida y vuelve al defecto si un id ya no existe o se repite', () => {
    expect(resolverPar(catalogo, { a: 'pulido', b: 'basico' })).toEqual({ a: 'pulido', b: 'basico' });
    expect(resolverPar(catalogo, { a: 'nada', b: 'basico' })).toEqual({ a: 'basico', b: 'premium' });
    expect(resolverPar(catalogo, { a: 'pulido', b: 'pulido' })).toEqual({ a: 'basico', b: 'premium' });
    expect(resolverPar(catalogo, null)).toEqual({ a: 'basico', b: 'premium' });
    expect(resolverPar([basico], { a: 'basico', b: 'basico' })).toBeNull();
  });

  it('elegir el servicio del otro lado intercambia los dos', () => {
    const par = { a: 'basico', b: 'premium' };
    expect(elegirEnPar(par, 'a', 'pulido')).toEqual({ a: 'pulido', b: 'premium' });
    expect(elegirEnPar(par, 'a', 'premium')).toEqual({ a: 'premium', b: 'basico' });
    expect(elegirEnPar(par, 'b', 'basico')).toEqual({ a: 'premium', b: 'basico' });
    expect(elegirEnPar(par, 'b', 'pulido')).toEqual({ a: 'basico', b: 'pulido' });
  });
});

describe('dividirFilas', () => {
  it('junta lo que incluyen los dos y deja aparte lo que los distingue, en orden', () => {
    const { comunes, distintas } = dividirFilas(armarFilas(basico, premium, catalogo));
    expect(comunes.map((f) => f.texto)).toEqual(['Prelavado', 'Lavado a mano', 'Secado']);
    expect(distintas.map((f) => f.texto)).toEqual(['Tapizados', 'Sellador']);
  });

  it('sin nada en común no hay comunes; sin diferencias no hay distintas; sin filas, nada', () => {
    expect(dividirFilas(armarFilas(basico, pulido, catalogo)).comunes).toEqual([]);
    const copia = servicio('c', 'Copia', [...basico.incluye]);
    expect(dividirFilas(armarFilas(basico, copia, [basico, copia])).distintas).toEqual([]);
    expect(dividirFilas([])).toEqual({ comunes: [], distintas: [] });
  });

  it('si cada uno tiene lo suyo, las dos cosas quedan como distintas', () => {
    const a = servicio('a', 'A', ['x', 'y']);
    const b = servicio('b', 'B', ['y', 'z']);
    const { comunes, distintas } = dividirFilas(armarFilas(a, b, [a, b]));
    expect(comunes.map((f) => f.texto)).toEqual(['y']);
    expect(distintas.map((f) => f.texto)).toEqual(['x', 'z']);
  });
});
