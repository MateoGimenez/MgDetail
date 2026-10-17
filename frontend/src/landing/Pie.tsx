import { Logo } from '../components/Logo';
import { instagramArroba, instagramUrl, whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';

const ANIO = new Date().getFullYear();

export function Pie() {
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
              <a href="#servicios">Servicios</a>
            </li>
            <li>
              <a href="#como-trabajamos">Cómo trabajamos</a>
            </li>
            <li>
              <a href="#preguntas">Preguntas</a>
            </li>
            <li>
              <a href="#reservar">Reservá tu turno</a>
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
