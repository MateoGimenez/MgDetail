import { describe, expect, it } from 'vitest';
import { desarrollador } from '../config/desarrollador';
import { sitio } from '../config/sitio';
import { contactoDesarrollador, redesDelNegocio, textosLegales } from './pieDatos';

describe('contacto del desarrollador', () => {
  const contacto = contactoDesarrollador();
  const por = (icono: string) => contacto.find((c) => c.icono === icono);

  it('trae Instagram, WhatsApp y correo con los enlaces pedidos', () => {
    expect(por('instagram')?.href).toBe('https://instagram.com/mateo_gimeneezz');
    expect(por('whatsapp')?.href).toBe('https://wa.me/5493804781737');
    expect(por('correo')?.href).toBe('mailto:matex23gimenez11@gmail.com');
  });

  it('usa el número del negocio, sin duplicar el dato', () => {
    expect(desarrollador.whatsapp).toBe(sitio.whatsapp);
  });

  it('los enlaces web van a otra pestaña (el chequeo del rel está en el componente); mailto no', () => {
    expect(por('instagram')?.externo).toBe(true);
    expect(por('whatsapp')?.externo).toBe(true);
    expect(por('correo')?.externo).toBe(false);
  });

  it('todos tienen etiqueta accesible con el nombre', () => {
    for (const c of contacto) expect(c.etiqueta).toContain('Mateo Gimenez');
  });
});

describe('redes del negocio', () => {
  it('muestra WhatsApp y, sin arroba de Instagram configurada, no muestra Instagram', () => {
    expect(sitio.instagram).toBe('');
    const redes = redesDelNegocio();
    expect(redes.map((r) => r.icono)).toEqual(['whatsapp']);
    expect(redes[0]?.etiqueta).toMatch(/WhatsApp/);
  });

  it('con arroba configurada, Instagram aparece con su enlace', () => {
    const original = sitio.instagram;
    (sitio as { instagram: string }).instagram = '@mgdetailing';
    try {
      const ig = redesDelNegocio().find((r) => r.icono === 'instagram');
      expect(ig?.href).toBe('https://www.instagram.com/mgdetailing/');
      expect(ig?.etiqueta).toContain('@mgdetailing');
    } finally {
      (sitio as { instagram: string }).instagram = original;
    }
  });
});

describe('textos legales', () => {
  const t = textosLegales(2031);
  it('usan el año recibido y separan marca del negocio y diseño del sitio', () => {
    expect(t.negocio).toContain('© 2031 MgDetailing. Todos los derechos reservados.');
    expect(t.desarrollo).toBe('Diseño y desarrollo del sitio © 2031 Mateo Gimenez.');
  });
  it('mencionan marcas de terceros y mantienen ciudad y país', () => {
    expect(t.terceros).toMatch(/terceros/);
    expect(t.ubicacion).toBe('La Rioja, Argentina');
  });
});
