import { describe, expect, it } from 'vitest';
import {
  ETIQUETA_FORMA_DE_PAGO,
  FORMAS_DE_PAGO,
  estadoDeEmision,
  esFormaDePago,
  lineaDeComprobante,
  nombreDeArchivoComprobante,
  nombreDeArchivoPresupuesto,
} from './comprobantes';
import {
  esCuitValido,
  faltaEnTaller,
  formularioDeTaller,
  limpiarInstagram,
  mismosDatosDeTaller,
  resumenDeTaller,
  validarTaller,
  type DatosTaller,
} from './taller';

const taller: DatosTaller = {
  nombre: 'MgDetailing',
  telefono: '5493804781737',
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  instagram: null,
  cuit: null,
  leyendaPdf: null,
};

describe('datos del taller', () => {
  it('el formulario de lo guardado no tiene nulls y vuelve igual', () => {
    const f = formularioDeTaller(taller);
    expect(f.instagram).toBe('');
    const r = validarTaller(f);
    expect(r).toEqual({ ok: true, datos: taller });
    if (r.ok) expect(mismosDatosDeTaller(r.datos, taller)).toBe(true);
  });

  it('normaliza teléfono e instagram y deja vacíos como null', () => {
    const r = validarTaller({
      nombre: ' MgDetailing ',
      telefono: '380 478-1737',
      direccion: '',
      instagram: '@mgdetailing',
      cuit: '20-12345678-9',
      leyendaPdf: ' Gracias por confiar ',
    });
    expect(r).toEqual({
      ok: true,
      datos: {
        nombre: 'MgDetailing',
        telefono: '5493804781737',
        direccion: null,
        instagram: 'mgdetailing',
        cuit: '20-12345678-9',
        leyendaPdf: 'Gracias por confiar',
      },
    });
  });

  it('marca cada campo con su error', () => {
    const r = validarTaller({ nombre: '', telefono: '12', direccion: 'x'.repeat(161), instagram: 'no vale!', cuit: '123', leyendaPdf: 'x'.repeat(301) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(['cuit', 'direccion', 'instagram', 'leyendaPdf', 'nombre', 'telefono']);
  });

  it('CUIT con o sin guiones; Instagram acepta el enlace del perfil', () => {
    expect(esCuitValido('20123456789')).toBe(true);
    expect(esCuitValido('20-12345678-9')).toBe(true);
    expect(esCuitValido('20-1234567-89')).toBe(false);
    expect(limpiarInstagram('https://www.instagram.com/mgdetailing/?hl=es')).toBe('mgdetailing');
    expect(limpiarInstagram(' @mg.detailing ')).toBe('mg.detailing');
  });

  it('resumen y avisos de lo que falta', () => {
    expect(resumenDeTaller(taller)).toBe('MgDetailing · 5493804781737 · Calle Olta Pasaje N2, La Rioja');
    expect(faltaEnTaller(taller)).toEqual([]);
    expect(faltaEnTaller({ ...taller, telefono: null, direccion: null })).toEqual(['el teléfono', 'la dirección']);
  });
});

describe('comprobantes', () => {
  it('las cinco formas de pago tienen etiqueta', () => {
    expect(FORMAS_DE_PAGO.map((f) => ETIQUETA_FORMA_DE_PAGO[f])).toEqual(['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Otro']);
    expect(esFormaDePago('efectivo')).toBe(true);
    expect(esFormaDePago('cheque')).toBe(false);
  });

  it('nombres de archivo iguales a los del backend', () => {
    expect(nombreDeArchivoComprobante('R-0001')).toBe('Comprobante-R-0001.pdf');
    expect(nombreDeArchivoPresupuesto('P-0007')).toBe('Presupuesto-P-0007.pdf');
  });

  it('sin cobro no se emite; con cobro sí (también uno de $ 0)', () => {
    expect(estadoDeEmision({ monto: null })).toBe('sin-cobro');
    expect(estadoDeEmision({ monto: 0 })).toBe('listo');
    expect(estadoDeEmision({ monto: 60000 })).toBe('listo');
  });

  it('línea del comprobante emitido', () => {
    expect(lineaDeComprobante({ codigo: 'R-0001', formaPago: 'efectivo', fechaEmision: '2026-10-27' })).toMatch(/^R-0001 · Efectivo · /);
  });
});
