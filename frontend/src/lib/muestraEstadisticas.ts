import type { Estadisticas } from '../api/estadisticas';

/** Datos de muestra para las pruebas (no los importa ningún componente: no entran al build). */
export const MUESTRA: Estadisticas = {
  rango: { desde: '2026-10-01', hasta: '2026-10-03' },
  granularidad: 'dia',
  resumen: {
    hoy: { actual: { completados: 3, ingresos: 95000 }, anterior: { completados: 2, ingresos: 60000 } },
    mes: { actual: { completados: 24, ingresos: 1240000 }, anterior: { completados: 0, ingresos: 0 } },
    anio: { actual: { completados: 120, ingresos: 6000000 }, anterior: { completados: 90, ingresos: 4000000 } },
  },
  periodo: {
    turnos: 40,
    pedidos: 36,
    pendientes: 4,
    confirmados: 6,
    completados: 24,
    cancelados: 4,
    ingresos: 1240000,
    ticketPromedio: 51666.7,
    completadosSinMonto: 3,
    tasaCancelacion: 0.1,
  },
  serie: [
    { clave: '2026-10-01', completados: 2, ingresos: 80000 },
    { clave: '2026-10-02', completados: 0, ingresos: 0 },
    { clave: '2026-10-03', completados: 1, ingresos: 25000 },
  ],
  porServicio: [
    { servicioId: 'lavado', nombre: 'Lavado Premium', pedidos: 14, completados: 10, ingresos: 600000 },
    { servicioId: 'raro', nombre: '=HYPERLINK("http://x")', pedidos: 1, completados: 0, ingresos: 0 },
  ],
  porTrabajador: [
    { id: 'u1', nombre: 'Lucas', completados: 12, ingresos: 560000 },
    { id: null, nombre: 'Sin asignar', completados: 2, ingresos: 0 },
  ],
  porDiaSemana: [
    { dia: 0, manana: 1, tarde: 0 },
    { dia: 1, manana: 5, tarde: 3 },
  ],
  completadosSinTrabajador: 2,
};
