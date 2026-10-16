---
version: 1
slug: "src-landing-landing-tsx"
primary_target: "src/landing/Landing.tsx"
related_targets: []
---

# Landing (/)

Mode: Persuade. Audiencia: riojanos con auto, camioneta o moto que llegan desde Instagram en el celular y recién conocen el detailing. Acción: pedir turno (formulario con preselección o WhatsApp si está configurado). Prueba disponible: método y explicaciones honestas; sin fotos, cifras ni testimonios todavía (ver PRODUCT.md). Build code-led (sin generación de imágenes; el brief prohíbe imágenes IA/stock). Sin ronda de decisión con el usuario: el pedido indicó decidir sin aprobación; se construye la dirección asignada.

## Direction contract

THESIS: La página es un cartel fileteado pintado sobre un panel grafito: el taller se presenta como los oficios argentinos pintaban vehículos y carteles (filete rojo de un trazo, volutas, letra con luz y sombra) y en el cartel mismo arranca el turno. Rechaza el default: hero con foto de auto, rojo neón, tarjetas iguales con íconos, testimonios.

OWN-WORLD: Grafito laqueado con un reflejo de luz fijo que el contenido atraviesa al scrollear; filete rojo con su luz blanca fina y su sombra; volutas en espiral de semicírculos, rombos y bolitas. Romana Bodoni Moda 900 con relleno cromo y sombra roja solo en logo, H1 y la frase; Yellowtail como cursiva de cartel; Archivo para texto e interfaz (ancho expandido en mayúsculas para rótulos de datos, nunca sobre títulos). Botón primario: chapa roja con bisel.

STORY: Quien llega desde Instagram entiende en segundos que es un taller de detailing nuevo en La Rioja, qué hace cada servicio, cuánto tarda y qué no se puede prometer; cree en el método, no en cifras; pide su turno.

FIRST VIEWPORT: Un cartel enmarcado ocupa la pantalla, con cuatro esquinas de volutas que se trazan al cargar. Centro: "Hasta el último detalle." en romana cromada con sombra roja (hasta 6rem en desktop, ~2.9rem en 390px), debajo una línea con qué hacemos y para qué vehículos. Zócalo del cartel: el arranque del turno funcionando (¿Qué traés? Auto/Camioneta/Moto, ¿Qué servicio? selector, botón rojo "Reservá tu turno") que precarga el formulario; WhatsApp al lado si está configurado. En 390×844 todo entra.

FORM: Fileteado (cartel y filete de vehículo), posición 7 de mi lista ordenada; seed:c85bba35ac04da1b. Firma: el trazo del filete; el filete se dibuja de un solo trazo para marcar lo elegido (vehículo, servicio), el divisor del comparador antes/después es un filete con voluta como manija, y la confirmación del turno se sella con un marco que se traza. Movimiento: trazo de pincel (ataque rápido, final lento), una sola vez, desde un estado ya visible; nada con reduced-motion.
Raise (piel de cefalópodo): el estado se pinta en el filete mismo (elegido, foco, error), no en chapitas aparte.
Raise (hoja Miura): todo ornamento cuelga de una sola grilla y de ejes de simetría; nada flota suelto.
Raise (telop): un solo gesto a escala display por sección; el resto en tamaño de lectura; nunca ornamento detrás de texto.
Raise (algorave): el formulario muestra en vivo el resumen del pedido antes de enviarlo.
Raise (nixie): duración y precio ocupan siempre el mismo lugar en cada servicio.
Competitive, no construido: corte Busytown (etiquetas con puntero), sostiene claridad de producto.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

- Fotos reales, logo real, datos de contacto y precios: los completa el usuario.
