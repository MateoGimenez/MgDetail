import { useId } from 'react';
import { Icono } from '../../components/Icono';
import type { PropsSeccion } from '../secciones';
import { ResumenDeMeta } from './ResumenDeMeta';
import type { useMetaActual } from './useMetaActual';
import './finanzas.css';

interface Props {
  carga: ReturnType<typeof useMetaActual>;
  /** Lleva a Finanzas, a la pestaña Metas. */
  irA: PropsSeccion['irA'];
  /** Dentro de otra tarjeta (Hoy) no lleva marco propio. */
  anidada?: boolean;
}

/**
 * "Meta del mes": barra, estado en texto y lo que falta, en versión compacta. Sin meta, invita a fijarla. Si el
 * pedido falla avisa con "Reintentar" (es un extra de la pantalla: no la rompe).
 */
export function MetaDelMes({ carga, irA, anidada = false }: Props) {
  const id = useId();
  const clase = anidada ? 'meta-del-mes meta-del-mes--anidada' : 'meta-del-mes';
  const datos = carga.datos;

  return (
    <section className={clase} aria-labelledby={`${id}-titulo`} aria-busy={carga.cargando}>
      <h3 id={`${id}-titulo`} className="meta-del-mes__titulo">
        Meta del mes
      </h3>

      {datos === null && carga.cargando && (
        <div className="meta-del-mes__esqueleto" aria-hidden="true">
          <span className="esq esq--m" />
          <span className="esq esq--completo meta-del-mes__esqueleto-barra" />
          <span className="esq esq--l" />
        </div>
      )}

      {carga.error && (
        <div className="meta-del-mes__error" role="alert">
          <p>
            <Icono nombre="alerta" tamano={18} />
            No pudimos cargar la meta. {carga.error}
          </p>
          <button type="button" className="boton boton--secundario boton--chico" onClick={carga.recargar}>
            Reintentar
          </button>
        </div>
      )}

      {datos && (
        <>
          {datos.meta ? (
            <ResumenDeMeta actual={datos} />
          ) : (
            <p className="meta-vacia">Todavía no fijaste la meta de este mes. Con una meta ves cómo venís, día a día.</p>
          )}
          <button
            type="button"
            className="boton boton--secundario boton--chico meta-del-mes__ir"
            onClick={() => {
              irA('finanzas', undefined, undefined, 'metas');
            }}
          >
            {datos.meta ? 'Ver el detalle' : 'Fijar la meta'}
            <Icono nombre="flecha" tamano={18} />
          </button>
        </>
      )}
    </section>
  );
}
