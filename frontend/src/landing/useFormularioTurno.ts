import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  CODIGO_FRANJA_LLENA,
  crearEsquemaTurno,
  esFranja,
  esSlugDeServicio,
  type CampoTurno,
  type TurnoNuevo,
} from '../api/contract';
import { crearTurno } from '../api/turnos';
import { estadoDelDia, franjaLibre } from '../lib/disponibilidad';
import { rangoDeTurno } from '../lib/fechas';
import { useCatalogo } from './catalogo-contexto';
import { useReserva } from './reserva-contexto';
import { useDisponibilidad, type DiasDisponibles } from './useDisponibilidad';

export type Valores = Record<CampoTurno, string>;
export type Errores = Partial<Record<CampoTurno, string>>;

export type Envio =
  | { fase: 'editando' }
  | { fase: 'enviando' }
  | { fase: 'error'; mensaje: string; reintentable: boolean }
  | { fase: 'exito'; id: string | null; seguimiento: string | null; datos: TurnoNuevo };

const VACIOS: Valores = {
  nombre: '',
  telefono: '',
  email: '',
  vehiculoTipo: '',
  vehiculoModelo: '',
  servicioId: '',
  fechaPreferida: '',
  franja: '',
  comentario: '',
  website: '',
};

/** Orden visual de los campos: se usa para enfocar el primer error. */
const ORDEN: readonly CampoTurno[] = [
  'servicioId',
  'vehiculoTipo',
  'vehiculoModelo',
  'fechaPreferida',
  'franja',
  'nombre',
  'telefono',
  'email',
  'comentario',
];

const MENSAJE_DIA_SIN_LUGAR = 'Ese día ya no tiene lugar. Elegí otro.';
const MENSAJE_FRANJA_LLENA = 'Esa franja se llenó. Elegí otra.';
const MENSAJE_DIA_CERRADO = 'Ese día no tomamos turnos. Elegí otro.';

/**
 * Con la disponibilidad recién cargada: lo elegido que ya no tiene lugar se borra y se pide otra elección.
 * Devuelve los valores y errores nuevos, o null si lo elegido sigue disponible.
 */
export function conciliarEleccion(
  valores: Valores,
  dias: DiasDisponibles,
  errores: Errores,
): { valores: Valores; errores: Errores } | null {
  const fecha = valores.fechaPreferida;
  if (fecha === '') return null;
  const dia = dias.get(fecha);
  const estado = estadoDelDia(dia);
  if (estado !== 'libre') {
    const otros = { ...errores };
    delete otros.franja;
    return {
      valores: { ...valores, fechaPreferida: '', franja: '' },
      errores: { ...otros, fechaPreferida: estado === 'cerrado' ? MENSAJE_DIA_CERRADO : MENSAJE_DIA_SIN_LUGAR },
    };
  }
  if (esFranja(valores.franja) && !franjaLibre(dia, valores.franja)) {
    return { valores: { ...valores, franja: '' }, errores: { ...errores, franja: errores.franja ?? MENSAJE_FRANJA_LLENA } };
  }
  return null;
}

/** Rechazos del alta por disponibilidad: 409 FRANJA_LLENA, o 400 con el error solo en la fecha (día cerrado). */
const esRechazoPorDisponibilidad = (error: ApiError) =>
  (error.status === 409 && error.code === CODIGO_FRANJA_LLENA) ||
  (error.status === 400 && error.fields?.fechaPreferida !== undefined && Object.keys(error.fields).length === 1);

const MENSAJE_DEMASIADOS_PEDIDOS =
  'Recibimos varios pedidos seguidos desde tu conexión. Esperá unos minutos y volvé a intentar.';

const esCampo = (clave: string): clave is CampoTurno => Object.hasOwn(VACIOS, clave);

function validar(
  valores: Valores,
  ahora: Date,
  idsDeServicio: readonly string[],
): { ok: true; datos: TurnoNuevo } | { ok: false; errores: Errores } {
  const resultado = crearEsquemaTurno(ahora, idsDeServicio).safeParse(valores);
  if (resultado.success) return { ok: true, datos: resultado.data };
  const errores: Errores = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && esCampo(campo)) errores[campo] ??= issue.message;
  }
  return { ok: false, errores };
}

const primerError = (errores: Errores) => ORDEN.find((campo) => errores[campo] !== undefined);

/** Estado, validación (mismas reglas que el backend) y envío del formulario de turno. */
export function useFormularioTurno() {
  const { registrar } = useReserva();
  const { servicios } = useCatalogo();
  const idsDeServicio = servicios.map((servicio) => servicio.id);
  const [parametros] = useSearchParams();
  const [valores, setValores] = useState<Valores>(() => {
    const servicio = parametros.get('servicio') ?? '';
    // El catálogo puede no haber llegado todavía: se acepta cualquier id con forma válida y, si no está en el
    // catálogo que se termina mostrando, simplemente no queda elegido (y la validación lo pide).
    return { ...VACIOS, servicioId: esSlugDeServicio(servicio) ? servicio : '' };
  });
  const [errores, setErrores] = useState<Errores>({});
  const [validarEnVivo, setValidarEnVivo] = useState(false);
  const [envio, setEnvio] = useState<Envio>({ fase: 'editando' });
  const [rango] = useState(() => rangoDeTurno(new Date()));
  const { disponibilidad, recargar: recargarDisponibilidad } = useDisponibilidad();
  const dias = disponibilidad.fase === 'lista' ? disponibilidad.dias : null;
  const formRef = useRef<HTMLFormElement>(null);
  const exitoRef = useRef<HTMLHeadingElement>(null);
  const base = useId();

  const ids = {
    campo: (campo: CampoTurno) => `${base}-${campo}`,
    error: (campo: CampoTurno) => `${base}-${campo}-error`,
    ayuda: (campo: CampoTurno) => `${base}-${campo}-ayuda`,
  };

  /** El radio elegido, o el primero habilitado, o el control (o el grupo) con el id del campo. */
  const enfocar = (campo: CampoTurno) => {
    requestAnimationFrame(() => {
      const form = formRef.current;
      if (!form) return;
      const elemento =
        form.querySelector<HTMLInputElement>(`input[type="radio"][name="${campo}"]:checked`) ??
        form.querySelector<HTMLInputElement>(`input[type="radio"][name="${campo}"]:not(:disabled)`) ??
        document.getElementById(ids.campo(campo));
      elemento?.focus();
    });
  };

  // Los botones "Reservá" de otras secciones cargan servicio y vehículo acá.
  useEffect(
    () =>
      registrar((preseleccion) => {
        setEnvio((actual) => (actual.fase === 'exito' ? { fase: 'editando' } : actual));
        setValores((actuales) => ({
          ...actuales,
          ...(preseleccion.servicioId ? { servicioId: preseleccion.servicioId } : {}),
          ...(preseleccion.vehiculoTipo ? { vehiculoTipo: preseleccion.vehiculoTipo } : {}),
        }));
        requestAnimationFrame(() => {
          const form = formRef.current;
          if (!form) return;
          for (const campo of ['servicioId', 'vehiculoTipo', 'fechaPreferida', 'franja', 'nombre'] as const) {
            const control = form.elements.namedItem(campo);
            if (control instanceof RadioNodeList && control.value === '') {
              const primero = Array.from(control).find((radio) => radio instanceof HTMLInputElement && !radio.disabled);
              if (primero instanceof HTMLElement) primero.focus({ preventScroll: true });
              return;
            }
            if (control instanceof HTMLInputElement && control.value === '') {
              control.focus({ preventScroll: true });
              return;
            }
          }
        });
      }),
    [registrar],
  );

  useEffect(() => {
    if (envio.fase === 'exito') exitoRef.current?.focus();
  }, [envio.fase]);

  const revalidarCampo = (campo: CampoTurno, siguientes: Valores) => {
    const resultado = validar(siguientes, new Date(), idsDeServicio);
    const mensaje = resultado.ok ? undefined : resultado.errores[campo];
    setErrores((previos) => {
      if (previos[campo] === mensaje) return previos;
      const nuevos = { ...previos };
      if (mensaje) nuevos[campo] = mensaje;
      else delete nuevos[campo];
      return nuevos;
    });
  };

  const actualizar = (campo: CampoTurno, valor: string) => {
    const siguientes = { ...valores, [campo]: valor };
    // Otro día: si la franja elegida no tiene lugar ahí, se borra (el selector solo deja marcar las que tienen).
    if (campo === 'fechaPreferida' && dias && esFranja(siguientes.franja) && !franjaLibre(dias.get(valor), siguientes.franja)) {
      siguientes.franja = '';
    }
    setValores(siguientes);
    if (validarEnVivo || errores[campo] !== undefined) revalidarCampo(campo, siguientes);
  };

  const alSalir = (campo: CampoTurno) => {
    if (valores[campo].trim() !== '') revalidarCampo(campo, valores);
  };

  const enviar = async () => {
    if (envio.fase === 'enviando') return;
    const resultado = validar(valores, new Date(), idsDeServicio);
    setValidarEnVivo(true);
    if (!resultado.ok) {
      setErrores(resultado.errores);
      setEnvio({ fase: 'editando' });
      const campo = primerError(resultado.errores);
      if (campo) enfocar(campo);
      return;
    }

    setErrores({});
    setEnvio({ fase: 'enviando' });
    try {
      const { id, seguimiento } = await crearTurno(resultado.datos);
      setEnvio({ fase: 'exito', id, seguimiento, datos: resultado.datos });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        setEnvio({ fase: 'error', mensaje: MENSAJE_DEMASIADOS_PEDIDOS, reintentable: false });
        return;
      }
      if (error instanceof ApiError && esRechazoPorDisponibilidad(error)) {
        await rechazadoPorDisponibilidad(error);
        return;
      }
      if (error instanceof ApiError && error.fields) {
        const delServidor: Errores = {};
        for (const [clave, mensaje] of Object.entries(error.fields)) {
          if (esCampo(clave)) delServidor[clave] = mensaje;
        }
        setErrores(delServidor);
        setEnvio({ fase: 'error', mensaje: error.message, reintentable: false });
        const campo = primerError(delServidor);
        if (campo) enfocar(campo);
        return;
      }
      setEnvio({
        fase: 'error',
        mensaje: error instanceof ApiError ? error.message : 'No pudimos enviar tu pedido. Probá de nuevo.',
        reintentable: true,
      });
    }
  };

  /**
   * 409 FRANJA_LLENA o 400 con `fields.fechaPreferida` (día cerrado): se recarga la disponibilidad, se borra lo que
   * ya no tiene lugar y se pide otra elección, con el mensaje del backend en el campo.
   */
  const rechazadoPorDisponibilidad = async (error: ApiError) => {
    const franjaLlena = error.code === CODIGO_FRANJA_LLENA;
    const campo: CampoTurno = franjaLlena ? 'franja' : 'fechaPreferida';
    const conError: Errores = { [campo]: error.fields?.[campo] ?? (franjaLlena ? MENSAJE_FRANJA_LLENA : MENSAJE_DIA_CERRADO) };
    const limpios: Valores = franjaLlena ? { ...valores, franja: '' } : { ...valores, fechaPreferida: '', franja: '' };
    setValores(limpios);
    setErrores(conError);
    setEnvio({ fase: 'error', mensaje: error.message, reintentable: false });

    const nuevos = await recargarDisponibilidad();
    // Con la disponibilidad al día: si el día entero se quedó sin lugar, también se pide otro día.
    const ajuste = nuevos ? conciliarEleccion(limpios, nuevos, conError) : null;
    if (ajuste) {
      setValores(ajuste.valores);
      setErrores(ajuste.errores);
    }
    enfocar(ajuste?.valores.fechaPreferida === '' ? 'fechaPreferida' : campo);
  };

  const nuevoPedido = () => {
    setValores((actuales) => ({
      ...VACIOS,
      nombre: actuales.nombre,
      telefono: actuales.telefono,
      email: actuales.email,
    }));
    setErrores({});
    setValidarEnVivo(false);
    setEnvio({ fase: 'editando' });
    enfocar('servicioId');
  };

  /** Props de accesibilidad de un radio, con el error ya enlazado. */
  const radio = (campo: CampoTurno) => ({
    name: campo,
    'aria-invalid': errores[campo] ? true : undefined,
    'aria-describedby': errores[campo] ? ids.error(campo) : undefined,
  });

  return {
    disponibilidad,
    valores,
    setValores,
    errores,
    validarEnVivo,
    envio,
    rango,
    formRef,
    exitoRef,
    ids,
    radio,
    actualizar,
    alSalir,
    enviar,
    nuevoPedido,
  };
}
