import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { CambiosInsumo, Insumo, NuevoInsumo } from '../../api/inventario';
import { Icono } from '../../components/Icono';
import { montoParaCampo } from '../../lib/cobro';
import {
  LIMITES_INSUMO,
  UNIDADES,
  altaDeInsumo,
  cambiosDeInsumo,
  cantidadParaCampo,
  etiquetaDeUnidad,
  esUnidad,
  formularioInsumoVacio,
  singularDeUnidad,
  validarInsumo,
  type ErroresInsumo,
} from '../../lib/inventario';
import { bloquearEscape, useMontado } from '../dialogo';
import { ErrorCampo, ErrorGeneral } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';

/** Qué abre el diálogo: el alta o la edición de un insumo. */
export type EdicionInsumo = { modo: 'crear' } | { modo: 'editar'; insumo: Insumo };

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  edicion: EdicionInsumo | null;
  /** Categorías que ya existen: se sugieren al escribir, así no se duplican con otra ortografía. */
  categorias: readonly string[];
  alCrear: (datos: NuevoInsumo) => Promise<Problema | null>;
  alGuardar: (insumo: Insumo, cambios: CambiosInsumo) => Promise<Problema | null>;
  alCerrar: () => void;
}

/** Alta y edición de un insumo (solo admin y superadmin) en un <dialog> modal. */
export function DialogoInsumo({ dialogoRef, edicion, categorias, alCrear, alGuardar, alCerrar }: Props) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar dialogo-usuario dialogo-insumo"
      aria-labelledby="insumo-dialogo-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={alCerrar}
    >
      {edicion && (
        <FormularioInsumo
          key={edicion.modo === 'editar' ? `${edicion.insumo.id}|${edicion.insumo.updatedAt}` : 'nuevo'}
          edicion={edicion}
          categorias={categorias}
          alCrear={alCrear}
          alGuardar={alGuardar}
          alCambiarOcupado={setOcupado}
          alTerminar={() => dialogoRef.current?.close()}
        />
      )}
    </dialog>
  );
}

function FormularioInsumo({
  edicion,
  categorias,
  alCrear,
  alGuardar,
  alCambiarOcupado,
  alTerminar,
}: Pick<Props, 'categorias' | 'alCrear' | 'alGuardar'> & {
  edicion: EdicionInsumo;
  alCambiarOcupado: (ocupado: boolean) => void;
  alTerminar: () => void;
}) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const original = edicion.modo === 'editar' ? edicion.insumo : null;
  const alta = original === null;
  const [valores, setValores] = useState(() =>
    original
      ? {
          nombre: original.nombre,
          categoria: original.categoria ?? '',
          unidad: original.unidad,
          stockInicial: '',
          stockMinimo: original.stockMinimo > 0 ? cantidadParaCampo(original.stockMinimo) : '',
          costoUnitario: montoParaCampo(original.costoUnitario),
        }
      : formularioInsumoVacio(),
  );
  const [errores, setErrores] = useState<ErroresInsumo>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const poner = <K extends keyof typeof valores>(campo: K, valor: (typeof valores)[K]) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };
  const campo = (nombre: string) => `${id}-${nombre}`;
  const describir = (nombre: keyof ErroresInsumo, ayuda?: boolean) =>
    [ayuda ? `${campo(nombre)}-ayuda` : null, errores[nombre] ? `${campo(nombre)}-error` : null].filter(Boolean).join(' ') || undefined;
  const enfocarInvalido = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError(null);
    const validacion = validarInsumo(valores, { alta });
    if (!validacion.ok) {
      setErrores(validacion.errores);
      setError('Revisá los campos marcados.');
      enfocarInvalido();
      return;
    }
    setErrores({});

    let cambios: CambiosInsumo | null = null;
    if (original) {
      cambios = cambiosDeInsumo(original, validacion.datos);
      if (Object.keys(cambios).length === 0) {
        alTerminar();
        return;
      }
    }

    setEnviando(true);
    alCambiarOcupado(true);
    const problema = original && cambios ? await alGuardar(original, cambios) : await alCrear(altaDeInsumo(validacion.datos));
    alCambiarOcupado(false);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    const campos = problema.campos ?? {};
    setErrores({
      nombre: campos.nombre,
      categoria: campos.categoria,
      stockInicial: campos.stockInicial,
      stockMinimo: campos.stockMinimo,
      costoUnitario: campos.costoUnitario,
    });
    setError(problema.mensaje);
    if (Object.keys(campos).length > 0) enfocarInvalido();
  };

  const unidadSingular = singularDeUnidad(valores.unidad);

  return (
    <form ref={formRef} className="dialogo-usuario__form servicio-form" noValidate onSubmit={(e) => void enviar(e)}>
      <div className="servicio-form__cabeza">
        <h2 id="insumo-dialogo-titulo" className="confirmar__titulo">
          {original ? `Editar ${original.nombre}` : 'Nuevo insumo'}
        </h2>
        <p className="confirmar__texto">
          {original
            ? 'Para sumar o restar stock usá Compré, Usé o Ajustar: así queda en el historial.'
            : 'Un producto o material que usás en los trabajos: shampoo, paños, cera…'}
        </p>
      </div>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">Qué es</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('nombre')}>
            Nombre
          </label>
          <input
            id={campo('nombre')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES_INSUMO.nombre}
            value={valores.nombre}
            aria-invalid={errores.nombre ? true : undefined}
            aria-describedby={describir('nombre')}
            onChange={(e) => {
              poner('nombre', e.target.value);
            }}
          />
          <ErrorCampo id={`${campo('nombre')}-error`} mensaje={errores.nombre} />
        </div>

        <div className="servicio-form__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('categoria')}>
              Categoría <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('categoria')}
              className="entrada"
              type="text"
              autoComplete="off"
              list={categorias.length > 0 ? campo('categorias') : undefined}
              maxLength={LIMITES_INSUMO.categoria}
              placeholder="Ej.: Lavado"
              value={valores.categoria}
              aria-invalid={errores.categoria ? true : undefined}
              aria-describedby={describir('categoria')}
              onChange={(e) => {
                poner('categoria', e.target.value);
              }}
            />
            {categorias.length > 0 && (
              <datalist id={campo('categorias')}>
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
            <ErrorCampo id={`${campo('categoria')}-error`} mensaje={errores.categoria} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('unidad')}>
              Se cuenta en
            </label>
            <div className="desplegable">
              <select
                id={campo('unidad')}
                className="entrada"
                value={valores.unidad}
                aria-describedby={original ? campo('unidad-ayuda') : undefined}
                onChange={(e) => {
                  if (esUnidad(e.target.value)) poner('unidad', e.target.value);
                }}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {etiquetaDeUnidad(u)}
                  </option>
                ))}
              </select>
              <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
            </div>
            {original && (
              <p id={campo('unidad-ayuda')} className="campo__ayuda">
                Si cambiás la unidad, revisá el stock: no se convierte solo.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">Cuánto hay</legend>

        {alta && (
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('stockInicial')}>
              Stock de arranque <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('stockInicial')}
              className="entrada"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej.: 4,5"
              value={valores.stockInicial}
              aria-invalid={errores.stockInicial ? true : undefined}
              aria-describedby={describir('stockInicial', true)}
              onChange={(e) => {
                poner('stockInicial', e.target.value);
              }}
            />
            <p id={`${campo('stockInicial')}-ayuda`} className="campo__ayuda">
              Cuánto tenés hoy. Queda anotado en el historial como «Stock inicial».
            </p>
            <ErrorCampo id={`${campo('stockInicial')}-error`} mensaje={errores.stockInicial} />
          </div>
        )}

        <div className="servicio-form__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('stockMinimo')}>
              Mínimo <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('stockMinimo')}
              className="entrada"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej.: 2"
              value={valores.stockMinimo}
              aria-invalid={errores.stockMinimo ? true : undefined}
              aria-describedby={describir('stockMinimo', true)}
              onChange={(e) => {
                poner('stockMinimo', e.target.value);
              }}
            />
            <p id={`${campo('stockMinimo')}-ayuda`} className="campo__ayuda">
              Cuando quede esto o menos, te avisamos «Stock bajo». Vacío: sin aviso.
            </p>
            <ErrorCampo id={`${campo('stockMinimo')}-error`} mensaje={errores.stockMinimo} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('costoUnitario')}>
              Costo por {unidadSingular} <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id={campo('costoUnitario')}
              className="entrada"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="$ 3.500"
              value={valores.costoUnitario}
              aria-invalid={errores.costoUnitario ? true : undefined}
              aria-describedby={describir('costoUnitario', true)}
              onChange={(e) => {
                poner('costoUnitario', e.target.value);
              }}
            />
            <p id={`${campo('costoUnitario')}-ayuda`} className="campo__ayuda">
              En pesos, sin centavos. Se actualiza solo cuando cargás una compra con su precio.
            </p>
            <ErrorCampo id={`${campo('costoUnitario')}-error`} mensaje={errores.costoUnitario} />
          </div>
        </div>
      </fieldset>

      <ErrorGeneral mensaje={error} />

      <div className="confirmar__acciones servicio-form__acciones">
        <button type="button" className="boton boton--secundario" onClick={alTerminar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {alta && <Icono nombre="mas" tamano={18} />}
          {enviando ? 'Guardando…' : alta ? 'Agregar insumo' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
