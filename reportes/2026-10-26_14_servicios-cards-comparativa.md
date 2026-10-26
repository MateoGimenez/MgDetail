# Objetivo 7: servicios como cards, comparativa y animaciones al hacer scroll

## Problema (pedido del dueño)

La sección "Qué le hacemos a tu vehículo" muestra cada servicio como un bloque largo (descripción completa, lista de lo que incluye, glosario, botón). Con cinco servicios la web se hace **muy larga y aburrida**. Quiere:

1. Los servicios como **cards** que muestren de un vistazo qué ofrecen.
2. Una **comparativa** que ayude al cliente a decidir, por ejemplo: "por $ 20.000 más, ¿me conviene el Premium que el Básico?".
3. **Animaciones mientras el usuario hace scroll.**

## Decisiones

### Cards

- Cada card (grilla: 1 columna en celular, 2 en tablet, 3 en pantalla ancha) muestra: nombre, resumen de una línea, **precio** ("Desde $ 25.000" o "Consultá"), **duración**, las **3 primeras cosas que incluye** y el botón "Reservá este servicio". El resto (descripción completa, lista completa de "Incluye", y **"En palabras simples"**) queda detrás de **"Ver qué incluye"**, que despliega dentro de la misma card (no un salto de página). El glosario se conserva porque explicar los términos es un principio del producto (ver `frontend/PRODUCT.md`).
- En el celular, cada card plegada no debería pasar de ~380 px de alto: la sección completa tiene que ocupar una fracción de lo que ocupa hoy.
- El servicio **destacado** (el que el dueño marca en el panel) se ve elevado, con el sello "Recomendado por el taller".
- Estados que ya existen y se mantienen: catálogo cargando (el precio espera con brillo), catálogo vacío (`SinTurnosOnline`), respaldo sin precios ("Consultá").

### Comparativa

- Un bloque debajo de las cards: **"¿Cuál te conviene?"**, con dos selectores para elegir qué dos servicios comparar. Por defecto compara el **primer servicio** con el **destacado** (hoy: Lavado Básico y Lavado Premium); si no hay destacado o hay menos de dos servicios, el bloque no se muestra.
- **Tabla de verdad** (una `<table>` real, con `caption`, encabezados `scope` y ✓ / — con texto alternativo "Incluido" / "No incluido"; no depende solo del color): una fila por cosa que incluye cada servicio. Las filas salen de las listas "Incluye" de los dos servicios.
- **Convención "Todo lo del X"**: un ítem de "Incluye" con la forma `Todo lo del <nombre de otro servicio>` (sin importar mayúsculas ni acentos) se **expande** a la lista de ese servicio. Así "Premium" = "Todo lo del Lavado Básico" + sus extras, y la tabla marca ✓ en ambos para lo que comparten y ✓ solo en el Premium para los extras. Si un ítem no coincide con ningún servicio, queda como una fila más.
- **Resumen de la diferencia** arriba de la tabla (lo que responde "¿me conviene?"): "**Por $ 20.000 más**, el Lavado Premium suma 4 cosas: …" y los extras en lista corta.
  - La diferencia de precio se calcula **solo si los dos precios están cargados** y el más completo cuesta más. Si falta algún precio o la diferencia no es positiva: "Sumás 4 cosas. Consultá el precio de cada uno." (**nunca** se inventa ni se estima un precio).
  - La duración se muestra lado a lado (es texto libre, no se resta).
  - "Es lo que sumás" siempre honesto: solo se listan diferencias reales de la tabla.
- Debajo de cada columna, un botón **"Elegir <nombre>"** que preselecciona ese servicio en el formulario de reserva (igual que el botón de las cards).
- En el celular la tabla tiene 3 columnas (concepto + los dos servicios), legible a 390 px, con la fila de nombres fija mientras se recorre.

### Animaciones al hacer scroll

- Un sistema chico y reutilizable de **"revelar al entrar en pantalla"**: un hook con `IntersectionObserver` (una sola vez por elemento) y clases CSS que animan **solo `transform` y `opacity`** (sin saltos de layout).
- Dónde: encabezados de sección (el filete de marca se dibuja al entrar), las **cards con entrada escalonada**, la **tabla de comparación** (los ✓ aparecen fila por fila y el resumen "Por $ X más" entra al final), y de forma **más sutil** las demás secciones de la landing (proceso, beneficios, trabajos, preguntas, contacto). El hero queda como está.
- Reglas: todo dentro de `@media (prefers-reduced-motion: no-preference)`; **el contenido es visible por defecto** (si falla JS o no hay `IntersectionObserver`, no queda nada oculto) y solo se anima lo que está **fuera de pantalla** al montar (nada parpadea al cargar); sin librerías de animación (CSS + `IntersectionObserver`); funciona en los dos temas, claro y oscuro; sin parallax ni efectos pesados.

### Panel

- Una línea de ayuda en el diálogo de edición de servicios, bajo "Incluye": *Si incluye todo lo de otro servicio, escribí "Todo lo del <nombre>" y la comparativa de la web lo cuenta.*

## Sin cambios de backend

Todo sale del catálogo que ya devuelve `GET /api/servicios` (con el respaldo sin precios). **Los precios hoy están sin cargar** (todos "Consultá"): la frase "Por $ 20.000 más" aparece sola cuando el dueño carga los dos precios en Panel → Servicios.

## Archivos

- Nuevos: `src/landing/TarjetaServicio.tsx`, `src/landing/Comparativa.tsx`, `src/landing/useRevelar.ts` (o `src/landing/revelar/`), `src/landing/servicios.css`, `src/lib/comparativa.ts` y su test.
- Modifican: `src/landing/Servicios.tsx`, `src/landing/Landing.tsx`, `src/landing/landing.css` (sacar los estilos viejos `.plancha*` y agregar lo mínimo), los componentes de las otras secciones (envolver con el revelado), `src/admin/DialogoServicio.tsx` (la línea de ayuda), `DESIGN.md` y `README.md` del frontend.

## Estado

- [ ] Cards de servicios, con detalle desplegable.
- [ ] Comparativa con tabla, resumen de la diferencia y botones de reserva.
- [ ] Revelado al hacer scroll en la landing, con `prefers-reduced-motion`.
- [ ] Verificación: tipos, lint, tests, build, y capturas en celular y pantalla ancha, en claro y oscuro.
