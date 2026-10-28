import { describe, expect, it } from 'vitest';
import type { CupoDia, Turno } from '../api/contract';
import {
  VISTAS,
  avisosDeHoy,
  haceCuanto,
  masViejos,
  resolverVista,
  resumenDeManana,
  resumenDelDia,
  saludoSegunHora,
  textoPendientes,
  textoStockBajo,
  type Vista,
} from './hoy';

const base: Turno = {
  id: 'a1',
  nombre: 'Lucía Fernández',
  telefono: '380 412-3456',
  telefonoWhatsapp: '5493804123456',
  email: null,
  vehiculoTipo: 'auto',
  vehiculoModelo: null,
  servicioId: 'pulido',
  fechaPreferida: '2026-10-26',
  franja: 'manana',
  fechaConfirmada: null,
  franjaConfirmada: null,
  comentario: null,
  estado: 'confirmado',
  createdAt: '2026-10-20T15:00:00.000Z',
  updatedAt: '2026-10-20T15:00:00.000Z',
  notasInternas: null,
  turnosDelCliente: 1,
  monto: null,
  trabajador: null,
};
const turno = (cambios: Partial<Turno>): Turno => ({ ...base, ...cambios });
const cupo = (cambios: Partial<CupoDia>): CupoDia => ({
  fecha: '2026-10-26',
  abierto: true,
  cupoManana: 2,
  cupoTarde: 2,
  ocupadosManana: 0,
  ocupadosTarde: 0,
  ...cambios,
});

const TODAS: readonly Vista[] = VISTAS;
const SIN_USUARIOS = VISTAS.filter((v) => v !== 'usuarios');

describe('vista inicial (?vista=)', () => {
  it('abre la pedida si es válida y el rol la puede ver', () => {
    expect(resolverVista('agenda', TODAS)).toBe('agenda');
    expect(resolverVista('usuarios', TODAS)).toBe('usuarios');
    expect(resolverVista('hoy', TODAS)).toBe('hoy');
  });

  it('ignora lo que falta, lo inválido y las mayúsculas', () => {
    expect(resolverVista(null, TODAS)).toBe('hoy');
    expect(resolverVista(undefined, TODAS)).toBe('hoy');
    expect(resolverVista('', TODAS)).toBe('hoy');
    expect(resolverVista('Agenda', TODAS)).toBe('hoy');
    expect(resolverVista('inexistente', TODAS)).toBe('hoy');
    expect(resolverVista('__proto__', TODAS)).toBe('hoy');
  });

  it('no deja abrir lo que el rol no puede ver', () => {
    expect(resolverVista('usuarios', SIN_USUARIOS)).toBe('hoy');
    expect(resolverVista('servicios', SIN_USUARIOS)).toBe('servicios');
  });
});

describe('las diez vistas', () => {
  it('son las del contrato, en el orden de la navegación', () => {
    expect(VISTAS).toEqual([
      'hoy',
      'turnos',
      'agenda',
      'estadisticas',
      'finanzas',
      'presupuestos',
      'inventario',
      'disponibilidad',
      'servicios',
      'usuarios',
    ]);
  });

  it('abre las nuevas si están permitidas', () => {
    expect(resolverVista('finanzas', TODAS)).toBe('finanzas');
    expect(resolverVista('presupuestos', TODAS)).toBe('presupuestos');
    expect(resolverVista('inventario', TODAS)).toBe('inventario');
    expect(resolverVista('finanzas', ['hoy', 'turnos'])).toBe('hoy');
  });

  it('frase del aviso de stock bajo', () => {
    expect(textoStockBajo(1)).toBe('1 insumo con stock bajo');
    expect(textoStockBajo(4)).toBe('4 insumos con stock bajo');
  });
});

describe('pendientes más viejos', () => {
  const p = (id: string, createdAt: string, estado: Turno['estado'] = 'pendiente') => turno({ id, createdAt, estado });

  it('elige los que llegaron primero, el más viejo arriba', () => {
    const lista = [p('c', '2026-10-25T10:00:00Z'), p('a', '2026-10-20T10:00:00Z'), p('d', '2026-10-26T10:00:00Z'), p('b', '2026-10-22T10:00:00Z')];
    expect(masViejos(lista, 3).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignora los que no están pendientes y no toca la lista original', () => {
    const lista = [p('x', '2026-10-01T10:00:00Z', 'confirmado'), p('b', '2026-10-22T10:00:00Z'), p('a', '2026-10-20T10:00:00Z')];
    expect(masViejos(lista, 3).map((t) => t.id)).toEqual(['a', 'b']);
    expect(lista.map((t) => t.id)).toEqual(['x', 'b', 'a']);
  });

  it('con menos o cero pedidos devuelve lo que hay', () => {
    expect(masViejos([], 3)).toEqual([]);
    expect(masViejos([p('a', '2026-10-20T10:00:00Z')], 0)).toEqual([]);
    expect(masViejos([p('a', '2026-10-20T10:00:00Z')], -2)).toEqual([]);
  });

  it('cuenta en singular y plural', () => {
    expect(textoPendientes(1)).toBe('1 pendiente');
    expect(textoPendientes(0)).toBe('0 pendientes');
    expect(textoPendientes(5)).toBe('5 pendientes');
  });
});

describe('hace cuánto llegó', () => {
  const ahora = new Date('2026-10-26T15:00:00Z');
  it('usa palabras llanas', () => {
    expect(haceCuanto('2026-10-26T14:59:50Z', ahora)).toBe('recién');
    expect(haceCuanto('2026-10-26T14:59:00Z', ahora)).toBe('hace 1 min');
    expect(haceCuanto('2026-10-26T14:30:00Z', ahora)).toBe('hace 30 min');
    expect(haceCuanto('2026-10-26T12:00:00Z', ahora)).toBe('hace 3 h');
    expect(haceCuanto('2026-10-25T12:00:00Z', ahora)).toBe('ayer');
    expect(haceCuanto('2026-10-22T12:00:00Z', ahora)).toBe('hace 4 días');
  });
  it('un reloj adelantado o una fecha rota no rompen', () => {
    expect(haceCuanto('2026-10-27T15:00:00Z', ahora)).toBe('recién');
    expect(haceCuanto('no es fecha', ahora)).toBe('recién');
  });
});

describe('saludo (hora de La Rioja, UTC−3)', () => {
  it('cambia con la hora local', () => {
    expect(saludoSegunHora(new Date('2026-10-26T12:00:00Z'))).toBe('Buen día'); // 09:00
    expect(saludoSegunHora(new Date('2026-10-26T14:59:00Z'))).toBe('Buen día'); // 11:59
    expect(saludoSegunHora(new Date('2026-10-26T15:00:00Z'))).toBe('Buenas tardes'); // 12:00
    expect(saludoSegunHora(new Date('2026-10-26T22:59:00Z'))).toBe('Buenas tardes'); // 19:59
    expect(saludoSegunHora(new Date('2026-10-26T23:00:00Z'))).toBe('Buenas noches'); // 20:00
    expect(saludoSegunHora(new Date('2026-10-27T02:00:00Z'))).toBe('Buenas noches'); // 23:00 del 26
    expect(saludoSegunHora(new Date('2026-10-27T03:00:00Z'))).toBe('Buen día'); // 00:00 del 27
  });
});

describe('resumen de un día', () => {
  const turnos = [
    turno({ id: '1', fechaPreferida: '2026-10-26', franja: 'tarde' }),
    turno({ id: '2', fechaPreferida: '2026-10-26', franja: 'manana' }),
    turno({ id: '3', fechaPreferida: '2026-10-27', franja: 'manana' }),
    turno({ id: '4', fechaPreferida: '2026-10-26', franja: 'manana', estado: 'cancelado' }),
    turno({ id: '5', fechaPreferida: '2026-10-20', fechaConfirmada: '2026-10-26', franjaConfirmada: 'manana' }),
  ];

  it('agrupa por franja con la fecha de agenda y deja afuera cancelados y otros días', () => {
    const dia = resumenDelDia(turnos, '2026-10-26', cupo({ cupoManana: 3, cupoTarde: 1 }));
    expect(dia.total).toBe(3);
    expect(dia.franjas[0]?.turnos.map((t) => t.id)).toEqual(['2', '5']);
    expect(dia.franjas[1]?.turnos.map((t) => t.id)).toEqual(['1']);
    expect(dia.franjas[0]?.lugares).toMatchObject({ ocupados: 2, cupo: 3, llena: false });
    expect(dia.franjas[1]?.lugares).toMatchObject({ ocupados: 1, cupo: 1, llena: true });
  });

  it('sin cupos del backend no inventa lugares', () => {
    const dia = resumenDelDia(turnos, '2026-10-26', null);
    expect(dia.cerrado).toBeNull();
    expect(dia.franjas.every((f) => f.lugares === null)).toBe(true);
    expect(avisosDeHoy(dia)).toEqual([]);
  });

  it('un día sin turnos tiene las dos franjas vacías', () => {
    const dia = resumenDelDia([], '2026-10-26', cupo({}));
    expect(dia.total).toBe(0);
    expect(dia.franjas.map((f) => f.turnos.length)).toEqual([0, 0]);
  });
});

describe('avisos de hoy', () => {
  it('hoy cerrado: un solo aviso, con o sin turnos ya agendados', () => {
    expect(avisosDeHoy(resumenDelDia([], '2026-10-26', cupo({ abierto: false })))).toEqual([
      'Hoy el taller figura cerrado: la web no recibe pedidos para hoy.',
    ]);
    expect(avisosDeHoy(resumenDelDia([turno({})], '2026-10-26', cupo({ abierto: false })))).toEqual([
      'Hoy el taller figura cerrado, pero ya hay 1 turno agendado.',
    ]);
  });

  it('franja llena', () => {
    const turnos = [turno({ id: '1' }), turno({ id: '2' })];
    expect(avisosDeHoy(resumenDelDia(turnos, '2026-10-26', cupo({})))).toEqual(['La mañana de hoy está llena (2/2).']);
  });

  it('franja con cupo 0', () => {
    expect(avisosDeHoy(resumenDelDia([], '2026-10-26', cupo({ cupoTarde: 0 })))).toEqual(['Hoy la tarde figura cerrada.']);
  });

  it('con lugar no avisa nada', () => {
    expect(avisosDeHoy(resumenDelDia([turno({})], '2026-10-26', cupo({})))).toEqual([]);
  });
});

describe('mañana', () => {
  it('cuenta, avisa si está cerrado o vacío', () => {
    const turnos = [turno({ id: '1', fechaPreferida: '2026-10-27' }), turno({ id: '2', fechaPreferida: '2026-10-27', franja: 'tarde' })];
    expect(resumenDeManana(resumenDelDia(turnos, '2026-10-27', cupo({ fecha: '2026-10-27' })))).toBe('2 turnos');
    expect(resumenDeManana(resumenDelDia([], '2026-10-27', cupo({ fecha: '2026-10-27' })))).toBe('Sin turnos por ahora');
    expect(resumenDeManana(resumenDelDia([], '2026-10-27', cupo({ fecha: '2026-10-27', abierto: false })))).toBe(
      'El taller figura cerrado',
    );
  });
});
