import { ApiError, request } from './client';
import { requestAdmin } from './sesion';
import {
  BUSQUEDA,
  MENSAJE_BUSQUEDA,
  TELEFONO_WHATSAPP,
  agendaSchema,
  listaDeTurnosSchema,
  respuestaTurnoSchema,
  type CambiosTurno,
  type CupoDia,
  type Estado,
  type Turno,
} from './contract';
import {
  disponibilidadPanelSchema,
  listaDeServiciosSchema,
  respuestaDiaEspecialSchema,
  respuestaHorarioSchema,
  listaDeUsuariosSchema,
  respuestaServicioSchema,
  respuestaSesionSchema,
  respuestaUsuarioSchema,
  type CambioDiaEspecial,
  type CambiosServicio,
  type DiaEspecial,
  type HorarioDia,
  type CambiosUsuario,
  type NuevoServicio,
  type NuevoUsuario,
  type ServicioPanel,
  type UsuarioPanel,
  type UsuarioSesion,
} from './contract-panel';

export type ResultadoSesion = { usuario: UsuarioSesion } | { usuario: null; aviso?: string };

/** GET /api/auth/me → usuario de la sesión; null con 401, o con aviso si el usuario no tiene acceso (403). */
export async function sesionActual(signal?: AbortSignal): Promise<ResultadoSesion> {
  try {
    const { usuario } = await request('/auth/me', { signal, schema: respuestaSesionSchema });
    return { usuario };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { usuario: null };
    if (error instanceof ApiError && error.status === 403) return { usuario: null, aviso: error.message };
    throw error;
  }
}

const MENSAJE_SIN_SERVICIO = 'El servicio de acceso no responde, probá en un rato.';

/** POST /api/auth/login → usuario. Las cookies de sesión las pone el backend. */
export async function iniciarSesion(email: string, password: string): Promise<UsuarioSesion> {
  try {
    const { usuario } = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
      schema: respuestaSesionSchema,
    });
    return usuario;
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      throw new ApiError(503, error.code, MENSAJE_SIN_SERVICIO);
    }
    throw error;
  }
}

/** POST /api/auth/logout → 204. */
export async function cerrarSesion(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export interface FiltroTurnos {
  estado?: Estado;
  /** Búsqueda por nombre, email, modelo o dígitos del teléfono: ya recortada, de 2 a 80 caracteres. */
  q?: string;
  /** Un telefonoWhatsapp exacto: todos los turnos de ese cliente (historial). */
  cliente?: string;
  limit: number;
  offset: number;
}

/**
 * GET /api/admin/bookings → más nuevas primero, paginadas; `total` cuenta lo filtrado. `estado`, `q` y `cliente`
 * se combinan. Un `q` o un `cliente` fuera de formato no se mandan: el backend respondería 400 (`fields.q`,
 * `fields.cliente`), así que se corta antes con el mismo mensaje.
 */
export async function listarTurnos(
  { estado, q, cliente, limit, offset }: FiltroTurnos,
  signal?: AbortSignal,
): Promise<{ turnos: Turno[]; total: number }> {
  const parametros = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (estado) parametros.set('estado', estado);
  if (q !== undefined) {
    const texto = q.trim();
    // En code points, como el backend: un emoji cuenta 1.
    const largo = Array.from(texto).length;
    if (largo < BUSQUEDA.min || largo > BUSQUEDA.max) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Revisá la búsqueda.', { q: MENSAJE_BUSQUEDA });
    }
    parametros.set('q', texto);
  }
  if (cliente !== undefined) {
    if (!TELEFONO_WHATSAPP.test(cliente)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Ese cliente no tiene un teléfono válido.', {
        cliente: 'El teléfono del cliente no es válido.',
      });
    }
    parametros.set('cliente', cliente);
  }
  const { bookings, total } = await requestAdmin(`/admin/bookings?${parametros.toString()}`, {
    signal,
    schema: listaDeTurnosSchema,
  });
  return { turnos: bookings, total };
}

/** Cantidad de turnos en un estado (pide una sola fila y lee el total). */
export async function contarTurnos(estado: Estado, signal?: AbortSignal): Promise<number> {
  const { total } = await listarTurnos({ estado, limit: 1, offset: 0 }, signal);
  return total;
}

/**
 * PATCH /api/admin/bookings/:id → turno actualizado. Cambia el estado, la fecha/franja confirmadas o las dos
 * cosas en el mismo pedido ("confirmar con otra fecha"). 403 si el rol no puede reprogramar; 400 con
 * `fields.fechaConfirmada` si la fecha está fuera de rango o el turno está cancelado o completado.
 */
export async function actualizarTurno(id: string, cambios: CambiosTurno): Promise<Turno> {
  const { booking } = await requestAdmin(`/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: respuestaTurnoSchema,
  });
  return booking;
}

/** PATCH /api/admin/bookings/:id con solo el estado. */
export async function cambiarEstado(id: string, estado: Estado): Promise<Turno> {
  return actualizarTurno(id, { estado });
}

/**
 * GET /api/admin/agenda?desde&hasta (todos los roles) → turnos no cancelados cuya fecha de agenda
 * (la confirmada o, si no hay, la pedida) cae en el rango inclusivo, de hasta 42 días, y los cupos de cada día
 * (null si el backend no los mandó: la agenda se ve igual, sin "2/3").
 */
export async function listarAgenda(
  desde: string,
  hasta: string,
  signal?: AbortSignal,
): Promise<{ turnos: Turno[]; cupos: CupoDia[] | null }> {
  const parametros = new URLSearchParams({ desde, hasta });
  const { turnos, cupos } = await requestAdmin(`/admin/agenda?${parametros.toString()}`, { signal, schema: agendaSchema });
  return { turnos, cupos: cupos ?? null };
}

/** DELETE /api/admin/bookings/:id → 204. */
export async function eliminarTurno(id: string): Promise<void> {
  await requestAdmin(`/admin/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * GET /api/admin/usuarios (solo superadmin) → los más viejos primero, y si el servidor puede crear, borrar y
 * cambiar email o contraseña (gestionCuentas).
 */
export async function listarUsuarios(
  signal?: AbortSignal,
): Promise<{ usuarios: UsuarioPanel[]; gestionCuentas: boolean }> {
  return requestAdmin('/admin/usuarios', { signal, schema: listaDeUsuariosSchema });
}

/** POST /api/admin/usuarios → usuario creado. 409 CONFLICT si el email ya está en uso. */
export async function crearUsuario(datos: NuevoUsuario): Promise<UsuarioPanel> {
  const { usuario } = await requestAdmin('/admin/usuarios', {
    method: 'POST',
    body: datos,
    schema: respuestaUsuarioSchema,
  });
  return usuario;
}

/** DELETE /api/admin/usuarios/:id → 204. Borra la cuenta y su perfil: no se puede deshacer. */
export async function eliminarUsuario(id: string): Promise<void> {
  await requestAdmin(`/admin/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** PATCH /api/admin/usuarios/:id → usuario actualizado. 409 CONFLICT trae un mensaje para mostrar. */
export async function actualizarUsuario(id: string, cambios: CambiosUsuario): Promise<UsuarioPanel> {
  const { usuario } = await requestAdmin(`/admin/usuarios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: respuestaUsuarioSchema,
  });
  return usuario;
}

/* ---------- Catálogo de servicios ---------- */

/** GET /api/admin/servicios (todos los roles) → activos e inactivos, en el orden del catálogo. */
export async function listarServiciosPanel(signal?: AbortSignal): Promise<ServicioPanel[]> {
  const { servicios } = await requestAdmin('/admin/servicios', { signal, schema: listaDeServiciosSchema });
  return servicios;
}

/** POST /api/admin/servicios → servicio creado (al final del orden). 409 SERVICIO_EXISTE si el id ya está usado. */
export async function crearServicio(datos: NuevoServicio): Promise<ServicioPanel> {
  const { servicio } = await requestAdmin('/admin/servicios', {
    method: 'POST',
    body: datos,
    schema: respuestaServicioSchema,
  });
  return servicio;
}

/** PATCH /api/admin/servicios/:id → servicio actualizado. 404 si ya no existe. */
export async function actualizarServicio(id: string, cambios: CambiosServicio): Promise<ServicioPanel> {
  const { servicio } = await requestAdmin(`/admin/servicios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: respuestaServicioSchema,
  });
  return servicio;
}

/** PUT /api/admin/servicios/orden con TODOS los ids, sin repetir, en el orden nuevo → catálogo completo. */
export async function ordenarServicios(ids: readonly string[]): Promise<ServicioPanel[]> {
  const { servicios } = await requestAdmin('/admin/servicios/orden', {
    method: 'PUT',
    body: { ids },
    schema: listaDeServiciosSchema,
  });
  return servicios;
}

/* ---------- Disponibilidad ---------- */

/** GET /api/admin/disponibilidad (todos los roles) → horario semanal y días especiales de hoy en adelante. */
export async function verDisponibilidad(
  signal?: AbortSignal,
): Promise<{ horarioSemanal: HorarioDia[]; diasEspeciales: DiaEspecial[] }> {
  return requestAdmin('/admin/disponibilidad', { signal, schema: disponibilidadPanelSchema });
}

/** PUT /api/admin/disponibilidad/horario-semanal con los siete días (superadmin y admin) → el horario guardado. */
export async function guardarHorarioSemanal(dias: readonly HorarioDia[]): Promise<HorarioDia[]> {
  const respuesta = await requestAdmin('/admin/disponibilidad/horario-semanal', {
    method: 'PUT',
    body: { dias: dias.map(({ dia, abierto, cupoManana, cupoTarde }) => ({ dia, abierto, cupoManana, cupoTarde })) },
    schema: respuestaHorarioSchema,
  });
  return 'horarioSemanal' in respuesta ? respuesta.horarioSemanal : respuesta.dias;
}

/** PUT /api/admin/disponibilidad/dias-especiales/:fecha: crea o reemplaza el día especial (superadmin y admin). */
export async function guardarDiaEspecial(fecha: string, cambio: CambioDiaEspecial): Promise<DiaEspecial> {
  const { dia } = await requestAdmin(`/admin/disponibilidad/dias-especiales/${encodeURIComponent(fecha)}`, {
    method: 'PUT',
    body: cambio,
    schema: respuestaDiaEspecialSchema,
  });
  return dia;
}

/** DELETE /api/admin/disponibilidad/dias-especiales/:fecha → 204: ese día vuelve al horario semanal. */
export async function quitarDiaEspecial(fecha: string): Promise<void> {
  await requestAdmin(`/admin/disponibilidad/dias-especiales/${encodeURIComponent(fecha)}`, { method: 'DELETE' });
}
