import { describe, expect, it } from 'vitest';
import type { Insumo, ListaDeInsumos } from '../../api/inventario';
import { recontar } from './useInsumos';

const base: Insumo = {
  id: 'i1',
  nombre: 'Shampoo',
  categoria: null,
  unidad: 'litro',
  stock: 4,
  stockMinimo: 2,
  costoUnitario: 1000,
  activo: true,
  bajoStock: false,
  valorEnStock: 4000,
  updatedAt: '2026-10-27T15:00:00.000Z',
};
const lista = (valorTotal: number | null): ListaDeInsumos => ({ insumos: [base], total: 1, bajoStock: 0, valorTotal });

describe('recontar', () => {
  it('cuenta el stock bajo y ajusta el valor total cuando un insumo cambia', () => {
    const despues = { ...base, stock: 1, bajoStock: true, valorEnStock: 1000 };
    const r = recontar(lista(4000), base, despues);
    expect(r.bajoStock).toBe(1);
    expect(r.valorTotal).toBe(1000);
    expect(r.insumos[0]).toBe(despues);
  });

  it('el empleado no tiene valor total: sigue en null', () => {
    expect(recontar(lista(null), base, { ...base, stock: 3 }).valorTotal).toBeNull();
  });

  it('desactivar saca al insumo de las cuentas', () => {
    const bajo = { ...base, bajoStock: true };
    const r = recontar({ ...lista(4000), bajoStock: 1 }, bajo, { ...bajo, activo: false });
    expect(r.bajoStock).toBe(0);
    expect(r.valorTotal).toBe(0);
  });
});
