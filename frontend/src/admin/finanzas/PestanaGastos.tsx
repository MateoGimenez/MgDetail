import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  CODIGO_GASTO_DE_INVENTARIO,
  borrarGasto,
  crearGasto,
  editarGasto,
  type CambiosGasto,
  type Gasto,
  type NuevoGasto,
} from '../../api/finanzas';
import { BUSQUEDA } from '../../api/contract';
import { esSesionPerdida } from '../../api/sesion';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { ESPERA_BUSQUEDA_MS, consultaDe, interpretarBusqueda } from '../../lib/busqueda';
import {
  CATEGORIAS,
  ETIQUETA_CATEGORIA,
  agruparGastosPorDia,
  etiquetaDelMes,
  rangoDelMes,
  textoGastos,
} from '../../lib/finanzas';
import { ErrorCampo } from '../ErroresFormulario';
import { useAvisos } from '../toast/contexto';
import type { Problema } from '../useUsuarios';
import { DialogoBorrarGasto } from './DialogoBorrarGasto';
import { DialogoGasto, type EdicionGasto } from './DialogoGasto';
import { FilaGasto } from './FilaGasto';
import { problemaDe } from './problema';
import { useGastos } from './useGastos';

interface Props {
  mes: string;
  hoy: string;
  alVencerSesion: (mensaje: string) => void;
  /** Se llama cuando los gastos cambiaron (alta, edición o baja) para que el resumen del mes se recalcule. */
  alCambiarGastos: () => void;
  /** Cuando cambia, se vuelve a pedir la lista (el botón Actualizar de la vista). */
  version: number;
}

/** Lo que se escribe pasa a la búsqueda después de una pausa breve (no un pedido por tecla). */
function useDemorado(valor: string, espera: number) {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    if (valor === demorado) return;
    const reloj = setTimeout(() => {
      setDemorado(valor);
    }, espera);
    return () => {
      clearTimeout(reloj);
    };
  }, [valor, demorado, espera]);
  return [demorado, setDemorado] as const;
}

/**
 * Gastos del mes: búsqueda y categoría, la suma del filtro, la lista por día, "Agregar gasto" y, en cada gasto manual,
 * editar y borrar (con confirmación). Los de inventario van marcados y sin acciones.
 */
export function PestanaGastos({ mes, hoy, alVencerSesion, alCambiarGastos, version }: Props) {
  const id = useId();
  const avisos = useAvisos();
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const borrarRef = useRef<HTMLDialogElement>(null);
  const [edicion, setEdicion] = useState<EdicionGasto | null>(null);
  const [aBorrar, setABorrar] = useState<Gasto | null>(null);
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [demorado, setDemorado] = useDemorado(texto, ESPERA_BUSQUEDA_MS);
  const busqueda = interpretarBusqueda(demorado);
  const q = consultaDe(busqueda);

  const { desde, hasta } = rangoDelMes(mes, hoy);
  // `version` entra en la búsqueda solo para volver a pedir con "Actualizar".
  const g = useGastos({ desde, hasta, categoria: categoria || undefined, q }, alVencerSesion, version);

  useEffect(() => {
    if (edicion && !dialogoRef.current?.open) dialogoRef.current?.showModal();
  }, [edicion]);
  useEffect(() => {
    if (aBorrar && !borrarRef.current?.open) borrarRef.current?.showModal();
  }, [aBorrar]);

  const nombreMes = etiquetaDelMes(mes);
  const hayFiltro = categoria !== '' || q !== undefined;
  const grupos = agruparGastosPorDia(g.gastos);
  const errorBusqueda = busqueda.tipo === 'larga' ? `Escribí hasta ${String(BUSQUEDA.max)} caracteres para buscar.` : null;

  /** Un 409 GASTO_DE_INVENTARIO no es un fallo del pedido: la lista estaba vieja. El mensaje del backend se muestra y se vuelve a pedir. */
  const alFallar = (error: unknown) => {
    if (error instanceof ApiError && error.code === CODIGO_GASTO_DE_INVENTARIO) g.recargar();
  };

  const crear = async (datos: NuevoGasto): Promise<Problema | null> => {
    try {
      await crearGasto(datos);
      avisos.exito('Listo, el gasto quedó cargado.');
      g.recargar();
      alCambiarGastos();
      return null;
    } catch (error) {
      return problemaDe(error, alVencerSesion, 'No pudimos guardar el gasto. Probá de nuevo.');
    }
  };

  const guardar = async (gasto: Gasto, cambios: CambiosGasto): Promise<Problema | null> => {
    try {
      await editarGasto(gasto.id, cambios);
      avisos.exito('Listo, guardamos los cambios del gasto.');
      g.recargar();
      alCambiarGastos();
      return null;
    } catch (error) {
      alFallar(error);
      return problemaDe(error, alVencerSesion, 'No pudimos guardar los cambios. Probá de nuevo.');
    }
  };

  const borrar = async (gasto: Gasto): Promise<string | null> => {
    try {
      await borrarGasto(gasto.id);
      avisos.exito('Listo, borramos el gasto.');
      g.recargar();
      alCambiarGastos();
      return null;
    } catch (error) {
      alFallar(error);
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return error.message;
      }
      return error instanceof Error ? error.message : 'No pudimos borrar el gasto. Probá de nuevo.';
    }
  };

  const limpiar = () => {
    setTexto('');
    setDemorado('');
  };

  return (
    <div className="fin-gastos">
      <div className="fin-gastos__barra">
        <form
          role="search"
          className="buscador fin-gastos__buscador"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            setDemorado(texto);
          }}
        >
          <label className="visualmente-oculto" htmlFor={`${id}-buscar`}>
            Buscar por descripción o proveedor
          </label>
          <div className="buscador__caja">
            <Icono nombre="buscar" tamano={20} className="buscador__lupa" />
            <input
              id={`${id}-buscar`}
              className="entrada buscador__campo"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={BUSQUEDA.max}
              placeholder="Buscar por descripción o proveedor"
              value={texto}
              aria-invalid={errorBusqueda ? true : undefined}
              aria-describedby={errorBusqueda ? `${id}-buscar-error` : undefined}
              onChange={(evento) => {
                setTexto(evento.target.value);
              }}
            />
            {texto !== '' && (
              <button type="button" className="buscador__limpiar" aria-label="Limpiar búsqueda" onClick={limpiar}>
                <Icono nombre="cerrar" tamano={18} />
              </button>
            )}
          </div>
          <ErrorCampo id={`${id}-buscar-error`} mensaje={errorBusqueda ?? undefined} />
        </form>

        <div className="fin-gastos__filtros">
          <div className="campo fin-gastos__categoria">
            <label className="visualmente-oculto" htmlFor={`${id}-categoria`}>
              Filtrar por categoría
            </label>
            <div className="desplegable">
              <select
                id={`${id}-categoria`}
                className="entrada"
                value={categoria}
                onChange={(evento) => {
                  setCategoria(evento.target.value);
                }}
              >
                <option value="">Todas las categorías</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c]}
                  </option>
                ))}
              </select>
              <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
            </div>
          </div>
          <button
            type="button"
            className="boton boton--primario fin-gastos__agregar"
            onClick={() => {
              setEdicion({ modo: 'crear' });
            }}
          >
            <Icono nombre="mas" tamano={18} />
            Agregar gasto
          </button>
        </div>
      </div>

      <div className="panel__estado fin-gastos__estado" aria-live="polite">
        {busqueda.tipo === 'corta' && <p className="panel__conteo">Escribí al menos {BUSQUEDA.min} caracteres para buscar.</p>}
        {g.cargando && !g.listo && <p className="panel__cargando">Cargando los gastos…</p>}
        {g.listo && !g.error && (
          <p className="fin-gastos__suma">
            <span>{textoGastos(g.total)}</span>
            <span aria-hidden="true"> · </span>
            <strong>
              {hayFiltro ? 'Suma del filtro' : 'Total del mes'}: {formatoPesos(g.suma)}
            </strong>
          </p>
        )}
      </div>

      {g.cargando && !g.listo && (
        <ul className="fin-gastos__lista" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <li key={n} className="gasto gasto--esqueleto">
              <span className="esq esq--m" />
              <span className="esq esq--s" />
            </li>
          ))}
        </ul>
      )}

      {g.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar los gastos. {g.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={g.recargar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {g.listo && !g.error && g.total === 0 && (
        <div className="panel__vacio">
          <p>
            {hayFiltro
              ? `No hay gastos en ${nombreMes} con ese filtro.`
              : `Todavía no cargaste gastos en ${nombreMes}. Sumá el alquiler, los insumos o lo que hayas comprado para ver tu ganancia real.`}
          </p>
          {hayFiltro && (
            <button
              type="button"
              className="boton boton--secundario boton--chico"
              onClick={() => {
                limpiar();
                setCategoria('');
              }}
            >
              Sacar los filtros
            </button>
          )}
        </div>
      )}

      {g.listo && g.total > 0 && (
        <div className={g.obsoleto ? 'fin-gastos__grupos fin-gastos__grupos--obsoleto' : 'fin-gastos__grupos'} aria-busy={g.obsoleto}>
          {grupos.map((grupo) => (
            <section key={grupo.fecha} className="fin-dia" aria-labelledby={`${id}-dia-${grupo.fecha}`}>
              <h3 id={`${id}-dia-${grupo.fecha}`} className="fin-dia__titulo">
                {grupo.titulo.charAt(0).toUpperCase() + grupo.titulo.slice(1)}
              </h3>
              <ul className="fin-gastos__lista" role="list">
                {grupo.gastos.map((gasto) => (
                  <FilaGasto
                    key={gasto.id}
                    gasto={gasto}
                    alEditar={(x) => {
                      setEdicion({ modo: 'editar', gasto: x });
                    }}
                    alBorrar={setABorrar}
                  />
                ))}
              </ul>
            </section>
          ))}

          {g.errorMas && (
            <p className="turno__error" role="alert">
              <Icono nombre="alerta" tamano={18} />
              {g.errorMas}
            </p>
          )}
          {g.hayMas && (
            <button
              type="button"
              className="boton boton--secundario fin-gastos__mas"
              disabled={g.cargandoMas}
              onClick={() => {
                void g.cargarMas();
              }}
            >
              {g.cargandoMas ? 'Cargando…' : `Ver más gastos (${String(g.total - g.gastos.length)} más)`}
            </button>
          )}
        </div>
      )}

      <DialogoGasto
        dialogoRef={dialogoRef}
        edicion={edicion}
        hoy={hoy}
        alCrear={crear}
        alGuardar={guardar}
        alCerrar={() => {
          setEdicion(null);
        }}
      />
      <DialogoBorrarGasto
        dialogoRef={borrarRef}
        gasto={aBorrar}
        alConfirmar={borrar}
        alCerrar={() => {
          setABorrar(null);
        }}
      />
    </div>
  );
}
