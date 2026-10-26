import { MarcoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { instagramArroba, instagramUrl } from '../config/enlaces';
import { antesDespues, fotos } from '../data/galeria';
import { CabeceraSeccion } from './CabeceraSeccion';
import { Comparador } from './Comparador';
import { Galeria } from './Galeria';
import { revelar } from './useRevelar';

function TrabajosVacio() {
  const instagram = instagramUrl();
  const arroba = instagramArroba();
  return (
    <div className="vacio">
      <div className="vacio__marco vacio__marco--principal">
        <MarcoFilete tamano="mediano" />
        <div className="vacio__contenido">
          <p className="vacio__titulo">Fotos reales muy pronto</p>
          <p className="vacio__texto">
            Cada trabajo que hagamos va a estar acá, con su antes y su después. Nada de fotos de internet: solo
            vehículos que pasaron por el taller.
          </p>
          {instagram && arroba && (
            <a className="boton boton--secundario" href={instagram} target="_blank" rel="noopener noreferrer">
              <Icono nombre="instagram" />
              Mientras tanto, seguinos en {arroba}
            </a>
          )}
        </div>
      </div>
      <div className="vacio__marco vacio__marco--chico" aria-hidden="true">
        <span className="vacio__rotulo">Antes</span>
      </div>
      <div className="vacio__marco vacio__marco--chico" aria-hidden="true">
        <span className="vacio__rotulo">Después</span>
      </div>
    </div>
  );
}

export function Trabajos() {
  const hayFotos = fotos.length > 0 || antesDespues.length > 0;
  return (
    <section id="trabajos" className="seccion trabajos" aria-labelledby="trabajos-titulo">
      <div className="contenedor">
        <CabeceraSeccion id="trabajos-titulo" titulo="Trabajos reales">
          <p className="seccion__bajada">
            {hayFotos
              ? 'Antes y después de vehículos que pasaron por el taller. Deslizá la manija para comparar.'
              : 'Recién abrimos. Acá vas a ver fotos de nuestros trabajos, antes y después, a medida que los hagamos.'}
          </p>
        </CabeceraSeccion>
        {hayFotos ? (
          <div ref={revelar} className="trabajos__contenido revelar revelar--sutil">
            {antesDespues.length > 0 && (
              <div className="trabajos__comparadores">
                {antesDespues.map((par) => (
                  <Comparador key={`${par.antes}|${par.despues}`} par={par} />
                ))}
              </div>
            )}
            {fotos.length > 0 && <Galeria fotos={fotos} />}
          </div>
        ) : (
          <TrabajosVacio />
        )}
      </div>
    </section>
  );
}
