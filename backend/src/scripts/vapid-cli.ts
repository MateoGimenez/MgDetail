import { generateKeyPairSync } from 'node:crypto';

/** Contacto por defecto del ejemplo: el dueño lo cambia por un email o la URL del sitio. */
const SUBJECT_EJEMPLO = 'mailto:tu-email@ejemplo.com';

/**
 * Par de claves VAPID nuevo (curva P-256, RFC 8292) en base64url, el formato que esperan web-push y el navegador:
 *  - pública: el punto sin comprimir (0x04 + X + Y), 65 bytes;
 *  - privada: el escalar `d`, 32 bytes.
 * Se arma desde el JWK (x, y, d ya vienen en base64url, sin relleno).
 */
export function generarClavesVapid(): { publicKey: string; privateKey: string } {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  if (jwk.x === undefined || jwk.y === undefined || jwk.d === undefined) {
    throw new Error('No se pudo generar el par de claves');
  }
  const publicKey = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { publicKey: publicKey.toString('base64url'), privateKey: jwk.d };
}

/**
 * Imprime un par nuevo con el formato listo para pegar en backend/.env. No escribe archivos ni lo registra en logs:
 * la clave privada es un secreto (quien la tenga puede mandar avisos a todos los dispositivos suscriptos).
 */
export function runVapid(out: (text: string) => void): number {
  const { publicKey, privateKey } = generarClavesVapid();
  out(
    [
      'Claves VAPID nuevas para los avisos push. Pegá estas tres líneas en backend/.env y reiniciá el backend:',
      '',
      `VAPID_PUBLIC_KEY=${publicKey}`,
      `VAPID_PRIVATE_KEY=${privateKey}`,
      `VAPID_SUBJECT=${SUBJECT_EJEMPLO}`,
      '',
      'Cambiá VAPID_SUBJECT por tu email (mailto:...) o la URL del sitio (https://...).',
      'La clave privada es un secreto: no la subas a git ni la compartas. Si cambiás el par, los dispositivos ya',
      'suscriptos dejan de recibir avisos hasta que se vuelvan a suscribir desde el panel.',
    ].join('\n'),
  );
  return 0;
}
