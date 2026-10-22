import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorEmail, errorNombre, errorPassword, normalizarEmail, soloErrores } from '../admin/validacionUsuario';
import { crearUsuario, eliminarUsuario, listarUsuarios } from './admin';
import { ApiError } from './client';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const usuario = {
  id: 'u2',
  email: 'lucia@mgdetailing.test',
  nombre: 'Lucía',
  rol: 'empleado',
  activo: true,
  createdAt: '2026-10-22T15:00:00.000Z',
  updatedAt: '2026-10-22T15:00:00.000Z',
};

/** fetch falso con una respuesta fija; guarda método, ruta, cabeceras y body de cada llamada. */
function simular(respuesta: () => Response) {
  const llamadas: { metodo: string; ruta: string; tipo: string | null; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      llamadas.push({
        metodo: init?.method ?? 'GET',
        ruta: typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
        tipo: headers.get('Content-Type'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(respuesta());
    }),
  );
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API de usuarios del panel', () => {
  it('la lista trae gestionCuentas; sin ese campo la respuesta se rechaza', async () => {
    simular(() => json(200, { usuarios: [usuario], gestionCuentas: false }));
    expect(await listarUsuarios()).toEqual({ usuarios: [usuario], gestionCuentas: false });

    simular(() => json(200, { usuarios: [usuario] }));
    const error = await listarUsuarios().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_RESPONSE');
  });

  it('crear manda POST con JSON y devuelve el usuario; un 409 trae el mensaje del servidor', async () => {
    const llamadas = simular(() => json(201, { usuario }));
    const datos = { email: 'lucia@mgdetailing.test', password: 'clave-segura', nombre: 'Lucía', rol: 'empleado' as const, activo: true };
    expect(await crearUsuario(datos)).toEqual(usuario);
    expect(llamadas).toEqual([{ metodo: 'POST', ruta: '/api/admin/usuarios', tipo: 'application/json', body: datos }]);

    simular(() => json(409, { error: { code: 'CONFLICT', message: 'Ya existe un usuario con ese email.' } }));
    const error = await crearUsuario(datos).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Ya existe un usuario con ese email.');
  });

  it('eliminar manda DELETE (con Content-Type, por CSRF) y acepta 204', async () => {
    const llamadas = simular(() => new Response(null, { status: 204 }));
    await eliminarUsuario('u2');
    expect(llamadas).toEqual([{ metodo: 'DELETE', ruta: '/api/admin/usuarios/u2', tipo: 'application/json', body: undefined }]);
  });
});

describe('validación de los formularios de usuarios', () => {
  it('email: obligatorio, con forma de email y hasta 120 caracteres; se manda en minúsculas', () => {
    expect(errorEmail('')).toMatch(/Ingresá el email/);
    expect(errorEmail('sin-arroba')).toMatch(/válido/);
    expect(errorEmail(`${'a'.repeat(110)}@mgdetailing.test`)).toMatch(/válido/);
    expect(errorEmail('  Lucia@MgDetailing.test ')).toBeUndefined();
    expect(normalizarEmail('  Lucia@MgDetailing.test ')).toBe('lucia@mgdetailing.test');
  });

  it('contraseña de 8 a 72 caracteres; nombre hasta 80', () => {
    expect(errorPassword('1234567')).toMatch(/al menos 8/);
    expect(errorPassword('12345678')).toBeUndefined();
    expect(errorPassword('x'.repeat(72))).toBeUndefined();
    expect(errorPassword('x'.repeat(73))).toMatch(/demasiado larga/);
    // Como el backend: el tope es en bytes UTF-8 (37 ñ = 74 bytes).
    expect(errorPassword('ñ'.repeat(37))).toMatch(/demasiado larga/);
    expect(errorNombre('x'.repeat(81))).toMatch(/80/);
    expect(errorNombre('  Lucía  ')).toBeUndefined();
  });

  it('soloErrores descarta los campos sin error', () => {
    expect(soloErrores({ email: undefined, password: 'mal' })).toEqual({ password: 'mal' });
  });
});
