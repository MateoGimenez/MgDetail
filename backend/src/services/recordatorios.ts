import type { BookingRepository } from '../domain/booking.js';
import { NotifyError } from '../domain/notifier.js';
import { addDays, todayInLaRioja } from '../lib/dates.js';
import type { Logger } from '../lib/logger.js';
import type { CanalRecordatorio } from '../notifications/recordatorio.js';

export interface RecordatorioServiceDeps {
  bookings: BookingRepository;
  /** Los canales configurados (email con Resend, WhatsApp Cloud). Vacío = recordatorios desactivados. */
  canales: readonly CanalRecordatorio[];
  logger: Logger;
  now: () => Date;
}

/** Resultado de una corrida: solo cantidades (nunca datos del cliente). */
export interface ResumenRecordatorios {
  enviados: number;
  fallidos: number;
  sinCanal: number;
}

/**
 * Recordatorios del día anterior (contrato: reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md).
 * Elige los turnos confirmados cuya fecha de agenda es MAÑANA (hora de La Rioja) y que todavía no tuvieron
 * recordatorio; a cada uno le manda por todos los canales que tiene (email si dejó email, WhatsApp si tiene teléfono
 * normalizado) y lo marca SOLO si al menos un canal lo entregó. Un turno con todos sus envíos fallidos queda sin
 * marcar y se reintenta en la próxima corrida. Idempotente: un turno marcado no vuelve a salir.
 *
 * Si un canal anda y el otro falla, el turno se marca igual (ya recibió el recordatorio; reintentar duplicaría el
 * que sí llegó).
 *
 * Dos corridas simultáneas en el MISMO proceso comparten la misma ejecución. (Con varias instancias del backend, la
 * Idempotency-Key de Resend evita el email repetido; el cron se configura una sola vez por día.)
 */
export class RecordatorioService {
  private enCurso: Promise<ResumenRecordatorios> | undefined;

  constructor(private readonly deps: RecordatorioServiceDeps) {}

  enviarPendientes(): Promise<ResumenRecordatorios> {
    this.enCurso ??= this.correr().finally(() => {
      this.enCurso = undefined;
    });
    return this.enCurso;
  }

  private async correr(): Promise<ResumenRecordatorios> {
    const { bookings, canales, logger, now } = this.deps;
    const manana = addDays(todayInLaRioja(now()), 1);
    const turnos = await bookings.recordatoriosPendientes(manana);
    const resumen: ResumenRecordatorios = { enviados: 0, fallidos: 0, sinCanal: 0 };

    if (canales.length === 0) {
      resumen.sinCanal = turnos.length;
      logger.info(`Recordatorios desactivados (sin canal configurado): sinCanal=${String(resumen.sinCanal)}`);
      return resumen;
    }

    for (const turno of turnos) {
      const aplicables = canales.filter((canal) => canal.aplica(turno));
      if (aplicables.length === 0) {
        resumen.sinCanal++;
        continue;
      }
      let entregado = false;
      for (const canal of aplicables) {
        try {
          await canal.enviar(turno);
          entregado = true;
        } catch (error) {
          // Ni el id, ni el destinatario, ni el texto: solo el canal y el status.
          const detalle = error instanceof NotifyError ? `status ${String(error.status)}` : 'sin respuesta';
          logger.warn(`Recordatorio falló (${canal.nombre}, ${detalle})`);
        }
      }
      if (entregado) {
        await bookings.marcarRecordatorio(turno.id, turno.fecha, now());
        resumen.enviados++;
      } else {
        resumen.fallidos++;
      }
    }

    logger.info(
      `Recordatorios: enviados=${String(resumen.enviados)} fallidos=${String(resumen.fallidos)} sinCanal=${String(resumen.sinCanal)}`,
    );
    return resumen;
  }
}
