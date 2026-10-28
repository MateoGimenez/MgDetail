import {
  type MetaActual,
  type MetaMensual,
  type MetaMensualConAvance,
  type MetaRepository,
  type ObjetivosMeta,
  calcularProgreso,
  contarDiasDeAtencion,
  limitesDelMes,
  mesesPermitidos,
  metaCumplida,
} from '../domain/metas.js';
import type { EstadisticasRepository } from '../domain/estadisticas.js';
import { todayInLaRioja } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';
import type { DisponibilidadService } from './disponibilidad.js';

export interface MetaServiceDeps {
  metas: MetaRepository;
  estadisticas: EstadisticasRepository;
  disponibilidad: DisponibilidadService;
  logger: Logger;
  now: () => Date;
}

export const META_NOT_FOUND = 'Ese mes no tiene una meta.';

/**
 * Metas mensuales (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Los permisos los exige la
 * ruta (domain/permisos.ts, puedeGestionarMetas). Los ingresos y los trabajos del mes salen de las estadísticas
 * (turnos completados por fecha de agenda); los días de atención, de la disponibilidad (horario semanal y días
 * especiales). "Hoy" es el de La Rioja.
 */
export class MetaService {
  constructor(private readonly deps: MetaServiceDeps) {}

  private hoy(): string {
    return todayInLaRioja(this.deps.now());
  }

  /** Meta y progreso del mes en curso. */
  async actual(): Promise<MetaActual> {
    const hoy = this.hoy();
    const mes = hoy.slice(0, 7);
    const { desde, hasta } = limitesDelMes(mes);
    const [meta, totales, cupos] = await Promise.all([
      this.deps.metas.obtener(mes),
      this.deps.estadisticas.totales([{ clave: 'mes', desde, hasta }]),
      this.deps.disponibilidad.cupos(desde, hasta),
    ]);
    const avance = { ingresos: totales.mes?.ingresos ?? 0, trabajos: totales.mes?.completados ?? 0 };
    const objetivos: ObjetivosMeta | null =
      meta === null ? null : { ingresosObjetivo: meta.ingresosObjetivo, trabajosObjetivo: meta.trabajosObjetivo };
    return { mes, meta: objetivos, progreso: calcularProgreso(objetivos, avance, contarDiasDeAtencion(cupos, hoy)) };
  }

  /** Las metas de un año (solo los meses que tienen), con lo logrado en cada mes. */
  async delAnio(anio: number | undefined): Promise<MetaMensualConAvance[]> {
    const anioElegido = anio ?? Number(this.hoy().slice(0, 4));
    const metas = await this.deps.metas.delAnio(anioElegido);
    if (metas.length === 0) return [];
    const rangos = metas.map((meta) => ({ clave: meta.mes, ...limitesDelMes(meta.mes) }));
    const totales = await this.deps.estadisticas.totales(rangos);
    return metas.map((meta) => {
      const ingresos = totales[meta.mes]?.ingresos ?? 0;
      const trabajos = totales[meta.mes]?.completados ?? 0;
      return { ...meta, ingresos, trabajos, cumplida: metaCumplida(meta, { ingresos, trabajos }) };
    });
  }

  /** Fija o corrige la meta de un mes (YYYY-MM, de 12 meses atrás a 12 adelante). */
  async guardar(actor: UsuarioSesion, mes: string, cambios: Partial<ObjetivosMeta>): Promise<MetaMensual> {
    const { primero, ultimo } = mesesPermitidos(this.hoy());
    if (mes < primero || mes > ultimo) {
      throw AppError.validation({ mes: 'Solo se pueden fijar metas de hasta 12 meses atrás y 12 meses adelante.' });
    }
    const guardada = await this.deps.metas.guardar(mes, cambios);
    if (guardada === null) {
      const mensaje = 'La meta tiene que tener al menos un objetivo: de ingresos o de trabajos.';
      throw AppError.validation({ ingresosObjetivo: mensaje, trabajosObjetivo: mensaje });
    }
    this.deps.logger.info(`Meta guardada mes=${mes} por=${actor.id}`);
    return guardada;
  }

  /** Quita la meta de un mes. 404 si no tenía. */
  async borrar(actor: UsuarioSesion, mes: string): Promise<void> {
    if (!(await this.deps.metas.borrar(mes))) throw AppError.notFound(META_NOT_FOUND);
    this.deps.logger.info(`Meta borrada mes=${mes} por=${actor.id}`);
  }
}
