import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Rombo, SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { mensajeConsultaServicio, MENSAJE_CONSULTA_TURNO, whatsappUrl } from '../config/enlaces';
import { negocio, sitio } from '../config/sitio';
import { antesDespues, fotos } from '../data/galeria';
import { preguntasFrecuentes } from '../data/preguntas';
import { textoPrecio } from '../data/servicios';
import { seoDeServicio, seoServicioNoEncontrado } from '../lib/seoServicio';
import { BotonWhatsapp } from './BotonWhatsapp';
import { Cabecera } from './Cabecera';
import { CatalogoProvider } from './CatalogoProvider';
import { useCatalogo } from './catalogo-contexto';
import { Comparador } from './Comparador';
import { Galeria } from './Galeria';
import { Pie } from './Pie';
import { ReservaProvider } from './ReservaProvider';
import { useMagnetico } from './useMagnetico';
import { useSeo } from './useSeo';
import './landing.css';
import './servicios.css';
import './revelar.css';
import './efectos.css';
import './paginaServicio.css';

function Migas({ nombre }: { nombre: string }) {
  return (
    <nav className="migas" aria-label="Migas de pan">
      <ol role="list">
        <li>
          <Link to="/">Inicio</Link>
        </li>
        <li>
          <Link to="/#servicios">Servicios</Link>
        </li>
        <li aria-current="page">{nombre}</li>
      </ol>
    </nav>
  );
}

function OtrosServicios({ excepto }: { excepto?: string }) {
  const { servicios } = useCatalogo();
  const otros = servicios.filter((s) => s.id !== excepto);
  if (otros.length === 0) return null;
  return (
    <section className="servicio__bloque" aria-labelledby="otros-titulo">
      <h2 id="otros-titulo" className="servicio__subtitulo">
        {excepto ? 'Otros servicios' : 'Los servicios que sí hay'}
      </h2>
      <ul className="otros" role="list">
        {otros.map((s) => (
          <li key={s.id}>
            <Link className="otros__enlace" to={`/servicios/${encodeURIComponent(s.id)}`}>
              <span className="otros__nombre">{s.nombre}</span>
              <span className="otros__resumen">{s.resumen}</span>
              <Icono nombre="flecha" tamano={18} className="otros__flecha" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ServicioNoEncontrado() {
  return (
    <div className="servicio__vacio">
      <h1 className="servicio__titulo">No encontramos ese servicio</h1>
      <SubrayadoFilete className="servicio__filete" />
      <p className="servicio__resumen">
        Puede que el enlace esté mal escrito o que ese servicio ya no se ofrezca. Mirá los que sí hay o volvé al inicio.
      </p>
      <div className="servicio__acciones">
        <Link className="boton boton--primario" to="/">
          Ir al inicio
        </Link>
      </div>
      <OtrosServicios />
    </div>
  );
}

function Pagina() {
  const { id = '' } = useParams();
  const { servicios, estado, buscar } = useCatalogo();
  const servicio = buscar(id);
  const cargando = estado === 'cargando';
  const noExiste = !servicio && !cargando;

  const seo = useMemo(() => {
    if (servicio) return seoDeServicio(servicio, { sitio, negocio });
    return noExiste ? seoServicioNoEncontrado(negocio) : null;
  }, [servicio, noExiste]);
  useSeo(seo);
  useMagnetico();

  // Una página nueva arranca arriba, no donde estaba la anterior.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [id]);

  const preguntas = servicio
    ? preguntasFrecuentes({ conWhatsapp: whatsappUrl() !== null, catalogo: servicios }).filter(
        (p) => p.servicioId === servicio.id,
      )
    : [];
  const fotosDelServicio = servicio ? fotos.filter((f) => f.servicioId === servicio.id) : [];
  const paresDelServicio = servicio ? antesDespues.filter((par) => par.servicioId === servicio.id) : [];
  const consulta = servicio ? whatsappUrl(mensajeConsultaServicio(servicio.nombre)) : null;

  return (
    <div className="landing pagina-servicio">
      <div className="reflejo" aria-hidden="true" />
      <Cabecera enPagina servicioId={servicio?.id} />
      <main id="contenido" tabIndex={-1} className="contenedor servicio">
        {!servicio && cargando && (
          <p className="servicio__cargando" role="status">
            Buscando el servicio…
          </p>
        )}
        {noExiste && <ServicioNoEncontrado />}
        {servicio && (
          <>
            <Migas nombre={servicio.nombre} />
            <header className="servicio__cabeza">
              {servicio.destacado && <p className="tarjeta__sello">Recomendado por el taller</p>}
              <h1 className="servicio__titulo">{servicio.nombre}</h1>
              <SubrayadoFilete className="servicio__filete" />
              <p className="servicio__resumen">{servicio.resumen}</p>
              <dl className="tarjeta__datos servicio__datos">
                <div className="tarjeta__dato">
                  <dt>Precio</dt>
                  <dd aria-busy={cargando || undefined}>
                    {cargando ? (
                      <span className="tarjeta__precio-cargando">
                        <span className="visualmente-oculto">Cargando precio</span>
                      </span>
                    ) : (
                      textoPrecio(servicio.precioDesde)
                    )}
                  </dd>
                </div>
                <div className="tarjeta__dato">
                  <dt>Duración</dt>
                  <dd>{servicio.duracion ?? 'A confirmar'}</dd>
                </div>
              </dl>
              <div className="servicio__acciones">
                <Link
                  className="boton boton--primario boton--grande"
                  to={`/?servicio=${encodeURIComponent(servicio.id)}#reservar`}
                >
                  Reservá este servicio
                  <Icono nombre="flecha" />
                </Link>
                {consulta && (
                  <a className="boton boton--secundario boton--grande" href={consulta} target="_blank" rel="noopener noreferrer">
                    <Icono nombre="whatsapp" />
                    Consultar por WhatsApp
                  </a>
                )}
              </div>
            </header>

            <div className="servicio__cuerpo">
              <section className="servicio__bloque" aria-labelledby="servicio-de-que-se-trata">
                <h2 id="servicio-de-que-se-trata" className="servicio__subtitulo">
                  De qué se trata
                </h2>
                <p className="servicio__texto">{servicio.descripcion}</p>
              </section>

              {servicio.incluye.length > 0 && (
                <section className="servicio__bloque" aria-labelledby="servicio-incluye">
                  <h2 id="servicio-incluye" className="servicio__subtitulo">
                    Qué incluye
                  </h2>
                  <ul className="tarjeta__incluye servicio__incluye" role="list">
                    {servicio.incluye.map((item, i) => (
                      <li key={`${String(i)}-${item}`}>
                        <Rombo />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {servicio.glosario.length > 0 && (
                <section className="servicio__bloque" aria-labelledby="servicio-glosario">
                  <h2 id="servicio-glosario" className="servicio__subtitulo">
                    En palabras simples
                  </h2>
                  <dl className="glosario">
                    {servicio.glosario.map((t, i) => (
                      <div key={`${String(i)}-${t.termino}`} className="glosario__item">
                        <dt>{t.termino}:</dt> <dd>{t.significado}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>

            {preguntas.length > 0 && (
              <section className="servicio__bloque" aria-labelledby="servicio-preguntas">
                <h2 id="servicio-preguntas" className="servicio__subtitulo">
                  Preguntas sobre este servicio
                </h2>
                <div className="servicio__preguntas">
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
              </section>
            )}

            {(paresDelServicio.length > 0 || fotosDelServicio.length > 0) && (
              <section className="servicio__bloque" aria-labelledby="servicio-fotos">
                <h2 id="servicio-fotos" className="servicio__subtitulo">
                  Trabajos de este servicio
                </h2>
                <div className="trabajos__contenido">
                  {paresDelServicio.length > 0 && (
                    <div className="trabajos__comparadores">
                      {paresDelServicio.map((par) => (
                        <Comparador key={`${par.antes}|${par.despues}`} par={par} />
                      ))}
                    </div>
                  )}
                  {fotosDelServicio.length > 0 && <Galeria fotos={fotosDelServicio} />}
                </div>
              </section>
            )}

            <OtrosServicios excepto={servicio.id} />
          </>
        )}
      </main>
      <Pie enPagina />
      <BotonWhatsapp mensaje={servicio ? mensajeConsultaServicio(servicio.nombre) : MENSAJE_CONSULTA_TURNO} />
    </div>
  );
}

/** /servicios/:id — la página de un servicio, con su propio SEO y el enlace profundo de reserva. Se descarga aparte (App.tsx). */
export default function PaginaServicio() {
  return (
    <CatalogoProvider>
      <ReservaProvider>
        <Pagina />
      </ReservaProvider>
    </CatalogoProvider>
  );
}
