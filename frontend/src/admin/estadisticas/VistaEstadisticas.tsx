import { useRef, useState } from 'react';
import { obtenerEstadisticas, obtenerMisTrabajos } from '../../api/estadisticas';
import { Icono } from '../../components/Icono';
import { hoyEnLaRioja } from '../../lib/fechas';
import { resolverGranularidad, trabajos } from '../../lib/estadisticas';
import {
  PRESET_POR_DEFECTO,
  rangoPreestablecido,
  type Preset,
  type RangoFechas,
} from '../../lib/rangosEstadisticas';
import { csvEstadisticas, csvMisTrabajos, nombreArchivoCsv } from '../../lib/tablasEstadisticas';
import type { Rol } from '../../api/contract-panel';
import { puedeVerEstadisticas } from '../permisos';
import { MetaDelMes } from '../finanzas/MetaDelMes';
import { useMetaActual } from '../finanzas/useMetaActual';
import type { PropsSeccion } from '../secciones';
import { useAvisos } from '../toast/contexto';
import { descargarCsv } from './descargarCsv';
import { EsqueletoEstadisticas } from './EsqueletoEstadisticas';
import { GraficosCompletos } from './GraficosCompletos';
import { GraficosMisTrabajos } from './GraficosMisTrabajos';
import { AvisosDeCarga, ResumenDelPeriodo } from './ResumenDelPeriodo';
import { SelectorDeRango } from './SelectorDeRango';
import { TarjetasDePeriodo } from './TarjetasDePeriodo';
import { useEstadisticas } from './useEstadisticas';
import './estadisticas.css';

interface Props {
  rol: Rol;
  alVencerSesion: (mensaje: string) => void;
  irA: PropsSeccion['irA'];
}

/**
 * Estadísticas. Admin y superadmin ven todo (con importes); el empleado ve "Mis trabajos" (cantidades suyas, sin
 * plata). Se descarga aparte (React.lazy desde Panel): quien no la abre no paga el peso de los gráficos.
 */
export default function VistaEstadisticas({ rol, alVencerSesion, irA }: Props) {
  const completa = puedeVerEstadisticas(rol);
  const avisos = useAvisos();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const [hoy] = useState(() => hoyEnLaRioja(new Date()));
  const [preset, setPreset] = useState<Preset>(PRESET_POR_DEFECTO);
  const [personalizado, setPersonalizado] = useState<RangoFechas | null>(null);
  const rango = (preset === 'personalizado' ? personalizado : rangoPreestablecido(preset, hoy)) ?? {
    desde: hoy,
    hasta: hoy,
  };

  const completas = useEstadisticas(obtenerEstadisticas, rango, alVencerSesion, completa);
  const mias = useEstadisticas(obtenerMisTrabajos, rango, alVencerSesion, !completa);
  // La meta del mes la ven solo admin y superadmin (el empleado recibiría 403).
  const meta = useMetaActual(alVencerSesion, 0, completa);
  // Cada rol hace un solo pedido: el hook del otro queda inactivo.
  const estado = completa ? completas : mias;
  const elegir = (p: Preset) => {
    // "Personalizado" arranca desde lo que se está viendo: el formulario y lo que se pide dicen lo mismo.
    if (p === 'personalizado') setPersonalizado(rango);
    setPreset(p);
  };

  const bajar = () => {
    if (completa && completas.datos) {
      descargarCsv(nombreArchivoCsv('estadisticas', completas.datos.rango), csvEstadisticas(completas.datos));
    } else if (!completa && mias.datos) {
      descargarCsv(
        nombreArchivoCsv('mis-trabajos', mias.datos.rango),
        csvMisTrabajos(mias.datos, resolverGranularidad(mias.datos.rango.desde, mias.datos.rango.hasta)),
      );
    } else return;
    avisos.exito('Listo, descargamos el archivo.');
  };

  const sinDatos = completa
    ? completas.datos !== null && completas.datos.periodo.turnos === 0
    : mias.datos !== null && mias.datos.completados === 0;

  return (
    <section className="panel__vista est" aria-labelledby="titulo-estadisticas">
      <div className="panel__encabezado">
        <h1 id="titulo-estadisticas" ref={tituloRef} className="panel__titulo" tabIndex={-1}>
          {completa ? 'Estadísticas' : 'Mis trabajos'}
        </h1>
        <div className="est-acciones">
          <button type="button" className="boton boton--secundario boton--chico" disabled={estado.cargando} onClick={() => {
              estado.recargar();
              if (completa) meta.recargar();
            }}>
            <Icono nombre="refrescar" tamano={18} />
            Actualizar
          </button>
          <button type="button" className="boton boton--secundario boton--chico" disabled={estado.datos === null} onClick={bajar}>
            <Icono nombre="abajo" tamano={18} />
            Descargar CSV
          </button>
        </div>
      </div>

      <div className="panel__estado" aria-live="polite">
        {estado.cargando && <p className="panel__cargando">Cargando las estadísticas…</p>}
      </div>

      {estado.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar las estadísticas. {estado.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={estado.recargar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {estado.cargando && estado.datos === null && <EsqueletoEstadisticas completo={completa} />}

      {completa && completas.datos && (
        <div className={completas.obsoleto ? 'est-contenido est-contenido--obsoleto' : 'est-contenido'} aria-busy={completas.obsoleto}>
          <TarjetasDePeriodo resumen={completas.datos.resumen} />
          <MetaDelMes carga={meta} irA={irA} />
          <SelectorDeRango hoy={hoy} preset={preset} rango={rango} alElegir={elegir} alAplicar={(r) => { setPersonalizado(r); }} />
          <AvisosDeCarga periodo={completas.datos.periodo} completadosSinTrabajador={completas.datos.completadosSinTrabajador} irA={irA} />
          {sinDatos ? (
            <p className="est-vacio">Todavía no hay datos en este período.</p>
          ) : (
            <>
              <ResumenDelPeriodo periodo={completas.datos.periodo} />
              <GraficosCompletos datos={completas.datos} />
            </>
          )}
        </div>
      )}

      {completa && completas.datos === null && !completas.cargando && (
        // Si el pedido falló, se puede elegir otro período en vez de quedar solo con "Reintentar".
        <SelectorDeRango hoy={hoy} preset={preset} rango={rango} alElegir={elegir} alAplicar={(r) => { setPersonalizado(r); }} />
      )}

      {!completa && (
        <>
          <SelectorDeRango hoy={hoy} preset={preset} rango={rango} alElegir={elegir} alAplicar={(r) => { setPersonalizado(r); }} />
          {mias.datos && (
            <div className={mias.obsoleto ? 'est-contenido est-contenido--obsoleto' : 'est-contenido'} aria-busy={mias.obsoleto}>
              {sinDatos ? (
                <p className="est-vacio">Todavía no hay trabajos tuyos en este período.</p>
              ) : (
                <>
                  <section className="est-tarjeta" aria-label="Resumen">
                    <p className="est-kpi__valor">{trabajos(mias.datos.completados)}</p>
                    <p className="est-kpi__sub">completados por vos en este período</p>
                  </section>
                  <GraficosMisTrabajos datos={mias.datos} granularidad={resolverGranularidad(mias.datos.rango.desde, mias.datos.rango.hasta)} />
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
