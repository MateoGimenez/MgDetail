import { describe, expect, it, vi } from 'vitest';
import { devolverFoco, selectorDeFicha, type Enfocable } from './foco';

const elemento = (visible: boolean) => ({ focus: vi.fn(), getClientRects: () => ({ length: visible ? 1 : 0 }) });

/** Una raíz falsa: devuelve las fichas solo para el selector de ese turno. */
const raiz = (selector: string, fichas: Enfocable[]) => ({
  querySelectorAll: (pedido: string) => (pedido === selector ? fichas : []),
});

describe('foco al cerrar el detalle de la agenda', () => {
  const selector = selectorDeFicha('a1');

  it('si el navegador pudo devolverlo a la ficha que abrió el detalle, no lo toca', () => {
    const ficha = elemento(true);
    const titulo = elemento(true);
    expect(devolverFoco(raiz(selector, [ficha]), selector, titulo, false)).toBe(false);
    expect(ficha.focus).not.toHaveBeenCalled();
    expect(titulo.focus).not.toHaveBeenCalled();
  });

  it('turno reprogramado a otro día: va a la ficha nueva que se ve (no a la de la vista oculta)', () => {
    const oculta = elemento(false); // la tira del celular, con display: none en pantalla ancha
    const visible = elemento(true);
    const titulo = elemento(true);
    expect(devolverFoco(raiz(selector, [oculta, visible]), selector, titulo, true)).toBe(true);
    expect(oculta.focus).not.toHaveBeenCalled();
    expect(visible.focus).toHaveBeenCalledOnce();
    expect(titulo.focus).not.toHaveBeenCalled();
  });

  it('turno cancelado, borrado o movido a otra semana: va al título de la agenda', () => {
    const titulo = elemento(true);
    expect(devolverFoco(raiz(selector, []), selector, titulo, true)).toBe(true);
    expect(titulo.focus).toHaveBeenCalledOnce();
    expect(devolverFoco(raiz(selector, [elemento(false)]), selector, null, true)).toBe(false);
  });

  it('el selector escapa comillas y barras del id', () => {
    expect(selectorDeFicha('a1')).toBe('[data-turno="a1"]');
    expect(selectorDeFicha('a"b\\c')).toBe('[data-turno="a\\"b\\\\c"]');
  });
});
