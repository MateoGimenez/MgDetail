import { contarTurnos } from '../api/admin';
import { ApiError } from '../api/client';
import { borrarSuscripcion, estadoDeAvisos, registrarSuscripcion } from '../api/push';
import { esSesionPerdida } from '../api/sesion';
import { borrarDuenoAvisos, decidirReconfirmacion, guardarDuenoAvisos, leerDuenoAvisos } from './duenoAvisos';
import { agenteCorto, leerEntorno } from './entorno';
import { registroActivo } from './registro';
import { claveVapidABytes, cuerpoSuscripcion, mismaClave } from './vapid';

/** Acciones con el navegador real para los avisos push. La lógica pura está en vapid.ts y estadoAjustes.ts. */

const MENSAJE_GENERICO = 'No pudimos activar los avisos en este dispositivo. Probá de nuevo.';

/** Texto para mostrar a partir de lo que falló (los errores del servidor ya vienen en español). */
export function mensajeDeFallo(error: unknown, porDefecto = MENSAJE_GENERICO): string {
  return error instanceof ApiError ? error.message : porDefecto;
}

export async function suscripcionActual(): Promise<PushSubscription | null> {
  const registro = await registroActivo();
  return registro ? registro.pushManager.getSubscription() : null;
}

/** Cantidad de pendientes en el globito del ícono de la app (donde el navegador lo permita). */
export async function fijarGlobito(cantidad: number): Promise<void> {
  try {
    if (cantidad > 0 && 'setAppBadge' in navigator) await navigator.setAppBadge(cantidad);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch {
    // El globito es un extra: si el sistema no lo permite, no pasa nada.
  }
}

/** Cuenta los pendientes y los pone en el globito. Falla en silencio. */
export async function actualizarGlobito(): Promise<void> {
  if (!('setAppBadge' in navigator)) return;
  try {
    await fijarGlobito(await contarTurnos('pendiente'));
  } catch {
    // Sin red o sesión vencida: se actualiza en la próxima carga o con el próximo aviso.
  }
}

async function suscribir(registro: ServiceWorkerRegistration, clave: Uint8Array<ArrayBuffer>) {
  const existente = await registro.pushManager.getSubscription();
  if (existente && mismaClave(existente.options.applicationServerKey, clave)) return existente;
  // Suscripción hecha con otra clave (cambió en el servidor): se rehace.
  if (existente) await existente.unsubscribe();
  return registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
}

export type ResultadoActivar = 'activado' | 'denegado';

/**
 * Activa los avisos en este dispositivo: pide el permiso (lo primero, dentro del toque), se suscribe con la clave
 * del servidor y registra la suscripción. Lanza con un mensaje en español si algo falla. Recuerda quién los activó
 * (`usuarioId`) para no dejárselos a otra persona que use el mismo aparato.
 */
export async function activarAvisos(clavePublica: string, usuarioId: string): Promise<ResultadoActivar> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return 'denegado';
  try {
    const clave = claveVapidABytes(clavePublica);
    const registro = await registroActivo();
    if (!registro) throw new Error('El navegador no pudo preparar los avisos.');
    const suscripcion = await suscribir(registro, clave);
    const cuerpo = cuerpoSuscripcion(suscripcion.toJSON(), agenteCorto(navigator.userAgent));
    if (!cuerpo) throw new Error('La suscripción no es válida.');
    await registrarSuscripcion(cuerpo);
    guardarDuenoAvisos(usuarioId);
    return 'activado';
  } catch (error) {
    if (esSesionPerdida(error)) throw error;
    throw new Error(mensajeDeFallo(error), { cause: error });
  }
}

/** Apaga los avisos de este dispositivo: avisa al servidor y se desuscribe. Si el servidor falla, lanza. */
export async function desactivarAvisos(): Promise<void> {
  const suscripcion = await suscripcionActual();
  if (!suscripcion) {
    borrarDuenoAvisos();
    return;
  }
  await borrarSuscripcion(suscripcion.endpoint);
  await suscripcion.unsubscribe();
  borrarDuenoAvisos();
}

/**
 * Libera este dispositivo cuando los avisos los activó otra persona: se intenta avisar al servidor, pero aunque falle
 * (sin red) igual se desuscribe acá, así el servicio de push la rechaza y el servidor la descarta solo.
 */
async function liberarDispositivo(suscripcion: PushSubscription): Promise<void> {
  await borrarSuscripcion(suscripcion.endpoint).catch(() => undefined);
  await suscripcion.unsubscribe();
  borrarDuenoAvisos();
}

/**
 * Al cargar el panel: si este dispositivo ya tenía los avisos activos, se vuelve a registrar (la clave del
 * servidor pudo cambiar o la suscripción pudo perderse en el servidor). No pide permisos ni suscribe de cero.
 * Si los avisos los había activado otra persona en este aparato (por ejemplo, su sesión venció sin tocar "Salir"),
 * no se le pasan a quien entró ahora: el dispositivo se libera y esa persona puede activarlos de nuevo si quiere.
 */
export async function reconfirmarAvisos(usuarioId: string): Promise<void> {
  const entorno = leerEntorno();
  if (!entorno.tieneNotification || entorno.permiso !== 'granted' || !entorno.tienePushManager) return;
  const existente = await suscripcionActual();
  if (!existente) return;
  if (decidirReconfirmacion(leerDuenoAvisos(), usuarioId) === 'liberar') {
    await liberarDispositivo(existente);
    return;
  }
  const estado = await estadoDeAvisos();
  if (!estado.disponible || !estado.clavePublica) return;
  const registro = await registroActivo();
  if (!registro) return;
  const suscripcion = await suscribir(registro, claveVapidABytes(estado.clavePublica));
  const cuerpo = cuerpoSuscripcion(suscripcion.toJSON(), agenteCorto(navigator.userAgent));
  if (cuerpo) await registrarSuscripcion(cuerpo);
}

/** Notificación local de prueba (no pasa por el servidor): muestra cómo se va a ver un aviso. */
export async function probarAviso(): Promise<void> {
  const registro = await registroActivo();
  if (!registro) throw new Error('El navegador no pudo preparar los avisos.');
  await registro.showNotification('Aviso de prueba', {
    body: 'Así vas a ver los turnos nuevos.',
    icon: '/marca/app-192.png',
    tag: 'prueba',
    data: { url: '/admin' },
    lang: 'es-AR',
  });
}

const TOPE_AL_SALIR_MS = 4000;

/**
 * Al cerrar sesión: este dispositivo deja de recibir avisos (DELETE + unsubscribe) y se limpia el globito.
 * Nunca lanza ni demora más de unos segundos: si falla la red, la sesión se cierra igual (el servidor descarta
 * la suscripción cuando el servicio de push la rechace).
 */
export async function desuscribirDispositivo(): Promise<void> {
  const tarea = (async () => {
    try {
      const entorno = leerEntorno();
      if (entorno.tienePushManager && entorno.tieneServiceWorker) {
        const suscripcion = await suscripcionActual();
        if (suscripcion) {
          await borrarSuscripcion(suscripcion.endpoint).catch(() => undefined);
          await suscripcion.unsubscribe();
        }
      }
    } catch {
      // Nada que hacer: igual se cierra la sesión.
    }
    borrarDuenoAvisos();
    await fijarGlobito(0);
  })();
  const tope = new Promise<void>((resolver) => {
    window.setTimeout(resolver, TOPE_AL_SALIR_MS);
  });
  await Promise.race([tarea, tope]);
}
