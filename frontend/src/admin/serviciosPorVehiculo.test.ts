import { describe, expect, it } from 'vitest';
import { pestanaConTecla, resumenPestana } from './pestanasVehiculo';
import { destinoDeMovimiento } from './useServicios';
import { formularioVacio } from './validacionServicio';

describe('pestanaConTecla', () => {
  it('las flechas recorren Auto, Camioneta y Moto de forma circular', () => {
    expect(pestanaConTecla('auto', 'ArrowRight')).toBe('camioneta');
    expect(pestanaConTecla('moto', 'ArrowRight')).toBe('auto');
    expect(pestanaConTecla('auto', 'ArrowLeft')).toBe('moto');
    expect(pestanaConTecla('camioneta', 'Home')).toBe('auto');
    expect(pestanaConTecla('camioneta', 'End')).toBe('moto');
  });
  it('otras teclas no cambian la pestaña', () => {
    expect(pestanaConTecla('camioneta', 'a')).toBe('camioneta');
  });
});

describe('resumenPestana', () => {
  it('cuenta servicios y activos', () => {
    expect(resumenPestana(0, 0, 'moto')).toBe('Ningún servicio para moto.');
    expect(resumenPestana(1, 1, 'auto')).toBe('1 servicio para auto · activo');
    expect(resumenPestana(3, 3, 'auto')).toBe('3 servicios para auto · todos activos');
    expect(resumenPestana(3, 2, 'auto')).toBe('3 servicios para auto · 2 activos en la web');
    expect(resumenPestana(2, 0, 'moto')).toContain('ninguno activo');
  });
});

describe('destinoDeMovimiento', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('sin vecino mueve un puesto', () => {
    expect(destinoDeMovimiento(ids, 'b', -1)).toBe(0);
    expect(destinoDeMovimiento(ids, 'b', 1)).toBe(2);
    expect(destinoDeMovimiento(ids, 'a', -1)).toBe(-1);
    expect(destinoDeMovimiento(ids, 'd', 1)).toBe(-1);
  });
  it('con vecino salta los servicios de otros vehículos', () => {
    // En la pestaña Moto solo se ven a y d: bajar "a" lo deja después de "d".
    expect(destinoDeMovimiento(ids, 'a', 1, 'd')).toBe(3);
    expect(destinoDeMovimiento(ids, 'd', -1, 'a')).toBe(0);
  });
  it('ids desconocidos no se mueven', () => {
    expect(destinoDeMovimiento(ids, 'x', 1)).toBe(-1);
    expect(destinoDeMovimiento(ids, 'a', 1, 'x')).toBe(-1);
  });
});

describe('formularioVacio desde una pestaña', () => {
  it('marca solo el vehículo de la pestaña', () => {
    expect(formularioVacio('moto').vehiculos).toEqual(['moto']);
  });
  it('sin pestaña marca los tres', () => {
    expect(formularioVacio().vehiculos).toEqual(['auto', 'camioneta', 'moto']);
  });
});
