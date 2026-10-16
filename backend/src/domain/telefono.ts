import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Teléfono => número listo para WhatsApp (https://wa.me/<n>): solo dígitos, formato internacional, sin "+".
 *
 * La metadata de libphonenumber-js ya resuelve las particularidades argentinas del prefijo 0 y del 15
 * (por eso "0380 15-4123456" y "380 4123456" dan el mismo número). Regla de negocio sobre esa base:
 *  - Celulares argentinos: 549 + los 10 dígitos nacionales, aunque el cliente no haya escrito el 15 ni el 9.
 *    Un fijo y un celular se escriben igual sin el 15, así que se asume celular (es un formulario de un taller
 *    que responde por WhatsApp).
 *  - Número válido de otro país: E.164 sin "+".
 *  - Todo lo demás (no interpretable o inválido): null. NUNCA se rechaza el turno por esto.
 */

const DEFAULT_COUNTRY = 'AR';
const ARGENTINA_CALLING_CODE = '54';

export function telefonoWhatsapp(telefono: string): string | null {
  const parsed = parsePhoneNumberFromString(telefono, DEFAULT_COUNTRY);
  if (!parsed?.isValid()) return null;

  if (parsed.countryCallingCode === ARGENTINA_CALLING_CODE) {
    // El número nacional viene con 10 dígitos, o con 11 si trae el "9" de los celulares (+54 9 ...).
    const national = parsed.nationalNumber;
    const tenDigits = national.length === 11 && national.startsWith('9') ? national.slice(1) : national;
    return /^\d{10}$/.test(tenDigits) ? `549${tenDigits}` : null;
  }

  const digits = parsed.number.slice(1); // E.164 sin el "+"
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
