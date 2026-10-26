import { describe, expect, it } from 'vitest';
import {
  DURACION_EXITO_MS,
  MAXIMO_TOASTS,
  TOASTS_INICIAL,
  reducirToasts,
  seCierraSolo,
  type AccionToast,
  type EstadoToasts,
} from './toasts';

const aplicar = (acciones: readonly AccionToast[], desde: EstadoToasts = TOASTS_INICIAL) =>
  acciones.reduce(reducirToasts, desde);
const exito = (texto: string): AccionToast => ({ tipo: 'agregar', toast: { tipo: 'exito', texto } });
const error = (texto: string): AccionToast => ({ tipo: 'agregar', toast: { tipo: 'error', texto } });
const textos = (estado: EstadoToasts) => estado.items.map((t) => t.texto);

describe('toasts', () => {
  it('agrega con un id nuevo cada vez', () => {
    const estado = aplicar([exito('Guardado'), error('No se pudo')]);
    expect(estado.items.map((t) => t.id)).toEqual([1, 2]);
    expect(estado.items.map((t) => t.tipo)).toEqual(['exito', 'error']);
  });

  it('ignora un texto vacío y recorta espacios', () => {
    expect(aplicar([exito('   ')])).toBe(TOASTS_INICIAL);
    expect(textos(aplicar([exito('  Guardado  ')]))).toEqual(['Guardado']);
  });

  it('el mismo aviso repetido no se apila: reemplaza al anterior y queda último', () => {
    const estado = aplicar([exito('Guardado'), exito('Turno confirmado'), exito('Guardado')]);
    expect(textos(estado)).toEqual(['Turno confirmado', 'Guardado']);
    expect(estado.items[1]?.id).toBe(3);
  });

  it('un éxito y un error con el mismo texto son avisos distintos', () => {
    expect(aplicar([exito('Listo'), error('Listo')]).items).toHaveLength(2);
  });

  it('nunca pasa del máximo y descarta primero el éxito más viejo', () => {
    const estado = aplicar([exito('a'), error('b'), exito('c'), exito('d')]);
    expect(estado.items).toHaveLength(MAXIMO_TOASTS);
    expect(textos(estado)).toEqual(['b', 'c', 'd']);
  });

  it('si todo son errores, descarta el más viejo; un error nuevo nunca se pierde', () => {
    const estado = aplicar([error('a'), error('b'), error('c'), error('d')]);
    expect(textos(estado)).toEqual(['b', 'c', 'd']);
    const conExitos = aplicar([error('a'), error('b'), error('c'), exito('d')]);
    expect(textos(conExitos)).toEqual(['b', 'c', 'd']);
  });

  it('cierra uno por id y no hace nada si ya no está', () => {
    const estado = aplicar([exito('a'), error('b')]);
    expect(textos(aplicar([{ tipo: 'cerrar', id: 1 }], estado))).toEqual(['b']);
    expect(aplicar([{ tipo: 'cerrar', id: 99 }], estado)).toBe(estado);
  });

  it('limpiar vacía la lista y conserva el contador', () => {
    const estado = aplicar([exito('a'), exito('b'), { tipo: 'limpiar' }]);
    expect(estado.items).toEqual([]);
    expect(estado.siguiente).toBe(3);
    expect(aplicar([{ tipo: 'limpiar' }])).toBe(TOASTS_INICIAL);
  });

  it('solo el éxito se cierra solo, a los 4 s', () => {
    const estado = aplicar([exito('a'), error('b')]);
    expect(estado.items.map(seCierraSolo)).toEqual([true, false]);
    expect(DURACION_EXITO_MS).toBe(4000);
  });

  it('no muta el estado anterior', () => {
    const antes = aplicar([exito('a')]);
    const copia = JSON.stringify(antes);
    aplicar([exito('b')], antes);
    expect(JSON.stringify(antes)).toBe(copia);
  });
});
