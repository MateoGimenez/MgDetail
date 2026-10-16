import { Icono } from '../components/Icono';
import {
  direccionDelTaller,
  horariosDelTaller,
  instagramArroba,
  instagramUrl,
  mapsUrl,
  whatsappUrl,
} from '../config/enlaces';
import { negocio } from '../config/sitio';
import { useReserva } from './reserva-contexto';

export function Contacto() {
  const { reservar } = useReserva();
  const direccion = direccionDelTaller();
  const horarios = horariosDelTaller();
  const mapa = mapsUrl();
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Quiero hacer una consulta.`);
  const instagram = instagramUrl();
  const arroba = instagramArroba();

  return (
    <section id="contacto" className="seccion contacto" aria-labelledby="contacto-titulo">
      <div className="contenedor contacto__grilla">
        <div className="contacto__lugar">
          <h2 id="contacto-titulo" className="seccion__titulo">
            Dónde estamos
          </h2>
          <p className="contacto__ciudad">
            {negocio.ciudad}, {negocio.pais}
          </p>
          {direccion && (
            <p className="contacto__dato">
              <Icono nombre="ubicacion" />
              {direccion}
            </p>
          )}
          {mapa && (
            <a className="boton boton--secundario" href={mapa} target="_blank" rel="noopener noreferrer">
              <Icono nombre="externo" tamano={18} />
              Cómo llegar
            </a>
          )}
        </div>

        <div className="contacto__canales">
          {horarios.length > 0 && (
            <div className="contacto__bloque">
              <h3 className="contacto__subtitulo">
                <Icono nombre="reloj" />
                Horarios
              </h3>
              <ul className="contacto__horarios" role="list">
                {horarios.map((horario) => (
                  <li key={horario}>{horario}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="contacto__bloque">
            <h3 className="contacto__subtitulo">Hablemos</h3>
            {whatsapp || instagram ? (
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
            ) : (
              <>
                <p className="contacto__texto">
                  Dejanos tu pedido con el formulario y te contactamos para coordinar.
                </p>
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
      </div>
    </section>
  );
}
