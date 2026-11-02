import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ETIQUETA_VEHICULO, VEHICULO_TIPOS, type VehiculoTipo } from '../api/contract';
import type { ServicioPanel } from '../api/contract-panel';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { contarPorVehiculo, serviciosPara, vehiculosSin } from '../lib/precios';
import { EsqueletoServicios } from './Esqueleto';
import { DialogoQuitarVehiculo, type QuitarDe } from './DialogoQuitarVehiculo';
import { DialogoServicio, type EdicionServicio } from './DialogoServicio';
import { FilaServicio } from './FilaServicio';
import { pestanaConTecla, resumenPestana } from './pestanasVehiculo';
import { idBajar, idSubir, mensajeActivo, type Catalogo } from './useServicios';

interface Props {
  /** El catálogo lo carga Panel (Turnos también lo usa para los nombres). */
  catalogo: Catalogo;
  /** superadmin y admin (puedeEditarCatalogo); el empleado ve la lista sin controles. */
  editable: boolean;
}

const idPestana = (tipo: VehiculoTipo) => `pestana-servicios-${tipo}`;

/**
 * Catálogo de servicios por vehículo: una pestaña por tipo (Auto, Camioneta, Moto) con lo que se ofrece para ese
 * vehículo y su precio. Un mismo servicio puede estar en varias pestañas. «Quitar de [vehículo]» (con confirmación)
 * no es lo mismo que «Ocultar en la web»; el backend no elimina servicios.
 */
export function VistaServicios({ catalogo: c, editable }: Props) {
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const quitarRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tipo, setTipo] = useState<VehiculoTipo>('auto');
  const [edicion, setEdicion] = useState<EdicionServicio | null>(null);
  const [quitar, setQuitar] = useState<QuitarDe | null>(null);
  /** Servicio recién quitado de la pestaña: su fila desaparece y el foco pasa al panel, no al vacío. */
  const quitado = useRef<string | null>(null);
  /** Después de mover un servicio, el foco vuelve a su flecha (al reordenarse, el botón puede perder el foco). */
  const [foco, setFoco] = useState<{ id: string; subir: boolean } | null>(null);

  useEffect(() => {
    if (edicion && !dialogoRef.current?.open) dialogoRef.current?.showModal();
  }, [edicion]);

  useEffect(() => {
    if (quitar && !quitarRef.current?.open) quitarRef.current?.showModal();
  }, [quitar]);

  useEffect(() => {
    if (!foco || c.ordenando) return;
    const flecha = document.getElementById(foco.subir ? idSubir(foco.id) : idBajar(foco.id));
    const otra = document.getElementById(foco.subir ? idBajar(foco.id) : idSubir(foco.id));
    const usable = (el: HTMLElement | null) => el instanceof HTMLButtonElement && !el.disabled;
    (usable(flecha) ? flecha : usable(otra) ? otra : null)?.focus();
  }, [foco, c.ordenando, c.servicios]);

  const todos = c.servicios ?? [];
  const servicios = serviciosPara(todos, tipo);
  const activos = servicios.filter((s) => s.activo).length;
  const cuentas = contarPorVehiculo(todos);
  const vehiculo = ETIQUETA_VEHICULO[tipo].toLowerCase();

  useEffect(() => {
    if (quitado.current && !servicios.some((s) => s.id === quitado.current)) {
      quitado.current = null;
      panelRef.current?.focus();
    }
  }, [servicios]);

  const alTeclearPestana = (evento: KeyboardEvent<HTMLButtonElement>) => {
    const destino = pestanaConTecla(tipo, evento.key);
    if (destino === tipo) return;
    evento.preventDefault();
    setTipo(destino);
    document.getElementById(idPestana(destino))?.focus();
  };

  const mover = (servicio: ServicioPanel, delta: -1 | 1) => {
    // El vecino es el de al lado en esta pestaña: subir y bajar siempre se nota, aunque haya otros servicios en medio.
    const i = servicios.findIndex((s) => s.id === servicio.id);
    const vecino = servicios[i + delta];
    if (!vecino) return;
    setFoco({ id: servicio.id, subir: delta < 0 });
    void c.mover(servicio, delta, { id: vecino.id, tipo });
  };

  return (
    <section className="panel__vista" aria-labelledby="titulo-servicios">
      <div className="panel__encabezado">
        <h1 id="titulo-servicios" className="panel__titulo">
          Servicios
        </h1>
        <div className="usuarios__botones">
          {editable && (
            <button
              type="button"
              className="boton boton--primario boton--chico"
              disabled={c.servicios === null}
              onClick={() => {
                setEdicion({ modo: 'crear', vehiculo: tipo });
              }}
            >
              <Icono nombre="mas" tamano={18} />
              Nuevo servicio
            </button>
          )}
          <button type="button" className="boton boton--secundario boton--chico" disabled={c.cargando} onClick={c.recargar}>
            <Icono nombre="refrescar" tamano={18} />
            Actualizar
          </button>
        </div>
      </div>
      <p className="usuarios__ayuda">
        {editable
          ? 'Elegí el vehículo: cada pestaña muestra lo que se ofrece para ese vehículo, con su precio y en el orden de la web. Lo que cambies acá aparece en la web al toque.'
          : 'Elegí el vehículo para ver lo que se ofrece, con su precio y en el orden de la web. Para cambiar textos, precios u orden, pedíselo a un admin.'}
      </p>
      {editable && (
        <details className="servicios-panel__guia">
          <summary>Quitar de un vehículo u ocultar: ¿cuál uso?</summary>
          <ul role="list">
            <li>
              <strong>Quitar de {vehiculo}</strong>: deja de ofrecerse solo para ese vehículo. El servicio sigue para los
              demás.
            </li>
            <li>
              <strong>Ocultar en la web</strong>: deja de verse para todos los vehículos, sin tocar a cuáles se ofrece. Se
              puede volver a mostrar.
            </li>
            <li>Los servicios no se eliminan del todo: así no se pierden los turnos que ya los tienen.</li>
          </ul>
        </details>
      )}

      <div className="filtros" role="tablist" aria-label="Vehículo">
        <ul role="presentation">
          {VEHICULO_TIPOS.map((t) => (
            <li key={t} role="presentation">
              <button
                id={idPestana(t)}
                type="button"
                role="tab"
                className={t === tipo ? 'filtro seleccionado' : 'filtro'}
                aria-selected={t === tipo}
                aria-controls="panel-servicios"
                tabIndex={t === tipo ? 0 : -1}
                onClick={() => {
                  setTipo(t);
                }}
                onKeyDown={alTeclearPestana}
              >
                {ETIQUETA_VEHICULO[t]}
                {c.servicios && (
                  <span className="filtro__cuenta">
                    {cuentas[t]}
                    <span className="visualmente-oculto"> servicios</span>
                  </span>
                )}
                {t === tipo && <SubrayadoFilete className="filtro__trazo" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel__estado" aria-live="polite">
        {c.cargando && <p>Cargando servicios…</p>}
        {!c.cargando && c.servicios && todos.length > 0 && (
          <p className="panel__conteo">{resumenPestana(servicios.length, activos, vehiculo)}</p>
        )}
      </div>

      {c.cargando && <EsqueletoServicios />}

      {c.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar los servicios. {c.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={c.recargar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {c.errorOrden && (
        <p className="turno__error servicios-panel__error-orden" role="alert">
          <Icono nombre="alerta" tamano={18} />
          {c.errorOrden}
        </p>
      )}

      {c.servicios && (
        <div
          id="panel-servicios"
          ref={panelRef}
          role="tabpanel"
          tabIndex={-1}
          aria-labelledby={idPestana(tipo)}
          className="servicios-panel__panel"
        >
          {servicios.length === 0 && (
            <div className="panel__vacio">
              <p>
                {todos.length === 0
                  ? 'Todavía no hay servicios cargados. Mientras tanto, la web avisa que por ahora no hay turnos online.'
                  : `Todavía no hay servicios para ${vehiculo}. En la web, quien elija ${vehiculo} ve que por ahora no hay turnos online.`}
                {editable &&
                  ` Podés crear uno con «Nuevo servicio»${todos.length > 0 ? ' o sumar este vehículo desde «Editar» en otra pestaña' : ''}.`}
              </p>
            </div>
          )}

          {servicios.length > 0 && (
            <ol className="turnos servicios-panel" role="list" aria-label={`Servicios para ${vehiculo}, en el orden de la web`}>
              {servicios.map((servicio, i) => (
                <FilaServicio
                  key={servicio.id}
                  servicio={servicio}
                  vehiculo={tipo}
                  puedeQuitar={vehiculosSin(servicio, tipo) !== null}
                  puesto={i + 1}
                  total={servicios.length}
                  editable={editable}
                  ocupado={c.ocupados.has(servicio.id)}
                  ordenando={c.ordenando}
                  error={c.errores[servicio.id]}
                  alSubir={() => {
                    mover(servicio, -1);
                  }}
                  alBajar={() => {
                    mover(servicio, 1);
                  }}
                  alEditar={() => {
                    setEdicion({ modo: 'editar', servicio });
                  }}
                  alQuitar={() => {
                    setQuitar({ servicio, tipo });
                  }}
                  alCambiarDestacado={() => {
                    void c.cambiar(
                      servicio,
                      { destacado: !servicio.destacado },
                      servicio.destacado ? `${servicio.nombre} ya no está destacado.` : `${servicio.nombre} quedó destacado.`,
                    );
                  }}
                  alCambiarActivo={() => {
                    void c.cambiar(servicio, { activo: !servicio.activo }, mensajeActivo(servicio));
                  }}
                />
              ))}
            </ol>
          )}
        </div>
      )}

      {editable && (
        <DialogoQuitarVehiculo
          dialogoRef={quitarRef}
          pedido={quitar}
          alConfirmar={(pedido) => {
            const quedan = vehiculosSin(pedido.servicio, pedido.tipo);
            if (!quedan) return;
            quitado.current = pedido.servicio.id;
            void c.cambiar(
              pedido.servicio,
              { vehiculos: quedan },
              `${pedido.servicio.nombre} ya no se ofrece para ${ETIQUETA_VEHICULO[pedido.tipo].toLowerCase()}.`,
            );
          }}
          alCerrar={() => {
            setQuitar(null);
          }}
        />
      )}

      {editable && (
        <DialogoServicio
          dialogoRef={dialogoRef}
          edicion={edicion}
          alCrear={c.crear}
          alGuardar={c.guardar}
          alCerrar={() => {
            setEdicion(null);
          }}
        />
      )}
    </section>
  );
}
