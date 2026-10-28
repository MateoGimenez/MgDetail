import type { Estadisticas } from '../api/estadisticas';

/** Datos de muestra para las pruebas (no los importa ningún componente: no entran al build). */
export const MUESTRA: Estadisticas = {
  rango: { desde: '2026-10-01', hasta: '2026-10-03' },
  granularidad: 'dia',
  resumen: {
    hoy: {
      actual: { completados: 3, ingresos: 95000, gastos: 15000, ganancia: 80000 },
      anterior: { completados: 2, ingresos: 60000, gastos: 0, ganancia: 60000 },
    },
    mes: {
      actual: { completados: 24, ingresos: 1240000, gastos: 310000, ganancia: 930000 },
      anterior: { completados: 0, ingresos: 0, gastos: 50000, ganancia: -50000 },
    },
    anio: {
      actual: { completados: 120, ingresos: 6000000, gastos: 1800000, ganancia: 4200000 },
      anterior: { completados: 90, ingresos: 4000000, gastos: 1500000, ganancia: 2500000 },
    },
  },
  periodo: {
    turnos: 40,
    pedidos: 36,
    pendientes: 4,
    confirmados: 6,
    completados: 24,
    cancelados: 4,
    ingresos: 1240000,
    gastos: 310000,
    gananciaNeta: 930000,
    margen: 0.75,
    ticketPromedio: 51666.7,
    completadosSinMonto: 3,
    tasaCancelacion: 0.1,
  },
  serie: [
    { clave: '2026-10-01', completados: 2, ingresos: 80000, gastos: 20000 },
    { clave: '2026-10-02', completados: 0, ingresos: 0, gastos: 45000 },
    { clave: '2026-10-03', completados: 1, ingresos: 25000, gastos: 0 },
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
  gastosPorCategoria: [
    { categoria: 'alquiler', monto: 150000 },
    { categoria: 'insumos', monto: 120000 },
    { categoria: 'servicios', monto: 40000 },
  ],
};
