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

// Favicon: el monograma recortado del logo 3D, sobre su fondo grafito.
const monograma = sharp(origen('MgDetailing-logo-3D.png'))
  .flatten({ background: '#0b0d10' })
  .extract({ left: 280, top: 200, width: 800, height: 800 });
const base = await monograma.png().toBuffer();
await guardar(sharp(base).resize(180, 180).png({ compressionLevel: 9 }), 'apple-touch-icon.png');
await guardar(sharp(base).resize(48, 48).png({ compressionLevel: 9 }), 'favicon-48.png');

// Íconos de la app instalable del panel (/admin), sobre el fondo oscuro de la marca.
// "any": el logo ocupa todo el cuadro; "maskable": queda dentro del 80 % central (zona segura
// que ningún sistema recorta) y el fondo llega hasta los bordes.
// Se parte del avatar cuadrado (logo completo, fondo transparente): el cuadro se ve igual que en la web.
const monogramaApp = await sharp(origen('MgDetailing-avatar-3D-1080.png')).flatten({ background: '#0b0d10' }).png().toBuffer();
// El avatar ya trae su propio fondo con viñeta casi negra: el margen del maskable repite sus bordes
// (sin franjas ni cuadro visible).
const iconoApp = async (lado, proporcion) => {
  const interior = Math.round(lado * proporcion);
  const imagen = sharp(monogramaApp).resize(interior, interior);
  if (interior === lado) return imagen.png({ compressionLevel: 9 });
  const margen = lado - interior;
  const bajo = Math.floor(margen / 2);
  return sharp(await imagen.png().toBuffer())
    .extend({ top: bajo, bottom: margen - bajo, left: bajo, right: margen - bajo, extendWith: 'copy' })
    .png({ compressionLevel: 9 });
};
await guardar(await iconoApp(192, 1), 'app-192.png');
await guardar(await iconoApp(512, 1), 'app-512.png');
await guardar(await iconoApp(512, 0.8), 'app-maskable-512.png');

console.log(salidas.join('\n'));
