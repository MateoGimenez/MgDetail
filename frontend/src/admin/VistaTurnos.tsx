import { useRef, useState } from 'react';
import { ETIQUETA_ESTADO, type Turno } from '../api/contract';
import { type Rol } from '../api/contract-panel';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { DialogoEliminar } from './DialogoEliminar';
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

/** Solicitudes de turno: pestañas por estado, tarjetas y paginación. */
export function VistaTurnos({ rol, nombreServicio, alVencerSesion }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [pagina, setPagina] = useState(0);
  const [aEliminar, setAEliminar] = useState<Turno | null>(null);
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const t = useTurnos(filtro, pagina, alVencerSesion);
  const { datos, cargando } = t;

  const eliminar = async (turno: Turno) => {
    const problema = await t.eliminar(turno);
    if (!problema && datos && datos.turnos.length === 1 && pagina > 0) setPagina((p) => p - 1);
    return problema;
  };

  const textoFiltro = FILTROS.find((x) => x.valor === filtro)?.texto.toLowerCase() ?? '';
  const enFiltro = datos ? datos.turnos.filter((x) => filtro === 'todas' || x.estado === filtro).length : 0;
  const desde = datos && datos.total > 0 ? pagina * POR_PAGINA + 1 : 0;
  const hasta = desde > 0 ? desde - 1 + enFiltro : 0;
  const hayAnterior = pagina > 0;
  const haySiguiente = datos ? (pagina + 1) * POR_PAGINA < datos.total : false;

  return (
    <>
      <section className="panel__vista" aria-labelledby="titulo-turnos">
        <div className="panel__encabezado">
          <h1 id="titulo-turnos" className="panel__titulo">
            Solicitudes de turno
          </h1>
          <button type="button" className="boton boton--secundario boton--chico" disabled={cargando} onClick={t.recargar}>
            <Icono nombre="refrescar" tamano={18} />
            Actualizar
          </button>
        </div>

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
          {cargando && <p className="panel__cargando">Cargando solicitudes…</p>}
          {!cargando && datos && datos.total > 0 && (
            <p className="panel__conteo">
              {datos.total === 1
                ? 'Mostrando 1 solicitud'
                : `Mostrando ${String(desde)}–${String(hasta)} de ${String(datos.total)} solicitudes`}
              {filtro !== 'todas' && ` · ${textoFiltro}`}
            </p>
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
            <p>{VACIO_POR_FILTRO[filtro]}</p>
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
                salioDelFiltro={filtro !== 'todas' && turno.estado !== filtro ? ETIQUETA_ESTADO[turno.estado] : null}
                ocupada={t.ocupadas.has(turno.id)}
                error={t.erroresPorTurno[turno.id]}
                alCambiarEstado={(estado) => {
                  void t.cambiar(turno, estado);
                }}
                alEliminar={() => {
                  setAEliminar(turno);
                  dialogoRef.current?.showModal();
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
    </>
  );
}
