import { useMemo } from 'react';
import { Link } from 'react-router';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { negocio, sitio } from '../config/sitio';
import { fechaDePrivacidad, PRIVACIDAD_ACTUALIZADA, seccionesPrivacidad } from '../data/privacidad';
import { seoPrivacidad } from '../lib/seoPrivacidad';
import { BotonWhatsapp } from './BotonWhatsapp';
import { Cabecera } from './Cabecera';
import { Pie } from './Pie';
import { ReservaProvider } from './ReservaProvider';
import { useSeo } from './useSeo';
import './landing.css';
import './servicios.css';
import './revelar.css';
import './efectos.css';
import './paginaServicio.css';
import './privacidad.css';

const MENSAJE = `Hola ${negocio.nombre}, quiero consultar por mis datos personales.`;

function Pagina() {
  const seo = useMemo(() => seoPrivacidad(sitio, negocio), []);
  useSeo(seo);

  const whatsapp = whatsappUrl(MENSAJE);
  const secciones = useMemo(
    () =>
      seccionesPrivacidad({
        nombre: negocio.nombre,
        ciudad: negocio.ciudad,
        pais: negocio.pais,
        direccion: sitio.direccion,
        conWhatsapp: whatsapp !== null,
        conMapaEmbebido: (sitio.mapaEmbedUrl ?? '').trim() !== '',
      }),
    [whatsapp],
  );

  return (
    <div className="landing pagina-servicio">
      <div className="reflejo" aria-hidden="true" />
      <Cabecera enPagina />
      <main id="contenido" tabIndex={-1} className="contenedor servicio privacidad">
        <nav className="migas" aria-label="Migas de pan">
          <ol role="list">
            <li>
              <Link to="/">Inicio</Link>
            </li>
            <li aria-current="page">Política de privacidad</li>
          </ol>
        </nav>
        <header className="servicio__cabeza">
          <h1 className="servicio__titulo">Política de privacidad</h1>
          <SubrayadoFilete className="servicio__filete" />
          <p className="servicio__resumen">
            Pedimos pocos datos y los usamos solo para atender tu turno. Acá te contamos cuáles son, para qué sirven y
            cómo pedirnos que los corrijamos o los borremos.
          </p>
          <p className="privacidad__fecha">
            Última actualización:{' '}
            <time dateTime={PRIVACIDAD_ACTUALIZADA}>{fechaDePrivacidad(PRIVACIDAD_ACTUALIZADA)}</time>
          </p>
        </header>

        <div className="privacidad__cuerpo">
          {secciones.map((s) => (
            <section key={s.id} className="privacidad__seccion" aria-labelledby={`priv-${s.id}`}>
              <h2 id={`priv-${s.id}`} className="privacidad__subtitulo">
                {s.titulo}
              </h2>
              {s.parrafos.map((p) => (
                <p key={p} className="servicio__texto">
                  {p}
                </p>
              ))}
              {s.lista && (
                <ul className="privacidad__lista" role="list">
                  {s.lista.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {s.cierre?.map((p) => (
                <p key={p} className="servicio__texto">
                  {p}
                </p>
              ))}
              {s.id === 'responsable' && whatsapp && (
                <p>
                  <a className="boton boton--secundario" href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <Icono nombre="whatsapp" />
                    Escribinos por WhatsApp
                  </a>
                </p>
              )}
            </section>
          ))}
        </div>
      </main>
      <Pie enPagina />
      <BotonWhatsapp mensaje={MENSAJE} />
    </div>
  );
}

/** /privacidad: la política de privacidad. Se descarga aparte (App.tsx). */
export default function PaginaPrivacidad() {
  return (
    <ReservaProvider>
      <Pagina />
    </ReservaProvider>
  );
}
