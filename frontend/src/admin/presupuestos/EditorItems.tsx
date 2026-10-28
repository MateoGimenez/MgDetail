import { useState, type Dispatch, type SetStateAction } from 'react';
import type { ServicioPanel } from '../../api/contract-panel';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import {
  LIMITES_PRESUPUESTO,
  etiquetaDeServicio,
  importeDeItem,
  itemEnVivo,
  renglonVacio,
  type ErroresPresupuesto,
  type RenglonItem,
} from '../../lib/presupuestos';
import { ErrorCampo } from '../ErroresFormulario';

interface Props {
  /** Prefijo de los ids (único por formulario). */
  base: string;
  renglones: RenglonItem[];
  alCambiar: Dispatch<SetStateAction<RenglonItem[]>>;
  /** Para pedir el siguiente `clave` estable. */
  proximaClave: () => number;
  errores: ErroresPresupuesto;
  /** Se llama al editar un renglón: los errores por posición de los ítems ya no valen y se borran. */
  alBorrarErrores: (prefijo: string) => void;
  /** Catálogo de servicios del panel; null mientras carga o si falló. */
  servicios: readonly ServicioPanel[] | null;
  deshabilitado: boolean;
}

const L = LIMITES_PRESUPUESTO;

/**
 * Los ítems de un presupuesto: se agregan del catálogo (con su «Desde» como precio sugerido) o libres. Cantidad con
 * decimales (2,5), precio en pesos e importe de cada renglón a la vista. Los errores llevan la clave del backend
 * (`items.0.cantidad`).
 */
export function EditorItems({ base, renglones, alCambiar, proximaClave, errores, alBorrarErrores, servicios, deshabilitado }: Props) {
  const [elegido, setElegido] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const activos = (servicios ?? []).filter((s) => s.activo);
  const lleno = renglones.length >= L.items;
  const campo = (n: string) => `${base}-${n.replaceAll('.', '-')}`;

  const enfocar = (idControl: string) => {
    requestAnimationFrame(() => {
      document.getElementById(idControl)?.focus();
    });
  };

  const agregar = (inicial: Partial<Omit<RenglonItem, 'clave'>>, foco: 'descripcion' | 'cantidad' | 'precio') => {
    if (lleno) return;
    const nuevo = { ...renglonVacio(proximaClave()), ...inicial };
    alCambiar((lista) => [...lista, nuevo]);
    alBorrarErrores('items');
    setAnuncio(`Se agregó ${inicial.descripcion ? `«${inicial.descripcion}»` : 'un ítem libre'}. Ahora hay ${String(renglones.length + 1)}.`);
    enfocar(campo(`items.${String(renglones.length)}.${foco === 'precio' ? 'precioUnitario' : foco}`));
  };

  const agregarDelCatalogo = () => {
    const servicio = activos.find((s) => s.id === elegido);
    if (!servicio) return;
    const conPrecio = servicio.precioDesde !== null && servicio.precioDesde > 0;
    agregar({ descripcion: servicio.nombre, precio: conPrecio ? String(servicio.precioDesde) : '' }, conPrecio ? 'cantidad' : 'precio');
    setElegido('');
  };

  const cambiar = (clave: number, cambio: Partial<RenglonItem>) => {
    alCambiar((lista) => lista.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));
  };

  const quitar = (indice: number) => {
    const quitado = renglones[indice];
    alBorrarErrores('items');
    alCambiar((lista) => lista.filter((_, i) => i !== indice));
    setAnuncio(`Quitaste el ítem ${String(indice + 1)}${quitado?.descripcion.trim() ? `, «${quitado.descripcion.trim()}»` : ''}.`);
    enfocar(indice < renglones.length - 1 ? campo(`items.${String(indice)}.descripcion`) : `${base}-libre`);
  };

  return (
    <fieldset className="pres-items" aria-describedby={errores.items ? `${base}-items-error` : undefined}>
      <legend className="campo__etiqueta">
        Qué incluye <span className="campo__opcional">({renglones.length === 0 ? 'vacío' : `${String(renglones.length)} de ${String(L.items)}`})</span>
      </legend>

      {renglones.length > 0 && (
        <ol className="pres-items__lista" role="list">
          {renglones.map((r, i) => {
            const pos = String(i);
            const item = itemEnVivo(r);
            const importe = importeDeItem(item);
            const eDesc = errores[`items.${pos}.descripcion`];
            const eCant = errores[`items.${pos}.cantidad`];
            const ePrecio = errores[`items.${pos}.precioUnitario`];
            return (
              <li key={r.clave} className="pres-item">
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor={campo(`items.${pos}.descripcion`)}>
                    Ítem {i + 1}
                  </label>
                  <input
                    id={campo(`items.${pos}.descripcion`)}
                    className="entrada"
                    type="text"
                    autoComplete="off"
                    maxLength={L.descripcion}
                    placeholder="Ej.: Pulido de pintura"
                    value={r.descripcion}
                    disabled={deshabilitado}
                    aria-invalid={eDesc ? true : undefined}
                    aria-describedby={eDesc ? `${campo(`items.${pos}.descripcion`)}-error` : undefined}
                    onChange={(e) => {
                      cambiar(r.clave, { descripcion: e.target.value });
                    }}
                  />
                  <ErrorCampo id={`${campo(`items.${pos}.descripcion`)}-error`} mensaje={eDesc} />
                </div>

                <div className="pres-item__cuenta">
                  <div className="campo">
                    <label className="campo__etiqueta" htmlFor={campo(`items.${pos}.cantidad`)}>
                      Cantidad
                    </label>
                    <input
                      id={campo(`items.${pos}.cantidad`)}
                      className="entrada pres-item__numero"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={r.cantidad}
                      disabled={deshabilitado}
                      aria-invalid={eCant ? true : undefined}
                      aria-describedby={eCant ? `${campo(`items.${pos}.cantidad`)}-error` : undefined}
                      onChange={(e) => {
                        cambiar(r.clave, { cantidad: e.target.value });
                      }}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta" htmlFor={campo(`items.${pos}.precioUnitario`)}>
                      Precio
                    </label>
                    <input
                      id={campo(`items.${pos}.precioUnitario`)}
                      className="entrada pres-item__numero"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="$ 25.000"
                      value={r.precio}
                      disabled={deshabilitado}
                      aria-invalid={ePrecio ? true : undefined}
                      aria-describedby={ePrecio ? `${campo(`items.${pos}.precioUnitario`)}-error` : undefined}
                      onChange={(e) => {
                        cambiar(r.clave, { precio: e.target.value });
                      }}
                    />
                  </div>
                  <p className="pres-item__importe">
                    <span className="pres-item__importe-titulo">Importe</span>
                    <strong>{formatoPesos(importe)}</strong>
                  </p>
                  <button
                    type="button"
                    className="boton-icono boton-icono--quitar"
                    aria-label={`Quitar el ítem ${String(i + 1)}`}
                    disabled={deshabilitado}
                    onClick={() => {
                      quitar(i);
                    }}
                  >
                    <Icono nombre="cerrar" tamano={18} />
                  </button>
                </div>
                <ErrorCampo id={`${campo(`items.${pos}.cantidad`)}-error`} mensaje={eCant} />
                <ErrorCampo id={`${campo(`items.${pos}.precioUnitario`)}-error`} mensaje={ePrecio} />
              </li>
            );
          })}
        </ol>
      )}

      <ErrorCampo id={`${base}-items-error`} mensaje={errores.items} />

      <div className="pres-agregar">
        {servicios === null ? (
          <p className="campo__ayuda">Cargando el catálogo de servicios…</p>
        ) : activos.length > 0 ? (
          <div className="pres-agregar__catalogo">
            <label className="visualmente-oculto" htmlFor={`${base}-catalogo`}>
              Servicio del catálogo para agregar
            </label>
            <div className="desplegable">
              <select
                id={`${base}-catalogo`}
                className="entrada"
                value={elegido}
                disabled={deshabilitado || lleno}
                onChange={(e) => {
                  setElegido(e.target.value);
                }}
              >
                <option value="">Servicio del catálogo…</option>
                {activos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {etiquetaDeServicio(s.nombre, s.precioDesde)}
                  </option>
                ))}
              </select>
              <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
            </div>
            <button
              type="button"
              className="boton boton--secundario boton--chico"
              disabled={deshabilitado || lleno || elegido === ''}
              onClick={agregarDelCatalogo}
            >
              <Icono nombre="mas" tamano={18} />
              Agregar
            </button>
          </div>
        ) : null}
        <button
          id={`${base}-libre`}
          type="button"
          className="boton boton--secundario boton--chico pres-agregar__libre"
          disabled={deshabilitado || lleno}
          onClick={() => {
            agregar({}, 'descripcion');
          }}
        >
          <Icono nombre="mas" tamano={18} />
          {lleno ? `Llegaste al máximo (${String(L.items)})` : 'Ítem libre'}
        </button>
      </div>
      <p className="campo__ayuda">
        Del catálogo se completa el precio «Desde», que podés cambiar. Un ítem libre es cualquier cosa que no esté en la lista.
      </p>
      <p className="visualmente-oculto" role="status">
        {anuncio}
      </p>
    </fieldset>
  );
}
