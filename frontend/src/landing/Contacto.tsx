import { Icono } from '../components/Icono';
import { instagramArroba, instagramUrl, whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { CabeceraSeccion } from './CabeceraSeccion';
import { useCatalogo } from './catalogo-contexto';
import { useReserva } from './reserva-contexto';
import { revelar } from './useRevelar';

/** Contacto: solo los canales. La dirección, los horarios y el mapa viven en "Dónde estamos" (DondeEstamos.tsx). */
export function Contacto() {
  const { reservar } = useReserva();
  const { estado } = useCatalogo();
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Quiero hacer una consulta.`);
  const instagram = instagramUrl();
  const arroba = instagramArroba();

  return (
    <section id="contacto" className="seccion contacto" aria-labelledby="contacto-titulo">
      <div className="contenedor">
        <CabeceraSeccion id="contacto-titulo" titulo="Hablemos" />
        <div ref={revelar} className="contacto__bloque revelar revelar--sutil">
          {whatsapp || instagram ? (
            <>
              <p className="contacto__texto">Si preferís charlarlo antes de reservar, escribinos.</p>
              <div className="contacto__botones">
                {whatsapp && (
                  <a className="boton boton--primario" href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <Icono nombre="whatsapp" />
                    Escribinos por WhatsApp
                  </a>
                )}
                {instagram && arroba && (
                  <a className="boton boton--secundario" href={instagram} target="_blank" rel="noopener noreferrer">
                    <Icono nombre="instagram" />
                    {arroba}
                  </a>
                )}
              </div>
            </>
          ) : estado === 'vacio' ? (
            // Sin servicios activos no hay formulario al que llevar (ver SinTurnosOnline).
            <p className="contacto__texto">Por ahora no estamos tomando turnos online.</p>
          ) : (
            <>
              <p className="contacto__texto">Dejanos tu pedido con el formulario y te contactamos para coordinar.</p>
              <button
                type="button"
                className="boton boton--primario"
                onClick={() => {
                  reservar();
                }}
              >
                Reservá tu turno
                <Icono nombre="flecha" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
