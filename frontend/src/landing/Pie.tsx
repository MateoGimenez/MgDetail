import { Link } from 'react-router';
import { Logo } from '../components/Logo';
import { hayUbicacion, RUTA_PRIVACIDAD } from '../config/enlaces';
import { desarrollador } from '../config/desarrollador';
import { EnlaceSeccion } from './EnlaceSeccion';
import { contactoDesarrollador, redesDelNegocio, textosLegales, type EnlacePie, type IconoRed } from './pieDatos';

const ANIO = new Date().getFullYear();

const TRAZOS: Record<IconoRed, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M3.5 20.5l1.3-4.4A8.5 8.5 0 1 1 8 19.3l-4.5 1.2z" />
      <path d="M9 8.5c0 3.2 3.3 6.5 6.5 6.5l1-1.6-2-1-.9.8c-1-.4-1.9-1.3-2.3-2.3l.8-.9-1-2L9 8.5z" />
    </>
  ),
  correo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
};

function Icono({ nombre }: { nombre: IconoRed }) {
  return (
    <svg
      className="pie__icono"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}

function BotonRed({ enlace }: { enlace: EnlacePie }) {
  return (
    <a
      className="pie__red"
      href={enlace.href}
      aria-label={enlace.etiqueta}
      {...(enlace.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <Icono nombre={enlace.icono} />
    </a>
  );
}

/** `enPagina`: se ve en otra página (la de un servicio), así que los enlaces de sección llevan a `/#sección`. */
export function Pie({ enPagina = false }: { enPagina?: boolean }) {
  const redes = redesDelNegocio();
  const contacto = contactoDesarrollador();
  const legales = textosLegales(ANIO);

  return (
    <footer className="pie">
      <div className="contenedor pie__grilla">
        <div className="pie__marca">
          <Logo tamano="grande" />
          <p className="pie__frase">Lo bueno se hace con tiempo.</p>
          {redes.length > 0 && (
            <ul className="pie__redes" role="list" aria-label="Redes de MgDetailing">
              {redes.map((r) => (
                <li key={r.icono}>
                  <BotonRed enlace={r} />
                </li>
              ))}
            </ul>
          )}
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
          </ul>
        </nav>
      </div>

      <div className="contenedor pie__legal">
        <p>
          {legales.negocio} {legales.ubicacion}.
        </p>
        <p>{legales.desarrollo}</p>
        <p>{legales.terceros}</p>
        <p>
          Usamos tus datos solo para coordinar tu turno (Ley 25.326 de Protección de Datos Personales).{' '}
          <Link className="enlace-privacidad" to={RUTA_PRIVACIDAD}>
            Política de privacidad
          </Link>
        </p>
      </div>

      <div className="pie__dev">
        <div className="contenedor pie__dev-fila">
          <p className="pie__dev-texto">
            Sitio web desarrollado por <strong>{desarrollador.nombre}</strong> (@{desarrollador.instagram})
          </p>
          <ul className="pie__redes" role="list" aria-label={`Contacto de ${desarrollador.nombre}`}>
            {contacto.map((c) => (
              <li key={c.icono}>
                <BotonRed enlace={c} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
