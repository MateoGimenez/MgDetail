import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { CambiosGasto, Gasto, NuevoGasto } from '../../api/finanzas';
import { Icono } from '../../components/Icono';
import {
  CATEGORIAS,
  ETIQUETA_CATEGORIA_LARGA,
  LIMITES_GASTO,
  cambiosDeGasto,
  validarGasto,
  type DatosGasto,
  type ErroresGasto,
} from '../../lib/finanzas';
import { montoParaCampo } from '../../lib/cobro';
import { bloquearEscape, useMontado } from '../dialogo';
import { Contador, ErrorCampo, ErrorGeneral } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';

/** Qué abre el diálogo: un gasto nuevo o la edición de uno que ya está. */
export type EdicionGasto = { modo: 'crear' } | { modo: 'editar'; gasto: Gasto };

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  edicion: EdicionGasto | null;
  /** La fecha de hoy en La Rioja (YYYY-MM-DD): tope de la fecha y valor inicial de un gasto nuevo. */
  hoy: string;
  alCrear: (datos: NuevoGasto) => Promise<Problema | null>;
  alGuardar: (gasto: Gasto, cambios: CambiosGasto) => Promise<Problema | null>;
  alCerrar: () => void;
}

/** Alta y edición de un gasto en un <dialog> modal. Los errores del backend (`fields`) van en su campo. */
export function DialogoGasto({ dialogoRef, edicion, hoy, alCrear, alGuardar, alCerrar }: Props) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar dialogo-gasto"
      aria-labelledby="gasto-dialogo-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={alCerrar}
    >
      {edicion && (
        <FormularioGasto
          key={edicion.modo === 'editar' ? `${edicion.gasto.id}|${edicion.gasto.updatedAt}` : 'nuevo'}
          edicion={edicion}
          hoy={hoy}
          alCrear={alCrear}
          alGuardar={alGuardar}
          alCambiarOcupado={setOcupado}
          alTerminar={() => dialogoRef.current?.close()}
        />
      )}
    </dialog>
  );
}

const datosDe = (gasto: Gasto): DatosGasto => ({
  fecha: gasto.fecha,
  categoria: gasto.categoria,
  descripcion: gasto.descripcion,
  monto: gasto.monto,
  proveedor: gasto.proveedor,
});

function FormularioGasto({
  edicion,
  hoy,
  alCrear,
  alGuardar,
  alCambiarOcupado,
  alTerminar,
}: Omit<Props, 'dialogoRef' | 'edicion' | 'alCerrar'> & { edicion: EdicionGasto; alCambiarOcupado: (ocupado: boolean) => void; alTerminar: () => void }) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const original = edicion.modo === 'editar' ? edicion.gasto : null;

  const [fecha, setFecha] = useState(original?.fecha ?? hoy);
  const [categoria, setCategoria] = useState<string>(original?.categoria ?? '');
  const [descripcion, setDescripcion] = useState(original?.descripcion ?? '');
  const [monto, setMonto] = useState(montoParaCampo(original?.monto ?? null));
  const [proveedor, setProveedor] = useState(original?.proveedor ?? '');
  const [errores, setErrores] = useState<ErroresGasto>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const campo = (nombre: string) => `${id}-${nombre}`;
  const describir = (nombre: keyof ErroresGasto, ayuda = false) => {
    const ids = [ayuda ? `${campo(nombre)}-ayuda` : null, errores[nombre] ? `${campo(nombre)}-error` : null].filter(Boolean);
    return {
      id: campo(nombre),
      'aria-invalid': errores[nombre] ? true : undefined,
      'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
    };
  };
  const enfocarElPrimerError = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError(null);
    const validacion = validarGasto({ fecha, categoria, descripcion, monto, proveedor }, hoy);
    if (!validacion.ok) {
      setErrores(validacion.errores);
      setError('Revisá los campos marcados.');
      enfocarElPrimerError();
      return;
    }
    setErrores({});

    let cambios: CambiosGasto | null = null;
    if (original) {
      cambios = cambiosDeGasto(datosDe(original), validacion.datos);
      if (Object.keys(cambios).length === 0) {
        alTerminar();
        return;
      }
    }

    setEnviando(true);
    alCambiarOcupado(true);
    const problema = original && cambios ? await alGuardar(original, cambios) : await alCrear(validacion.datos);
    alCambiarOcupado(false);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    // Los `fields` del backend usan los mismos nombres que el formulario.
    setErrores(problema.campos ?? {});
    setError(problema.mensaje);
    if (problema.campos) enfocarElPrimerError();
  };

  return (
    <form ref={formRef} className="dialogo-gasto__form" noValidate onSubmit={(evento) => void enviar(evento)}>
      <div>
        <h2 id="gasto-dialogo-titulo" className="confirmar__titulo">
          {original ? 'Editar gasto' : 'Agregar gasto'}
        </h2>
        <p className="confirmar__texto">
          {original
            ? 'Los cambios se ven enseguida en el resumen del mes.'
            : 'Cargá lo que gastaste en el taller. Cuenta para la ganancia neta del mes.'}
        </p>
      </div>

      <fieldset className="dialogo-gasto__grupo" disabled={enviando}>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('descripcion')}>
            En qué se gastó
          </label>
          <input
            {...describir('descripcion')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES_GASTO.descripcion + 20}
            placeholder="Ej.: Shampoo para autos"
            value={descripcion}
            onChange={(evento) => {
              setDescripcion(evento.target.value);
            }}
          />
          <p className="campo__ayuda servicio-form__ayuda-fila">
            <span />
            <Contador valor={descripcion} max={LIMITES_GASTO.descripcion} />
          </p>
          <ErrorCampo id={`${campo('descripcion')}-error`} mensaje={errores.descripcion} />
        </div>

        <div className="dialogo-gasto__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('monto')}>
              Cuánto
            </label>
            <div className="servicio-form__precio">
              <span aria-hidden="true">$</span>
              <input
                {...describir('monto', true)}
                className="entrada"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej.: 12500"
                value={monto}
                onChange={(evento) => {
                  setMonto(evento.target.value);
                }}
              />
            </div>
            <p id={`${campo('monto')}-ayuda`} className="campo__ayuda">
              En pesos, sin centavos.
            </p>
            <ErrorCampo id={`${campo('monto')}-error`} mensaje={errores.monto} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('fecha')}>
              Fecha
            </label>
            <input
              {...describir('fecha')}
              className="entrada"
              type="date"
              max={hoy}
              value={fecha}
              onChange={(evento) => {
                setFecha(evento.target.value);
              }}
            />
            <ErrorCampo id={`${campo('fecha')}-error`} mensaje={errores.fecha} />
          </div>
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('categoria')}>
            Categoría
          </label>
          <div className="desplegable">
            <select
              {...describir('categoria')}
              className="entrada"
              value={categoria}
              onChange={(evento) => {
                setCategoria(evento.target.value);
              }}
            >
              <option value="" disabled>
                Elegí una categoría
              </option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA_LARGA[c]}
                </option>
              ))}
            </select>
            <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
          </div>
          <ErrorCampo id={`${campo('categoria')}-error`} mensaje={errores.categoria} />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('proveedor')}>
            Proveedor <span className="campo__opcional">(opcional)</span>
          </label>
          <input
            {...describir('proveedor')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES_GASTO.proveedor + 20}
            placeholder="Ej.: Distribuidora del Norte"
            value={proveedor}
            onChange={(evento) => {
              setProveedor(evento.target.value);
            }}
          />
          <ErrorCampo id={`${campo('proveedor')}-error`} mensaje={errores.proveedor} />
        </div>
      </fieldset>

      <ErrorGeneral mensaje={error} />

      <div className="confirmar__acciones">
        <button type="button" className="boton boton--secundario" onClick={alTerminar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {!original && <Icono nombre="mas" tamano={18} />}
          {enviando ? 'Guardando…' : original ? 'Guardar cambios' : 'Agregar gasto'}
        </button>
      </div>
    </form>
  );
}
