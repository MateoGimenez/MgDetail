import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { esAbortado } from '../api/client';
import { ETIQUETA_FRANJA, FRANJA_EN_FRASE, type Estado, type TurnoSeguido } from '../api/contract';
import { consultarTurno } from '../api/turnos';
import { MarcoFilete, SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';
import { instagramArroba, instagramUrl, MENSAJE_CONSULTA_TURNO, whatsappUrl } from '../config/enlaces';
import { BotonWhatsapp } from '../landing/BotonWhatsapp';
import '../landing/efectos.css';
import { negocio } from '../config/sitio';
import { fechaLarga, momentoEnLaRioja } from '../lib/fechas';
import { ETIQUETA_FECHA_SEGUIMIENTO, pasosDelTurno } from '../lib/seguimiento';
import { referenciaDeTurno } from '../lib/turnos';
import './seguimiento.css';

type Consulta =
  | { fase: 'cargando' }
  | { fase: 'encontrado'; turno: TurnoSeguido }
  | { fase: 'no-existe' }
  | { fase: 'error'; mensaje: string };

const TITULO: Readonly<Record<Estado, string>> = {
  pendiente: 'Recibimos tu pedido',
  confirmado: 'Tu turno está confirmado',
  completado: 'Trabajo terminado',
  cancelado: 'Este turno se canceló',
};

function explicacion(turno: TurnoSeguido): string {
  const cuando = `el ${fechaLarga(turno.fecha)} ${FRANJA_EN_FRASE[turno.franja]}`;
  switch (turno.estado) {
    case 'pendiente':
      return 'Todavía no está confirmado: te vamos a escribir para confirmar el día y el horario.';
    case 'confirmado':
      return `Te esperamos ${cuando}. Si no podés venir, avisanos así le damos el lugar a otra persona.`;
    case 'completado':
      return '¡Gracias por elegirnos! Si algo no te quedó como esperabas, escribinos.';
    case 'cancelado':
      return 'Si querés otro turno, pedilo desde la web o escribinos y lo coordinamos.';
  }
}

/** Línea de tiempo del estado: el paso actual con aria-current; los otros dicen si ya pasaron o faltan. */
function LineaDeTiempo({ estado }: { estado: Estado }) {
  return (
    <ol role="list" className={`linea linea--${estado}`} aria-label="Cómo va tu turno">
      {pasosDelTurno(estado).map((paso) => (
        <li
          key={paso.texto}
          className={['linea__paso', paso.alcanzado ? 'linea__paso--alcanzado' : '', paso.actual ? 'linea__paso--actual' : '']
            .filter(Boolean)
            .join(' ')}
          aria-current={paso.actual ? 'step' : undefined}
        >
          <span className="linea__marca" aria-hidden="true">
            {paso.alcanzado && <Icono nombre={paso.texto === 'Cancelado' ? 'cerrar' : 'check'} tamano={16} />}
          </span>
          <span className="linea__texto">
            {paso.texto}
            <span className="visualmente-oculto">
              {paso.actual ? ' (estado actual)' : paso.alcanzado ? ' (hecho)' : ' (todavía no)'}
            </span>
          </span>
          {paso.actual && <SubrayadoFilete className="linea__trazo" />}
        </li>
      ))}
    </ol>
  );
}

function Contacto({ id }: { id: string }) {
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Te escribo por mi turno #${referenciaDeTurno(id)}.`);
  const instagram = instagramUrl();
  const arroba = instagramArroba();
  if (!whatsapp && !(instagram && arroba)) return null;
  return (
    <div className="seguimiento__contacto">
      <h2 className="seguimiento__subtitulo">¿Necesitás algo?</h2>
      <div className="seguimiento__botones">
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
    </div>
  );
}

/**
 * /turno/:id — el cliente ve cómo va su pedido sin llamar. Solo servicio, fecha y franja de agenda, estado y cuándo
 * se actualizó: nunca datos personales. noindex. Carga, error con reintento y "No encontramos ese turno".
 */
export default function PaginaSeguimiento() {
  const { id = '' } = useParams();
  const [consulta, setConsulta] = useState<Consulta>({ fase: 'cargando' });
  const [intento, setIntento] = useState(0);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const anterior = document.title;
    document.title = `Tu turno · ${negocio.nombre}`;
    return () => {
      document.title = anterior;
    };
  }, []);

  useEffect(() => {
    const control = new AbortController();
    consultarTurno(id, control.signal)
      .then((turno) => {
        setConsulta(turno ? { fase: 'encontrado', turno } : { fase: 'no-existe' });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        setConsulta({
          fase: 'error',
          mensaje: error instanceof Error ? error.message : 'No pudimos consultar tu turno. Probá de nuevo.',
        });
      });
    return () => {
      control.abort();
    };
  }, [id, intento]);

  // Al terminar de cargar, el foco va al título: el lector de pantalla arranca por lo importante.
  useEffect(() => {
    if (consulta.fase !== 'cargando') tituloRef.current?.focus();
  }, [consulta.fase]);

  const reintentar = () => {
    setConsulta({ fase: 'cargando' });
    setIntento((n) => n + 1);
  };

  return (
    <div className="seguimiento">
      <meta name="robots" content="noindex, nofollow" />
      <header className="seguimiento__cabecera">
        <Link to="/" className="seguimiento__logo" aria-label={`${negocio.nombre}: ir al inicio`}>
          <Logo tamano="chico" />
        </Link>
      </header>

      <main className="seguimiento__principal">
        {consulta.fase === 'cargando' && (
          <div className="seguimiento__tarjeta seguimiento__tarjeta--cargando">
            <p className="seguimiento__cargando" role="status">
              Buscando tu turno…
            </p>
            <div className="seguimiento__esqueleto" aria-hidden="true" />
          </div>
        )}

        {consulta.fase === 'no-existe' && (
          <div className="seguimiento__tarjeta seguimiento__tarjeta--aviso">
            <h1 ref={tituloRef} tabIndex={-1} className="seguimiento__titulo">
              No encontramos ese turno
            </h1>
            <p className="seguimiento__texto">
              Revisá que el enlace esté completo, tal como te llegó. Si lo copiaste a mano, puede que le falte una
              parte.
            </p>
            <div className="seguimiento__botones">
              {/* Carga completa: el navegador baja solo hasta el formulario. */}
              <a className="boton boton--primario" href="/#reservar">
                Pedir un turno
              </a>
            </div>
          </div>
        )}

        {consulta.fase === 'error' && (
          <div className="seguimiento__tarjeta seguimiento__tarjeta--aviso" role="alert">
            <h1 ref={tituloRef} tabIndex={-1} className="seguimiento__titulo">
              No pudimos consultar tu turno
            </h1>
            <p className="seguimiento__texto">{consulta.mensaje}</p>
            <div className="seguimiento__botones">
              <button type="button" className="boton boton--primario" onClick={reintentar}>
                <Icono nombre="refrescar" tamano={18} />
                Reintentar
              </button>
            </div>
          </div>
        )}

        {consulta.fase === 'encontrado' && (
          <article className={`seguimiento__tarjeta seguimiento__tarjeta--${consulta.turno.estado}`} aria-labelledby="seguimiento-titulo">
            <MarcoFilete tamano="chico" trazar={consulta.turno.estado === 'confirmado'} />
            <div className="seguimiento__contenido">
              <p className="seguimiento__ref">Solicitud #{referenciaDeTurno(consulta.turno.id)}</p>
              <h1 id="seguimiento-titulo" ref={tituloRef} tabIndex={-1} className="seguimiento__titulo">
                {TITULO[consulta.turno.estado]}
              </h1>
              <LineaDeTiempo estado={consulta.turno.estado} />
              <p className="seguimiento__texto">{explicacion(consulta.turno)}</p>

              <dl className="seguimiento__datos">
                <div>
                  <dt>Servicio</dt>
                  <dd>{consulta.turno.servicioNombre}</dd>
                </div>
                <div>
                  <dt>{ETIQUETA_FECHA_SEGUIMIENTO[consulta.turno.estado]}</dt>
                  <dd>{fechaLarga(consulta.turno.fecha)}</dd>
                </div>
                <div>
                  <dt>Horario</dt>
                  <dd>{ETIQUETA_FRANJA[consulta.turno.franja]}</dd>
                </div>
              </dl>

              <p className="seguimiento__actualizado">
                Actualizado el {momentoEnLaRioja(consulta.turno.actualizadoEl)}.{' '}
                <button type="button" className="enlace seguimiento__refrescar" onClick={reintentar}>
                  Consultar de nuevo
                </button>
              </p>

              <Contacto id={consulta.turno.id} />
            </div>
          </article>
        )}

        <p className="seguimiento__volver">
          <Link className="enlace" to="/">
            Ir a la web de {negocio.nombre}
          </Link>
        </p>
      </main>
      <BotonWhatsapp mensaje={MENSAJE_CONSULTA_TURNO} />
    </div>
  );
}
