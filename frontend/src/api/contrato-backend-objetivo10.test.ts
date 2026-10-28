import { afterEach, describe, expect, it, vi } from 'vitest';
import * as permisos from '../admin/permisos';
import type { Rol } from './contract-panel';
import { ApiError } from './client';
import { buscarComprobante, emitirComprobante } from './comprobantes';
import { eliminarTurno } from './admin';
import { obtenerEstadisticas } from './estadisticas';
import {
  CODIGO_GASTO_DE_INVENTARIO,
  borrarGasto,
  crearGasto,
  editarGasto,
  fijarMeta,
  listarGastos,
  listarMetas,
  obtenerMetaActual,
} from './finanzas';
import fixtures from './fixtures-backend/respuestas.json';
import {
  CODIGO_STOCK_INSUFICIENTE,
  actualizarInsumo,
  crearInsumo,
  listarInsumos,
  listarMovimientos,
  registrarMovimiento,
} from './inventario';
import { actualizarPresupuesto, crearPresupuesto, eliminarPresupuesto, listarPresupuestos } from './presupuestos';
import { guardarTaller, obtenerTaller } from './taller';

/*
 * Objetivo 10: las respuestas REALES del backend (generadas por backend/test/integracion-objetivo8.test.ts con la app
 * de test y PGlite) pasadas por los esquemas estrictos y los clientes de api/*. Si un lado cambia un campo, esto falla.
 */

type Captura = { status: number; body: unknown };
const capturas = fixtures as unknown as Record<string, Captura>;
const de = (nombre: string): Captura => {
  const captura = capturas[nombre];
  if (!captura) throw new Error(`Falta la captura ${nombre}`);
  return captura;
};

function responder(nombre: string) {
  const { status, body } = de(nombre);
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const fallo = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;

describe('gastos y metas con respuestas reales', () => {
  it('lista, alta, filtros y el aviso de inventario pasan los esquemas', async () => {
    responder('gastosLista');
    const lista = await listarGastos({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(lista.gastos.length).toBeGreaterThan(2);
    expect(lista.gastos.some((g) => g.origen === 'inventario')).toBe(true);
    expect(lista.suma).toBe(lista.gastos.reduce((acc, g) => acc + g.monto, 0));

    responder('gastosFiltrados');
    expect((await listarGastos({ desde: '2026-10-01', hasta: '2026-10-31', categoria: 'insumos', q: 'cera', limit: 1 })).gastos).toHaveLength(1);

    responder('gastoCrea');
    expect(await crearGasto({ fecha: '2026-10-14', categoria: 'insumos', descripcion: 'x', monto: 1 })).toMatchObject({ monto: 12500, proveedor: 'Distribuidora Norte' });
    responder('gastoCreaSinProveedor');
    expect((await crearGasto({ fecha: '2026-10-02', categoria: 'alquiler', descripcion: 'x', monto: 1 })).proveedor).toBeNull();
  });

  it('errores: fecha futura, monto, 409 de inventario, 403 y 404 del empleado y del gasto', async () => {
    responder('error400GastoFechaFutura');
    expect(await fallo(crearGasto({ fecha: '2026-10-17', categoria: 'otros', descripcion: 'x', monto: 5 }))).toMatchObject({ status: 400, fields: { fecha: expect.any(String) as string } });
    responder('error400GastoMonto');
    expect((await fallo(crearGasto({ fecha: '2026-10-14', categoria: 'otros', descripcion: 'x', monto: 0 }))).fields).toHaveProperty('monto');
    responder('error409GastoDeInventario');
    expect(await fallo(editarGasto('x', { monto: 1 }))).toMatchObject({ status: 409, code: CODIGO_GASTO_DE_INVENTARIO });
    responder('error403GastosEmpleado');
    expect(await fallo(listarGastos({ desde: '2026-10-01', hasta: '2026-10-31' }))).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    responder('error404Gasto');
    expect(await fallo(borrarGasto('x'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('metas: actual, del año, fijar y los errores', async () => {
    responder('metasActual');
    const actual = await obtenerMetaActual();
    expect(actual.mes).toBe('2026-10');
    expect(actual.meta).toEqual({ ingresosObjetivo: 1500000, trabajosObjetivo: 40 });
    responder('metasAnio');
    expect((await listarMetas(2026)).map((m) => m.mes)).toEqual(['2026-09', '2026-10']);
    responder('metaPut');
    expect(await fijarMeta('2026-10', { ingresosObjetivo: 1500000, trabajosObjetivo: 40 })).toEqual({ ingresosObjetivo: 1500000, trabajosObjetivo: 40 });
    responder('error400MetaVacia');
    expect(Object.keys((await fallo(fijarMeta('2026-08', { ingresosObjetivo: null, trabajosObjetivo: null }))).fields ?? {})).toContain('ingresosObjetivo');
    responder('error400MetaMes');
    expect((await fallo(fijarMeta('2030-01', { ingresosObjetivo: 1000, trabajosObjetivo: null }))).fields).toHaveProperty('mes');
    responder('error403MetasEmpleado');
    expect(await fallo(obtenerMetaActual())).toMatchObject({ status: 403 });
  });

  it('estadísticas ampliadas: ganancia neta consistente con ingresos y gastos', async () => {
    responder('estadisticasMes');
    const e = await obtenerEstadisticas({ desde: '2026-10-01', hasta: '2026-10-16' });
    expect(e.periodo.gananciaNeta).toBe(e.periodo.ingresos - e.periodo.gastos);
    expect(e.serie.reduce((acc, p) => acc + p.gastos, 0)).toBe(e.periodo.gastos);
    expect(e.gastosPorCategoria.reduce((acc, c) => acc + c.monto, 0)).toBe(e.periodo.gastos);
    expect(e.resumen.mes.actual.ganancia).toBe(e.resumen.mes.actual.ingresos - e.resumen.mes.actual.gastos);
    responder('estadisticasVacio');
    expect((await obtenerEstadisticas({ desde: '2020-01-01', hasta: '2020-01-07' })).periodo.margen).toBeNull();
  });

  it('taller: lee, guarda y el 400 trae los campos', async () => {
    responder('tallerGet');
    expect((await obtenerTaller()).nombre).toBe('MgDetailing');
    responder('tallerPut');
    const datos = await obtenerTaller();
    expect((await guardarTaller(datos)).cuit).toBe('20-12345678-9');
    responder('error400Taller');
    expect(Object.keys((await fallo(guardarTaller(datos))).fields ?? {})).toEqual(expect.arrayContaining(['nombre', 'telefono', 'instagram', 'cuit']));
    responder('error403TallerEmpleado');
    expect(await fallo(obtenerTaller())).toMatchObject({ status: 403 });
  });
});

describe('inventario con respuestas reales', () => {
  const PAGINA = { limit: 50, offset: 0 };

  it('lista del admin con costos y del empleado sin ninguno', async () => {
    responder('insumosAdmin');
    const admin = await listarInsumos(PAGINA);
    expect(admin.valorTotal).not.toBeNull();
    responder('insumosEmpleado');
    const empleado = await listarInsumos(PAGINA);
    expect(empleado.valorTotal).toBeNull();
    expect(empleado.insumos.every((i) => i.costoUnitario === null && i.valorEnStock === null)).toBe(true);
    expect(empleado.insumos.length).toBe(admin.insumos.length);
    responder('insumosBajoStock');
    expect((await listarInsumos({ ...PAGINA, bajoStock: true })).insumos.every((i) => i.bajoStock)).toBe(true);
  });

  it('alta, edición y errores (400 por campo, 409 CONFLICT con fields.nombre, 403)', async () => {
    responder('insumoCrea');
    expect(await crearInsumo({ nombre: 'x', unidad: 'litro' })).toMatchObject({ stock: 5, valorEnStock: 6000 });
    responder('insumoCreaSinCosto');
    expect((await crearInsumo({ nombre: 'x', unidad: 'unidad' })).valorEnStock).toBeNull();
    responder('insumoPatch');
    expect((await actualizarInsumo('x', { stockMinimo: 1.5 })).stockMinimo).toBe(1.5);
    responder('error400Insumo');
    expect(Object.keys((await fallo(crearInsumo({ nombre: '', unidad: 'litro' }))).fields ?? {})).toEqual(expect.arrayContaining(['nombre', 'unidad']));
    responder('error409InsumoRepetido');
    expect(await fallo(crearInsumo({ nombre: 'x', unidad: 'litro' }))).toMatchObject({ status: 409, code: 'CONFLICT', fields: { nombre: expect.any(String) as string } });
    responder('error403InsumoEmpleado');
    expect(await fallo(crearInsumo({ nombre: 'x', unidad: 'litro' }))).toMatchObject({ status: 403 });
    responder('error404Insumo');
    expect(await fallo(registrarMovimiento('x', { tipo: 'uso', cantidad: 1 }))).toMatchObject({ status: 404 });
  });

  it('movimientos: uso, compra, ajuste, ajuste sin cambio y los errores', async () => {
    responder('movimientoUsoAdmin');
    expect((await registrarMovimiento('x', { tipo: 'uso', cantidad: 0.5 })).movimiento).toMatchObject({ cantidad: -0.5 });
    responder('movimientoUsoEmpleado');
    const uso = await registrarMovimiento('x', { tipo: 'uso', cantidad: 1.25 });
    expect(uso.insumo.costoUnitario).toBeNull();
    expect(uso.movimiento?.costoTotal).toBeNull();
    responder('movimientoCompra');
    expect((await registrarMovimiento('x', { tipo: 'compra', cantidad: 5, costoTotal: 12500 })).movimiento).toMatchObject({ costoTotal: 12500 });
    responder('movimientoAjuste');
    expect((await registrarMovimiento('x', { tipo: 'ajuste', stockReal: 4.5 })).movimiento?.tipo).toBe('ajuste');
    responder('movimientoAjusteSinCambio');
    expect((await registrarMovimiento('x', { tipo: 'ajuste', stockReal: 4.5 })).movimiento).toBeNull();
    responder('error409Stock');
    expect(await fallo(registrarMovimiento('x', { tipo: 'uso', cantidad: 10 }))).toMatchObject({ status: 409, code: CODIGO_STOCK_INSUFICIENTE, fields: { cantidad: 'Solo quedan 3,25 litros.' } });
    responder('error400Movimiento');
    expect((await fallo(registrarMovimiento('x', { tipo: 'uso', cantidad: 0 }))).fields).toHaveProperty('cantidad');
    responder('error400CompraCostoAlto');
    expect((await fallo(registrarMovimiento('x', { tipo: 'compra', cantidad: 0.01, costoTotal: 5000000 }))).fields).toHaveProperty('costoTotal');
    for (const nombre of ['error403CompraEmpleado', 'error403AjusteEmpleado']) {
      responder(nombre);
      expect(await fallo(registrarMovimiento('x', { tipo: 'ajuste', stockReal: 1 }))).toMatchObject({ status: 403 });
    }
  });

  it('historial: el admin ve costos y personas; el empleado, ni costos ni proveedores ni personas ajenas', async () => {
    responder('movimientosAdmin');
    const admin = await listarMovimientos('x', { limit: 50, offset: 0 });
    expect(admin.movimientos.some((m) => m.costoTotal !== null)).toBe(true);
    expect(admin.movimientos.every((m) => m.persona !== null)).toBe(true);
    responder('movimientosEmpleado');
    const empleado = await listarMovimientos('x', { limit: 50, offset: 0 });
    expect(empleado.movimientos.length).toBe(admin.movimientos.length);
    expect(empleado.movimientos.every((m) => m.costoTotal === null && m.proveedor === null && m.persona === null)).toBe(true);
  });
});

describe('presupuestos y comprobantes con respuestas reales', () => {
  const nuevo = { clienteNombre: 'x', items: [{ descripcion: 'a', cantidad: 1, precioUnitario: 1 }] };

  it('alta, cambios, lista y las cuentas que manda el backend', async () => {
    responder('presupuestoCrea');
    const p = await crearPresupuesto(nuevo);
    expect(p).toMatchObject({ codigo: 'P-0001', subtotal: 25000 + 15002, total: 25000 + 15002 - 3000 });
    responder('presupuestoCreaMinimo');
    expect((await crearPresupuesto(nuevo)).clienteTelefono).toBeNull();
    responder('presupuestoPatch');
    expect(await actualizarPresupuesto('x', { estado: 'aceptado' })).toMatchObject({ estado: 'aceptado', clienteTelefono: null });
    responder('presupuestosLista');
    const lista = await listarPresupuestos({ limit: 50, offset: 0 });
    expect(lista.total).toBe(lista.presupuestos.length);
  });

  it('errores: items.N.campo, total excedido, aceptado, 404 y 403', async () => {
    responder('error400Presupuesto');
    const campos = (await fallo(crearPresupuesto(nuevo))).fields ?? {};
    expect(Object.keys(campos)).toEqual(expect.arrayContaining(['clienteNombre', 'items.1.descripcion', 'items.1.cantidad', 'items.1.precioUnitario']));
    responder('error400PresupuestoTotal');
    expect((await fallo(crearPresupuesto(nuevo))).fields).toHaveProperty('items');
    responder('error409PresupuestoAceptado');
    expect(await fallo(eliminarPresupuesto('x'))).toMatchObject({ status: 409, code: 'PRESUPUESTO_ACEPTADO' });
    responder('error404Presupuesto');
    expect(await fallo(actualizarPresupuesto('x', { estado: 'enviado' }))).toMatchObject({ status: 404 });
    responder('error403PresupuestosEmpleado');
    expect(await fallo(listarPresupuestos({ limit: 50, offset: 0 }))).toMatchObject({ status: 403 });
  });

  it('comprobantes: emitir (201), reabrir (200), buscar, 404 como null y los errores', async () => {
    responder('comprobanteCrea');
    expect(await emitirComprobante('x', { formaPago: 'transferencia' })).toMatchObject({ codigo: 'R-0001', monto: 60000 });
    responder('comprobanteExistente');
    expect((await emitirComprobante('x', { formaPago: 'efectivo' })).formaPago).toBe('transferencia');
    responder('comprobanteGet');
    expect((await buscarComprobante('x'))?.codigo).toBe('R-0001');
    responder('error404Comprobante');
    expect(await buscarComprobante('x')).toBeNull();
    responder('error400ComprobanteSinCobro');
    expect((await fallo(emitirComprobante('x', { formaPago: 'efectivo' }))).message).toBe('Primero cargá el cobro del trabajo.');
    responder('error400ComprobanteFormaPago');
    expect((await fallo(emitirComprobante('x', { formaPago: 'efectivo' }))).fields).toHaveProperty('formaPago');
    responder('error403ComprobanteEmpleado');
    expect(await fallo(emitirComprobante('x', { formaPago: 'efectivo' }))).toMatchObject({ status: 403 });
  });

  it('borrar un turno con comprobante vuelve como 409 TURNO_CON_COMPROBANTE con su mensaje', async () => {
    responder('error409TurnoConComprobante');
    const error = await fallo(eliminarTurno('x'));
    expect(error).toMatchObject({ status: 409, code: 'TURNO_CON_COMPROBANTE' });
    expect(error.message).toMatch(/comprobante/i);
  });
});

describe('las funciones puede* del panel coinciden con /api/admin/permisos (finanzas, documentos e inventario)', () => {
  type Nivel = 'si' | 'no' | 'parcial';
  const capacidades = (de('permisosAdmin').body as { capacidades: { id: string; roles: Record<Rol, Nivel> }[] }).capacidades;
  const nivel = (id: string, rol: Rol): Nivel => {
    const capacidad = capacidades.find((c) => c.id === id);
    if (!capacidad) throw new Error(`Falta la capacidad ${id}`);
    return capacidad.roles[rol];
  };
  const ROLES: Rol[] = ['superadmin', 'admin', 'empleado'];

  it('cada función coincide con sus capacidades para los tres roles', () => {
    const pares: [string[], (rol: Rol) => boolean][] = [
      [['finanzas.gastos', 'finanzas.metas'], permisos.puedeVerFinanzas],
      [['documentos.presupuestos', 'documentos.comprobantes', 'documentos.taller'], permisos.puedeEmitirDocumentos],
      [['inventario.gestionar'], permisos.puedeGestionarInventario],
    ];
    for (const rol of ROLES) {
      for (const [ids, funcion] of pares) {
        for (const id of ids) expect(funcion(rol), `${id} / ${rol}`).toBe(nivel(id, rol) === 'si');
      }
      // Ver el inventario y registrar el uso: todos los roles (no hay función que los esconda).
      expect(nivel('inventario.ver', rol)).toBe('si');
      expect(nivel('inventario.usar', rol)).toBe('si');
    }
  });
});
