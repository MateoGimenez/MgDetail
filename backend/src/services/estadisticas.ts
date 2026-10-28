import {
  type Estadisticas,
  type EstadisticasRepository,
  type FilaDiaSemana,
  type MisTrabajos,
  type PuntoSerie,
  type Rango,
  type Totales,
  type TotalesConGastos,
  clavesDeSerie,
  granularidadDe,
  razon,
  rangosDelResumen,
  resolverRango,
} from '../domain/estadisticas.js';
import { todayInLaRioja } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';

export interface EstadisticasServiceDeps {
  estadisticas: EstadisticasRepository;
  now: () => Date;
}

const CERO: Totales = { completados: 0, ingresos: 0 };

/** Redondea a 4 decimales (una tasa como 0.1 o 0.3333). */
const redondear4 = (valor: number): number => Math.round(valor * 10_000) / 10_000;

/**
 * Estadísticas del taller (contrato: reportes/2026-10-26_15_estadisticas-y-permisos.md). Las completas llevan
 * importes y datos de todo el equipo: solo las pide quien puede (domain/permisos.ts, puedeVerEstadisticas; lo exige
 * la ruta). "Mis trabajos" lleva solo conteos de una persona y nunca importes. "Hoy" es el de La Rioja, no el del
 * servidor. Las agregaciones las hace la base (repositories/postgres/estadisticas.ts).
 */
export class EstadisticasService {
  constructor(private readonly deps: EstadisticasServiceDeps) {}

  private rango(pedido: { desde?: string; hasta?: string }, hoy: string): Rango {
    const resuelto = resolverRango(pedido, hoy);
    if (!resuelto.ok) throw AppError.validation(resuelto.fields);
    return resuelto.rango;
  }

  async completas(pedido: { desde?: string; hasta?: string }): Promise<Estadisticas> {
    const hoy = todayInLaRioja(this.deps.now());
    const rango = this.rango(pedido, hoy);
    const granularidad = granularidadDe(rango);
    const repo = this.deps.estadisticas;

    const [totales, gastos, conteo, serie, gastosSerie, gastosPorCategoria, porServicio, porTrabajador, porDiaSemana] =
      await Promise.all([
        repo.totales(rangosDelResumen(hoy)),
        repo.gastosPorRango([...rangosDelResumen(hoy), { clave: 'periodo', ...rango }]),
        repo.conteo(rango),
        repo.serie(rango, granularidad),
        repo.gastosSerie(rango, granularidad),
        repo.gastosPorCategoria(rango),
        repo.porServicio(rango),
        repo.porTrabajador(rango),
        repo.porDiaSemana(rango),
      ]);

    const total = (clave: string): TotalesConGastos => {
      const { completados, ingresos } = totales[clave] ?? CERO;
      const gastado = gastos[clave] ?? 0;
      return { completados, ingresos, gastos: gastado, ganancia: ingresos - gastado };
    };
    const gastosDelPeriodo = gastos.periodo ?? 0;
    const gananciaNeta = conteo.ingresos - gastosDelPeriodo;
    const margen = razon(gananciaNeta, conteo.ingresos);
    const pedidos = conteo.pendientes + conteo.confirmados + conteo.completados;
    const ticket = razon(conteo.ingresos, conteo.completadosConMonto);
    const tasa = razon(conteo.cancelados, conteo.turnos);

    const porClave = new Map(serie.map((punto) => [punto.clave, punto]));
    const gastosPorClave = new Map(gastosSerie.map((punto) => [punto.clave, punto.gastos]));
    const diasSemana = new Map(porDiaSemana.map((fila) => [fila.dia, fila]));

    return {
      rango,
      granularidad,
      resumen: {
        hoy: { actual: total('hoy.actual'), anterior: total('hoy.anterior') },
        mes: { actual: total('mes.actual'), anterior: total('mes.anterior') },
        anio: { actual: total('anio.actual'), anterior: total('anio.anterior') },
      },
      periodo: {
        turnos: conteo.turnos,
        pedidos,
        pendientes: conteo.pendientes,
        confirmados: conteo.confirmados,
        completados: conteo.completados,
        cancelados: conteo.cancelados,
        ingresos: conteo.ingresos,
        gastos: gastosDelPeriodo,
        gananciaNeta,
        margen: margen === null ? null : redondear4(margen),
        ticketPromedio: ticket === null ? null : Math.round(ticket),
        completadosSinMonto: conteo.completados - conteo.completadosConMonto,
        tasaCancelacion: tasa === null ? null : redondear4(tasa),
      },
      serie: clavesDeSerie(rango, granularidad).map(
        (clave): PuntoSerie => ({ ...(porClave.get(clave) ?? { clave, ...CERO }), gastos: gastosPorClave.get(clave) ?? 0 }),
      ),
      porServicio,
      porTrabajador,
      porDiaSemana: [0, 1, 2, 3, 4, 5, 6].map((dia): FilaDiaSemana => diasSemana.get(dia) ?? { dia, manana: 0, tarde: 0 }),
      completadosSinTrabajador: porTrabajador.find((fila) => fila.id === null)?.completados ?? 0,
      gastosPorCategoria,
    };
  }

  /** Los trabajos que completó esa persona (por trabajador_id). Sin importes ni datos de los demás. */
  async mias(perfilId: string, pedido: { desde?: string; hasta?: string }): Promise<MisTrabajos> {
    const rango = this.rango(pedido, todayInLaRioja(this.deps.now()));
    const granularidad = granularidadDe(rango);
    const [porServicio, serie] = await Promise.all([
      this.deps.estadisticas.misServicios(perfilId, rango),
      this.deps.estadisticas.misSerie(perfilId, rango, granularidad),
    ]);
    const porClave = new Map(serie.map((punto) => [punto.clave, punto.completados]));
    return {
      rango,
      completados: porServicio.reduce((suma, fila) => suma + fila.completados, 0),
      porServicio,
      serie: clavesDeSerie(rango, granularidad).map((clave) => ({ clave, completados: porClave.get(clave) ?? 0 })),
    };
  }
}
