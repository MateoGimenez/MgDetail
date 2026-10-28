import { describe, expect, it } from 'vitest';
import {
  avisoDeEstado,
  cuerpoDeAlta,
  cuerpoDeCambios,
  etiquetaDeServicio,
  importeDeItem,
  itemEnVivo,
  mensajeDePresupuesto,
  normalizarTelefono,
  renglonDesdeItem,
  renglonVacio,
  subtotalDe,
  textoDeVencimiento,
  textoItems,
  totalDe,
  totalEnVivo,
  validarPresupuesto,
  whatsappPresupuestoUrl,
  type FormularioPresupuesto,
} from './presupuestos';

describe('cuentas del presupuesto (iguales al backend)', () => {
  it('importe = round(cantidad × precio), sin errores de coma flotante', () => {
    expect(importeDeItem({ cantidad: 1, precioUnitario: 25000 })).toBe(25000);
    expect(importeDeItem({ cantidad: 2.5, precioUnitario: 10000 })).toBe(25000);
    expect(importeDeItem({ cantidad: 2.35, precioUnitario: 100 })).toBe(235);
    expect(importeDeItem({ cantidad: 0.5, precioUnitario: 25 })).toBe(13);
    expect(importeDeItem({ cantidad: 1.15, precioUnitario: 3 })).toBe(3);
    expect(importeDeItem({ cantidad: 3, precioUnitario: 0 })).toBe(0);
  });

  it('subtotal suma importes y total nunca baja de 0', () => {
    const items = [
      { cantidad: 1, precioUnitario: 25000 },
      { cantidad: 2, precioUnitario: 4500 },
    ];
    expect(subtotalDe(items)).toBe(34000);
    expect(totalDe(34000, 4000)).toBe(30000);
    expect(totalDe(34000, 50000)).toBe(0);
    expect(subtotalDe([])).toBe(0);
  });

  it('total en vivo: lo que no se entiende todavía vale 0', () => {
    const r1 = { ...renglonVacio(1), descripcion: 'Pulido', cantidad: '1', precio: '25.000' };
    const r2 = { ...renglonVacio(2), cantidad: '2,5', precio: '10000' };
    const r3 = { ...renglonVacio(3), cantidad: 'x', precio: '$' };
    expect(itemEnVivo(r3)).toEqual({ cantidad: 0, precioUnitario: 0 });
    expect(totalEnVivo([r1, r2, r3], '$ 5.000')).toEqual({ subtotal: 50000, descuento: 5000, total: 45000 });
    expect(totalEnVivo([r1], 'abc')).toEqual({ subtotal: 25000, descuento: 0, total: 25000 });
  });

  it('textos', () => {
    expect(textoItems(1)).toBe('1 ítem');
    expect(textoItems(3)).toBe('3 ítems');
    expect(etiquetaDeServicio('Pulido', 60000)).toBe('Pulido · Desde $ 60.000');
    expect(etiquetaDeServicio('Pulido', null)).toBe('Pulido');
    expect(etiquetaDeServicio('Pulido', 0)).toBe('Pulido');
    expect(avisoDeEstado('P-0007', 'aceptado')).toBe('P-0007 pasó a Aceptado.');
  });

  it('vencimiento: solo si sigue abierto', () => {
    expect(textoDeVencimiento({ venceEl: '2026-11-03', vencido: false, estado: 'enviado' })).toMatch(/^Vence el /);
    expect(textoDeVencimiento({ venceEl: '2026-10-20', vencido: true, estado: 'borrador' })).toMatch(/^Venció el /);
    expect(textoDeVencimiento({ venceEl: '2026-10-20', vencido: true, estado: 'aceptado' })).toBeNull();
    expect(textoDeVencimiento({ venceEl: '2026-10-20', vencido: false, estado: 'rechazado' })).toBeNull();
  });
});

describe('teléfono para wa.me', () => {
  it('entiende las formas de escribir un celular de La Rioja', () => {
    expect(normalizarTelefono('380 478-1737')).toBe('5493804781737');
    expect(normalizarTelefono('0380 15 478 1737')).toBe('5493804781737');
    expect(normalizarTelefono('0380-154781737')).toBe('5493804781737');
    expect(normalizarTelefono('+54 9 380 478 1737')).toBe('5493804781737');
    expect(normalizarTelefono('54 380 4781737')).toBe('5493804781737');
    expect(normalizarTelefono('5493804781737')).toBe('5493804781737');
    expect(normalizarTelefono('011 15 1234 5678')).toBe('5491112345678');
  });

  it('respeta otros países y rechaza lo que no alcanza', () => {
    expect(normalizarTelefono('+598 99 123 456')).toBe('59899123456');
    expect(normalizarTelefono('123')).toBeNull();
    expect(normalizarTelefono('')).toBeNull();
    expect(normalizarTelefono('1234567890123456')).toBeNull();
  });

  it('arma el enlace con el texto codificado, o null sin teléfono', () => {
    const url = whatsappPresupuestoUrl('380 478-1737', 'Hola Juan!\nTotal $ 25.000');
    expect(url).toBe('https://wa.me/5493804781737?text=Hola%20Juan!%0ATotal%20%24%2025.000');
    expect(whatsappPresupuestoUrl(null, 'x')).toBeNull();
    expect(whatsappPresupuestoUrl('abc', 'x')).toBeNull();
  });
});

describe('mensaje de WhatsApp', () => {
  it('va en voseo, con total, vencimiento y aclara que el PDF se manda aparte', () => {
    const texto = mensajeDePresupuesto(
      { codigo: 'P-0007', clienteNombre: 'Juan Pérez', vehiculo: 'Corsa 2012', total: 85000, validezDias: 7, venceEl: '2026-11-03' },
      'MgDetailing',
    );
    expect(texto).toContain('Hola Juan!');
    expect(texto).toContain('presupuesto P-0007 de MgDetailing para tu Corsa 2012');
    expect(texto).toContain('$ 85.000');
    expect(texto).toContain('7 días');
    expect(texto).toContain('Ahora te mando el PDF');
  });

  it('sin vehículo ni nombre queda natural', () => {
    const texto = mensajeDePresupuesto(
      { codigo: 'P-0001', clienteNombre: ' ', vehiculo: null, total: 1000, validezDias: 1, venceEl: '2026-11-03' },
      'MgDetailing',
    );
    expect(texto.startsWith('Hola! Te paso el presupuesto P-0001 de MgDetailing.')).toBe(true);
    expect(texto).toContain('(1 día)');
  });
});

const formulario = (cambios: Partial<FormularioPresupuesto> = {}): FormularioPresupuesto => ({
  clienteNombre: ' Juan Pérez ',
  clienteTelefono: '380 478-1737',
  vehiculo: 'Corsa 2012',
  renglones: [
    { clave: 1, descripcion: ' Pulido ', cantidad: '1', precio: '$ 60.000' },
    { clave: 2, descripcion: 'Pasta extra', cantidad: '2,5', precio: '1000' },
  ],
  descuento: '5000',
  validezDias: '10',
  notas: ' Con ceras ',
  ...cambios,
});

describe('validarPresupuesto', () => {
  it('arma los datos listos para mandar', () => {
    expect(validarPresupuesto(formulario())).toEqual({
      ok: true,
      datos: {
        clienteNombre: 'Juan Pérez',
        clienteTelefono: '5493804781737',
        vehiculo: 'Corsa 2012',
        items: [
          { descripcion: 'Pulido', cantidad: 1, precioUnitario: 60000 },
          { descripcion: 'Pasta extra', cantidad: 2.5, precioUnitario: 1000 },
        ],
        descuento: 5000,
        validezDias: 10,
        notas: 'Con ceras',
      },
    });
  });

  it('opcionales vacíos y valores por defecto', () => {
    const r = validarPresupuesto(formulario({ clienteTelefono: '', vehiculo: '', descuento: '', validezDias: '', notas: '' }));
    expect(r).toMatchObject({
      ok: true,
      datos: { clienteTelefono: null, vehiculo: null, descuento: 0, validezDias: 7, notas: null },
    });
  });

  it('errores con las claves del backend y un precio vacío no pasa', () => {
    const r = validarPresupuesto(
      formulario({
        clienteNombre: '',
        clienteTelefono: '12',
        renglones: [
          { clave: 1, descripcion: '', cantidad: '0', precio: '' },
          { clave: 2, descripcion: 'ok', cantidad: '1000', precio: '10,5' },
        ],
        validezDias: '91',
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errores).sort()).toEqual(
        [
          'clienteNombre',
          'clienteTelefono',
          'items.0.cantidad',
          'items.0.descripcion',
          'items.0.precioUnitario',
          'items.1.cantidad',
          'items.1.precioUnitario',
          'validezDias',
        ].sort(),
      );
    }
  });

  it('de 1 a 30 ítems', () => {
    const vacio = validarPresupuesto(formulario({ renglones: [] }));
    expect(vacio.ok).toBe(false);
    if (!vacio.ok) expect(typeof vacio.errores.items).toBe('string');
    const treintaYUno = Array.from({ length: 31 }, (_, i) => ({ clave: i, descripcion: 'x', cantidad: '1', precio: '1' }));
    const lleno = validarPresupuesto(formulario({ renglones: treintaYUno }));
    expect(lleno.ok).toBe(false);
    if (!lleno.ok) expect(typeof lleno.errores.items).toBe('string');
  });

  it('precio 0 vale (sin cargo)', () => {
    const r = validarPresupuesto(formulario({ renglones: [{ clave: 1, descripcion: 'Cortesía', cantidad: '1', precio: '0' }] }));
    expect(r).toMatchObject({ ok: true });
  });
});

describe('cuerpos de alta y de cambios', () => {
  const valido = validarPresupuesto(formulario());
  if (!valido.ok) throw new Error('el formulario de prueba tiene que ser válido');
  const datos = valido.datos;

  it('el alta no manda los opcionales vacíos', () => {
    const cuerpo = cuerpoDeAlta({ ...datos, clienteTelefono: null, vehiculo: null, notas: null });
    expect(cuerpo).not.toHaveProperty('clienteTelefono');
    expect(cuerpo).not.toHaveProperty('vehiculo');
    expect(cuerpo).not.toHaveProperty('notas');
    expect(cuerpo).toMatchObject({ clienteNombre: 'Juan Pérez', descuento: 5000, validezDias: 10 });
  });

  it('los cambios llevan solo lo distinto; vaciar un opcional manda null', () => {
    const original = { ...datos, clienteTelefono: '380 478-1737' };
    expect(cuerpoDeCambios(original, datos)).toBeNull();
    expect(cuerpoDeCambios(original, { ...datos, vehiculo: null, descuento: 0 })).toEqual({ vehiculo: null, descuento: 0 });
    expect(cuerpoDeCambios(original, { ...datos, items: datos.items.slice(0, 1) })).toHaveProperty('items');
  });

  it('un ítem guardado vuelve a texto de campo', () => {
    expect(renglonDesdeItem({ descripcion: 'x', cantidad: 2.5, precioUnitario: 1000 }, 4)).toEqual({
      clave: 4,
      descripcion: 'x',
      cantidad: '2,5',
      precio: '1000',
    });
  });
});

/* Los MISMOS casos en backend/test/revision-objetivos-9-10.test.ts y frontend/src/lib/presupuestos.test.ts (valores
 * calculados aparte con BigInt): si un lado cambia su redondeo, el otro test sigue exigiendo lo de siempre. */
const CASOS_IMPORTE: [number, number, number][] = [[1,25000,25000],[0.5,25,13],[2.5,333,833],[1.15,100,115],[2.35,100,235],[0.01,149,1],[0.01,150,2],[0.03,50,2],[999,99999999,99899999001],[0.33,99999999,33000000],[1.5,1001,1502],[0.5,1,1],[0.07,10,1],[12.34,5678,70067],[0.1,5,1],[0.29,50,15],[3,0,0],[0.01,1,0],[0.99,99999999,98999999]];
const ITEMS_30 = Array.from({ length: 30 }, (_, i) => ({ cantidad: 1 + (i % 7) * 0.35, precioUnitario: 1234 + i * 777 }));

describe('cuentas idénticas al backend (mismos casos de borde)', () => {
  it('importe por ítem: .5 hacia arriba, decimales de la cantidad y precios grandes', () => {
    for (const [cantidad, precioUnitario, esperado] of CASOS_IMPORTE) {
      expect(importeDeItem({ cantidad, precioUnitario }), `${String(cantidad)} x ${String(precioUnitario)}`).toBe(esperado);
    }
  });
  it('30 ítems, descuento igual, menor y mayor al subtotal', () => {
    const subtotal = subtotalDe(ITEMS_30);
    expect(subtotal).toBe(758464);
    expect(totalDe(subtotal, 58464)).toBe(700000);
    expect(totalDe(subtotal, 758464)).toBe(0);
    expect(totalDe(subtotal, 1_000_000)).toBe(0);
    expect(totalDe(0, 5)).toBe(0);
  });
});
