import { describe, expect, it } from 'vitest';
import { diaCortoConMes } from './fechas';
import {
  PLEGADO_INICIAL,
  alternar,
  conMarca,
  estaExpandida,
  expandirTodas,
  hayPlegadas,
  plegarTodas,
} from './plegado';

const CELU = false;
const ANCHA = true;

describe('tarjetas plegables de Turnos', () => {
  it('sin tocar nada: plegadas en el celular, abiertas en pantalla ancha', () => {
    expect(estaExpandida(PLEGADO_INICIAL, 'a', CELU)).toBe(false);
    expect(estaExpandida(PLEGADO_INICIAL, 'a', ANCHA)).toBe(true);
  });

  it('tocar una la abre y tocarla de nuevo la pliega, sin mover las demás', () => {
    const abierta = alternar(PLEGADO_INICIAL, 'a', CELU);
    expect(estaExpandida(abierta, 'a', CELU)).toBe(true);
    expect(estaExpandida(abierta, 'b', CELU)).toBe(false);
    const plegada = alternar(abierta, 'a', CELU);
    expect(estaExpandida(plegada, 'a', CELU)).toBe(false);
  });

  it('en pantalla ancha, tocar una abierta la pliega', () => {
    const estado = alternar(PLEGADO_INICIAL, 'a', ANCHA);
    expect(estaExpandida(estado, 'a', ANCHA)).toBe(false);
    expect(estaExpandida(estado, 'b', ANCHA)).toBe(true);
  });

  it('no cambia el estado que recibe', () => {
    alternar(PLEGADO_INICIAL, 'a', CELU);
    expect(PLEGADO_INICIAL.elegidas.size).toBe(0);
  });

  it('va por id: si la lista se recarga con otro orden o sale de la página y vuelve, la abierta sigue abierta', () => {
    const estado = alternar(PLEGADO_INICIAL, 'b', CELU);
    // La lista recargada trae los mismos turnos en otro orden y uno nuevo.
    const recargada = ['c', 'b', 'a'];
    expect(recargada.map((id) => estaExpandida(estado, id, CELU))).toEqual([false, true, false]);
  });

  it('lo elegido a mano se mantiene si cambia el ancho (girar el celular)', () => {
    const estado = alternar(PLEGADO_INICIAL, 'a', CELU);
    expect(estaExpandida(estado, 'a', ANCHA)).toBe(true);
    expect(estaExpandida(estado, 'b', ANCHA)).toBe(true);
    expect(estaExpandida(estado, 'b', CELU)).toBe(false);
  });

  it('expandir todas abre todas, incluidas las plegadas a mano y las que lleguen después', () => {
    const estado = expandirTodas();
    expect(estaExpandida(estado, 'a', CELU)).toBe(true);
    expect(estaExpandida(estado, 'nueva', CELU)).toBe(true);
    expect(hayPlegadas(estado, ['a', 'b'], CELU)).toBe(false);
  });

  it('plegar todas pliega todas, en cualquier ancho', () => {
    const estado = plegarTodas(expandirTodas(), ANCHA, new Set());
    expect(estaExpandida(estado, 'a', ANCHA)).toBe(false);
    expect(estaExpandida(estado, 'b', CELU)).toBe(false);
    expect(hayPlegadas(estado, ['a'], ANCHA)).toBe(true);
  });

  it('plegar todas deja abierta la que tiene un formulario a medio escribir', () => {
    const conNota = new Set(['a']);
    const estado = plegarTodas(expandirTodas(), CELU, conNota);
    expect(estaExpandida(estado, 'a', CELU)).toBe(true);
    expect(estaExpandida(estado, 'b', CELU)).toBe(false);
  });

  it('plegar todas no abre una con borrador que ya estaba plegada', () => {
    // Se plegó a mano con la nota abierta: el contenido queda oculto pero montado.
    const plegadaConNota = alternar(expandirTodas(), 'a', CELU);
    const estado = plegarTodas(plegadaConNota, CELU, new Set(['a']));
    expect(estaExpandida(estado, 'a', CELU)).toBe(false);
  });

  it('hay plegadas: decide si el control ofrece expandir o plegar', () => {
    expect(hayPlegadas(PLEGADO_INICIAL, ['a', 'b'], CELU)).toBe(true);
    expect(hayPlegadas(PLEGADO_INICIAL, ['a', 'b'], ANCHA)).toBe(false);
    expect(hayPlegadas(alternar(PLEGADO_INICIAL, 'a', ANCHA), ['a', 'b'], ANCHA)).toBe(true);
    expect(hayPlegadas(PLEGADO_INICIAL, [], CELU)).toBe(false);
  });

  it('marca de borrador: agrega y saca, y devuelve el mismo conjunto si no cambia', () => {
    const vacio: ReadonlySet<string> = new Set();
    const conA = conMarca(vacio, 'a', true);
    expect(conA.has('a')).toBe(true);
    expect(vacio.has('a')).toBe(false);
    expect(conMarca(conA, 'a', true)).toBe(conA);
    expect(conMarca(vacio, 'a', false)).toBe(vacio);
    expect(conMarca(conA, 'a', false).has('a')).toBe(false);
  });
});

describe('fecha de la tarjeta plegada', () => {
  it('día corto con el mes, sin año', () => {
    expect(diaCortoConMes('2026-10-22')).toBe('jue 22/10');
    expect(diaCortoConMes('2027-01-03')).toBe('dom 3/1');
  });

  it('una fecha que no se puede leer se muestra tal cual', () => {
    expect(diaCortoConMes('mañana')).toBe('mañana');
  });
});
