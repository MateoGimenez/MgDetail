import { negocio, sitio } from './sitio';

/**
 * Enlaces y datos de contacto ya listos para usar. Cada función devuelve null
 * si el dato no está cargado en `sitio.ts`: los componentes solo preguntan
 * `if (url)` y nunca escriben números, usuarios ni URLs a mano.
 */

const soloDigitos = (texto: string) => texto.replace(/\D/g, '');

function armarWhatsapp(numero: string, mensaje?: string): string {
  const base = `https://wa.me/${numero}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** Enlace de WhatsApp para un número cargado tal cual (se quedan solo los dígitos). null si no parece un número. */
export function whatsappUrlDe(numero: string, mensaje?: string): string | null {
  const digitos = soloDigitos(numero);
  return digitos.length >= 8 ? armarWhatsapp(digitos, mensaje) : null;
}

/** WhatsApp del taller con un mensaje prellenado opcional. */
export function whatsappUrl(mensaje?: string): string | null {
  return whatsappUrlDe(sitio.whatsapp, mensaje);
}

/** Mensaje del botón flotante de WhatsApp en la landing. */
export const MENSAJE_CONSULTA_TURNO = `Hola ${negocio.nombre}, quiero consultar por un turno.`;

/** Mensaje del botón flotante en la página de un servicio: nombra el servicio. */
export function mensajeConsultaServicio(nombreServicio: string): string {
  return `Hola ${negocio.nombre}, quiero consultar por el servicio ${nombreServicio}.`;
}

/**
 * WhatsApp de un cliente (panel). Usa `telefonoWhatsapp` tal como lo normaliza
 * el backend; si vino null, no hay botón.
 */
export function whatsappClienteUrl(telefonoWhatsapp: string | null, mensaje: string): string | null {
  const numero = telefonoWhatsapp ? soloDigitos(telefonoWhatsapp) : '';
  return numero ? armarWhatsapp(numero, mensaje) : null;
}

/** Dirección pública de la web (`sitio.url`) sin barra final, o null si no está cargada o no es una URL http(s). */
function urlPublica(base: string): string | null {
  const limpia = base.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+/i.test(limpia) ? limpia : null;
}

/**
 * Enlace público de seguimiento de un turno (`<sitio.url>/turno/<id>`), para mandárselo al cliente desde el panel.
 * null si la web todavía no tiene URL pública: un enlace a localhost no le sirve al cliente.
 */
export function seguimientoPublicoUrl(id: string, base: string = sitio.url): string | null {
  const raiz = urlPublica(base);
  return raiz ? `${raiz}/turno/${encodeURIComponent(id)}` : null;
}

function usuarioInstagram(): string | null {
  const usuario = sitio.instagram.trim().replace(/^@/, '');
  return usuario === '' ? null : usuario;
}

export function instagramUrl(): string | null {
  const usuario = usuarioInstagram();
  return usuario ? `https://www.instagram.com/${encodeURIComponent(usuario)}/` : null;
}

/** "@usuario" para mostrar. */
export function instagramArroba(): string | null {
  const usuario = usuarioInstagram();
  return usuario ? `@${usuario}` : null;
}

export function mapsUrl(): string | null {
  const url = sitio.mapsUrl.trim();
  return /^https:\/\//i.test(url) ? url : null;
}

/** Mapa embebido: solo se acepta un `src` de Google Maps (lo único que permite la CSP del servidor). */
export function mapaEmbedUrl(): string | null {
  const url = (sitio.mapaEmbedUrl ?? '').trim();
  return url.startsWith('https://www.google.com/maps/') ? url : null;
}

export function direccionDelTaller(): string | null {
  const direccion = sitio.direccion.trim();
  return direccion === '' ? null : direccion;
}

export function horariosDelTaller(): readonly string[] {
  return sitio.horarios.map((h) => h.trim()).filter((h) => h !== '');
}

/** Hay algo que mostrar en "Dónde estamos": dirección, horarios o el enlace de Maps. */
export function hayUbicacion(): boolean {
  return direccionDelTaller() !== null || horariosDelTaller().length > 0 || mapsUrl() !== null;
}

export function logoUrl(): string | null {
  const ruta = sitio.logo.trim();
  return ruta === '' ? null : ruta;
}
