/*
 * Tema antes de pintar (sin parpadeo). Archivo aparte y no inline: la CSP del
 * backend solo permite scripts del mismo origen. Misma clave, color y rutas que
 * src/tema/tema.ts (lo comprueba tema.test.ts). El oscuro es el tema por defecto.
 */
/* global window, document -- corre en el navegador, no en Node */
(function () {
  try {
    if (/^\/admin(?:\/|$)/i.test(window.location.pathname)) return;
    if (window.localStorage.getItem('mg-tema') !== 'claro') return;
    document.documentElement.setAttribute('data-tema', 'claro');
    var barra = document.querySelector('meta[name="theme-color"]');
    if (barra) barra.setAttribute('content', '#f7f8f9');
  } catch {
    /* Sin acceso al almacenamiento: queda el tema oscuro. */
  }
})();
