import { useId, useRef, useState, type FormEvent } from 'react';
import { Icono } from '../../components/Icono';
import {
  LIMITES_TALLER,
  faltaEnTaller,
  formularioDeTaller,
  mismosDatosDeTaller,
  resumenDeTaller,
  validarTaller,
  type DatosTaller,
  type ErroresTaller,
  type FormularioTaller,
} from '../../lib/taller';
import { useMontado } from '../dialogo';
import { Contador, ErrorCampo, ErrorGeneral } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';

interface Props {
  cargando: boolean;
  taller: DatosTaller | null;
  error: string | null;
  alReintentar: () => void;
  alGuardar: (datos: DatosTaller) => Promise<Problema | null>;
}

/**
 * "Datos que salen en los PDF": nombre, teléfono, dirección, Instagram, CUIT y leyenda del taller. Van arriba de
 * cada presupuesto y comprobante. Plegado: se revisa antes del primer PDF y casi nunca más.
 */
export function DatosDelTaller({ cargando, taller, error, alReintentar, alGuardar }: Props) {
  const faltan = taller ? faltaEnTaller(taller) : [];
  return (
    <details className="plegable pres-taller">
      <summary className="plegable__titulo">
        <span>Datos que salen en los PDF</span>
        <span className="plegable__resumen">{taller ? (faltan.length > 0 ? 'Faltan datos' : 'Revisar') : cargando ? 'Cargando…' : ''}</span>
        <Icono nombre="abajo" tamano={20} className="plegable__flecha" />
      </summary>
      <div className="plegable__cuerpo">
        {cargando && <p className="panel__cargando">Cargando los datos del taller…</p>}
        {error && (
          <div className="panel__error" role="alert">
            <Icono nombre="alerta" tamano={22} />
            <div>
              <p>No pudimos cargar los datos del taller. {error}</p>
              <button type="button" className="boton boton--primario boton--chico" onClick={alReintentar}>
                Reintentar
              </button>
            </div>
          </div>
        )}
        {taller && (
          <>
            <p className="usuarios__ayuda">
              Salen arriba de cada presupuesto y comprobante. Revisalos antes de mandar el primer PDF.
              <strong> No son facturas:</strong> los PDF lo aclaran solos. Si necesitás facturar, seguís por ARCA.
            </p>
            {faltan.length > 0 && (
              <p className="pres-taller__falta" role="status">
                <Icono nombre="alerta" tamano={18} />
                Todavía no cargaste {faltan.join(' ni ')}. El cliente no tiene cómo escribirte desde el PDF.
              </p>
            )}
            <FormularioTallerPdf taller={taller} alGuardar={alGuardar} />
          </>
        )}
      </div>
    </details>
  );
}

function FormularioTallerPdf({ taller, alGuardar }: { taller: DatosTaller; alGuardar: Props['alGuardar'] }) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const [valores, setValores] = useState<FormularioTaller>(() => formularioDeTaller(taller));
  const [errores, setErrores] = useState<ErroresTaller>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const poner = (campo: keyof FormularioTaller, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
    setGuardado(false);
  };
  const campo = (nombre: string) => `${id}-${nombre}`;
  const describir = (nombre: keyof FormularioTaller, ayuda: boolean) =>
    [ayuda ? `${campo(nombre)}-ayuda` : null, errores[nombre] ? `${campo(nombre)}-error` : null].filter(Boolean).join(' ') || undefined;
  const enfocarInvalido = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setGeneral(null);
    const validacion = validarTaller(valores);
    if (!validacion.ok) {
      setErrores(validacion.errores);
      setGeneral('Revisá los campos marcados.');
      enfocarInvalido();
      return;
    }
    setErrores({});
    if (mismosDatosDeTaller(validacion.datos, taller)) {
      setGuardado(true);
      return;
    }
    setEnviando(true);
    const problema = await alGuardar(validacion.datos);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      setGuardado(true);
      return;
    }
    const c = problema.campos ?? {};
    setErrores({ nombre: c.nombre, telefono: c.telefono, direccion: c.direccion, instagram: c.instagram, cuit: c.cuit, leyendaPdf: c.leyendaPdf });
    setGeneral(problema.mensaje);
    if (Object.keys(c).length > 0) enfocarInvalido();
  };

  return (
    <form ref={formRef} className="pres-taller__form" noValidate onSubmit={(e) => void enviar(e)}>
      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="visualmente-oculto">Datos del taller en los PDF</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('nombre')}>
            Nombre del taller
          </label>
          <input
            id={campo('nombre')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES_TALLER.nombre}
            value={valores.nombre}
            aria-invalid={errores.nombre ? true : undefined}
            aria-describedby={describir('nombre', false)}
            onChange={(e) => {
              poner('nombre', e.target.value);
            }}
          />
          <ErrorCampo id={`${campo('nombre')}-error`} mensaje={errores.nombre} />
        </div>

        <div className="servicio-form__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('telefono')}>
              WhatsApp / teléfono <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('telefono')}
              className="entrada"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="380 478-1737"
              value={valores.telefono}
              aria-invalid={errores.telefono ? true : undefined}
              aria-describedby={describir('telefono', true)}
              onChange={(e) => {
                poner('telefono', e.target.value);
              }}
            />
            <p id={`${campo('telefono')}-ayuda`} className="campo__ayuda">
              Escribilo como siempre: lo guardamos con el código de país.
            </p>
            <ErrorCampo id={`${campo('telefono')}-error`} mensaje={errores.telefono} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('instagram')}>
              Instagram <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('instagram')}
              className="entrada"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="mgdetailing"
              value={valores.instagram}
              aria-invalid={errores.instagram ? true : undefined}
              aria-describedby={describir('instagram', true)}
              onChange={(e) => {
                poner('instagram', e.target.value);
              }}
            />
            <p id={`${campo('instagram')}-ayuda`} className="campo__ayuda">
              Solo el usuario, sin la arroba.
            </p>
            <ErrorCampo id={`${campo('instagram')}-error`} mensaje={errores.instagram} />
          </div>
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('direccion')}>
            Dirección <span className="campo__opcional">(opcional)</span>
          </label>
          <input
            id={campo('direccion')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES_TALLER.direccion}
            value={valores.direccion}
            aria-invalid={errores.direccion ? true : undefined}
            aria-describedby={describir('direccion', false)}
            onChange={(e) => {
              poner('direccion', e.target.value);
            }}
          />
          <ErrorCampo id={`${campo('direccion')}-error`} mensaje={errores.direccion} />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('cuit')}>
            CUIT <span className="campo__opcional">(opcional)</span>
          </label>
          <input
            id={campo('cuit')}
            className="entrada pres-taller__corto"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="20-12345678-9"
            value={valores.cuit}
            aria-invalid={errores.cuit ? true : undefined}
            aria-describedby={describir('cuit', true)}
            onChange={(e) => {
              poner('cuit', e.target.value);
            }}
          />
          <p id={`${campo('cuit')}-ayuda`} className="campo__ayuda">
            Solo si corresponde. Con el CUIT en el PDF no se vuelve una factura.
          </p>
          <ErrorCampo id={`${campo('cuit')}-error`} mensaje={errores.cuit} />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('leyendaPdf')}>
            Leyenda al pie <span className="campo__opcional">(opcional)</span>
          </label>
          <textarea
            id={campo('leyendaPdf')}
            className="entrada servicio-form__corto"
            rows={2}
            maxLength={LIMITES_TALLER.leyendaPdf}
            placeholder="Ej.: Gracias por confiar en nosotros."
            value={valores.leyendaPdf}
            aria-invalid={errores.leyendaPdf ? true : undefined}
            aria-describedby={describir('leyendaPdf', true)}
            onChange={(e) => {
              poner('leyendaPdf', e.target.value);
            }}
          />
          <p id={`${campo('leyendaPdf')}-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
            <span>Se suma a la aclaración de que no es una factura.</span>
            <Contador valor={valores.leyendaPdf} max={LIMITES_TALLER.leyendaPdf} />
          </p>
          <ErrorCampo id={`${campo('leyendaPdf')}-error`} mensaje={errores.leyendaPdf} />
        </div>
      </fieldset>

      <ErrorGeneral mensaje={general} />

      <div className="cobro__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={enviando}>
          <Icono nombre="check" tamano={18} />
          {enviando ? 'Guardando…' : 'Guardar datos'}
        </button>
        <p className="pres-taller__estado" role="status">
          {guardado ? `Guardado: ${resumenDeTaller(taller)}` : ''}
        </p>
      </div>
    </form>
  );
}
