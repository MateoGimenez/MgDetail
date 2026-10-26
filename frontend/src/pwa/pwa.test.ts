import { describe, expect, it } from 'vitest';
import { agenteCorto, capacidadesDe, esDispositivoIOS, type DatosDelEntorno } from './entorno';
import { decidirAvisos, decidirInstalacion, type EstadoDelServidor } from './estadoAjustes';
import { claveVapidABytes, cuerpoSuscripcion, mismaClave } from './vapid';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36';

const datos = (cambios: Partial<DatosDelEntorno> = {}): DatosDelEntorno => ({
  userAgent: ANDROID,
  plataforma: 'Linux armv8l',
  puntosTactiles: 5,
  instalada: false,
  contextoSeguro: true,
  tieneServiceWorker: true,
  tienePushManager: true,
  tieneNotification: true,
  permiso: 'default',
  ...cambios,
});

/** Una clave VAPID de prueba: 65 bytes que empiezan con 0x04, en base64url. */
const bytesClave = Uint8Array.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 7 + 3) % 256)]);
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('plataforma', () => {
  it('detecta iPhone, iPad y el iPad que dice ser Mac', () => {
    expect(esDispositivoIOS(IPHONE, 'iPhone', 5)).toBe(true);
    expect(esDispositivoIOS('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)', 'iPad', 5)).toBe(true);
    expect(esDispositivoIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });

  it('una Mac de verdad y Android no son iOS', () => {
    expect(esDispositivoIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(esDispositivoIOS(ANDROID, 'Linux armv8l', 5)).toBe(false);
  });

  it('puedePush pide contexto seguro, service worker, PushManager y Notification', () => {
    expect(capacidadesDe(datos()).puedePush).toBe(true);
    expect(capacidadesDe(datos({ contextoSeguro: false })).puedePush).toBe(false);
    expect(capacidadesDe(datos({ tienePushManager: false })).puedePush).toBe(false);
    expect(capacidadesDe(datos({ tieneServiceWorker: false })).puedePush).toBe(false);
  });

  it('sin Notification el permiso es "no-soportado"', () => {
    expect(capacidadesDe(datos({ tieneNotification: false, tienePushManager: false })).permiso).toBe('no-soportado');
  });

  it('arma un nombre corto del aparato', () => {
    expect(agenteCorto(ANDROID)).toBe('Chrome · Android');
    expect(agenteCorto(IPHONE)).toBe('Safari · iPhone');
    expect(agenteCorto('Mozilla/5.0 (Windows NT 10.0) Chrome/126 Edg/126')).toBe('Edge · Windows');
    expect(agenteCorto('')).toBe('Navegador');
  });
});

describe('clave VAPID y suscripción', () => {
  it('convierte base64url (con y sin relleno) en los 65 bytes', () => {
    expect(Array.from(claveVapidABytes(base64url(bytesClave)))).toEqual(Array.from(bytesClave));
    expect(Array.from(claveVapidABytes(`${base64url(bytesClave)}=`))).toEqual(Array.from(bytesClave));
  });

  it('rechaza claves con caracteres raros, de otro largo o que no empiezan con 0x04', () => {
    expect(() => claveVapidABytes('')).toThrow();
    expect(() => claveVapidABytes('abc+/def')).toThrow();
    expect(() => claveVapidABytes(base64url(bytesClave.slice(0, 40)))).toThrow();
    expect(() => claveVapidABytes(base64url(Uint8Array.from([5, ...bytesClave.slice(1)])))).toThrow();
  });

  it('compara la clave de una suscripción con la del servidor', () => {
    expect(mismaClave(bytesClave.buffer.slice(0), bytesClave)).toBe(true);
    expect(mismaClave(Uint8Array.from([4, 1, 2]).buffer, bytesClave)).toBe(false);
    expect(mismaClave(null, bytesClave)).toBe(false);
  });

  it('arma el cuerpo desde PushSubscription.toJSON()', () => {
    const json = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P', auth: 'A' } };
    expect(cuerpoSuscripcion(json, 'Chrome · Android')).toEqual({ ...json, agente: 'Chrome · Android' });
    expect(cuerpoSuscripcion(json)).toEqual(json);
    expect(cuerpoSuscripcion(json, '   ')).toEqual(json);
  });

  it('corta el agente en 120 y rechaza suscripciones incompletas o que no son https', () => {
    const json = { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'P', auth: 'A' } };
    expect(cuerpoSuscripcion(json, 'x'.repeat(300))?.agente).toHaveLength(120);
    expect(cuerpoSuscripcion({ endpoint: json.endpoint, keys: { p256dh: 'P' } })).toBeNull();
    expect(cuerpoSuscripcion({ keys: json.keys })).toBeNull();
    expect(cuerpoSuscripcion({ ...json, endpoint: 'http://fcm.googleapis.com/x' })).toBeNull();
  });
});

describe('qué estado de ajustes se muestra', () => {
  const SERVIDOR_OK: EstadoDelServidor = { disponible: true, clavePublica: 'clave' };
  const caps = (cambios: Partial<DatosDelEntorno> = {}) => capacidadesDe(datos(cambios));
  const base = { servidor: SERVIDOR_OK, capacidades: caps(), suscripto: false, error: null };

  it('instalar: botón si hay ofrecimiento, pasos en iOS, menú en el resto y nada si ya está instalada', () => {
    const android = caps();
    const iphone = caps({ userAgent: IPHONE, plataforma: 'iPhone' });
    expect(decidirInstalacion(android, true)).toBe('boton');
    expect(decidirInstalacion(android, false)).toBe('menu');
    expect(decidirInstalacion(iphone, false)).toBe('ios');
    expect(decidirInstalacion(caps({ instalada: true }), true)).toBe('oculto');
  });

  it('cargando hasta saber qué dice el servidor y si hay suscripción', () => {
    expect(decidirAvisos({ ...base, servidor: null }).tipo).toBe('cargando');
    expect(decidirAvisos({ ...base, suscripto: null }).tipo).toBe('cargando');
  });

  it('sin avisos en el servidor, no se muestra la sección', () => {
    expect(decidirAvisos({ ...base, servidor: { disponible: false, clavePublica: null } }).tipo).toBe('oculto');
    expect(decidirAvisos({ ...base, servidor: { disponible: true, clavePublica: null } }).tipo).toBe('oculto');
  });

  it('iPhone sin instalar pide instalar primero, aunque el navegador no tenga PushManager', () => {
    const iphone = caps({ userAgent: IPHONE, plataforma: 'iPhone', tienePushManager: false });
    expect(decidirAvisos({ ...base, capacidades: iphone }).tipo).toBe('instalar-primero');
    const instalado = caps({ userAgent: IPHONE, plataforma: 'iPhone', instalada: true });
    expect(decidirAvisos({ ...base, capacidades: instalado }).tipo).toBe('inactivo');
  });

  it('sin soporte, bloqueado, inactivo y activo', () => {
    expect(decidirAvisos({ ...base, capacidades: caps({ tienePushManager: false }) }).tipo).toBe('sin-soporte');
    expect(decidirAvisos({ ...base, capacidades: caps({ permiso: 'denied' }) }).tipo).toBe('bloqueado');
    expect(decidirAvisos(base).tipo).toBe('inactivo');
    expect(decidirAvisos({ ...base, capacidades: caps({ permiso: 'granted' }), suscripto: true }).tipo).toBe('activo');
  });

  it('suscripción sin permiso (se revocó desde el sistema) no cuenta como activo', () => {
    expect(decidirAvisos({ ...base, suscripto: true }).tipo).toBe('inactivo');
  });

  it('un error de la última acción se muestra, y si el servidor falló también', () => {
    expect(decidirAvisos({ ...base, error: 'Se cayó.' })).toEqual({ tipo: 'error', mensaje: 'Se cayó.' });
    expect(decidirAvisos({ ...base, servidor: 'error', error: 'Sin red.' })).toEqual({
      tipo: 'error',
      mensaje: 'Sin red.',
    });
    expect(decidirAvisos({ ...base, servidor: 'error', error: null }).tipo).toBe('error');
  });
});
