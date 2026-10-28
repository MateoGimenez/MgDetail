import { describe, expect, it } from 'vitest';
import { mapaEmbedUrl, mensajeConsultaServicio, MENSAJE_CONSULTA_TURNO, whatsappUrl, whatsappUrlDe } from './enlaces';
import { negocio, sitio } from './sitio';

describe('WhatsApp del taller', () => {
  it('está cargado en formato internacional: solo dígitos, 54 + 9 + código de área', () => {
    expect(sitio.whatsapp).toBe('5493804781737');
    expect(sitio.whatsapp).toMatch(/^549\d{10}$/);
  });

  it('el enlace arma wa.me con el mensaje codificado', () => {
    expect(whatsappUrl(MENSAJE_CONSULTA_TURNO)).toBe(
      `https://wa.me/5493804781737?text=${encodeURIComponent('Hola MgDetailing, quiero consultar por un turno.')}`,
    );
  });

  it('en la página de un servicio el mensaje nombra el servicio', () => {
    const mensaje = mensajeConsultaServicio('Restauración de ópticas');
    expect(mensaje).toBe('Hola MgDetailing, quiero consultar por el servicio Restauración de ópticas.');
    expect(whatsappUrl(mensaje)).toContain(encodeURIComponent('Restauración de ópticas'));
    expect(mensaje).toContain(negocio.nombre);
  });

  it('whatsappUrlDe limpia lo que no son dígitos y rechaza lo que no parece un número', () => {
    expect(whatsappUrlDe('+54 9 380 478-1737')).toBe('https://wa.me/5493804781737');
    expect(whatsappUrlDe('')).toBeNull();
    expect(whatsappUrlDe('123')).toBeNull();
  });
});

describe('mapa embebido', () => {
  it('sin src cargado, no hay mapa', () => {
    expect(sitio.mapaEmbedUrl ?? '').toBe('');
    expect(mapaEmbedUrl()).toBeNull();
  });
});
