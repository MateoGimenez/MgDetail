import { Logo } from '../components/Logo';
import { hayUbicacion, instagramArroba, instagramUrl, whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { EnlaceSeccion } from './EnlaceSeccion';

const ANIO = new Date().getFullYear();

/** `enPagina`: se ve en otra página (la de un servicio), así que los enlaces de sección llevan a `/#sección`. */
export function Pie({ enPagina = false }: { enPagina?: boolean }) {
  const whatsapp = whatsappUrl();
  const instagram = instagramUrl();
  const arroba = instagramArroba();

  return (
    <footer className="pie">
      <div className="contenedor pie__grilla">
        <div className="pie__marca">
          <Logo tamano="grande" />
          <p className="pie__frase">Lo bueno se hace con tiempo.</p>
        </div>
        <nav className="pie__nav" aria-label="Pie de página">
          <ul role="list">
            <li>
              <EnlaceSeccion hash="#servicios" enPagina={enPagina}>Servicios</EnlaceSeccion>
            </li>
            <li>
              <EnlaceSeccion hash="#como-trabajamos" enPagina={enPagina}>Cómo trabajamos</EnlaceSeccion>
            </li>
            <li>
              <EnlaceSeccion hash="#preguntas" enPagina={enPagina}>Preguntas</EnlaceSeccion>
            </li>
            {hayUbicacion() && (
              <li>
                <EnlaceSeccion hash="#donde" enPagina={enPagina}>
                  Dónde estamos
                </EnlaceSeccion>
              </li>
            )}
            <li>
              <EnlaceSeccion hash="#reservar" enPagina={enPagina}>Reservá tu turno</EnlaceSeccion>
            </li>
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </li>
            )}
            {instagram && arroba && (
              <li>
                <a href={instagram} target="_blank" rel="noopener noreferrer">
                  Instagram {arroba}
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>
      <div className="contenedor pie__legal">
        <p>
          Usamos tus datos solo para coordinar tu turno (Ley 25.326 de Protección de Datos Personales).
        </p>
        <p>
          © {ANIO} {negocio.nombre} · {negocio.ciudad}, {negocio.pais}
        </p>
      </div>
    </footer>
  );
}
