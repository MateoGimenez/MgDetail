import { describe, expect, it } from 'vitest';
import { duracionPorVehiculo, contarPorVehiculo, vehiculosSin, menorPrecio, precioPorVehiculo, seOfrecePara, serviciosPara, tiposOfrecidos, type ConPrecios } from './precios';
import { vehiculoInicial } from './vehiculoElegido';
import { textoPrecio } from '../data/servicios';

const TODOS = ['auto', 'camioneta', 'moto'] as const;
const servicio: ConPrecios = { precioDesde: 25000, precioDesdeCamioneta: 32000, precioDesdeMoto: null, vehiculos: TODOS };

describe('precioPorVehiculo', () => {
  it('devuelve el precio del tipo elegido', () => {
    expect(precioPorVehiculo(servicio, 'auto')).toBe(25000);
    expect(precioPorVehiculo(servicio, 'camioneta')).toBe(32000);
  });

  it('si falta el del tipo, es null ("Consultá"): nunca cae al precio de auto', () => {
    expect(precioPorVehiculo(servicio, 'moto')).toBeNull();
    expect(textoPrecio(precioPorVehiculo(servicio, 'moto'))).toBe('Consultá');
    expect(precioPorVehiculo({ ...servicio, precioDesde: null }, 'camioneta')).toBe(32000);
  });

  it('el 0 es un precio válido (no se confunde con "Consultá")', () => {
    expect(precioPorVehiculo({ ...servicio, precioDesdeMoto: 0 }, 'moto')).toBe(0);
  });
});

describe('menorPrecio', () => {
  it('es el menor entre los cargados y null si no hay ninguno', () => {
    expect(menorPrecio(servicio)).toBe(25000);
    expect(menorPrecio({ precioDesde: null, precioDesdeCamioneta: null, precioDesdeMoto: 9000, vehiculos: TODOS })).toBe(9000);
    expect(menorPrecio({ precioDesde: null, precioDesdeCamioneta: null, precioDesdeMoto: null, vehiculos: TODOS })).toBeNull();
    expect(menorPrecio({ precioDesde: 10, precioDesdeCamioneta: 0, precioDesdeMoto: 5, vehiculos: TODOS })).toBe(0);
  });
});

describe('vehiculoInicial', () => {
  it('toma el del enlace, si no el recordado, si no auto; ignora valores raros', () => {
    expect(vehiculoInicial('?servicio=pulido&vehiculo=moto', 'camioneta')).toBe('moto');
    expect(vehiculoInicial('?servicio=pulido', 'camioneta')).toBe('camioneta');
    expect(vehiculoInicial('', null)).toBe('auto');
    expect(vehiculoInicial('?vehiculo=bicicleta', null)).toBe('auto');
  });
});

describe('servicios según el vehículo', () => {
  const lista = [
    { id: 'a', vehiculos: ['auto', 'camioneta', 'moto'] as const },
    { id: 'b', vehiculos: ['auto', 'camioneta'] as const },
    { id: 'c', vehiculos: ['auto'] as const },
  ];

  it('serviciosPara filtra y conserva el orden; un tipo puede quedar sin servicios', () => {
    expect(serviciosPara(lista, 'auto').map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(serviciosPara(lista, 'camioneta').map((s) => s.id)).toEqual(['a', 'b']);
    expect(serviciosPara(lista, 'moto').map((s) => s.id)).toEqual(['a']);
    expect(serviciosPara([lista[2]!], 'moto')).toEqual([]);
  });

  it('seOfrecePara y tiposOfrecidos (orden canónico)', () => {
    expect(seOfrecePara(lista[1]!, 'moto')).toBe(false);
    expect(seOfrecePara(lista[1]!, 'camioneta')).toBe(true);
    expect(tiposOfrecidos({ vehiculos: ['moto', 'auto'] })).toEqual(['auto', 'moto']);
  });

  it('menorPrecio ignora el precio de un tipo que no se ofrece', () => {
    const s: ConPrecios = { precioDesde: 60000, precioDesdeCamioneta: 80000, precioDesdeMoto: 5000, vehiculos: ['auto', 'camioneta'] };
    expect(menorPrecio(s)).toBe(60000);
    expect(menorPrecio({ ...s, vehiculos: ['moto'] })).toBe(5000);
  });
});

describe('servicios por vehículo (pestañas)', () => {
  const lista = [
    { vehiculos: ['auto', 'camioneta', 'moto'] as const },
    { vehiculos: ['auto', 'camioneta'] as const },
    { vehiculos: ['moto'] as const },
  ];

  it('cuenta los servicios de cada vehículo', () => {
    expect(contarPorVehiculo(lista)).toEqual({ auto: 2, camioneta: 2, moto: 2 });
    expect(contarPorVehiculo([])).toEqual({ auto: 0, camioneta: 0, moto: 0 });
  });

  it('quitar de un vehículo deja los otros, en orden canónico', () => {
    expect(vehiculosSin({ vehiculos: ['auto', 'camioneta', 'moto'] }, 'camioneta')).toEqual(['auto', 'moto']);
    expect(vehiculosSin({ vehiculos: ['auto', 'moto'] }, 'camioneta')).toEqual(['auto', 'moto']);
  });

  it('no se puede quitar el único vehículo (para eso está ocultar)', () => {
    expect(vehiculosSin({ vehiculos: ['moto'] }, 'moto')).toBeNull();
  });
});

describe('duracionPorVehiculo', () => {
  const d = { duracion: '2 h', duracionCamioneta: '3 h', duracionMoto: null };
  it('usa la del vehículo y, si falta, cae a la de auto', () => {
    expect(duracionPorVehiculo(d, 'auto')).toBe('2 h');
    expect(duracionPorVehiculo(d, 'camioneta')).toBe('3 h');
    expect(duracionPorVehiculo(d, 'moto')).toBe('2 h');
  });
  it('sin ninguna, null (A confirmar)', () => {
    expect(duracionPorVehiculo({ duracion: null, duracionCamioneta: null, duracionMoto: '1 h' }, 'camioneta')).toBeNull();
    expect(duracionPorVehiculo({ duracion: null, duracionCamioneta: null, duracionMoto: '1 h' }, 'moto')).toBe('1 h');
  });
});
