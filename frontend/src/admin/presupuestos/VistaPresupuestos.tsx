import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BUSQUEDA, MENSAJE_BUSQUEDA } from '../../api/contract';
import type { Presupuesto } from '../../api/presupuestos';
import { negocio } from '../../config/sitio';
import { SubrayadoFilete } from '../../components/Filete';
import { Icono } from '../../components/Icono';
import { ESPERA_BUSQUEDA_MS, consultaDe, interpretarBusqueda } from '../../lib/busqueda';
import {
  ETIQUETA_ESTADO_PRESUPUESTO,
  FILTROS_PRESUPUESTO,
  estadoDeFiltro,
  type FiltroPresupuesto,
} from '../../lib/presupuestos';
import { ErrorCampo } from '../ErroresFormulario';
import type { PropsSeccion } from '../secciones';
import { useDemorado } from '../useDemorado';
import { DatosDelTaller } from './DatosDelTaller';
import { DialogoBorrarPresupuesto } from './DialogoBorrarPresupuesto';
import { DialogoPresupuesto, type EdicionPresupuesto } from './DialogoPresupuesto';
import { EsqueletoPresupuestos } from './EsqueletoPresupuestos';
import { TarjetaPresupuesto } from './TarjetaPresupuesto';
import { POR_PAGINA, usePresupuestos } from './usePresupuestos';
import { useTaller } from './useTaller';
import './presupuestos.css';

const TEXTO_FILTRO: Readonly<Record<FiltroPresupuesto, string>> = {
  todos: 'Todos',
  borrador: `${ETIQUETA_ESTADO_PRESUPUESTO.borrador}s`,
  enviado: `${ETIQUETA_ESTADO_PRESUPUESTO.enviado}s`,
  aceptado: `${ETIQUETA_ESTADO_PRESUPUESTO.aceptado}s`,
  rechazado: `${ETIQUETA_ESTADO_PRESUPUESTO.rechazado}s`,
};

const VACIO_POR_FILTRO: Readonly<Record<FiltroPresupuesto, string>> = {
  todos: 'Todavía no armaste ningún presupuesto. Empezá con «Nuevo presupuesto»: elegís los servicios, le ponés el precio y mandás el PDF.',
  borrador: 'No hay borradores.',
  enviado: 'No hay presupuestos enviados esperando respuesta.',
  aceptado: 'Todavía no hay presupuestos aceptados.',
  rechazado: 'No hay presupuestos rechazados.',
};

/**
 * Presupuestos: armá el detalle de lo que le vas a cobrar a un cliente, mandalo en PDF por WhatsApp y seguí en qué
 * quedó. Solo superadmin y admin. No son facturas: el PDF lo aclara.
 */
export function VistaPresupuestos({ alVencerSesion, catalogo }: Pick<PropsSeccion, 'alVencerSesion' | 'catalogo'>) {
  const id = useId();
  const [filtro, setFiltro] = useState<FiltroPresupuesto>('todos');
  const [pagina, setPagina] = useState(0);
  const [texto, setTexto] = useState('');
  const [demorado, aplicar] = useDemorado(texto, ESPERA_BUSQUEDA_MS);
  const busqueda = interpretarBusqueda(demorado);
  const q = consultaDe(busqueda);

  const [qDeLaPagina, setQDeLaPagina] = useState(q);
  if (qDeLaPagina !== q) {
    setQDeLaPagina(q);
    setPagina(0);
  }

  const dialogoRef = useRef<HTMLDialogElement>(null);
  const borrarRef = useRef<HTMLDialogElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const [edicion, setEdicion] = useState<EdicionPresupuesto | null>(null);
  const [aBorrar, setABorrar] = useState<Presupuesto | null>(null);
  const p = usePresupuestos(estadoDeFiltro(filtro), q, pagina, alVencerSesion);
  const taller = useTaller(alVencerSesion);
  const { datos, cargando } = p;

  useEffect(() => {
    if (edicion && !dialogoRef.current?.open) dialogoRef.current?.showModal();
  }, [edicion]);
  useEffect(() => {
    if (aBorrar && !borrarRef.current?.open) borrarRef.current?.showModal();
  }, [aBorrar]);

  const eliminar = async (presupuesto: Presupuesto) => {
    const problema = await p.eliminar(presupuesto);
    // Si era el único de la última página, se vuelve a la anterior.
    if (!problema && datos && datos.presupuestos.length === 1 && pagina > 0) setPagina((n) => n - 1);
    return problema;
  };

  const limpiar = () => {
    setTexto('');
    aplicar('');
    campoRef.current?.focus();
  };
  const alTeclear = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Escape' && texto !== '') {
      evento.preventDefault();
      limpiar();
    }
  };

  const errorBusqueda = busqueda.tipo === 'larga' ? MENSAJE_BUSQUEDA : null;
  const buscado = q === undefined ? null : `«${q}»`;
  const hayAnterior = pagina > 0;
  const haySiguiente = datos ? (pagina + 1) * POR_PAGINA < datos.total : false;
  const nombreTaller = taller.taller?.nombre ?? negocio.nombre;
  const vencidos = datos ? datos.presupuestos.filter((x) => x.vencido).length : 0;

  const conteo = () => {
    if (!datos || datos.total === 0) return null;
    const cuantos = datos.total === 1 ? '1 presupuesto' : `${String(datos.total)} presupuestos`;
    const filtrado = filtro !== 'todos' ? ` · ${TEXTO_FILTRO[filtro].toLowerCase()}` : '';
    const venc = vencidos > 0 ? ` · ${String(vencidos)} ${vencidos === 1 ? 'vencido' : 'vencidos'} en esta página` : '';
    return `${cuantos}${buscado ? ` para ${buscado}` : ''}${filtrado}${venc}`;
  };

  return (
    <>
      <section className="panel__vista" aria-labelledby="titulo-presupuestos">
        <div className="panel__encabezado">
          <h1 id="titulo-presupuestos" className="panel__titulo">
            Presupuestos
          </h1>
          <div className="usuarios__botones">
            <button
              type="button"
              className="boton boton--primario boton--chico"
              onClick={() => {
                setEdicion({ modo: 'crear' });
              }}
            >
              <Icono nombre="mas" tamano={18} />
              Nuevo presupuesto
            </button>
            <button type="button" className="boton boton--secundario boton--chico" disabled={cargando} onClick={p.recargar}>
              <Icono nombre="refrescar" tamano={18} />
              Actualizar
            </button>
          </div>
        </div>
        <p className="usuarios__ayuda">
          Armá lo que le vas a cobrar, bajalo en PDF y mandalo por WhatsApp. Un presupuesto no es una factura: el PDF lo aclara.
        </p>

        <DatosDelTaller
          cargando={taller.cargando}
          taller={taller.taller}
          error={taller.error}
          alReintentar={taller.reintentar}
          alGuardar={taller.guardar}
        />

        <form
          role="search"
          className="buscador"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            aplicar(texto);
          }}
        >
          <label className="visualmente-oculto" htmlFor={`${id}-buscar`}>
            Buscar por cliente, vehículo o código
          </label>
          <div className="buscador__caja">
            <Icono nombre="buscar" tamano={20} className="buscador__lupa" />
            <input
              ref={campoRef}
              id={`${id}-buscar`}
              className="entrada buscador__campo"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={BUSQUEDA.max}
              placeholder="Buscar por cliente, vehículo o código"
              value={texto}
              aria-invalid={errorBusqueda ? true : undefined}
              aria-describedby={errorBusqueda ? `${id}-buscar-error` : undefined}
              onChange={(evento) => {
                setTexto(evento.target.value);
              }}
              onKeyDown={alTeclear}
            />
            {texto !== '' && (
              <button type="button" className="buscador__limpiar" aria-label="Limpiar búsqueda" onClick={limpiar}>
                <Icono nombre="cerrar" tamano={18} />
              </button>
            )}
          </div>
          <ErrorCampo id={`${id}-buscar-error`} mensaje={errorBusqueda ?? undefined} />
        </form>

        <nav className="filtros" aria-label="Filtrar por estado">
          <ul role="list">
            {FILTROS_PRESUPUESTO.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className={f === filtro ? 'filtro seleccionado' : 'filtro'}
                  aria-pressed={f === filtro}
                  onClick={() => {
                    setFiltro(f);
                    setPagina(0);
                  }}
                >
                  {TEXTO_FILTRO[f]}
                  {f === filtro && <SubrayadoFilete className="filtro__trazo" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="turnos__barra">
          <div className="panel__estado" aria-live="polite">
            {busqueda.tipo === 'corta' && <p className="panel__conteo">Escribí al menos {BUSQUEDA.min} caracteres para buscar.</p>}
            {cargando && <p className="panel__cargando">{buscado ? `Buscando ${buscado}…` : 'Cargando presupuestos…'}</p>}
            {!cargando && conteo() && <p className="panel__conteo">{conteo()}</p>}
          </div>
        </div>

        {cargando && <EsqueletoPresupuestos />}

        {p.error && (
          <div className="panel__error" role="alert">
            <Icono nombre="alerta" tamano={22} />
            <div>
              <p>No pudimos cargar los presupuestos. {p.error}</p>
              <button type="button" className="boton boton--primario boton--chico" onClick={p.recargar}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {datos && datos.presupuestos.length === 0 && (
          <div className="panel__vacio">
            {buscado ? (
              <div className="panel__vacio-busqueda">
                <p className="panel__vacio-titulo">No encontramos presupuestos para {buscado}</p>
                <p>
                  {filtro === 'todos'
                    ? 'Probá con otra parte del nombre del cliente, el vehículo o el código (P-0007).'
                    : `Buscamos solo entre los ${TEXTO_FILTRO[filtro].toLowerCase()}.`}
                </p>
                <div className="panel__vacio-acciones">
                  {filtro !== 'todos' && (
                    <button
                      type="button"
                      className="boton boton--secundario boton--chico"
                      onClick={() => {
                        setFiltro('todos');
                        setPagina(0);
                      }}
                    >
                      Buscar en todos
                    </button>
                  )}
                  <button type="button" className="boton boton--fantasma boton--chico" onClick={limpiar}>
                    Limpiar búsqueda
                  </button>
                </div>
              </div>
            ) : (
              <p>{VACIO_POR_FILTRO[filtro]}</p>
            )}
          </div>
        )}

        {datos && datos.presupuestos.length > 0 && (
          <ul className="turnos pres-lista" role="list" aria-label="Presupuestos">
            {datos.presupuestos.map((presupuesto) => (
              <TarjetaPresupuesto
                key={presupuesto.id}
                presupuesto={presupuesto}
                nombreTaller={nombreTaller}
                ocupado={p.ocupados.has(presupuesto.id)}
                error={p.errores[presupuesto.id]}
                aviso={
                  filtro !== 'todos' && presupuesto.estado !== filtro && p.cambiados.has(presupuesto.id)
                    ? `Pasó a ${ETIQUETA_ESTADO_PRESUPUESTO[presupuesto.estado]}. Sale de esta lista al actualizar.`
                    : null
                }
                alCambiarEstado={(estado) => {
                  void p.cambiarEstado(presupuesto, estado);
                }}
                alEditar={() => {
                  setEdicion({ modo: 'editar', presupuesto });
                }}
                alBorrar={() => {
                  setABorrar(presupuesto);
                }}
                alVencerSesion={alVencerSesion}
              />
            ))}
          </ul>
        )}

        {datos && (hayAnterior || haySiguiente) && (
          <nav className="paginacion" aria-label="Páginas">
            <button
              type="button"
              className="boton boton--secundario boton--chico"
              disabled={!hayAnterior || cargando}
              onClick={() => {
                setPagina((n) => n - 1);
              }}
            >
              Anteriores
            </button>
            <span className="paginacion__texto">
              Página {pagina + 1} de {Math.max(1, Math.ceil(datos.total / POR_PAGINA))}
            </span>
            <button
              type="button"
              className="boton boton--secundario boton--chico"
              disabled={!haySiguiente || cargando}
              onClick={() => {
                setPagina((n) => n + 1);
              }}
            >
              Siguientes
            </button>
          </nav>
        )}
      </section>

      <DialogoPresupuesto
        dialogoRef={dialogoRef}
        edicion={edicion}
        servicios={catalogo.servicios}
        alCrear={p.crear}
        alGuardar={p.guardar}
        alCerrar={() => {
          setEdicion(null);
        }}
      />

      <DialogoBorrarPresupuesto
        dialogoRef={borrarRef}
        presupuesto={aBorrar}
        alConfirmar={eliminar}
        alCerrar={() => {
          setABorrar(null);
        }}
      />
    </>
  );
}

export default VistaPresupuestos;
