import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { obtenerEstadisticas } from '../../api/estadisticas';
import { Icono } from '../../components/Icono';
import { hoyEnLaRioja } from '../../lib/fechas';
import { etiquetaDelMes, mesDeFecha, rangoDelMes, sumarMeses } from '../../lib/finanzas';
import type { PropsSeccion } from '../secciones';
import { NavegacionMes } from './NavegacionMes';
import { PestanaGastos } from './PestanaGastos';
import { PestanaMetas } from './PestanaMetas';
import { ResumenDelMes } from './ResumenDelMes';
import { useCarga } from './useCarga';
import './finanzas.css';

const PESTANAS = [
  { clave: 'gastos', texto: 'Gastos' },
  { clave: 'metas', texto: 'Metas' },
] as const;
type Pestana = (typeof PESTANAS)[number]['clave'];

/**
 * Finanzas (admin y superadmin): arriba el resumen del mes (ingresos, gastos, ganancia neta y margen) con navegación
 * de mes, y dos pestañas: Gastos (lista, filtros, alta, edición y baja) y Metas (la del mes con su ritmo, y el
 * historial). Se descarga aparte (React.lazy desde el registro de secciones).
 */
export default function VistaFinanzas({ alVencerSesion, abrirCon }: PropsSeccion) {
  const id = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const [hoy] = useState(() => hoyEnLaRioja(new Date()));
  const mesActual = mesDeFecha(hoy);
  const [mes, setMes] = useState(mesActual);
  const [pestana, setPestana] = useState<Pestana>(abrirCon === 'metas' ? 'metas' : 'gastos');
  // "Actualizar" vuelve a pedir lo de la pestaña; los cambios de gastos recalculan solo el resumen.
  const [version, setVersion] = useState(0);

  const futuro = mes > mesActual;
  const rango = rangoDelMes(mes, hoy);
  const resumen = useCarga(obtenerEstadisticas, rango, `resumen|${rango.desde}|${rango.hasta}|${String(version)}`, alVencerSesion, !futuro);
  const nombreMes = etiquetaDelMes(mes);
  const mesMaximo = pestana === 'metas' ? sumarMeses(mesActual, 12) : mesActual;

  const elegirPestana = (clave: Pestana) => {
    // Los gastos son hasta hoy: si se estaba mirando un mes futuro (solo se llega desde Metas), se vuelve al actual.
    if (clave === 'gastos' && mes > mesActual) setMes(mesActual);
    setPestana(clave);
  };

  const alTeclear = (evento: KeyboardEvent<HTMLButtonElement>) => {
    const i = PESTANAS.findIndex((p) => p.clave === pestana);
    let destino = i;
    if (evento.key === 'ArrowRight') destino = (i + 1) % PESTANAS.length;
    else if (evento.key === 'ArrowLeft') destino = (i - 1 + PESTANAS.length) % PESTANAS.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = PESTANAS.length - 1;
    else return;
    evento.preventDefault();
    const siguiente = PESTANAS[destino];
    if (!siguiente) return;
    elegirPestana(siguiente.clave);
    document.getElementById(`${id}-tab-${siguiente.clave}`)?.focus();
  };

  const actualizar = () => {
    setVersion((n) => n + 1);
  };

  return (
    <section className="panel__vista fin" aria-labelledby="titulo-finanzas">
      <div className="panel__encabezado">
        <h1 id="titulo-finanzas" ref={tituloRef} className="panel__titulo" tabIndex={-1}>
          Finanzas
        </h1>
        <button type="button" className="boton boton--secundario boton--chico" disabled={resumen.cargando} onClick={actualizar}>
          <Icono nombre="refrescar" tamano={18} />
          Actualizar
        </button>
      </div>
      <p className="usuarios__ayuda">
        Lo que entra, lo que sale y lo que te queda cada mes. Los ingresos son lo cobrado en los trabajos completados; los gastos, lo que cargues acá o
        compres en Inventario.
      </p>

      <NavegacionMes mes={mes} mesActual={mesActual} mesMaximo={mesMaximo} alCambiar={setMes} />

      {futuro ? (
        <p className="fin-resumen fin-resumen--futuro">
          {nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} todavía no empezó: no hay ingresos ni gastos para mostrar. Podés dejar fijada la meta.
        </p>
      ) : (
        <ResumenDelMes
          periodo={resumen.datos?.periodo ?? null}
          cargando={resumen.cargando}
          error={resumen.error}
          alReintentar={resumen.recargar}
          nombreDelMes={nombreMes}
        />
      )}

      <div className="fin-pestanas" role="tablist" aria-label="Qué querés ver">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            id={`${id}-tab-${p.clave}`}
            type="button"
            role="tab"
            className="fin-pestana"
            aria-selected={pestana === p.clave}
            aria-controls={`${id}-panel-${p.clave}`}
            tabIndex={pestana === p.clave ? 0 : -1}
            onKeyDown={alTeclear}
            onClick={() => {
              elegirPestana(p.clave);
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {pestana === 'gastos' ? (
        <div id={`${id}-panel-gastos`} role="tabpanel" aria-labelledby={`${id}-tab-gastos`}>
          <PestanaGastos mes={mes} hoy={hoy} alVencerSesion={alVencerSesion} alCambiarGastos={resumen.recargar} version={version} />
        </div>
      ) : (
        <div id={`${id}-panel-metas`} role="tabpanel" aria-labelledby={`${id}-tab-metas`}>
          <PestanaMetas
            mes={mes}
            mesActual={mesActual}
            hoy={hoy}
            alVencerSesion={alVencerSesion}
            alCambiarMes={setMes}
            version={version}
          />
        </div>
      )}
    </section>
  );
}
