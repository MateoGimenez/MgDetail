import { afterEach, describe, expect, it, vi } from 'vitest';
import { accionesDeEstado, muestraSelectorDeEstado, puedeBorrarTurnos, puedeGestionarUsuarios } from '../admin/permisos';
import { ApiError, request } from './client';
import { esSesionPerdida, requestAdmin } from './sesion';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
const vencida = () => json(401, { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión venció.' } });
const usuario = { usuario: { id: 'u1', email: 'a@b.com', nombre: null, rol: 'admin' } };

/** fetch falso: responde según método + ruta, y cuenta las llamadas. */
function simularApi(responder: (ruta: string, metodo: string, llamada: number) => Response) {
  const llamadas: string[] = [];
  const espia = vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
    const ruta = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = init?.method ?? 'GET';
    llamadas.push(`${metodo} ${ruta}`);
    return Promise.resolve(responder(ruta, metodo, llamadas.filter((l) => l === `${metodo} ${ruta}`).length));
  });
  vi.stubGlobal('fetch', espia);
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refresco de sesión en /api/admin/*', () => {
  it('varios pedidos vencidos a la vez comparten UN solo refresh y se reintentan', async () => {
    const llamadas = simularApi((ruta, metodo, n) => {
      if (ruta === '/api/auth/refresh') return json(200, usuario);
      if (metodo === 'GET' && ruta.startsWith('/api/admin/')) return n === 1 ? vencida() : json(200, { ok: true });
      return json(404, {});
    });

    await Promise.all([requestAdmin('/admin/bookings?limit=1'), requestAdmin('/admin/usuarios'), requestAdmin('/admin/bookings?limit=2')]);

    expect(llamadas.filter((l) => l === 'POST /api/auth/refresh')).toHaveLength(1);
    expect(llamadas.filter((l) => l.startsWith('GET /api/admin/'))).toHaveLength(6);
  });

  it('si el refresh falla, el error marca la sesión como perdida y no reintenta', async () => {
    const llamadas = simularApi((ruta) =>
      ruta === '/api/auth/refresh' ? json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }) : vencida(),
    );

    const error = await requestAdmin('/admin/usuarios').catch((e: unknown) => e);
    expect(esSesionPerdida(error)).toBe(true);
    expect(llamadas.filter((l) => l === 'GET /api/admin/usuarios')).toHaveLength(1);
  });

  it('403 FORBIDDEN (rol sin permiso) mantiene la sesión; 403 NO_ACCESS la pierde, sin pedidos extra', async () => {
    const prohibido = json(403, { error: { code: 'FORBIDDEN', message: 'Solo un superadmin puede gestionar usuarios.' } });
    const llamadas = simularApi(() => prohibido.clone());
    const porRol = await requestAdmin('/admin/usuarios').catch((e: unknown) => e);
    expect(porRol).toBeInstanceOf(ApiError);
    expect(esSesionPerdida(porRol)).toBe(false);
    expect((porRol as ApiError).message).toMatch(/superadmin/);
    expect(llamadas).toEqual(['GET /api/admin/usuarios']);

    const sinAccesoRespuesta = json(403, { error: { code: 'NO_ACCESS', message: 'Tu usuario no tiene acceso al panel.' } });
    simularApi(() => sinAccesoRespuesta.clone());
    const sinAcceso = await requestAdmin('/admin/usuarios').catch((e: unknown) => e);
    expect(esSesionPerdida(sinAcceso)).toBe(true);
  });

  it('los pedidos que no son /admin no disparan refresh', async () => {
    const llamadas = simularApi(() => vencida());
    await request('/auth/me').catch(() => undefined);
    expect(llamadas).toEqual(['GET /api/auth/me']);
  });
});

describe('permisos de la interfaz por rol', () => {
  it('superadmin y admin ven todas las acciones; solo superadmin gestiona usuarios', () => {
    expect(accionesDeEstado('admin', 'pendiente').map((a) => a.a)).toEqual(['confirmado', 'cancelado']);
    expect(puedeBorrarTurnos('admin')).toBe(true);
    expect(puedeGestionarUsuarios('admin')).toBe(false);
    expect(puedeGestionarUsuarios('superadmin')).toBe(true);
  });

  it('el empleado solo puede marcar completado y no borra', () => {
    expect(accionesDeEstado('empleado', 'pendiente').map((a) => a.a)).toEqual(['completado']);
    expect(accionesDeEstado('empleado', 'confirmado').map((a) => a.a)).toEqual(['completado']);
    expect(accionesDeEstado('empleado', 'cancelado')).toEqual([]);
    expect(puedeBorrarTurnos('empleado')).toBe(false);
    expect(muestraSelectorDeEstado('empleado')).toBe(false);
  });
});
