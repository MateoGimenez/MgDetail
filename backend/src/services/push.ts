import type { PushConfig } from '../config.js';
import type { Booking } from '../domain/booking.js';
import {
  type BookingPushNotifier,
  type DestinoPush,
  type NuevaSuscripcion,
  type PayloadPush,
  PushError,
  type PushRepository,
  type PushSender,
  esEndpointPermitido,
} from '../domain/push.js';
import type { Logger } from '../lib/logger.js';
import { descripcionTurno } from '../notifications/message.js';

/** Tope de cada envío (todos van en paralelo): un servicio de push lento no demora a los demás. */
export const PUSH_TIMEOUT_MS = 5000;

export interface PushServiceDeps {
  repo: PushRepository;
  /** Las claves VAPID. undefined = avisos apagados. */
  config: PushConfig | undefined;
  /** Cliente de envío (web-push en producción, un doble en los tests). Sin él, tampoco se manda. */
  sender: PushSender | undefined;
  logger: Logger;
  now: () => Date;
  timeoutMs?: number;
}

type Resultado = 'enviado' | 'caducado' | 'fallido';

/**
 * Avisos push de turnos nuevos. Los endpoints de suscripción (alta y baja) y el envío al crear un turno público.
 *
 * Privacidad: el aviso dice solo "<servicio> · <día corto> · <franja>" y la cantidad de pendientes. Los logs llevan
 * solo cantidades: nunca el endpoint, las claves de la suscripción ni las VAPID.
 */
export class PushService implements BookingPushNotifier {
  constructor(private readonly deps: PushServiceDeps) {}

  /** true si hay claves VAPID y cliente de envío. */
  get disponible(): boolean {
    return this.deps.config !== undefined && this.deps.sender !== undefined;
  }

  /** GET /api/admin/push/estado: la clave pública solo se publica si el envío está disponible. */
  estado(): { disponible: boolean; clavePublica: string | null } {
    const clave = this.deps.config?.publicKey;
    return this.disponible && clave !== undefined
      ? { disponible: true, clavePublica: clave }
      : { disponible: false, clavePublica: null };
  }

  /** Guarda el dispositivo de `perfilId` (reasigna el endpoint si era de otra persona). */
  async suscribir(perfilId: string, suscripcion: NuevaSuscripcion): Promise<void> {
    await this.deps.repo.guardar(perfilId, suscripcion);
    this.deps.logger.info(`Dispositivo push registrado por=${perfilId}`);
  }

  /** Borra el dispositivo con ese endpoint; no falla si no existía. */
  async desuscribir(endpoint: string, perfilId: string): Promise<void> {
    const existia = await this.deps.repo.borrarPorEndpoint(endpoint);
    if (existia) this.deps.logger.info(`Dispositivo push quitado por=${perfilId}`);
  }

  /** Nunca se rechaza. Con el push apagado no hace nada (ni siquiera consulta la base). */
  async avisarTurnoNuevo(booking: Booking, servicioNombre: string): Promise<void> {
    const { repo, sender, logger, now } = this.deps;
    if (!this.disponible || sender === undefined) return;
    try {
      const destinos = await repo.destinosActivos();
      if (destinos.length === 0) return;
      const pendientes = await repo.contarPendientes();
      const payload: PayloadPush = {
        titulo: 'Turno nuevo',
        cuerpo: descripcionTurno(servicioNombre, booking.fechaPreferida, booking.franja),
        pendientes,
        url: '/admin',
      };
      const texto = JSON.stringify(payload);

      const resultados = await Promise.all(destinos.map((destino) => this.enviar(sender, destino, texto)));
      const idsDe = (resultado: Resultado): string[] =>
        destinos.filter((_, i) => resultados[i] === resultado).map((destino) => destino.id);
      const caducados = idsDe('caducado');
      const enviados = idsDe('enviado');
      const fallidos = resultados.length - caducados.length - enviados.length;

      // El mantenimiento de la tabla no puede tirar el resumen: cada paso se atrapa por separado.
      await repo.borrarPorIds(caducados).catch(() => undefined);
      await repo.marcarAvisados(enviados, now()).catch(() => undefined);
      logger.info(
        `Aviso push: enviados=${String(enviados.length)} caducados=${String(caducados.length)} fallidos=${String(fallidos)}`,
      );
    } catch {
      logger.warn('Aviso push falló (error al leer los dispositivos)');
    }
  }

  /** Un envío con tope de tiempo. 404/410 = la suscripción ya no existe (se borra); el resto, solo se cuenta. */
  private async enviar(sender: PushSender, destino: DestinoPush, payload: string): Promise<Resultado> {
    // Defensa en profundidad contra SSRF: un endpoint que hoy no pasa la lista no recibe pedidos.
    if (!esEndpointPermitido(destino.endpoint)) return 'caducado';
    let timer: NodeJS.Timeout | undefined;
    try {
      const tope = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new PushError(0));
        }, this.deps.timeoutMs ?? PUSH_TIMEOUT_MS);
      });
      // Si el envío gana la carrera, el tope queda sin escuchar: se atrapa para que no sea un rechazo sin manejar.
      tope.catch(() => undefined);
      await Promise.race([sender.send(destino, payload), tope]);
      return 'enviado';
    } catch (error) {
      return error instanceof PushError && (error.status === 404 || error.status === 410) ? 'caducado' : 'fallido';
    } finally {
      clearTimeout(timer);
    }
  }
}
