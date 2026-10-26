/**
 * Quién activó los avisos en este dispositivo. Los avisos push quedan atados a una persona del panel: si en un
 * celular compartido vence la sesión de A sin tocar "Salir" y entra B, B no tiene que empezar a recibir los avisos
 * de A. Al cargar el panel, si el dueño recordado no es quien está logueado, el dispositivo se libera.
 *
 * Se guarda solo el id de la persona (nada de datos personales). Si el navegador no deja usar localStorage, no hay
 * dueño recordado y el dispositivo se libera al entrar: es el lado seguro (se vuelven a activar con un toque).
 */

const CLAVE = 'mg-avisos-dueno';

export function leerDuenoAvisos(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarDuenoAvisos(usuarioId: string): void {
  try {
    window.localStorage.setItem(CLAVE, usuarioId);
  } catch {
    // Sin almacenamiento: la próxima carga va a liberar el dispositivo (ver arriba).
  }
}

export function borrarDuenoAvisos(): void {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}

/**
 * Qué hacer al cargar el panel con una suscripción ya existente en este dispositivo:
 *  - 'reconfirmar': la activó quien está logueado (se vuelve a registrar por si cambió la clave del servidor);
 *  - 'liberar': la activó otra persona, o no hay registro de quién (se desuscribe el dispositivo).
 */
export function decidirReconfirmacion(dueno: string | null, usuarioId: string): 'reconfirmar' | 'liberar' {
  return dueno !== null && dueno === usuarioId ? 'reconfirmar' : 'liberar';
}
