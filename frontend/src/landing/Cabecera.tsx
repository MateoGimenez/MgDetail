import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';
import { useReserva } from './reserva-contexto';

const SECCIONES = [
  { href: '#servicios', texto: 'Servicios' },
  { href: '#como-trabajamos', texto: 'Cómo trabajamos' },
  { href: '#trabajos', texto: 'Trabajos' },
  { href: '#preguntas', texto: 'Preguntas' },
  { href: '#contacto', texto: 'Contacto' },
] as const;

export function Cabecera() {
  const [abierto, setAbierto] = useState(false);
  const botonMenuRef = useRef<HTMLButtonElement>(null);
  const { reservar } = useReserva();

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

  return (
    <header className="cabecera">
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <div className="cabecera__barra contenedor">
        <a className="cabecera__marca" href="#inicio" aria-label="MgDetailing, volver al inicio">
          <Logo />
        </a>

        <nav className="cabecera__nav" aria-label="Secciones">
          <ul role="list">
            {SECCIONES.map((seccion) => (
              <li key={seccion.href}>
                <a href={seccion.href}>{seccion.texto}</a>
              </li>
            ))}
          </ul>
        </nav>

        <a className="boton boton--primario boton--chico cabecera__cta" href="#reservar" onClick={irAReservar}>
          Reservá<span className="cabecera__cta-resto"> tu turno</span>
        </a>

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
          {SECCIONES.map((seccion) => (
            <li key={seccion.href}>
              <a
                href={seccion.href}
                onClick={() => {
                  setAbierto(false);
                }}
              >
                {seccion.texto}
                <Icono nombre="flecha" tamano={18} />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
