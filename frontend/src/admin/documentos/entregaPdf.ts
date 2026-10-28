/**
 * Entregar un PDF ya bajado: guardarlo en el dispositivo o compartirlo con la hoja de compartir del sistema
 * (WhatsApp, Drive, correo…). Compartir solo se ofrece donde el navegador lo permite con archivos
 * (`navigator.canShare({ files })`); en el resto queda solo "Descargar".
 */

export const TIPO_PDF = 'application/pdf';

/** true si este navegador puede compartir un PDF como archivo. */
export function puedeCompartirPdf(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File(['%PDF'], 'prueba.pdf', { type: TIPO_PDF })] });
  } catch {
    return false;
  }
}

/** Baja el archivo al dispositivo con su nombre. El enlace temporal se libera al rato. */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  enlace.hidden = true;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/**
 * Qué pasó cuando `navigator.share` falló:
 * - `cancelado`: la persona cerró la hoja de compartir; no es un error.
 * - `toque`: el navegador pidió un gesto nuevo (pasó demasiado tiempo desde el toque mientras se armaba el PDF).
 *   El PDF ya está bajado, así que otro toque comparte al instante.
 * - `otra`: no se pudo compartir; queda Descargar.
 */
export type FallaDeCompartir = 'cancelado' | 'toque' | 'otra';

export function clasificarFallaDeCompartir(error: unknown): FallaDeCompartir {
  const nombre = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (nombre === 'AbortError') return 'cancelado';
  if (nombre === 'NotAllowedError') return 'toque';
  return 'otra';
}

/** Abre la hoja de compartir con el PDF. Lanza lo que lance el navegador (ver `clasificarFallaDeCompartir`). */
export async function compartirArchivo(blob: Blob, nombre: string, titulo: string): Promise<void> {
  const archivo = new File([blob], nombre, { type: TIPO_PDF });
  await navigator.share({ files: [archivo], title: titulo });
}
