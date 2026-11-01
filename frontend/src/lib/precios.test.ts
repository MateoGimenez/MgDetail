import { describe, expect, it } from 'vitest';
import { menorPrecio, precioPorVehiculo, type ConPrecios } from './precios';
import { vehiculoInicial } from './vehiculoElegido';
import { textoPrecio } from '../data/servicios';

const servicio: ConPrecios = { precioDesde: 25000, precioDesdeCamioneta: 32000, precioDesdeMoto: null };

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
    expect(menorPrecio({ precioDesde: null, precioDesdeCamioneta: null, precioDesdeMoto: 9000 })).toBe(9000);
    expect(menorPrecio({ precioDesde: null, precioDesdeCamioneta: null, precioDesdeMoto: null })).toBeNull();
    expect(menorPrecio({ precioDesde: 10, precioDesdeCamioneta: 0, precioDesdeMoto: 5 })).toBe(0);
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
