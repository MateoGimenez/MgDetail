import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { FiltroActivo, Insumo } from '../../api/inventario';
import { BUSQUEDA, MENSAJE_BUSQUEDA } from '../../api/contract';
import { SubrayadoFilete } from '../../components/Filete';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { ESPERA_BUSQUEDA_MS, consultaDe, interpretarBusqueda } from '../../lib/busqueda';
import { pideStockBajo, textoStockBajo } from '../../lib/inventario';
import { ErrorCampo } from '../ErroresFormulario';
import { puedeGestionarInventario } from '../permisos';
import type { PropsSeccion } from '../secciones';
import { useDemorado } from '../useDemorado';
import { DialogoInsumo, type EdicionInsumo } from './DialogoInsumo';
import { EsqueletoInsumos } from './EsqueletoInsumos';
import { TarjetaInsumo } from './TarjetaInsumo';
import { POR_PAGINA, useInsumos } from './useInsumos';
import './inventario.css';

/** Con qué pidió abrirse la sección desde Hoy ("N insumos con stock bajo"). */
const PEDIDO_STOCK_BAJO = 'bajo-stock';

/**
 * El `?bajoStock=1` de la dirección vale una sola vez, al primer montaje: si no, volver a Inventario desde otra
 * sección lo filtraría de nuevo aunque la persona ya lo haya sacado. Se marca como leído en un efecto (no al leerlo)
 * para que el modo estricto de React, que corre el inicializador dos veces, vea lo mismo las dos.
 */
let parametroDeLaDireccionLeido = false;
const bajoStockDeLaDireccion = (): boolean => !parametroDeLaDireccionLeido && pideStockBajo(window.location.search);

const MOSTRAR: readonly { valor: FiltroActivo; texto: string }[] = [
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
  { valor: 'todos', texto: 'Todos' },
];

/**
 * Inventario: lo que hay en el taller contra lo mínimo que conviene tener. Todos los roles lo ven y anotan lo que
 * usan; comprar, ajustar, crear y desactivar es de admin y superadmin, que además ven costos y valores en pesos.
 * `?vista=inventario&bajoStock=1` (o el aviso de Hoy) lo abre con "Stock bajo" activo.
 */
export function VistaInventario({ rol, alVencerSesion, abrirCon }: Pick<PropsSeccion, 'rol' | 'alVencerSesion' | 'abrirCon'>) {
  const id = useId();
  const gestiona = puedeGestionarInventario(rol);
  const [bajoStock, setBajoStock] = useState(() => bajoStockDeLaDireccion() || abrirCon === PEDIDO_STOCK_BAJO);
  const [activo, setActivo] = useState<FiltroActivo>('true');
  const [pagina, setPagina] = useState(0);
  const [texto, setTexto] = useState('');
  const [demorado, aplicar] = useDemorado(texto, ESPERA_BUSQUEDA_MS);
  const busqueda = interpretarBusqueda(demorado);
  const q = consultaDe(busqueda);

  // Una búsqueda nueva arranca en la primera página (se ajusta en el mismo render: no sale un pedido viejo).
  const [qDeLaPagina, setQDeLaPagina] = useState(q);
  if (qDeLaPagina !== q) {
    setQDeLaPagina(q);
    setPagina(0);
  }

  const dialogoRef = useRef<HTMLDialogElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const [edicion, setEdicion] = useState<EdicionInsumo | null>(null);
  const inv = useInsumos({ q, bajoStock, activo }, pagina, alVencerSesion);
  const { datos, cargando } = inv;

  useEffect(() => {
    parametroDeLaDireccionLeido = true;
  }, []);

  useEffect(() => {
    if (edicion && !dialogoRef.current?.open) dialogoRef.current?.showModal();
  }, [edicion]);

  const categorias = useMemo(
    () => [...new Set((datos?.insumos ?? []).map((i) => i.categoria).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, 'es')),
    [datos],
  );

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
  const cantidadBajos = datos?.bajoStock ?? null;
  const hayAnterior = pagina > 0;
  const haySiguiente = datos ? (pagina + 1) * POR_PAGINA < datos.total : false;

  const resumen = () => {
    if (!datos || datos.total === 0) return null;
    const cuantos = datos.total === 1 ? '1 insumo' : `${String(datos.total)} insumos`;
    const partes = [cuantos];
    if (cantidadBajos !== null && cantidadBajos > 0 && !bajoStock) partes.push(textoStockBajo(cantidadBajos));
    if (datos.valorTotal !== null && activo !== 'false') partes.push(`En stock ${formatoPesos(datos.valorTotal)}`);
    return `${partes.join(' · ')}${buscado ? ` para ${buscado}` : ''}`;
  };

  const elegirBajoStock = (valor: boolean) => {
    setBajoStock(valor);
    setPagina(0);
  };

  return (
    <>
      <section className="panel__vista" aria-labelledby="titulo-inventario">
        <div className="panel__encabezado">
          <h1 id="titulo-inventario" className="panel__titulo">
            Inventario
          </h1>
          <div className="usuarios__botones">
            {gestiona && (
              <button
                type="button"
                className="boton boton--primario boton--chico"
                onClick={() => {
                  setEdicion({ modo: 'crear' });
                }}
              >
                <Icono nombre="mas" tamano={18} />
                Nuevo insumo
              </button>
            )}
            <button type="button" className="boton boton--secundario boton--chico" disabled={cargando} onClick={inv.recargar}>
              <Icono nombre="refrescar" tamano={18} />
              Actualizar
            </button>
          </div>
        </div>
        <p className="usuarios__ayuda">
          {gestiona
            ? 'Lo que tenés en el taller. Tocá Usé cuando gastes algo, Compré cuando repongas y Ajustar después de contar el estante.'
            : 'Lo que hay en el taller. Tocá Usé cuando gastes algo y el stock se descuenta. Para reponer o corregir, pedíselo a un admin.'}
        </p>

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
            Buscar un insumo por nombre o categoría
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
              placeholder="Buscar por nombre o categoría"
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

        <nav className="filtros" aria-label="Filtrar el inventario">
          <ul role="list">
            <li>
              <button
                type="button"
                className={!bajoStock ? 'filtro seleccionado' : 'filtro'}
                aria-pressed={!bajoStock}
                onClick={() => {
                  elegirBajoStock(false);
                }}
              >
                Todos
                {!bajoStock && <SubrayadoFilete className="filtro__trazo" />}
              </button>
            </li>
            <li>
              <button
                type="button"
                className={bajoStock ? 'filtro seleccionado' : 'filtro'}
                aria-pressed={bajoStock}
                onClick={() => {
                  elegirBajoStock(true);
                }}
              >
                Stock bajo
                {cantidadBajos !== null && cantidadBajos > 0 && (
                  <span className="filtro__cuenta">
                    {cantidadBajos}
                    <span className="visualmente-oculto"> en total</span>
                  </span>
                )}
                {bajoStock && <SubrayadoFilete className="filtro__trazo" />}
              </button>
            </li>
          </ul>
        </nav>

        {gestiona && (
          <div className="inv-mostrar">
            <label className="campo__etiqueta" htmlFor={`${id}-mostrar`}>
              Mostrar
            </label>
            <div className="desplegable">
              <select
                id={`${id}-mostrar`}
                className="entrada"
                value={activo}
                onChange={(evento) => {
                  const valor = MOSTRAR.find((m) => m.valor === evento.target.value);
                  if (valor) {
                    setActivo(valor.valor);
                    setPagina(0);
                  }
                }}
              >
                {MOSTRAR.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.texto}
                  </option>
                ))}
              </select>
              <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
            </div>
          </div>
        )}

        <div className="turnos__barra">
          <div className="panel__estado" aria-live="polite">
            {busqueda.tipo === 'corta' && <p className="panel__conteo">Escribí al menos {BUSQUEDA.min} caracteres para buscar.</p>}
            {cargando && <p className="panel__cargando">{buscado ? `Buscando ${buscado}…` : 'Cargando el inventario…'}</p>}
            {!cargando && resumen() && <p className="panel__conteo">{resumen()}</p>}
          </div>
        </div>

        {cargando && <EsqueletoInsumos />}

        {inv.error && (
          <div className="panel__error" role="alert">
            <Icono nombre="alerta" tamano={22} />
            <div>
              <p>No pudimos cargar el inventario. {inv.error}</p>
              <button type="button" className="boton boton--primario boton--chico" onClick={inv.recargar}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {datos && datos.insumos.length === 0 && (
          <div className="panel__vacio">
            {buscado ? (
              <div className="panel__vacio-busqueda">
                <p className="panel__vacio-titulo">No encontramos insumos para {buscado}</p>
                <p>Probá con otra parte del nombre o con la categoría.</p>
                <div className="panel__vacio-acciones">
                  <button type="button" className="boton boton--fantasma boton--chico" onClick={limpiar}>
                    Limpiar búsqueda
                  </button>
                </div>
              </div>
            ) : bajoStock ? (
              <div className="panel__vacio-busqueda">
                <p className="panel__vacio-titulo">No hay nada con stock bajo</p>
                <p>Todo está por encima del mínimo. Buen trabajo.</p>
                <div className="panel__vacio-acciones">
                  <button
                    type="button"
                    className="boton boton--secundario boton--chico"
                    onClick={() => {
                      elegirBajoStock(false);
                    }}
                  >
                    Ver todo el inventario
                  </button>
                </div>
              </div>
            ) : activo === 'false' ? (
              <p>No hay insumos inactivos.</p>
            ) : (
              <p>
                Todavía no cargaste ningún insumo.
                {gestiona
                  ? ' Empezá con «Nuevo insumo»: shampoo, paños, cera… y poné cuánto tenés.'
                  : ' Un admin los tiene que cargar primero.'}
              </p>
            )}
          </div>
        )}

        {datos && datos.insumos.length > 0 && (
          <ul className="turnos inv-lista" role="list" aria-label="Insumos">
            {datos.insumos.map((insumo: Insumo) => (
              <TarjetaInsumo
                key={insumo.id}
                insumo={insumo}
                gestiona={gestiona}
                ocupado={inv.ocupados.has(insumo.id)}
                error={inv.errores[insumo.id]}
                version={inv.versiones[insumo.id] ?? 0}
                alRegistrar={(cuerpo) => inv.registrar(insumo, cuerpo)}
                alEditar={() => {
                  setEdicion({ modo: 'editar', insumo });
                }}
                alCambiarActivo={() => {
                  void inv.cambiarActivo(insumo);
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
                setPagina((p) => p - 1);
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
                setPagina((p) => p + 1);
              }}
            >
              Siguientes
            </button>
          </nav>
        )}
      </section>

      {gestiona && (
        <DialogoInsumo
          dialogoRef={dialogoRef}
          edicion={edicion}
          categorias={categorias}
          alCrear={inv.crear}
          alGuardar={inv.guardar}
          alCerrar={() => {
            setEdicion(null);
          }}
        />
      )}
    </>
  );
}

export default VistaInventario;
