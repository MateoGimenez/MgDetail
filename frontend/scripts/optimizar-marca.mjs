/**
 * Genera las versiones livianas de los archivos de marca (public/fotos/MgDetailing-*)
 * en public/marca/, al tamaño en que se usan. Los originales no se tocan.
 * Uso: npm run marca
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const raiz = path.resolve(import.meta.dirname, '..');
const origen = (archivo) => path.join(raiz, 'public', 'fotos', archivo);
const destino = (archivo) => path.join(raiz, 'public', 'marca', archivo);

await mkdir(path.join(raiz, 'public', 'marca'), { recursive: true });

const salidas = [];
const guardar = async (imagen, archivo) => {
  const info = await imagen.toFile(destino(archivo));
  salidas.push(`${archivo}: ${String(info.width)}×${String(info.height)}, ${((await stat(destino(archivo))).size / 1024).toFixed(1)} KB`);
};

// Logo plano para fondo oscuro (cabecera, pie, panel): recortado y a 120 px de alto (≈2,5x del uso).
// PNG con paleta: con estos colores planos pesa menos que WebP.
const logoOscuro = sharp(origen('MgDetailing-plano-para-fondo-oscuro.png')).trim().resize({ height: 120 });
await guardar(logoOscuro.png({ compressionLevel: 9, palette: true }), 'logo-fondo-oscuro.png');

// Logo plano para fondo claro (tema claro de la web): mismo recorte y alto que el oscuro.
const logoClaro = sharp(origen('MgDetailing-plano-para-fondo-claro.png')).trim().resize({ height: 120 });
await guardar(logoClaro.png({ compressionLevel: 9, palette: true }), 'logo-fondo-claro.png');

// Póster del monograma animado: el avatar 3D a 720 px (el video se muestra a ≤ 400 px).
const avatar = sharp(origen('MgDetailing-avatar-3D-1080.png')).flatten({ background: '#0b0d10' }).resize(720, 720);
await guardar(avatar.webp({ quality: 82 }), 'monograma-poster.webp');

// Dorso del monograma que gira: el logo 3D completo, centrado en un cuadro de 720 px.
await guardar(
  sharp(origen('MgDetailing-logo-3D.png'))
    .flatten({ background: '#0b0d10' })
    .resize({ width: 720 })
    // El logo es apaisado: se completa el cuadro repitiendo sus propios bordes oscuros (sin franjas).
    .extend({ top: 158, bottom: 157, extendWith: 'copy' })
    .webp({ quality: 80 }),
  'monograma-dorso.webp',
);

// Vista previa para compartir (og:image), 1200 × 630, desde el logo 3D.
await guardar(
  sharp(origen('MgDetailing-logo-3D.png'))
    .flatten({ background: '#0b0d10' })
    .resize(1200, 630, { fit: 'cover' })
    .jpeg({ quality: 82, mozjpeg: true }),
  'og.jpg',
);

// Favicon e íconos de la app (celular, panel instalable): SOLO el monograma "Mg", sin "Detailing" ni la línea roja.
// Se recorta del logo 3D horizontal con un polígono ajustado al contorno del monograma (en coordenadas del recorte
// de abajo: la "D" de Detailing casi toca el borde derecho y la línea roja pasa por debajo) y se centra sobre un
// fondo oscuro de la marca. Si cambia el logo, hay que revisar este polígono mirando public/marca/app-512.png.
const RECORTE = { left: 240, top: 200, width: 1000, height: 800 };
const POLIGONO = [
  [283, 37], [822, 60], [742, 432], [726, 470], [712, 505], [724, 516], [600, 690], [480, 695], [372, 694],
  [405, 528], [60, 528], [145, 147],
];
const CAJA = { x: 56, y: 34, ancho: 772, alto: 664 }; // el monograma dentro del recorte
const monogramaSolo = async () => {
  const recorte = await sharp(origen('MgDetailing-logo-3D.png')).flatten({ background: '#0b0d10' }).extract(RECORTE).png().toBuffer();
  const puntos = POLIGONO.map(([x, y]) => `${String(x)},${String(y)}`).join(' ');
  const mascara = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(RECORTE.width)}" height="${String(RECORTE.height)}"><polygon points="${puntos}" fill="#fff"/></svg>`),
  )
    .blur(1.2)
    .extractChannel(0)
    .png()
    .toBuffer();
  const recortado = await sharp(recorte).joinChannel(mascara).png().toBuffer();
  return sharp(recortado).extract({ left: CAJA.x, top: CAJA.y, width: CAJA.ancho, height: CAJA.alto }).png().toBuffer();
};
const monograma = await monogramaSolo();
// Fondo cuadrado: grafito con una viñeta suave, como el del avatar de la marca.
const fondo = (lado) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${String(lado)}" height="${String(lado)}"><defs><radialGradient id="g" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="#16191d"/><stop offset="1" stop-color="#090b0d"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
    ),
  ).png();
// `proporcion` = qué parte del ancho del cuadro ocupa el monograma (el maskable queda dentro de la zona segura).
const iconoMonograma = async (lado, proporcion) => {
  const ancho = Math.round(lado * proporcion);
  const alto = Math.round((ancho * CAJA.alto) / CAJA.ancho);
  const pieza = await sharp(monograma).resize(ancho, alto).png().toBuffer();
  return sharp(await fondo(lado).toBuffer())
    .composite([{ input: pieza, left: Math.round((lado - ancho) / 2), top: Math.round((lado - alto) / 2) }])
    .png({ compressionLevel: 9 });
};
await guardar(await iconoMonograma(180, 0.76), 'apple-touch-icon.png');
await guardar(await iconoMonograma(48, 0.84), 'favicon-48.png');
await guardar(await iconoMonograma(192, 0.76), 'app-192.png');
await guardar(await iconoMonograma(512, 0.76), 'app-512.png');
await guardar(await iconoMonograma(512, 0.58), 'app-maskable-512.png');

console.log(salidas.join('\n'));
