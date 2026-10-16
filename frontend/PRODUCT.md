# Product

<!-- impeccable:product-schema 1 -->

> Registro escrito a partir del brief del proyecto, sin ronda de entrevista: el pedido indicó decidir sin aprobación del usuario. Lo que no viene textual del brief está marcado como _(inferido)_.

## Platform

web

## Stack

Fijado por el brief: React 19 + TypeScript strict + Vite, react-router (`/` landing, `/admin` panel cargado con `React.lazy`), zod para validar el formulario con las mismas reglas que el backend, fuentes autoalojadas con `@fontsource/*` (sin CDNs de fuentes). El backend es un servicio aparte (`../backend/`, Node) en `http://localhost:4000`, al que el front llega por el proxy `/api` de Vite. Despliegue: sin definir.

## Users

- **Cliente local (principal):** personas de La Rioja, Argentina, con auto, camioneta o moto. La mayoría llega desde Instagram, en el celular. Muchas recién conocen qué es el detailing y no manejan la jerga. Su trabajo: entender qué servicio le conviene, cuánto tarda y pedir un turno (por formulario o WhatsApp).
- **Dueño del taller (secundario):** entra a `/admin` para ver las solicitudes de turno y gestionarlas (confirmar, completar, cancelar, eliminar, escribirle al cliente por WhatsApp). _(inferido: lo usa entre trabajos, a veces desde el celular)_

## Product Purpose

Sitio de MgDetailing, un taller de detailing que recién abre en La Rioja. Tiene que explicar los servicios en palabras simples y convertir visitas en solicitudes de turno. Éxito: que una persona que nunca contrató detailing entienda qué hace cada servicio, confíe en el taller sin pruebas infladas y deje su pedido de turno en un minuto. Para el dueño: ver y resolver las solicitudes sin fricción.

## Positioning

Detailing hecho a mano y explicado sin vueltas: cada término técnico (descontaminación, clay bar, corrección de pintura, sellado UV, swirls) se explica en una línea, con honestidad sobre lo que un tratamiento logra y lo que no (por ejemplo, el pulido no saca rayas que llegan a la base). Es un taller nuevo: la confianza se gana con claridad y método, no con cifras.

## Operating Context

- Reserva: el cliente elige servicio, tipo de vehículo, fecha preferida (de hoy a +60 días, hora de Argentina) y franja (mañana o tarde). El taller confirma después; no es una agenda en tiempo real.
- WhatsApp es el canal habitual de la zona para coordinar; Instagram es la vidriera.
- El panel es una herramienta interna con sesión por cookie httpOnly que maneja el backend.

## Capabilities and Constraints

- Servicios (IDs de contrato con el backend): `lavado-basico`, `lavado-premium` (destacado), `pulido`, `encerado`, `restauracion-opticas`.
- Vehículos: auto, camioneta, moto.
- Estados de un turno: pendiente, confirmado, completado, cancelado.
- Contrato de API fijo (ver brief del proyecto); el backend rechaza campos desconocidos.
- Datos del negocio todavía sin definir y centralizados en `src/config/sitio.ts`: WhatsApp, Instagram, dirección, horarios, link de Maps. Todo lo que dependa de ellos se oculta o se degrada si están vacíos.
- Precios sin definir: `precioDesde: null` → la UI muestra "Consultá".

## Brand Commitments

- Nombre: siempre **MgDetailing**, tal cual.
- Colores: rojo, gris y blanco. Fondo oscuro gris grafito con acentos rojos; look premium que combine con el logo cromado.
- Logo: monograma "Mg" cromado + "Detailing" en letra script. El archivo todavía no existe (`public/logo.png` cuando llegue).
- Voz: español rioplatense con voseo ("Reservá tu turno", "Traé tu auto"). Profesional y cercana, sin tecnicismos innecesarios; cada término técnico se explica en una línea.

## Evidence on Hand

- No hay fotos del taller ni trabajos todavía (irán en `public/fotos/`).
- No hay archivo de logo todavía.
- No hay testimonios, cifras, años de experiencia, premios, promociones ni descuentos: el taller recién abre. **No se inventan.**
- No se usan imágenes generadas por IA ni fotos de stock de autos: no se puede mostrar un acabado que no sea del taller.

## Product Principles

1. Explicar antes que impresionar: cada servicio dice para qué sirve, qué incluye y cuánto tarda.
2. Honestidad técnica: decir también lo que un tratamiento no hace.
3. El turno siempre a mano: cada sección lleva a reservar, por formulario o WhatsApp.
4. Nada inventado: la confianza sale del método y de los trabajos reales cuando lleguen.
5. Celular primero: la mayoría entra desde Instagram.

## Accessibility & Inclusion

WCAG 2.1 AA: contraste, foco visible, labels, navegación por teclado (incluido el comparador antes/después) y respeto de `prefers-reduced-motion`. Lenguaje llano para un público que recién conoce el detailing.
