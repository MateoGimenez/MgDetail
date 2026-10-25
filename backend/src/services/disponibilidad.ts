import { MAX_DAYS_DIA_ESPECIAL } from '../domain/booking-dates.js';
import {
  type CupoDia,
  type DiaEspecial,
  type DisponibilidadPublica,
  type DisponibilidadRepository,
  type HorarioDia,
  type NuevoDiaEspecial,
  disponibilidadPublica,
} from '../domain/disponibilidad.js';
import { addDays, todayInLaRioja } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';

export interface DisponibilidadServiceDeps {
  disponibilidad: DisponibilidadRepository;
  logger: Logger;
  now: () => Date;
}

export const DIA_ESPECIAL_NOT_FOUND = 'Ese día no tiene una regla especial (ya usa el horario semanal).';

/**
 * Casos de uso de la disponibilidad (contrato: reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md).
 * Los permisos los exige la ruta (domain/permisos.ts, puedeEditarDisponibilidad). En el log: quién y qué fecha,
 * nunca el motivo.
 */
export class DisponibilidadService {
  constructor(private readonly deps: DisponibilidadServiceDeps) {}

  /** Lo que ve el formulario público: si se atiende y si hay lugar en cada franja, sin cantidades. */
  async publica(desde: string, hasta: string): Promise<DisponibilidadPublica[]> {
    return (await this.deps.disponibilidad.cupos(desde, hasta)).map(disponibilidadPublica);
  }

  /** Cupos y ocupados de cada día (la agenda del panel). */
  cupos(desde: string, hasta: string): Promise<CupoDia[]> {
    return this.deps.disponibilidad.cupos(desde, hasta);
  }

  /** El horario semanal (lunes a domingo) y los días especiales de hoy en adelante (hora de La Rioja). */
  async panel(): Promise<{ horarioSemanal: HorarioDia[]; diasEspeciales: DiaEspecial[] }> {
    const hoy = todayInLaRioja(this.deps.now());
    return {
      horarioSemanal: await this.deps.disponibilidad.horarioSemanal(),
      diasEspeciales: await this.deps.disponibilidad.diasEspeciales(hoy),
    };
  }

  async reemplazarHorario(actor: UsuarioSesion, dias: readonly HorarioDia[]): Promise<HorarioDia[]> {
    const horario = await this.deps.disponibilidad.reemplazarHorario(dias);
    this.deps.logger.info(`Horario semanal actualizado por=${actor.id}`);
    return horario;
  }

  /** Crea o reemplaza un día especial. La fecha va de hoy a hoy + 730 días (hora de La Rioja): si no, 400. */
  async guardarDiaEspecial(actor: UsuarioSesion, dia: NuevoDiaEspecial): Promise<DiaEspecial> {
    const hoy = todayInLaRioja(this.deps.now());
    if (dia.fecha < hoy) {
      throw AppError.validation({ fecha: 'No se puede cambiar un día que ya pasó.' });
    }
    if (dia.fecha > addDays(hoy, MAX_DAYS_DIA_ESPECIAL)) {
      throw AppError.validation({
        fecha: `Los días especiales se cargan con hasta ${String(MAX_DAYS_DIA_ESPECIAL)} días de anticipación.`,
      });
    }
    const guardado = await this.deps.disponibilidad.guardarDiaEspecial(dia);
    this.deps.logger.info(
      `Día especial guardado fecha=${guardado.fecha} ${guardado.abierto ? 'abierto' : 'cerrado'} por=${actor.id}`,
    );
    return guardado;
  }

  /** Quita un día especial (vuelve al horario semanal). 404 si no había. */
  async borrarDiaEspecial(actor: UsuarioSesion, fecha: string): Promise<void> {
    if (!(await this.deps.disponibilidad.borrarDiaEspecial(fecha))) {
      throw AppError.notFound(DIA_ESPECIAL_NOT_FOUND);
    }
    this.deps.logger.info(`Día especial quitado fecha=${fecha} por=${actor.id}`);
  }
}
