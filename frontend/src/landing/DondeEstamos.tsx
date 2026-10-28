import { useEffect, useState } from 'react';
import { MarcoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { direccionDelTaller, hayUbicacion, horariosDelTaller, mapaEmbedUrl, mapsUrl } from '../config/enlaces';
import { negocio, sitio } from '../config/sitio';
import { estadoDeApertura } from '../lib/horarioTaller';
import { CabeceraSeccion } from './CabeceraSeccion';
import { revelar } from './useRevelar';

/** Cada cuánto se vuelve a mirar la hora para actualizar "Abierto ahora" (si la pestaña queda abierta). */
const REFRESCO = 60_000;

function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setAhora(new Date());
    }, REFRESCO);
    return () => {
      window.clearInterval(intervalo);
    };
  }, []);
  return ahora;
}

function ComoLlegar({ url }: { url: string }) {
  return (
    <a className="boton boton--secundario" href={url} target="_blank" rel="noopener noreferrer">
      <Icono nombre="externo" tamano={18} />
      Cómo llegar
      <span className="visualmente-oculto"> (se abre en Google Maps)</span>
    </a>
  );
}

/**
 * "Dónde estamos": dirección, horarios, el estado "Abierto ahora" (hora de La Rioja, solo si `horariosSemana` está
 * cargado) y el mapa. El mapa embebido NO se pide hasta que la persona toca "Ver el mapa acá": no se le manda nada a
 * Google antes de que lo quiera y la página carga más rápido. Sin `mapaEmbedUrl`, queda la tarjeta con la dirección y
 * "Cómo llegar". Sin dirección, horarios ni enlace de Maps, la sección no existe.
 */
export function DondeEstamos() {
  const ahora = useAhora();
  const [mapaAbierto, setMapaAbierto] = useState(false);
  if (!hayUbicacion()) return null;

  const direccion = direccionDelTaller();
  const horarios = horariosDelTaller();
  const maps = mapsUrl();
  const embed = mapaEmbedUrl();
  const estado = sitio.horariosSemana ? estadoDeApertura(ahora, sitio.horariosSemana) : null;
  const hayTarjeta = embed !== null || direccion !== null || maps !== null;

  return (
    <section id="donde" className="seccion donde" aria-labelledby="donde-titulo">
      <div className="contenedor">
        <CabeceraSeccion id="donde-titulo" titulo="Dónde estamos" />
        <div className={hayTarjeta ? 'donde__grilla' : 'donde__grilla donde__grilla--sola'}>
          <div ref={revelar} className="donde__info revelar revelar--sutil">
            <p className="donde__ciudad">
              {negocio.ciudad}, {negocio.pais}
            </p>
            {estado && (
              <p className={`donde__estado donde__estado--${estado.abierto ? 'abierto' : 'cerrado'}`}>
                <span className="donde__punto" aria-hidden="true" />
                <span>
                  <strong>{estado.titulo}</strong> · {estado.detalle}
                </span>
              </p>
            )}
            {direccion && embed && (
              <p className="donde__dato">
                <Icono nombre="ubicacion" />
                {direccion}
              </p>
            )}
            {horarios.length > 0 && (
              <div className="donde__horarios">
                <h3 className="donde__subtitulo">
                  <Icono nombre="reloj" />
                  Horarios
                </h3>
                <ul role="list">
                  {horarios.map((horario) => (
                    <li key={horario}>{horario}</li>
                  ))}
                </ul>
              </div>
            )}
            {maps && embed && <ComoLlegar url={maps} />}
          </div>

          {hayTarjeta && (
            <div ref={revelar} className="donde__mapa revelar revelar--sutil">
              {embed && mapaAbierto ? (
                <iframe
                  className="donde__iframe"
                  title={`Mapa con la ubicación de ${negocio.nombre}`}
                  src={embed}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  allowFullScreen
                />
              ) : (
                <div className="donde__tarjeta">
                  <MarcoFilete tamano="chico" />
                  <div className="donde__tarjeta-cuerpo">
                    <Icono nombre="ubicacion" tamano={36} className="donde__pin" />
                    {direccion && !embed && <p className="donde__direccion">{direccion}</p>}
                    <div className="donde__acciones">
                      {embed && (
                        <button
                          type="button"
                          className="boton boton--primario"
                          onClick={() => {
                            setMapaAbierto(true);
                          }}
                        >
                          Ver el mapa acá
                        </button>
                      )}
                      {maps && !embed && <ComoLlegar url={maps} />}
                    </div>
                    {embed && <p className="donde__aviso">Se carga recién cuando lo tocás.</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
