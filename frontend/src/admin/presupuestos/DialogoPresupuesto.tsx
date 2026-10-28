import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { ServicioPanel } from '../../api/contract-panel';
import type { NuevoPresupuesto, Presupuesto } from '../../api/presupuestos';
import { Icono } from '../../components/Icono';
import { formatoPesos, montoParaCampo } from '../../lib/cobro';
import {
  LIMITES_PRESUPUESTO,
  cuerpoDeAlta,
  cuerpoDeCambios,
  renglonDesdeItem,
  textoItems,
  totalEnVivo,
  validarPresupuesto,
  type ErroresPresupuesto,
  type RenglonItem,
} from '../../lib/presupuestos';
import { bloquearEscape, useMontado } from '../dialogo';
import { Contador, ErrorCampo, ErrorGeneral } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';
import { EditorItems } from './EditorItems';

const L = LIMITES_PRESUPUESTO;

/** Qué abre el diálogo: el alta o la edición de un presupuesto. */
export type EdicionPresupuesto = { modo: 'crear' } | { modo: 'editar'; presupuesto: Presupuesto };

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  edicion: EdicionPresupuesto | null;
  /** Catálogo del panel; null mientras carga o si falló (los ítems libres andan igual). */
  servicios: readonly ServicioPanel[] | null;
  alCrear: (datos: NuevoPresupuesto) => Promise<Problema | null>;
  alGuardar: (presupuesto: Presupuesto, cambios: Record<string, unknown>) => Promise<Problema | null>;
  alCerrar: () => void;
}

/** Alta y edición de un presupuesto en un <dialog> modal, con el total en vivo siempre a la vista. */
export function DialogoPresupuesto({ dialogoRef, edicion, servicios, alCrear, alGuardar, alCerrar }: Props) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar dialogo-usuario dialogo-servicio dialogo-presupuesto"
      aria-labelledby="presupuesto-dialogo-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={alCerrar}
    >
      {edicion && (
        <FormularioPresupuesto
          key={edicion.modo === 'editar' ? `${edicion.presupuesto.id}|${edicion.presupuesto.updatedAt}` : 'nuevo'}
          edicion={edicion}
          servicios={servicios}
          alCrear={alCrear}
          alGuardar={alGuardar}
          alCambiarOcupado={setOcupado}
          alTerminar={() => dialogoRef.current?.close()}
        />
      )}
    </dialog>
  );
}

function FormularioPresupuesto({
  edicion,
  servicios,
  alCrear,
  alGuardar,
  alCambiarOcupado,
  alTerminar,
}: Pick<Props, 'servicios' | 'alCrear' | 'alGuardar'> & {
  edicion: EdicionPresupuesto;
  alCambiarOcupado: (ocupado: boolean) => void;
  alTerminar: () => void;
}) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const original = edicion.modo === 'editar' ? edicion.presupuesto : null;
  const proximaClave = useRef(original ? original.items.length : 0);
  const nuevaClave = () => (proximaClave.current += 1);

  const [clienteNombre, setClienteNombre] = useState(original?.clienteNombre ?? '');
  const [clienteTelefono, setClienteTelefono] = useState(original?.clienteTelefono ?? '');
  const [vehiculo, setVehiculo] = useState(original?.vehiculo ?? '');
  const [renglones, setRenglones] = useState<RenglonItem[]>(() =>
    original ? original.items.map((item, i) => renglonDesdeItem(item, i)) : [],
  );
  const [descuento, setDescuento] = useState(original && original.descuento > 0 ? montoParaCampo(original.descuento) : '');
  const [validezDias, setValidezDias] = useState(String(original?.validezDias ?? L.validezPorDefecto));
  const [notas, setNotas] = useState(original?.notas ?? '');
  const [errores, setErrores] = useState<ErroresPresupuesto>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const campo = (nombre: string) => `${id}-${nombre}`;
  const borrar = (clave: string) => {
    setErrores((e) => (e[clave] ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== clave)) : e));
  };
  const borrarPrefijo = (prefijo: string) => {
    setErrores((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(prefijo))));
  };
  const describir = (nombre: string, ayuda: boolean) =>
    [ayuda ? `${campo(nombre)}-ayuda` : null, errores[nombre] ? `${campo(nombre)}-error` : null].filter(Boolean).join(' ') || undefined;
  const enfocarInvalido = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const cuentas = totalEnVivo(renglones, descuento);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError(null);
    const validacion = validarPresupuesto({ clienteNombre, clienteTelefono, vehiculo, renglones, descuento, validezDias, notas });
    if (!validacion.ok) {
      setErrores(validacion.errores);
      setError('Revisá los campos marcados.');
      enfocarInvalido();
      return;
    }
    setErrores({});

    let cambios: Record<string, unknown> | null = null;
    if (original) {
      cambios = cuerpoDeCambios(original, validacion.datos);
      if (cambios === null) {
        alTerminar();
        return;
      }
    }

    setEnviando(true);
    alCambiarOcupado(true);
    const problema = original && cambios ? await alGuardar(original, cambios) : await alCrear(cuerpoDeAlta(validacion.datos));
    alCambiarOcupado(false);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    setErrores(problema.campos ?? {});
    setError(problema.mensaje);
    if (problema.campos) enfocarInvalido();
  };

  return (
    <form ref={formRef} className="dialogo-usuario__form servicio-form" noValidate onSubmit={(e) => void enviar(e)}>
      <div className="servicio-form__cabeza">
        <h2 id="presupuesto-dialogo-titulo" className="confirmar__titulo">
          {original ? `Editar ${original.codigo}` : 'Nuevo presupuesto'}
        </h2>
        <p className="confirmar__texto">
          {original
            ? 'Los PDF nuevos salen con lo que guardes. Los que ya mandaste no cambian.'
            : 'Armalo con lo que le vas a cobrar. No es una factura: el PDF lo aclara.'}
        </p>
      </div>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">Para quién</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('clienteNombre')}>
            Nombre del cliente
          </label>
          <input
            id={campo('clienteNombre')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={L.clienteNombre}
            value={clienteNombre}
            aria-invalid={errores.clienteNombre ? true : undefined}
            aria-describedby={describir('clienteNombre', false)}
            onChange={(e) => {
              setClienteNombre(e.target.value);
              borrar('clienteNombre');
            }}
          />
          <ErrorCampo id={`${campo('clienteNombre')}-error`} mensaje={errores.clienteNombre} />
        </div>

        <div className="servicio-form__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('clienteTelefono')}>
              WhatsApp del cliente <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('clienteTelefono')}
              className="entrada"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={L.telefono}
              placeholder="380 478-1737"
              value={clienteTelefono}
              aria-invalid={errores.clienteTelefono ? true : undefined}
              aria-describedby={describir('clienteTelefono', true)}
              onChange={(e) => {
                setClienteTelefono(e.target.value);
                borrar('clienteTelefono');
              }}
            />
            <p id={`${campo('clienteTelefono')}-ayuda`} className="campo__ayuda">
              Con el código de área, sin el 15. Sirve para avisarle por WhatsApp.
            </p>
            <ErrorCampo id={`${campo('clienteTelefono')}-error`} mensaje={errores.clienteTelefono} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('vehiculo')}>
              Vehículo <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('vehiculo')}
              className="entrada"
              type="text"
              autoComplete="off"
              maxLength={L.vehiculo}
              placeholder="Ej.: Corsa 2012 gris"
              value={vehiculo}
              aria-invalid={errores.vehiculo ? true : undefined}
              aria-describedby={describir('vehiculo', false)}
              onChange={(e) => {
                setVehiculo(e.target.value);
                borrar('vehiculo');
              }}
            />
            <ErrorCampo id={`${campo('vehiculo')}-error`} mensaje={errores.vehiculo} />
          </div>
        </div>
      </fieldset>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">Lo que se presupuesta</legend>
        <EditorItems
          base={campo('x')}
          renglones={renglones}
          alCambiar={setRenglones}
          proximaClave={nuevaClave}
          errores={errores}
          alBorrarErrores={borrarPrefijo}
          servicios={servicios}
          deshabilitado={enviando}
        />
      </fieldset>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">Condiciones</legend>

        <div className="servicio-form__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('descuento')}>
              Descuento <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('descuento')}
              className="entrada"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="$ 5.000"
              value={descuento}
              aria-invalid={errores.descuento ? true : undefined}
              aria-describedby={describir('descuento', true)}
              onChange={(e) => {
                setDescuento(e.target.value);
                borrar('descuento');
              }}
            />
            <p id={`${campo('descuento')}-ayuda`} className="campo__ayuda">
              {cuentas.descuento > cuentas.subtotal && cuentas.subtotal > 0
                ? 'El descuento es mayor que el subtotal: el total queda en $ 0.'
                : 'En pesos, se resta del total.'}
            </p>
            <ErrorCampo id={`${campo('descuento')}-error`} mensaje={errores.descuento} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('validezDias')}>
              Vale por (días)
            </label>
            <input
              id={campo('validezDias')}
              className="entrada pres-item__numero"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={validezDias}
              aria-invalid={errores.validezDias ? true : undefined}
              aria-describedby={describir('validezDias', true)}
              onChange={(e) => {
                setValidezDias(e.target.value);
                borrar('validezDias');
              }}
            />
            <p id={`${campo('validezDias')}-ayuda`} className="campo__ayuda">
              De {L.validezMin} a {L.validezMax}. Pasado ese tiempo figura como «Vencido».
            </p>
            <ErrorCampo id={`${campo('validezDias')}-error`} mensaje={errores.validezDias} />
          </div>
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('notas')}>
            Notas para el cliente <span className="campo__opcional">(opcional)</span>
          </label>
          <textarea
            id={campo('notas')}
            className="entrada servicio-form__corto"
            rows={3}
            maxLength={L.notas}
            placeholder="Ej.: El auto tiene que entrar lavado de barro grueso."
            value={notas}
            aria-invalid={errores.notas ? true : undefined}
            aria-describedby={describir('notas', true)}
            onChange={(e) => {
              setNotas(e.target.value);
              borrar('notas');
            }}
          />
          <p id={`${campo('notas')}-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
            <span>Salen en el PDF.</span>
            <Contador valor={notas} max={L.notas} />
          </p>
          <ErrorCampo id={`${campo('notas')}-error`} mensaje={errores.notas} />
        </div>
      </fieldset>

      <ErrorGeneral mensaje={error} />

      <div className="servicio-form__acciones pres-barra">
        <div className="pres-barra__total" role="status" aria-atomic="true">
          <span className="pres-barra__titulo">
            Total · {textoItems(renglones.length)}
            {cuentas.descuento > 0 && cuentas.subtotal > 0 && ` · descuento ${formatoPesos(Math.min(cuentas.descuento, cuentas.subtotal))}`}
          </span>
          <strong className="pres-barra__monto">{formatoPesos(cuentas.total)}</strong>
        </div>
        <div className="confirmar__acciones">
          <button type="button" className="boton boton--secundario" onClick={alTerminar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {!original && <Icono nombre="mas" tamano={18} />}
            {enviando ? 'Guardando…' : original ? 'Guardar cambios' : 'Crear presupuesto'}
          </button>
        </div>
      </div>
    </form>
  );
}
