import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { preguntasFrecuentes } from '../data/preguntas';
import { CabeceraSeccion } from './CabeceraSeccion';
import { useCatalogo } from './catalogo-contexto';
import { revelar } from './useRevelar';

export function Preguntas() {
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Tengo una consulta.`);
  const { servicios } = useCatalogo();
  const preguntas = preguntasFrecuentes({ conWhatsapp: whatsapp !== null, catalogo: servicios });

  return (
    <section id="preguntas" className="seccion preguntas" aria-labelledby="preguntas-titulo">
      <div className="contenedor preguntas__grilla">
        <CabeceraSeccion id="preguntas-titulo" titulo="Preguntas frecuentes" className="preguntas__cabecera">
          <p className="seccion__bajada">Lo que más nos preguntan sobre detailing, contestado sin vueltas.</p>
          {whatsapp ? (
            <a className="enlace preguntas__ayuda" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <Icono nombre="whatsapp" tamano={18} />
              ¿Te quedó una duda? Escribinos
            </a>
          ) : (
            <a className="enlace preguntas__ayuda" href="#reservar">
              ¿Te quedó una duda? Dejala en el formulario
            </a>
          )}
        </CabeceraSeccion>
        <div ref={revelar} className="preguntas__lista revelar revelar--sutil">
          {preguntas.map((item) => (
            <details key={item.pregunta} className="pregunta">
              <summary className="pregunta__resumen">
                <span>{item.pregunta}</span>
                <span className="pregunta__icono" aria-hidden="true" />
              </summary>
              <div className="pregunta__respuesta">
                {item.respuesta.map((parrafo) => (
                  <p key={parrafo}>{parrafo}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
