import { describe, expect, it } from 'vitest';
import {
  altaDeInsumo,
  avisoDeMovimiento,
  barraDeStock,
  cambiosDeInsumo,
  cantidadParaCampo,
  costoPorUnidad,
  formatoCantidad,
  formatoCantidadConSigno,
  formatoNumero,
  formularioInsumoVacio,
  formularioMovimientoVacio,
  leerCantidad,
  nivelDeStock,
  pideStockBajo,
  resumenDeMovimiento,
  textoDeDiferencia,
  textoDelMinimo,
  textoStockBajo,
  validarInsumo,
  validarMovimiento,
} from './inventario';

describe('formato de cantidades es-AR', () => {
  it('usa coma decimal, punto de miles y recorta ceros', () => {
    expect(formatoNumero(4.5)).toBe('4,5');
    expect(formatoNumero(3)).toBe('3');
    expect(formatoNumero(1250.5)).toBe('1.250,5');
    expect(formatoNumero(0.1 + 0.2)).toBe('0,3');
    expect(formatoNumero(-1.5)).toBe('-1,5');
    expect(formatoNumero(0)).toBe('0');
  });

  it('pega la unidad: abreviada en L, ml, kg y g; con plural en unidad, par y caja', () => {
    expect(formatoCantidad(4.5, 'litro')).toBe('4,5 L');
    expect(formatoCantidad(3, 'unidad')).toBe('3 unidades');
    expect(formatoCantidad(1, 'unidad')).toBe('1 unidad');
    expect(formatoCantidad(0, 'unidad')).toBe('0 unidades');
    expect(formatoCantidad(2, 'par')).toBe('2 pares');
    expect(formatoCantidad(1, 'caja')).toBe('1 caja');
    expect(formatoCantidad(500, 'ml')).toBe('500 ml');
    expect(formatoCantidad(1.5, 'kg')).toBe('1,5 kg');
  });

  it('marca el signo de los movimientos', () => {
    expect(formatoCantidadConSigno(5, 'litro')).toBe('+5 L');
    expect(formatoCantidadConSigno(-1.5, 'litro')).toBe('−1,5 L');
    expect(formatoCantidadConSigno(-1, 'unidad')).toBe('−1 unidad');
    expect(resumenDeMovimiento({ tipo: 'compra', cantidad: 5 }, 'litro')).toBe('Compra · +5 L');
  });
});

describe('estado del stock', () => {
  it('sin stock gana sobre stock bajo; bajo es mínimo > 0 y stock <= mínimo', () => {
    expect(nivelDeStock({ stock: 0, stockMinimo: 2 })).toBe('sin-stock');
    expect(nivelDeStock({ stock: 0, stockMinimo: 0 })).toBe('sin-stock');
    expect(nivelDeStock({ stock: 2, stockMinimo: 2 })).toBe('bajo');
    expect(nivelDeStock({ stock: 1.9, stockMinimo: 2 })).toBe('bajo');
    expect(nivelDeStock({ stock: 2.01, stockMinimo: 2 })).toBe('normal');
    expect(nivelDeStock({ stock: 5, stockMinimo: 0 })).toBe('normal');
  });

  it('la barra pone el mínimo contra el stock y no existe sin mínimo', () => {
    expect(barraDeStock({ stock: 5, stockMinimo: 0 })).toBeNull();
    expect(barraDeStock({ stock: 2, stockMinimo: 2 })).toEqual({ relleno: 0.5, minimo: 0.5 });
    expect(barraDeStock({ stock: 0, stockMinimo: 2 })).toEqual({ relleno: 0, minimo: 0.5 });
    expect(barraDeStock({ stock: 8, stockMinimo: 2 })).toEqual({ relleno: 1, minimo: 0.25 });
  });

  it('textos', () => {
    expect(textoDelMinimo({ stock: 1, stockMinimo: 2, unidad: 'litro' })).toBe('Mínimo 2 L');
    expect(textoDelMinimo({ stock: 1, stockMinimo: 0, unidad: 'litro' })).toBe('Sin mínimo cargado');
    expect(textoStockBajo(1)).toBe('1 insumo con stock bajo');
    expect(textoStockBajo(3)).toBe('3 insumos con stock bajo');
  });
});

describe('leerCantidad', () => {
  it('entiende coma, punto decimal y miles', () => {
    expect(leerCantidad('4,5')).toEqual({ valor: 4.5 });
    expect(leerCantidad('4.5')).toEqual({ valor: 4.5 });
    expect(leerCantidad('3')).toEqual({ valor: 3 });
    expect(leerCantidad('1.250')).toEqual({ valor: 1250 });
    expect(leerCantidad('1.250,5')).toEqual({ valor: 1250.5 });
    expect(leerCantidad(' 0,25 ')).toEqual({ valor: 0.25 });
  });

  it('rechaza lo que no es un número, los 3 decimales y los topes', () => {
    expect(leerCantidad('')).toEqual({ error: 'Escribí cuánto.' });
    expect(leerCantidad('abc')).toHaveProperty('error');
    expect(leerCantidad('1,2,3')).toHaveProperty('error');
    expect(leerCantidad('-2')).toHaveProperty('error');
    expect(leerCantidad('1,234')).toEqual({ error: 'Usá hasta 2 decimales.' });
    expect(leerCantidad('0')).toEqual({ error: 'Tiene que ser más que cero.' });
    expect(leerCantidad('1.000.000')).toHaveProperty('error');
  });

  it('el cero vale donde se permite (mínimo, conteo) y el tope es configurable', () => {
    expect(leerCantidad('0', { cero: true })).toEqual({ valor: 0 });
    expect(leerCantidad('1000', { max: 999 })).toHaveProperty('error');
  });

  it('cantidadParaCampo vuelve al formato de escritura', () => {
    expect(cantidadParaCampo(4.5)).toBe('4,5');
    expect(cantidadParaCampo(3)).toBe('3');
  });
});

describe('validarInsumo', () => {
  const base = { ...formularioInsumoVacio(), nombre: 'Shampoo', unidad: 'litro' as const };

  it('arma los datos: recorta y vacíos como null o 0', () => {
    const r = validarInsumo(
      { ...base, nombre: '  Shampoo  ', stockInicial: '4,5', stockMinimo: '2', costoUnitario: '$ 3.500' },
      { alta: true },
    );
    expect(r).toEqual({
      ok: true,
      datos: { nombre: 'Shampoo', categoria: null, unidad: 'litro', stockInicial: 4.5, stockMinimo: 2, costoUnitario: 3500 },
    });
    expect(validarInsumo(base, { alta: true })).toMatchObject({
      ok: true,
      datos: { stockInicial: null, stockMinimo: 0, costoUnitario: null },
    });
  });

  it('en la edición no mira el stock inicial', () => {
    expect(validarInsumo({ ...base, stockInicial: 'xx' }, { alta: false })).toMatchObject({ ok: true });
  });

  it('marca cada campo con su mensaje', () => {
    const r = validarInsumo(
      { ...base, nombre: ' ', stockMinimo: '1,234', costoUnitario: '10,5', stockInicial: '-1' },
      { alta: true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(['costoUnitario', 'nombre', 'stockInicial', 'stockMinimo']);
  });
});

describe('validarMovimiento', () => {
  const f = (cambios: Partial<ReturnType<typeof formularioMovimientoVacio>>) => ({
    ...formularioMovimientoVacio(),
    ...cambios,
  });

  it('uso: cantidad y nota opcional', () => {
    expect(validarMovimiento('uso', f({ cantidad: '0,5', nota: ' pulido ' }))).toEqual({
      ok: true,
      cuerpo: { tipo: 'uso', cantidad: 0.5, nota: 'pulido' },
    });
    const cero = validarMovimiento('uso', f({ cantidad: '0' }));
    expect(cero.ok).toBe(false);
    if (!cero.ok) expect(typeof cero.errores.cantidad).toBe('string');
  });

  it('compra: costo y proveedor solo si hay; un costo 0 no se manda', () => {
    expect(validarMovimiento('compra', f({ cantidad: '5', costoTotal: '12.500', proveedor: 'Distribuidora Sur' }))).toEqual({
      ok: true,
      cuerpo: { tipo: 'compra', cantidad: 5, costoTotal: 12500, proveedor: 'Distribuidora Sur' },
    });
    expect(validarMovimiento('compra', f({ cantidad: '5', costoTotal: '0' }))).toEqual({
      ok: true,
      cuerpo: { tipo: 'compra', cantidad: 5 },
    });
    expect(validarMovimiento('compra', f({ cantidad: '5', costoTotal: '10,5' }))).toMatchObject({ ok: false });
  });

  it('ajuste: el conteo real puede ser 0 y va en stockReal', () => {
    expect(validarMovimiento('ajuste', f({ cantidad: '0' }))).toEqual({ ok: true, cuerpo: { tipo: 'ajuste', stockReal: 0 } });
    expect(validarMovimiento('ajuste', f({ cantidad: '' }))).toEqual({
      ok: false,
      errores: { stockReal: 'Escribí cuánto hay ahora.' },
    });
  });

  it('la nota tiene tope', () => {
    const larga = validarMovimiento('uso', f({ cantidad: '1', nota: 'x'.repeat(201) }));
    expect(larga.ok).toBe(false);
    if (!larga.ok) expect(typeof larga.errores.nota).toBe('string');
  });
});

describe('textos de ayuda', () => {
  it('costo por unidad y diferencia del conteo', () => {
    expect(costoPorUnidad(5, 12500, 'litro')).toBe('$ 2.500 por litro');
    expect(costoPorUnidad(0, 12500, 'litro')).toBeNull();
    expect(costoPorUnidad(5, null, 'litro')).toBeNull();
    expect(textoDeDiferencia(4.5, 3, 'litro')).toBe('Son 1,5 L menos de lo que figura.');
    expect(textoDeDiferencia(3, 4, 'unidad')).toBe('Son 1 unidad más de lo que figura.');
    expect(textoDeDiferencia(3, 3, 'unidad')).toBe('Es lo mismo que figura: no cambia nada.');
  });

  it('avisos de éxito', () => {
    expect(avisoDeMovimiento('uso', 'Shampoo', 4, 'litro')).toBe('Anotado: Shampoo. Quedan 4 L.');
    expect(avisoDeMovimiento('compra', 'Shampoo', 9, 'litro')).toBe('Compra de Shampoo cargada. Ahora hay 9 L.');
    expect(avisoDeMovimiento('ajuste', 'Paños', 12, 'unidad')).toBe('Stock de Paños ajustado: ahora hay 12 unidades.');
  });

  it('?bajoStock=1 abre la lista filtrada', () => {
    expect(pideStockBajo('?vista=inventario&bajoStock=1')).toBe(true);
    expect(pideStockBajo('?vista=inventario')).toBe(false);
    expect(pideStockBajo('?bajoStock=true')).toBe(false);
  });
});

describe('cuerpos para el backend', () => {
  const datos = { nombre: 'Shampoo', categoria: 'Lavado', unidad: 'litro' as const, stockInicial: 4.5, stockMinimo: 2, costoUnitario: 3500 };

  it('el alta no manda lo vacío', () => {
    expect(altaDeInsumo(datos)).toEqual({ nombre: 'Shampoo', unidad: 'litro', categoria: 'Lavado', stockInicial: 4.5, stockMinimo: 2, costoUnitario: 3500 });
    expect(altaDeInsumo({ ...datos, categoria: null, stockInicial: null, stockMinimo: 0, costoUnitario: null })).toEqual({ nombre: 'Shampoo', unidad: 'litro' });
  });

  it('la edición manda solo lo que cambió y vaciar un opcional va como null', () => {
    const guardado = { nombre: 'Shampoo', categoria: 'Lavado' as string | null, unidad: 'litro' as const, stockMinimo: 2, costoUnitario: 3500 as number | null };
    expect(cambiosDeInsumo(guardado, datos)).toEqual({});
    expect(cambiosDeInsumo(guardado, { ...datos, categoria: null, costoUnitario: null, stockMinimo: 3 })).toEqual({
      categoria: null,
      costoUnitario: null,
      stockMinimo: 3,
    });
  });
});
