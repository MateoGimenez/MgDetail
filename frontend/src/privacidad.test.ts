import { describe, expect, it } from 'vitest';
import { RUTA_PRIVACIDAD } from './config/enlaces';
import { negocio, sitio } from './config/sitio';
import { fechaDePrivacidad, PRIVACIDAD_ACTUALIZADA, seccionesPrivacidad } from './data/privacidad';
import { seoPrivacidad } from './lib/seoPrivacidad';

const contexto = {
  nombre: negocio.nombre,
  ciudad: negocio.ciudad,
  pais: negocio.pais,
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  conWhatsapp: true,
  conMapaEmbebido: false,
};

describe('política de privacidad', () => {
  it('la ruta es /privacidad', () => {
    expect(RUTA_PRIVACIDAD).toBe('/privacidad');
  });

  it('tiene las secciones obligatorias, con ids únicos', () => {
    const secciones = seccionesPrivacidad(contexto);
    const ids = secciones.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['responsable', 'datos', 'terceros', 'conservacion', 'derechos', 'cookies']) {
      expect(ids).toContain(id);
    }
  });

  it('nombra la Ley 25.326 y la AAIP, y no promete plazos automáticos', () => {
    const texto = JSON.stringify(seccionesPrivacidad(contexto));
    expect(texto).toContain('25.326');
    expect(texto).toContain('AAIP');
    expect(texto).toContain('no los borra solo');
  });

  it('no deja marcadores sin completar en lo que se muestra', () => {
    expect(JSON.stringify(seccionesPrivacidad(contexto))).not.toContain('[COMPLETAR]');
  });

  it('Google Maps se nombra solo si hay mapa embebido', () => {
    expect(JSON.stringify(seccionesPrivacidad(contexto))).not.toContain('Google Maps');
    expect(JSON.stringify(seccionesPrivacidad({ ...contexto, conMapaEmbebido: true }))).toContain('Google Maps');
  });

  it('sin WhatsApp ni dirección, el contacto no inventa nada', () => {
    const [responsable] = seccionesPrivacidad({ ...contexto, conWhatsapp: false, direccion: '' });
    expect(responsable?.parrafos).toHaveLength(1);
  });

  it('formatea la fecha de actualización', () => {
    expect(fechaDePrivacidad('2026-10-29')).toBe('29 de octubre de 2026');
    expect(fechaDePrivacidad('basura')).toBe('basura');
    expect(PRIVACIDAD_ACTUALIZADA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('SEO: título, canonical con la URL pública, indexable', () => {
    const seo = seoPrivacidad(sitio, negocio);
    expect(seo.titulo).toBe('Política de privacidad · MgDetailing');
    expect(seo.url).toBe(`${sitio.url}/privacidad`);
    expect(seo.noindex).toBe(false);
    expect(seoPrivacidad({ url: '' }, negocio).url).toBeNull();
  });
});
