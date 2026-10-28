/**
 * Genera las versiones livianas de las fotos de trabajos: por cada foto de fotos-originales/ crea en
 * public/trabajos/ tres WebP (480, 800 y 1080 px de ancho) y un JPG de respaldo de 800 px.
 * Los originales no se tocan ni se publican (la carpeta fotos-originales/ queda fuera de public/).
 * Uso: npm run fotos
 *
 * Para sumar una foto: copiala a fotos-originales/, agregala a FOTOS con el nombre final (en minúsculas y con
 * guiones), corré `npm run fotos` y cargá la entrada en src/data/galeria.ts con `fotoOptimizada()`.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const raiz = path.resolve(import.meta.dirname, '..');
const carpetaOrigen = path.join(raiz, 'fotos-originales');
const carpetaDestino = path.join(raiz, 'public', 'trabajos');

/** Anchos de las versiones WebP. Tienen que coincidir con ANCHOS_FOTO de src/lib/fotos.ts. */
const ANCHOS = [480, 800, 1080];
/** Ancho del JPG de respaldo (navegadores sin WebP). */
const ANCHO_RESPALDO = 800;

/** Original → nombre final (sin extensión ni ancho). */
const FOTOS = [
  { original: 'trabajoDespues.jpg', nombre: 'honda-nx-lateral' },
  { original: 'trabajoDespues2.jpg', nombre: 'honda-nx-frente-tres-cuartos' },
  { original: 'mgdetailing_corsa_frente.jpg', nombre: 'corsa-frente' },
];

await mkdir(carpetaDestino, { recursive: true });

const kb = async (archivo) => `${((await stat(archivo)).size / 1024).toFixed(0)} KB`;

for (const { original, nombre } of FOTOS) {
  const origen = path.join(carpetaOrigen, original);
  for (const ancho of ANCHOS) {
    const salida = path.join(carpetaDestino, `${nombre}-${String(ancho)}.webp`);
    await sharp(origen).rotate().resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 78 }).toFile(salida);
    console.log(`${path.basename(salida)}: ${await kb(salida)}`);
  }
  const respaldo = path.join(carpetaDestino, `${nombre}-${String(ANCHO_RESPALDO)}.jpg`);
  await sharp(origen)
    .rotate()
    .resize({ width: ANCHO_RESPALDO, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(respaldo);
  console.log(`${path.basename(respaldo)}: ${await kb(respaldo)}`);
}
