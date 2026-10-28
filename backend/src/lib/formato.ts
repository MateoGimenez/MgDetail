/**
 * Formato de números y fechas en español rioplatense (es-AR), SIN depender de Intl ni de la configuración regional del
 * servidor: punto para los miles y coma para los decimales ("12.500", "4,5"), siempre igual en cualquier máquina.
 */

/** Agrupa los miles con punto: 1250000 => "1.250.000". Solo para enteros no negativos en forma de texto. */
function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 12500 => "12.500"; 4.5 => "4,5"; 0.3 => "0,3". Hasta `maxDecimales` decimales, sin ceros de más. */
export function formatearNumero(valor: number, maxDecimales = 2): string {
  const negativo = valor < 0;
  const [entero = '0', decimales = ''] = Math.abs(valor).toFixed(maxDecimales).split('.');
  const recortados = decimales.replace(/0+$/, '');
  const texto = `${agruparMiles(entero)}${recortados === '' ? '' : `,${recortados}`}`;
  return negativo && texto !== '0' ? `-${texto}` : texto;
}

/** Pesos enteros: 12500 => "$ 12.500". */
export function formatearPesos(valor: number): string {
  return `$ ${formatearNumero(Math.round(valor), 0)}`;
}

/** "2026-10-16" => "16/10/2026". */
export function formatearFecha(iso: string): string {
  const [anio = '', mes = '', dia = ''] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}
