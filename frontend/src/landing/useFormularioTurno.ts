import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import { crearEsquemaTurno, esServicioId, type CampoTurno, type TurnoNuevo } from '../api/contract';
import { crearTurno } from '../api/turnos';
import { rangoDeTurno } from '../lib/fechas';
import { useReserva } from './reserva-contexto';

export type Valores = Record<CampoTurno, string>;
export type Errores = Partial<Record<CampoTurno, string>>;

export type Envio =
  | { fase: 'editando' }
  | { fase: 'enviando' }
  | { fase: 'error'; mensaje: string; reintentable: boolean }
  | { fase: 'exito'; id: string | null; datos: TurnoNuevo };

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

const RADIOS: ReadonlySet<CampoTurno> = new Set(['servicioId', 'vehiculoTipo', 'franja']);

const MENSAJE_DEMASIADOS_PEDIDOS =
  'Recibimos varios pedidos seguidos desde tu conexión. Esperá unos minutos y volvé a intentar.';

const esCampo = (clave: string): clave is CampoTurno => Object.hasOwn(VACIOS, clave);

function validar(valores: Valores, ahora: Date): { ok: true; datos: TurnoNuevo } | { ok: false; errores: Errores } {
  const resultado = crearEsquemaTurno(ahora).safeParse(valores);
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
  const [parametros] = useSearchParams();
  const [valores, setValores] = useState<Valores>(() => {
    const servicio = parametros.get('servicio') ?? '';
    return { ...VACIOS, servicioId: esServicioId(servicio) ? servicio : '' };
  });
  const [errores, setErrores] = useState<Errores>({});
  const [validarEnVivo, setValidarEnVivo] = useState(false);
  const [envio, setEnvio] = useState<Envio>({ fase: 'editando' });
  const [rango] = useState(() => rangoDeTurno(new Date()));
  const formRef = useRef<HTMLFormElement>(null);
  const exitoRef = useRef<HTMLHeadingElement>(null);
  const base = useId();

  const ids = {
    campo: (campo: CampoTurno) => `${base}-${campo}`,
    error: (campo: CampoTurno) => `${base}-${campo}-error`,
    ayuda: (campo: CampoTurno) => `${base}-${campo}-ayuda`,
  };

  const enfocar = (campo: CampoTurno) => {
    requestAnimationFrame(() => {
      const form = formRef.current;
      if (!form) return;
      const elemento = RADIOS.has(campo)
        ? (form.querySelector<HTMLInputElement>(`input[name="${campo}"]:checked`) ??
          form.querySelector<HTMLInputElement>(`input[name="${campo}"]`))
        : document.getElementById(ids.campo(campo));
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
              const primero = control[0];
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
    const resultado = validar(siguientes, new Date());
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
    setValores(siguientes);
    if (validarEnVivo || errores[campo] !== undefined) revalidarCampo(campo, siguientes);
  };

  const alSalir = (campo: CampoTurno) => {
    if (valores[campo].trim() !== '') revalidarCampo(campo, valores);
  };

  const enviar = async () => {
    if (envio.fase === 'enviando') return;
    const resultado = validar(valores, new Date());
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
      const { id } = await crearTurno(resultado.datos);
      setEnvio({ fase: 'exito', id, datos: resultado.datos });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        setEnvio({ fase: 'error', mensaje: MENSAJE_DEMASIADOS_PEDIDOS, reintentable: false });
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
