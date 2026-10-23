import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BUSQUEDA, ETIQUETA_ESTADO, MENSAJE_BUSQUEDA, type Turno } from '../api/contract';
import { type Rol } from '../api/contract-panel';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { ESPERA_BUSQUEDA_MS, consultaDe, interpretarBusqueda } from '../lib/busqueda';
import { DialogoEliminar } from './DialogoEliminar';
import { DialogoHistorial } from './DialogoHistorial';
import { ErrorCampo } from './ErroresFormulario';
import { TarjetaTurno } from './TarjetaTurno';
import { POR_PAGINA, esNueva, useTurnos, type Filtro } from './useTurnos';

const FILTROS: readonly { valor: Filtro; texto: string }[] = [
  { valor: 'pendiente', texto: 'Pendientes' },
  { valor: 'confirmado', texto: 'Confirmadas' },
  { valor: 'completado', texto: 'Completadas' },
  { valor: 'cancelado', texto: 'Canceladas' },
  { valor: 'todas', texto: 'Todas' },
];

const VACIO_POR_FILTRO: Readonly<Record<Filtro, string>> = {
  pendiente: 'No hay solicitudes pendientes. Cuando alguien pida un turno desde la web, aparece acá.',
  confirmado: 'No hay turnos confirmados.',
  completado: 'Todavía no hay turnos completados.',
  cancelado: 'No hay solicitudes canceladas.',
  todas: 'Todavía no llegó ninguna solicitud. Cuando alguien pida un turno desde la web, aparece acá.',
};

interface Props {
  rol: Rol;
  /** Nombre legible de un servicio (catálogo del panel, respaldo o el id tal cual). */
  nombreServicio: (id: string) => string;
  alVencerSesion: (mensaje: string) => void;
}

/**
 * Lo que se escribe pasa a la búsqueda después de una pausa breve (no un pedido por tecla). `aplicar` lo pasa ya,
 * para Enter y para Limpiar.
 */
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

/** Solicitudes de turno: buscador, pestañas por estado, tarjetas y paginación. */
export function VistaTurnos({ rol, nombreServicio, alVencerSesion }: Props) {
  const id = useId();
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
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

  const [aEliminar, setAEliminar] = useState<Turno | null>(null);
  const [historialDe, setHistorialDe] = useState<Turno | null>(null);
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const historialRef = useRef<HTMLDialogElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const t = useTurnos(filtro, pagina, q, alVencerSesion);
  const { datos, cargando } = t;

  const eliminar = async (turno: Turno) => {
    const problema = await t.eliminar(turno);
    if (!problema && datos && datos.turnos.length === 1 && pagina > 0) setPagina((p) => p - 1);
    return problema;
  };

  const limpiar = () => {
    setTexto('');
    aplicar('');
    campoRef.current?.focus();
  };

  const alTeclear = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Escape' && texto !== '') {
      // Dentro del panel no hay un diálogo abierto: Escape solo limpia.
      evento.preventDefault();
      limpiar();
    }
  };

  const textoFiltro = FILTROS.find((x) => x.valor === filtro)?.texto.toLowerCase() ?? '';
  const enFiltro = datos ? datos.turnos.filter((x) => filtro === 'todas' || x.estado === filtro).length : 0;
  const desde = datos && datos.total > 0 ? pagina * POR_PAGINA + 1 : 0;
  const hasta = desde > 0 ? desde - 1 + enFiltro : 0;
  const hayAnterior = pagina > 0;
  const haySiguiente = datos ? (pagina + 1) * POR_PAGINA < datos.total : false;
  const buscado = q === undefined ? null : `«${q}»`;
  const errorBusqueda = t.errorBusqueda ?? (busqueda.tipo === 'larga' ? MENSAJE_BUSQUEDA : null);

  const conteo = () => {
    if (!datos || datos.total === 0) return null;
    const cuantas =
      datos.total === 1
        ? buscado
          ? '1 solicitud'
          : 'Mostrando 1 solicitud'
        : `Mostrando ${String(desde)}–${String(hasta)} de ${String(datos.total)} solicitudes`;
    return `${cuantas}${buscado ? ` para ${buscado}` : ''}${filtro !== 'todas' ? ` · ${textoFiltro}` : ''}`;
  };

  return (
    <>
      <section className="panel__vista" aria-labelledby="titulo-turnos">
        <div className="panel__encabezado">
          <h1 id="titulo-turnos" ref={tituloRef} className="panel__titulo" tabIndex={-1}>
            Solicitudes de turno
          </h1>
          <button type="button" className="boton boton--secundario boton--chico" disabled={cargando} onClick={t.recargar}>
            <Icono nombre="refrescar" tamano={18} />
            Actualizar
          </button>
        </div>

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
            Buscar por nombre, teléfono o vehículo
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
              placeholder="Buscar por nombre, teléfono o vehículo"
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
            {FILTROS.map((x) => (
              <li key={x.valor}>
                <button
                  type="button"
                  className={x.valor === filtro ? 'filtro seleccionado' : 'filtro'}
                  aria-pressed={x.valor === filtro}
                  onClick={() => {
                    setFiltro(x.valor);
                    setPagina(0);
                  }}
                >
                  {x.texto}
                  {x.valor === 'pendiente' && t.pendientes !== null && (
                    <span className="filtro__cuenta">
                      {t.pendientes}
                      <span className="visualmente-oculto"> en total</span>
                    </span>
                  )}
                  {x.valor === filtro && <SubrayadoFilete className="filtro__trazo" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="panel__estado" aria-live="polite">
          {busqueda.tipo === 'corta' && (
            <p className="panel__conteo">Escribí al menos {BUSQUEDA.min} caracteres para buscar.</p>
          )}
          {cargando && <p className="panel__cargando">{buscado ? `Buscando ${buscado}…` : 'Cargando solicitudes…'}</p>}
          {!cargando && conteo() && <p className="panel__conteo">{conteo()}</p>}
          {!cargando && buscado && datos?.total === 0 && (
            <p className="visualmente-oculto">No encontramos turnos para {buscado}</p>
          )}
        </div>

        {cargando && (
          <div className="turnos" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div key={n} className="turno turno--esqueleto" />
            ))}
          </div>
        )}

        {t.error && (
          <div className="panel__error" role="alert">
            <Icono nombre="alerta" tamano={22} />
            <div>
              <p>No pudimos cargar las solicitudes. {t.error}</p>
              <button type="button" className="boton boton--primario boton--chico" onClick={t.recargar}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {datos && datos.turnos.length === 0 && (
          <div className="panel__vacio">
            {buscado ? (
              <div className="panel__vacio-busqueda">
                <p className="panel__vacio-titulo">No encontramos turnos para {buscado}</p>
                <p>
                  {filtro === 'todas'
                    ? 'Probá con otra parte del nombre, el teléfono o el modelo del vehículo.'
                    : `Buscamos solo en ${textoFiltro}.`}
                </p>
                <div className="panel__vacio-acciones">
                  {filtro !== 'todas' && (
                    <button
                      type="button"
                      className="boton boton--secundario boton--chico"
                      onClick={() => {
                        setFiltro('todas');
                        setPagina(0);
                      }}
                    >
                      Buscar en todas
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

        {datos && datos.turnos.length > 0 && (
          <div className="turnos">
            {datos.turnos.map((turno) => (
              <TarjetaTurno
                key={turno.id}
                turno={turno}
                rol={rol}
                nombreServicio={nombreServicio(turno.servicioId)}
                nueva={esNueva(turno)}
                cambiada={t.cambiadas.has(turno.id)}
                aviso={
                  filtro !== 'todas' && turno.estado !== filtro
                    ? `Pasó a ${ETIQUETA_ESTADO[turno.estado]}. Sale de esta lista al actualizar.`
                    : null
                }
                ocupada={t.ocupadas.has(turno.id)}
                error={t.erroresPorTurno[turno.id]}
                alCambiar={(cambios) => t.cambiar(turno, cambios)}
                alEliminar={() => {
                  setAEliminar(turno);
                  dialogoRef.current?.showModal();
                }}
                alVerHistorial={() => {
                  setHistorialDe(turno);
                  historialRef.current?.showModal();
                }}
              />
            ))}
          </div>
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

      <DialogoEliminar
        dialogoRef={dialogoRef}
        turno={aEliminar}
        alConfirmar={eliminar}
        alCerrar={() => {
          setAEliminar(null);
        }}
      />

      <DialogoHistorial
        dialogoRef={historialRef}
        origen={historialDe}
        nombreServicio={nombreServicio}
        alVencerSesion={alVencerSesion}
        respaldoFoco={tituloRef}
        alCerrar={() => {
          setHistorialDe(null);
        }}
      />
    </>
  );
}
