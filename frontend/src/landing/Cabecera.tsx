import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';
import { hayUbicacion } from '../config/enlaces';
import { BotonTema } from '../tema/BotonTema';
import { sincronizarTema } from '../tema/tema';
import { EnlaceSeccion } from './EnlaceSeccion';
import { useReserva } from './reserva-contexto';
import { useDesplazado } from './useDesplazado';
import { useSeccionActiva } from './useSeccionActiva';

const SECCIONES = [
  { id: 'servicios', texto: 'Servicios' },
  { id: 'como-trabajamos', texto: 'Cómo trabajamos' },
  { id: 'trabajos', texto: 'Trabajos' },
  { id: 'preguntas', texto: 'Preguntas' },
  { id: 'donde', texto: 'Dónde estamos' },
  { id: 'contacto', texto: 'Contacto' },
] as const;

/**
 * La barra fija. En la landing marca (scrollspy) la sección que se está viendo; en otra página (`enPagina`, la de un
 * servicio) sus enlaces llevan a `/#sección` y no hay ninguna marcada. `servicioId` hace que "Reservá" abra el
 * formulario con ese servicio elegido.
 */
export function Cabecera({ enPagina = false, servicioId }: { enPagina?: boolean; servicioId?: string }) {
  const [abierto, setAbierto] = useState(false);
  const botonMenuRef = useRef<HTMLButtonElement>(null);
  const { reservar } = useReserva();
  const desplazado = useDesplazado(8);

  // "Dónde estamos" solo existe si hay dirección, horarios o mapa cargados (la sección no se emite sin datos).
  const secciones = SECCIONES.filter((seccion) => seccion.id !== 'donde' || hayUbicacion());
  const { activa, activarYa } = useSeccionActiva(enPagina ? [] : secciones.map((seccion) => seccion.id));

  // Si se llegó desde /admin sin recargar, el script inicial no aplicó el tema guardado.
  useEffect(() => {
    sincronizarTema();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAbierto(false);
        botonMenuRef.current?.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const irAReservar = (evento: MouseEvent<HTMLAnchorElement>) => {
    evento.preventDefault();
    setAbierto(false);
    reservar();
  };

  const enlaces = (alElegir?: () => void) =>
    secciones.map((seccion) => (
      <li key={seccion.id}>
        <EnlaceSeccion
          hash={`#${seccion.id}`}
          enPagina={enPagina}
          aria-current={activa === seccion.id ? 'location' : undefined}
          onClick={() => {
            if (!enPagina) activarYa(seccion.id);
            alElegir?.();
          }}
        >
          {seccion.texto}
          {alElegir && <Icono nombre="flecha" tamano={18} />}
        </EnlaceSeccion>
      </li>
    ));

  const reservarEnlace = servicioId ? `/?servicio=${encodeURIComponent(servicioId)}#reservar` : '/#reservar';

  return (
    <header className="cabecera" data-desplazado={desplazado}>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <div className="cabecera__barra contenedor">
        {enPagina ? (
          <Link className="cabecera__marca" to="/" aria-label="MgDetailing, ir al inicio">
            <Logo />
          </Link>
        ) : (
          <a className="cabecera__marca" href="#inicio" aria-label="MgDetailing, volver al inicio">
            <Logo />
          </a>
        )}

        <nav className="cabecera__nav" aria-label="Secciones">
          <ul role="list">{enlaces()}</ul>
        </nav>

        <BotonTema variante="cabecera" />

        {enPagina ? (
          <Link className="boton boton--primario boton--chico cabecera__cta" to={reservarEnlace}>
            Reservá<span className="cabecera__cta-resto"> tu turno</span>
          </Link>
        ) : (
          <a className="boton boton--primario boton--chico cabecera__cta" href="#reservar" onClick={irAReservar}>
            Reservá<span className="cabecera__cta-resto"> tu turno</span>
          </a>
        )}

        <button
          ref={botonMenuRef}
          type="button"
          className="cabecera__menu"
          aria-expanded={abierto}
          aria-controls="menu-movil"
          onClick={() => {
            setAbierto((valor) => !valor);
          }}
        >
          <Icono nombre={abierto ? 'cerrar' : 'menu'} tamano={22} />
          <span className="visualmente-oculto">{abierto ? 'Cerrar menú' : 'Abrir menú'}</span>
        </button>
      </div>

      <nav id="menu-movil" className="menu-movil" aria-label="Secciones" hidden={!abierto}>
        <ul role="list" className="contenedor">
          {enlaces(() => {
            setAbierto(false);
          })}
        </ul>
        <div className="contenedor menu-movil__tema">
          <BotonTema variante="menu" />
        </div>
      </nav>
    </header>
  );
}
