/**
 * Baja un texto como archivo, sin pasar por el servidor. El BOM del CSV ya viene en el texto (Excel lo necesita
 * para leer bien las tildes); `text/csv;charset=utf-8` evita que el navegador lo interprete de otra forma.
 */
export function descargarCsv(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Un respiro para que el navegador empiece la descarga antes de soltar el archivo.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
