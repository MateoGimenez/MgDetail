import { useEffect, useRef, useState } from 'react';
import type { ServicioPanel } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { EsqueletoServicios } from './Esqueleto';
import { DialogoServicio, type EdicionServicio } from './DialogoServicio';
import { FilaServicio } from './FilaServicio';
import { idBajar, idSubir, mensajeActivo, type Catalogo } from './useServicios';

interface Props {
  /** El catálogo lo carga Panel (Turnos también lo usa para los nombres). */
  catalogo: Catalogo;
  /** superadmin y admin (puedeEditarCatalogo); el empleado ve la lista sin controles. */
  editable: boolean;
}

/** Catálogo de servicios: lo que muestra la web, en su orden. Se edita, se ordena y se activa desde acá. */
export function VistaServicios({ catalogo: c, editable }: Props) {
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const [edicion, setEdicion] = useState<EdicionServicio | null>(null);
  /** Después de mover un servicio, el foco vuelve a su flecha (al reordenarse, el botón puede perder el foco). */
  const [foco, setFoco] = useState<{ id: string; subir: boolean } | null>(null);

  useEffect(() => {
    if (edicion && !dialogoRef.current?.open) dialogoRef.current?.showModal();
  }, [edicion]);

  useEffect(() => {
    if (!foco || c.ordenando) return;
    const flecha = document.getElementById(foco.subir ? idSubir(foco.id) : idBajar(foco.id));
    const otra = document.getElementById(foco.subir ? idBajar(foco.id) : idSubir(foco.id));
    const usable = (el: HTMLElement | null) => el instanceof HTMLButtonElement && !el.disabled;
    (usable(flecha) ? flecha : usable(otra) ? otra : null)?.focus();
  }, [foco, c.ordenando, c.servicios]);

  const servicios = c.servicios ?? [];
  const destacado = servicios.find((s) => s.destacado) ?? null;
  const activos = servicios.filter((s) => s.activo).length;

  const mover = (servicio: ServicioPanel, delta: -1 | 1) => {
    setFoco({ id: servicio.id, subir: delta < 0 });
    void c.mover(servicio, delta);
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
                setEdicion({ modo: 'crear' });
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
          ? 'Así se ven en la web, en este orden. Lo que cambies acá aparece en la web al toque. Los servicios no se borran: si dejás de ofrecer uno, desactivalo.'
          : 'Así se ven en la web, en este orden. Para cambiar textos, precios u orden, pedíselo a un admin.'}
      </p>

      <div className="panel__estado" aria-live="polite">
        {c.cargando && <p>Cargando servicios…</p>}
        {!c.cargando && c.servicios && c.servicios.length > 0 && (
          <p className="panel__conteo">
            {servicios.length === 1 ? '1 servicio' : `${String(servicios.length)} servicios`} ·{' '}
            {activos === servicios.length
              ? 'todos activos'
              : activos === 0
                ? 'ninguno activo: la web avisa que por ahora no hay turnos online'
                : `${String(activos)} ${activos === 1 ? 'activo' : 'activos'} en la web`}
          </p>
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

      {c.servicios && c.servicios.length === 0 && (
        <div className="panel__vacio">
          <p>
            Todavía no hay servicios cargados. Mientras tanto, la web avisa que por ahora no hay turnos online.
            {editable && ' Creá el primero con «Nuevo servicio».'}
          </p>
        </div>
      )}

      {servicios.length > 0 && (
        <ol className="turnos servicios-panel" role="list" aria-label="Servicios en el orden de la web">
          {servicios.map((servicio, i) => (
            <FilaServicio
              key={servicio.id}
              servicio={servicio}
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
              alCambiarDestacado={() => {
                void c.cambiar(
                  servicio,
                  { destacado: !servicio.destacado },
                  servicio.destacado ? `${servicio.nombre} ya no está destacado.` : `${servicio.nombre} quedó destacado.`,
                );
              }}
              alCambiarActivo={() => {
                void c.cambiar(
                  servicio,
                  { activo: !servicio.activo },
                  mensajeActivo(servicio),
                );
              }}
            />
          ))}
        </ol>
      )}

      {editable && (
        <DialogoServicio
          dialogoRef={dialogoRef}
          edicion={edicion}
          destacadoActual={destacado}
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
