import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS,
  ETIQUETA_CATEGORIA,
  agruparGastosPorDia,
  anchoDeBarra,
  cambiosDeGasto,
  etiquetaDelMes,
  fraseDias,
  fraseFaltante,
  fraseProyeccion,
  mesPermitidoParaMeta,
  mesesEntre,
  mesesParaFijarMeta,
  nombreDeCategoria,
  pesosConSigno,
  rangoDelMes,
  situacionDeMes,
  sumarMeses,
  textoAvance,
  textoMargen,
  ultimoDia,
  validarGasto,
  validarMeta,
  type ProgresoMeta,
} from './finanzas';

const HOY = '2026-10-27';

describe('categorías', () => {
  it('las nueve del contrato, todas con etiqueta', () => {
    expect(CATEGORIAS).toHaveLength(9);
    for (const c of CATEGORIAS) expect(ETIQUETA_CATEGORIA[c]).toBeTruthy();
    expect(nombreDeCategoria('servicios')).toBe('Servicios');
    expect(nombreDeCategoria('rara')).toBe('rara');
  });
});

describe('plata', () => {
  it('pesos con signo menos de verdad', () => {
    expect(pesosConSigno(930000)).toBe('$ 930.000');
    expect(pesosConSigno(-50000)).toBe('−$ 50.000');
    expect(pesosConSigno(0)).toBe('$ 0');
  });

  it('margen: vacío sin ingresos, con coma y signo', () => {
    expect(textoMargen(null)).toBe('—');
    expect(textoMargen(0.75)).toBe('75 %');
    expect(textoMargen(0.3456)).toBe('34,6 %');
    expect(textoMargen(-0.2)).toBe('−20 %');
  });
});

describe('meses', () => {
  it('suma y resta meses cruzando el año', () => {
    expect(sumarMeses('2026-10', 1)).toBe('2026-11');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-10', -22)).toBe('2024-12');
    expect(mesesEntre('2026-10', '2027-02')).toBe(4);
    expect(mesesEntre('2026-10', '2025-10')).toBe(-12);
  });

  it('último día del mes, con febrero y bisiesto', () => {
    expect(ultimoDia('2026-10')).toBe('2026-10-31');
    expect(ultimoDia('2026-02')).toBe('2026-02-28');
    expect(ultimoDia('2028-02')).toBe('2028-02-29');
    expect(ultimoDia('2026-12')).toBe('2026-12-31');
  });

  it('rango del mes: el actual termina hoy, los otros llegan al último día', () => {
    expect(rangoDelMes('2026-10', HOY)).toEqual({ desde: '2026-10-01', hasta: HOY });
    expect(rangoDelMes('2026-09', HOY)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(rangoDelMes('2026-11', HOY)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    // Fin de mes: el 31 sigue siendo octubre.
    expect(rangoDelMes('2026-10', '2026-10-31')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('etiqueta en palabras', () => {
    expect(etiquetaDelMes('2026-10')).toBe('octubre de 2026');
    expect(etiquetaDelMes('2027-01')).toBe('enero de 2027');
  });

  it('metas: de 12 meses atrás a 12 adelante', () => {
    expect(mesPermitidoParaMeta('2026-10', HOY)).toBe(true);
    expect(mesPermitidoParaMeta('2025-10', HOY)).toBe(true);
    expect(mesPermitidoParaMeta('2025-09', HOY)).toBe(false);
    expect(mesPermitidoParaMeta('2027-10', HOY)).toBe(true);
    expect(mesPermitidoParaMeta('2027-11', HOY)).toBe(false);
    expect(mesPermitidoParaMeta('2026-13', HOY)).toBe(false);
    expect(mesesParaFijarMeta(HOY)).toHaveLength(12);
    expect(mesesParaFijarMeta(HOY)[0]).toBe('2026-10');
    expect(mesesParaFijarMeta(HOY)[11]).toBe('2027-09');
  });
});

describe('agrupar gastos por día', () => {
  const g = (id: string, fecha: string) => ({ id, fecha });
  it('mantiene el orden y junta los del mismo día', () => {
    const grupos = agruparGastosPorDia([g('a', '2026-10-27'), g('b', '2026-10-27'), g('c', '2026-10-20')]);
    expect(grupos.map((x) => [x.fecha, x.gastos.map((y) => y.id)])).toEqual([
      ['2026-10-27', ['a', 'b']],
      ['2026-10-20', ['c']],
    ]);
    expect(grupos[0]?.titulo).toBe('martes 27 de octubre');
  });

  it('un mismo día partido en dos páginas queda en un grupo', () => {
    const grupos = agruparGastosPorDia([g('a', '2026-10-27'), g('b', '2026-10-20'), g('c', '2026-10-27')]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]?.gastos.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('sin gastos, sin grupos', () => {
    expect(agruparGastosPorDia([])).toEqual([]);
  });
});

describe('formulario de un gasto', () => {
  const ok = { fecha: '2026-10-27', categoria: 'insumos', descripcion: ' Shampoo ', monto: '12.500', proveedor: '' };

  it('lo válido: recorta el texto, lee el monto y deja el proveedor vacío en null', () => {
    const r = validarGasto(ok, HOY);
    expect(r).toEqual({
      ok: true,
      datos: { fecha: '2026-10-27', categoria: 'insumos', descripcion: 'Shampoo', monto: 12500, proveedor: null },
    });
  });

  it('errores por campo, con voseo', () => {
    const r = validarGasto({ fecha: '2026-10-28', categoria: '', descripcion: '  ', monto: '', proveedor: 'x'.repeat(81) }, HOY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errores).sort()).toEqual(['categoria', 'descripcion', 'fecha', 'monto', 'proveedor']);
      expect(r.errores.fecha).toMatch(/futura/);
      expect(r.errores.monto).toMatch(/Cargá/);
    }
  });

  it('monto: sin centavos, no cero y con tope', () => {
    const monto = (texto: string) => {
      const r = validarGasto({ ...ok, monto: texto }, HOY);
      return r.ok ? null : (r.errores.monto ?? null);
    };
    expect(monto('0')).toMatch(/al menos/);
    expect(monto('25,50')).toMatch(/sin centavos/);
    expect(monto('abc')).toMatch(/solo números/);
    expect(monto('100000000')).toMatch(/máximo/);
    expect(monto('99999999')).toBeNull();
    expect(monto('$ 1')).toBeNull();
  });

  it('descripción de 120 sí, de 121 no; fecha de hoy sí', () => {
    expect(validarGasto({ ...ok, descripcion: 'a'.repeat(120) }, HOY).ok).toBe(true);
    expect(validarGasto({ ...ok, descripcion: 'a'.repeat(121) }, HOY).ok).toBe(false);
    expect(validarGasto({ ...ok, fecha: HOY }, HOY).ok).toBe(true);
    expect(validarGasto({ ...ok, fecha: '2026-02-30' }, HOY).ok).toBe(false);
  });

  it('cambios: solo lo que cambió', () => {
    const base = { fecha: '2026-10-27', categoria: 'insumos' as const, descripcion: 'Shampoo', monto: 12500, proveedor: null };
    expect(cambiosDeGasto(base, base)).toEqual({});
    expect(cambiosDeGasto(base, { ...base, monto: 13000, proveedor: 'Norte' })).toEqual({ monto: 13000, proveedor: 'Norte' });
  });
});

describe('meta mensual', () => {
  const progreso = (c: Partial<ProgresoMeta> = {}): ProgresoMeta => ({
    ingresos: 1096000,
    trabajos: 32,
    porcentajeIngresos: 0.7307,
    porcentajeTrabajos: 0.8,
    diasDeAtencionTranscurridos: 20,
    diasDeAtencionRestantes: 5,
    diasDeAtencionTotales: 25,
    proyeccionIngresos: 1370000,
    necesarioPorDia: 80800,
    estado: 'en-ritmo',
    ...c,
  });
  const meta = { ingresosObjetivo: 1500000, trabajosObjetivo: 40 };

  it('barra: entre 0 y 100, y pasada de 100 se llena', () => {
    expect(anchoDeBarra(0.7307)).toBe(73.1);
    expect(anchoDeBarra(1.4)).toBe(100);
    expect(anchoDeBarra(-1)).toBe(0);
    expect(anchoDeBarra(null)).toBe(0);
    expect(textoAvance(0.7307)).toBe('73 %');
    expect(textoAvance(1.126)).toBe('113 %');
    expect(textoAvance(null)).toBe('—');
  });

  it('te faltan $ X, $ Y por día de atención', () => {
    expect(fraseFaltante(meta, progreso())).toBe(
      'Te faltan $ 404.000: son unos $ 80.800 por día de atención (5 días de atención).',
    );
    expect(fraseFaltante(meta, progreso({ diasDeAtencionRestantes: 1 }))).toContain('(1 día de atención)');
  });

  it('cumplida, sin días restantes y sin objetivo de ingresos', () => {
    expect(fraseFaltante(meta, progreso({ estado: 'cumplida', ingresos: 1600000, necesarioPorDia: 0 }))).toBe(
      'Ya llegaste a la meta de ingresos.',
    );
    expect(fraseFaltante(meta, progreso({ diasDeAtencionRestantes: 0, necesarioPorDia: null }))).toBe(
      'Te faltaron $ 404.000: no quedan días de atención este mes.',
    );
    expect(fraseFaltante({ ingresosObjetivo: null, trabajosObjetivo: 40 }, progreso())).toBeNull();
  });

  it('proyección y días', () => {
    expect(fraseProyeccion(progreso())).toBe('Si seguís a este ritmo, el mes cierra en unos $ 1.370.000.');
    expect(fraseProyeccion(progreso({ proyeccionIngresos: null }))).toBeNull();
    expect(fraseDias(progreso())).toBe('Van 20 de 25 días de atención.');
  });

  it('formulario: con uno alcanza, enteros, con topes', () => {
    expect(validarMeta('1.500.000', '', '2026-10', HOY)).toEqual({
      ok: true,
      datos: { ingresosObjetivo: 1500000, trabajosObjetivo: null },
    });
    expect(validarMeta('', '40', '2026-10', HOY)).toEqual({ ok: true, datos: { ingresosObjetivo: null, trabajosObjetivo: 40 } });
    const vacio = validarMeta(' ', ' ', '2026-10', HOY);
    expect(vacio.ok).toBe(false);
    if (!vacio.ok) expect(vacio.errores.general).toMatch(/al menos un objetivo/);
    const malo = validarMeta('0', '4,5', '2026-10', HOY);
    expect(malo.ok).toBe(false);
    if (!malo.ok) {
      expect(malo.errores.ingresosObjetivo).toMatch(/al menos/);
      expect(malo.errores.trabajosObjetivo).toMatch(/enteros/);
    }
    const tope = validarMeta('1000000000', '10000', '2026-10', HOY);
    expect(tope.ok).toBe(false);
    if (!tope.ok) {
      expect(tope.errores.ingresosObjetivo).toMatch(/máximo/);
      expect(tope.errores.trabajosObjetivo).toMatch(/máximo/);
    }
    expect(validarMeta('999999999', '9999', '2026-10', HOY).ok).toBe(true);
  });

  it('un mes fuera de rango no se puede fijar', () => {
    const r = validarMeta('100', '', '2030-01', HOY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.mes).toBeTruthy();
  });

  it('situación de un mes del historial', () => {
    expect(situacionDeMes('2026-09', true, HOY)).toBe('cumplida');
    expect(situacionDeMes('2026-09', false, HOY)).toBe('no-cumplida');
    expect(situacionDeMes('2026-10', false, HOY)).toBe('en-curso');
    expect(situacionDeMes('2026-10', true, HOY)).toBe('cumplida');
    expect(situacionDeMes('2026-11', false, HOY)).toBe('programada');
  });
});
