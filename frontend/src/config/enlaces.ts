import { sitio } from './sitio';

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

/** WhatsApp del taller con un mensaje prellenado opcional. */
export function whatsappUrl(mensaje?: string): string | null {
  const numero = soloDigitos(sitio.whatsapp);
  return numero.length >= 8 ? armarWhatsapp(numero, mensaje) : null;
}

/**
 * WhatsApp de un cliente (panel). Usa `telefonoWhatsapp` tal como lo normaliza
 * el backend; si vino null, no hay botón.
 */
export function whatsappClienteUrl(telefonoWhatsapp: string | null, mensaje: string): string | null {
  const numero = telefonoWhatsapp ? soloDigitos(telefonoWhatsapp) : '';
  return numero ? armarWhatsapp(numero, mensaje) : null;
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

export function direccionDelTaller(): string | null {
  const direccion = sitio.direccion.trim();
  return direccion === '' ? null : direccion;
}

export function horariosDelTaller(): readonly string[] {
  return sitio.horarios.map((h) => h.trim()).filter((h) => h !== '');
}

export function logoUrl(): string | null {
  const ruta = sitio.logo.trim();
  return ruta === '' ? null : ruta;
}
