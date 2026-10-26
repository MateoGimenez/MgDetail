import { useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { LIMITES_SERVICIO, type CambiosServicio, type NuevoServicio, type ServicioPanel } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { textoPrecio } from '../data/servicios';
import { bloquearEscape, useMontado } from './dialogo';
import { Contador, ErrorCampo, ErrorGeneral } from './ErroresFormulario';
import type { Problema } from './useUsuarios';
import {
  cambiosDe,
  formularioDesde,
  formularioVacio,
  leerPrecio,
  sugerirSlug,
  validarServicio,
  type ErroresServicio,
} from './validacionServicio';

const L = LIMITES_SERVICIO;

/** Qué abre el diálogo: el alta o la edición de un servicio. */
export type EdicionServicio = { modo: 'crear' } | { modo: 'editar'; servicio: ServicioPanel };

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  edicion: EdicionServicio | null;
  /** Nombre del servicio destacado hoy (para avisar que deja de estarlo), si hay. */
  destacadoActual: ServicioPanel | null;
  alCrear: (datos: NuevoServicio) => Promise<Problema | null>;
  alGuardar: (servicio: ServicioPanel, cambios: CambiosServicio) => Promise<Problema | null>;
  alCerrar: () => void;
}

/** Alta y edición de un servicio en un <dialog> modal, con todos los campos del contrato. */
export function DialogoServicio({ dialogoRef, edicion, destacadoActual, alCrear, alGuardar, alCerrar }: Props) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar dialogo-usuario dialogo-servicio"
      aria-labelledby="servicio-dialogo-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={alCerrar}
    >
      {edicion && (
        <FormularioServicio
          key={edicion.modo === 'editar' ? `${edicion.servicio.id}|${edicion.servicio.updatedAt}` : 'nuevo'}
          edicion={edicion}
          destacadoActual={destacadoActual}
          alCrear={alCrear}
          alGuardar={alGuardar}
          alCambiarOcupado={setOcupado}
          alTerminar={() => dialogoRef.current?.close()}
        />
      )}
    </dialog>
  );
}

/* Renglones de las listas editables: una clave estable para que React no mezcle campos al ordenar o quitar. */
interface Renglon {
  clave: number;
  texto: string;
}
interface Entrada {
  clave: number;
  termino: string;
  significado: string;
}

function FormularioServicio({
  edicion,
  destacadoActual,
  alCrear,
  alGuardar,
  alCambiarOcupado,
  alTerminar,
}: Omit<Props, 'dialogoRef' | 'edicion' | 'alCerrar'> & {
  edicion: EdicionServicio;
  alCambiarOcupado: (ocupado: boolean) => void;
  alTerminar: () => void;
}) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const esAlta = edicion.modo === 'crear';
  const original = edicion.modo === 'editar' ? edicion.servicio : null;
  const [inicial] = useState(() => (original ? formularioDesde(original) : formularioVacio()));
  // Los renglones iniciales usan su posición como clave; los nuevos, de 100 en adelante (las listas tienen ≤ 15).
  const proximaClave = useRef(100);
  const nuevaClave = () => (proximaClave.current += 1);

  const [nombre, setNombre] = useState(inicial.nombre);
  const [slug, setSlug] = useState(inicial.id);
  /** Mientras no se toque a mano, el identificador sigue al nombre. */
  const [slugManual, setSlugManual] = useState(false);
  const [resumen, setResumen] = useState(inicial.resumen);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [duracion, setDuracion] = useState(inicial.duracion);
  const [precio, setPrecio] = useState(inicial.precio);
  const [destacado, setDestacado] = useState(inicial.destacado);
  const [activo, setActivo] = useState(inicial.activo);
  const [incluye, setIncluye] = useState<Renglon[]>(() => inicial.incluye.map((texto, clave) => ({ clave, texto })));
  const [glosario, setGlosario] = useState<Entrada[]>(() => inicial.glosario.map((t, clave) => ({ clave, ...t })));
  const [errores, setErrores] = useState<ErroresServicio>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const campo = (nombreCampo: string) => `${id}-${nombreCampo.replaceAll('.', '-')}`;
  const errorDe = (clave: string) => errores[clave];
  /** Props de accesibilidad de un control con su error (y su ayuda, si tiene). */
  const describir = (clave: string, ayuda?: boolean) => {
    const ids = [ayuda ? `${campo(clave)}-ayuda` : null, errorDe(clave) ? `${campo(clave)}-error` : null].filter(Boolean);
    return {
      id: campo(clave),
      'aria-invalid': errorDe(clave) ? true : undefined,
      'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
    };
  };
  /** Al reordenar o quitar renglones, los errores por posición ya no corresponden: se borran los de esa lista. */
  const limpiarErroresDe = (lista: 'incluye' | 'glosario') => {
    setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([clave]) => !clave.startsWith(lista))));
  };
  const enfocar = (idControl: string) => {
    requestAnimationFrame(() => {
      const elemento = document.getElementById(idControl);
      // Al llegar a una punta, "Subir" o "Bajar" queda deshabilitado: el foco pasa al otro botón del renglón.
      if (elemento instanceof HTMLButtonElement && elemento.disabled) {
        elemento.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        return;
      }
      elemento?.focus();
    });
  };

  const precioLeido = leerPrecio(precio);
  const otroDestacado = destacado && destacadoActual && destacadoActual.id !== original?.id ? destacadoActual : null;

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const validacion = validarServicio({
      id: esAlta ? slug : inicial.id,
      nombre,
      resumen,
      descripcion,
      incluye: incluye.map((r) => r.texto),
      glosario: glosario.map(({ termino, significado }) => ({ termino, significado })),
      duracion,
      precio,
      destacado,
      activo,
    });
    setError(null);
    if (!validacion.ok) {
      setErrores(validacion.errores);
      setError('Revisá los campos marcados.');
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setErrores({});

    let cambios: CambiosServicio | null = null;
    if (original) {
      cambios = cambiosDe(original, validacion.datos);
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
    setErrores(problema.campos ?? {});
    setError(problema.mensaje);
    if (problema.campos) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
    }
  };

  return (
    <form ref={formRef} className="dialogo-usuario__form servicio-form" noValidate onSubmit={(evento) => void enviar(evento)}>
      <div className="servicio-form__cabeza">
        <h2 id="servicio-dialogo-titulo" className="confirmar__titulo">
          {original ? `Editar ${original.nombre}` : 'Nuevo servicio'}
        </h2>
        <p className="confirmar__texto">
          {original
            ? 'Lo que guardes se ve en la web en cuanto alguien la abra.'
            : 'Se agrega al final de la lista. Lo podés mover después.'}
        </p>
      </div>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">Lo que se ve primero</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('nombre')}>
            Nombre
          </label>
          <input
            {...describir('nombre')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={L.nombre.max}
            value={nombre}
            onChange={(evento) => {
              const valor = evento.target.value;
              setNombre(valor);
              if (esAlta && !slugManual) setSlug(sugerirSlug(valor));
            }}
          />
          <ErrorCampo id={`${campo('nombre')}-error`} mensaje={errorDe('nombre')} />
        </div>

        {esAlta ? (
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('id')}>
              Identificador
            </label>
            <input
              {...describir('id', true)}
              className="entrada servicio-form__slug"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={L.id.max}
              placeholder="Se arma con el nombre"
              value={slug}
              onChange={(evento) => {
                const valor = evento.target.value;
                setSlug(valor);
                // Si lo borra entero, vuelve a seguir al nombre.
                setSlugManual(valor !== '');
              }}
            />
            <p id={`${campo('id')}-ayuda`} className="campo__ayuda">
              Minúsculas, números y guiones. Identifica al servicio en los turnos y en los enlaces de la web.
              <strong> Después de crearlo no se puede cambiar.</strong>
            </p>
            <ErrorCampo id={`${campo('id')}-error`} mensaje={errorDe('id')} />
          </div>
        ) : (
          <p className="servicio-form__fijo">
            Identificador <code className="servicio__slug">{inicial.id}</code>
            <span className="campo__opcional"> · no se puede cambiar</span>
          </p>
        )}

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('resumen')}>
            Resumen
          </label>
          <textarea
            {...describir('resumen', true)}
            className="entrada servicio-form__corto"
            rows={2}
            maxLength={L.resumen.max}
            value={resumen}
            onChange={(evento) => {
              setResumen(evento.target.value);
            }}
          />
          <p id={`${campo('resumen')}-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
            <span>Una línea, en palabras simples: para qué sirve.</span>
            <Contador valor={resumen} max={L.resumen.max} />
          </p>
          <ErrorCampo id={`${campo('resumen')}-error`} mensaje={errorDe('resumen')} />
        </div>

        <div className="servicio-form__par">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('precioDesde')}>
              Precio desde <span className="campo__opcional">(opcional)</span>
            </label>
            <div className="servicio-form__precio">
              <span aria-hidden="true">$</span>
              <input
                {...describir('precioDesde', true)}
                className="entrada"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej.: 25000"
                value={precio}
                onChange={(evento) => {
                  setPrecio(evento.target.value);
                }}
              />
            </div>
            <p id={`${campo('precioDesde')}-ayuda`} className="campo__ayuda">
              {precioLeido === undefined
                ? 'En pesos, sin centavos.'
                : `En la web: «${textoPrecio(precioLeido)}».${precioLeido === null ? ' Vacío = a consultar.' : ''}`}
            </p>
            <ErrorCampo id={`${campo('precioDesde')}-error`} mensaje={errorDe('precioDesde')} />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor={campo('duracion')}>
              Duración <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              {...describir('duracion', true)}
              className="entrada"
              type="text"
              autoComplete="off"
              maxLength={L.duracion.max}
              placeholder="Ej.: 2 a 3 h"
              value={duracion}
              onChange={(evento) => {
                setDuracion(evento.target.value);
              }}
            />
            <p id={`${campo('duracion')}-ayuda`} className="campo__ayuda">
              Como lo dirías en el taller. Vacío: «A confirmar».
            </p>
            <ErrorCampo id={`${campo('duracion')}-error`} mensaje={errorDe('duracion')} />
          </div>
        </div>
      </fieldset>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">El detalle</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('descripcion')}>
            Descripción
          </label>
          <textarea
            {...describir('descripcion', true)}
            className="entrada"
            rows={5}
            maxLength={L.descripcion.max}
            value={descripcion}
            onChange={(evento) => {
              setDescripcion(evento.target.value);
            }}
          />
          <p id={`${campo('descripcion')}-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
            <span>Qué hacen, paso a paso, y lo que el servicio no logra.</span>
            <Contador valor={descripcion} max={L.descripcion.max} />
          </p>
          <ErrorCampo id={`${campo('descripcion')}-error`} mensaje={errorDe('descripcion')} />
        </div>

        <ListaEditable
          titulo="Incluye"
          ayuda={`Un ítem por renglón, hasta ${String(L.incluye.items)}.`}
          ayudaExtra={'Si incluye todo lo de otro servicio, escribí "Todo lo del <nombre>" y la comparativa de la web lo cuenta.'}
          idAgregar={`${campo('incluye')}-agregar`}
          error={errorDe('incluye')}
          idError={`${campo('incluye')}-error`}
          cantidad={incluye.length}
          maximo={L.incluye.items}
          textoAgregar="Agregar ítem"
          alAgregar={() => {
            const clave = nuevaClave();
            setIncluye((lista) => [...lista, { clave, texto: '' }]);
            enfocar(campo(`incluye.${String(incluye.length)}`));
          }}
        >
          {incluye.map((renglon, i) => (
            <li key={renglon.clave} className="lista-editable__item">
              <div className="lista-editable__fila">
                <label className="visualmente-oculto" htmlFor={campo(`incluye.${String(i)}`)}>
                  Ítem {i + 1} de lo que incluye
                </label>
                <input
                  {...describir(`incluye.${String(i)}`)}
                  className="entrada"
                  type="text"
                  autoComplete="off"
                  maxLength={L.incluye.max}
                  value={renglon.texto}
                  onChange={(evento) => {
                    const texto = evento.target.value;
                    setIncluye((lista) => lista.map((r) => (r.clave === renglon.clave ? { ...r, texto } : r)));
                  }}
                />
                <BotonesDeRenglon
                  queEs={`el ítem ${String(i + 1)}`}
                  indice={i}
                  total={incluye.length}
                  alMover={(delta) => {
                    limpiarErroresDe('incluye');
                    setIncluye((lista) => mover(lista, i, i + delta));
                    enfocar(`${campo(`incluye.${String(i + delta)}`)}-${delta < 0 ? 'subir' : 'bajar'}`);
                  }}
                  alQuitar={() => {
                    limpiarErroresDe('incluye');
                    setIncluye((lista) => lista.filter((r) => r.clave !== renglon.clave));
                    enfocar(i < incluye.length - 1 ? campo(`incluye.${String(i)}`) : `${campo('incluye')}-agregar`);
                  }}
                  idBase={campo(`incluye.${String(i)}`)}
                />
              </div>
              <ErrorCampo id={`${campo(`incluye.${String(i)}`)}-error`} mensaje={errorDe(`incluye.${String(i)}`)} />
            </li>
          ))}
        </ListaEditable>

        <ListaEditable
          titulo="En palabras simples"
          ayuda={`Cada término técnico, explicado en una línea. Hasta ${String(L.glosario.items)}.`}
          idAgregar={`${campo('glosario')}-agregar`}
          error={errorDe('glosario')}
          idError={`${campo('glosario')}-error`}
          cantidad={glosario.length}
          maximo={L.glosario.items}
          textoAgregar="Agregar término"
          alAgregar={() => {
            const clave = nuevaClave();
            setGlosario((lista) => [...lista, { clave, termino: '', significado: '' }]);
            enfocar(campo(`glosario.${String(glosario.length)}.termino`));
          }}
        >
          {glosario.map((entrada, i) => {
            const base = `glosario.${String(i)}`;
            const cambiar = (cambio: Partial<Entrada>) => {
              setGlosario((lista) => lista.map((e) => (e.clave === entrada.clave ? { ...e, ...cambio } : e)));
            };
            return (
              <li key={entrada.clave} className="lista-editable__item lista-editable__item--termino">
                <div className="lista-editable__fila">
                  <div className="lista-editable__campos">
                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor={campo(`${base}.termino`)}>
                        Término {i + 1}
                      </label>
                      <input
                        {...describir(`${base}.termino`)}
                        className="entrada"
                        type="text"
                        autoComplete="off"
                        maxLength={L.glosario.termino}
                        placeholder="Ej.: Clay bar"
                        value={entrada.termino}
                        onChange={(evento) => {
                          cambiar({ termino: evento.target.value });
                        }}
                      />
                      <ErrorCampo id={`${campo(`${base}.termino`)}-error`} mensaje={errorDe(`${base}.termino`)} />
                    </div>
                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor={campo(`${base}.significado`)}>
                        Qué significa
                      </label>
                      <textarea
                        {...describir(`${base}.significado`)}
                        className="entrada servicio-form__corto"
                        rows={2}
                        maxLength={L.glosario.significado}
                        placeholder="Ej.: una arcilla especial que saca la suciedad pegada."
                        value={entrada.significado}
                        onChange={(evento) => {
                          cambiar({ significado: evento.target.value });
                        }}
                      />
                      <ErrorCampo
                        id={`${campo(`${base}.significado`)}-error`}
                        mensaje={errorDe(`${base}.significado`)}
                      />
                    </div>
                  </div>
                  <BotonesDeRenglon
                    queEs={`el término ${String(i + 1)}`}
                    indice={i}
                    total={glosario.length}
                    alMover={(delta) => {
                      limpiarErroresDe('glosario');
                      setGlosario((lista) => mover(lista, i, i + delta));
                      enfocar(`${campo(`glosario.${String(i + delta)}`)}-${delta < 0 ? 'subir' : 'bajar'}`);
                    }}
                    alQuitar={() => {
                      limpiarErroresDe('glosario');
                      setGlosario((lista) => lista.filter((e) => e.clave !== entrada.clave));
                      enfocar(
                        i < glosario.length - 1 ? campo(`glosario.${String(i)}.termino`) : `${campo('glosario')}-agregar`,
                      );
                    }}
                    idBase={campo(base)}
                  />
                </div>
              </li>
            );
          })}
        </ListaEditable>
      </fieldset>

      <fieldset className="servicio-form__grupo" disabled={enviando}>
        <legend className="servicio-form__titulo">En la web</legend>
        <div className="servicio-form__casillas">
          <div>
            <label className="casilla">
              <input
                type="checkbox"
                checked={activo}
                aria-describedby={`${id}-activo-ayuda`}
                onChange={(evento) => {
                  const marcado = evento.target.checked;
                  setActivo(marcado);
                  // Un inactivo no puede ser el destacado: al desactivarlo se desmarca (igual que hace el backend).
                  if (!marcado) setDestacado(false);
                }}
              />
              Activo
            </label>
            <p id={`${id}-activo-ayuda`} className="campo__ayuda">
              {activo
                ? 'Se ve en la web y se puede pedir turno.'
                : `No se ve en la web ni se puede pedir turno. Los turnos que ya lo tienen no cambian.${
                    original?.destacado ? ' Deja de estar destacado.' : ''
                  }`}
            </p>
          </div>
          <div>
            <label className="casilla">
              <input
                type="checkbox"
                checked={destacado}
                disabled={!activo}
                aria-invalid={errorDe('destacado') ? true : undefined}
                aria-describedby={[`${id}-destacado-ayuda`, errorDe('destacado') ? `${id}-destacado-error` : null]
                  .filter(Boolean)
                  .join(' ')}
                onChange={(evento) => {
                  setDestacado(evento.target.checked);
                }}
              />
              Destacado
            </label>
            <p id={`${id}-destacado-ayuda`} className="campo__ayuda">
              {!activo
                ? 'Solo se puede destacar un servicio activo: marcalo como activo primero.'
                : otroDestacado
                  ? `Solo puede haber uno: ${otroDestacado.nombre} deja de estar destacado.`
                  : 'Lleva el marco fileteado en la web. Solo puede haber uno.'}
            </p>
            <ErrorCampo id={`${id}-destacado-error`} mensaje={errorDe('destacado')} />
          </div>
        </div>
      </fieldset>

      <ErrorGeneral mensaje={error} />

      <div className="confirmar__acciones servicio-form__acciones">
        <button type="button" className="boton boton--secundario" onClick={alTerminar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {esAlta && <Icono nombre="mas" tamano={18} />}
          {enviando ? 'Guardando…' : esAlta ? 'Crear servicio' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

function mover<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (hasta < 0 || hasta >= lista.length) return [...lista];
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  if (elemento !== undefined) copia.splice(hasta, 0, elemento);
  return copia;
}

function ListaEditable({
  titulo,
  ayuda,
  ayudaExtra,
  idAgregar,
  error,
  idError,
  cantidad,
  maximo,
  textoAgregar,
  alAgregar,
  children,
}: {
  titulo: string;
  ayuda: string;
  /** Una segunda línea de ayuda, si hace falta. */
  ayudaExtra?: string;
  idAgregar: string;
  error: string | undefined;
  idError: string;
  cantidad: number;
  maximo: number;
  textoAgregar: string;
  alAgregar: () => void;
  children: ReactNode;
}) {
  const lleno = cantidad >= maximo;
  return (
    <fieldset className="lista-editable" aria-describedby={error ? idError : undefined}>
      <legend className="campo__etiqueta">
        {titulo} <span className="campo__opcional">({cantidad === 0 ? 'vacío' : `${String(cantidad)} de ${String(maximo)}`})</span>
      </legend>
      <p className="campo__ayuda">{ayuda}</p>
      {ayudaExtra && <p className="campo__ayuda">{ayudaExtra}</p>}
      {cantidad > 0 && (
        <ol className="lista-editable__items" role="list">
          {children}
        </ol>
      )}
      <ErrorCampo id={idError} mensaje={error} />
      <button
        id={idAgregar}
        type="button"
        className="boton boton--secundario boton--chico lista-editable__agregar"
        disabled={lleno}
        onClick={alAgregar}
      >
        <Icono nombre="mas" tamano={18} />
        {lleno ? `Llegaste al máximo (${String(maximo)})` : textoAgregar}
      </button>
    </fieldset>
  );
}

function BotonesDeRenglon({
  queEs,
  indice,
  total,
  idBase,
  alMover,
  alQuitar,
}: {
  queEs: string;
  indice: number;
  total: number;
  idBase: string;
  alMover: (delta: -1 | 1) => void;
  alQuitar: () => void;
}) {
  return (
    <div className="lista-editable__botones">
      <button
        id={`${idBase}-subir`}
        type="button"
        className="boton-icono"
        aria-label={`Subir ${queEs}`}
        disabled={indice === 0}
        onClick={() => {
          alMover(-1);
        }}
      >
        <Icono nombre="arriba" tamano={18} />
      </button>
      <button
        id={`${idBase}-bajar`}
        type="button"
        className="boton-icono"
        aria-label={`Bajar ${queEs}`}
        disabled={indice === total - 1}
        onClick={() => {
          alMover(1);
        }}
      >
        <Icono nombre="abajo" tamano={18} />
      </button>
      <button type="button" className="boton-icono boton-icono--quitar" aria-label={`Quitar ${queEs}`} onClick={alQuitar}>
        <Icono nombre="cerrar" tamano={18} />
      </button>
    </div>
  );
}
