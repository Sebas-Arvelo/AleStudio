# 0001 — Exportar videos a apps de edición y etiquetar en lote

Pedido de Alejandra (15/10/2026): mandar los videos que elija a CapCut, TikTok o Edits desde
AleStudio, y etiquetar muchos videos a la vez.

## Qué se va a hacer

1. **Copia al agregar (opción A).** En el flujo de agregar videos, un interruptor
   "Guardar copia para exportar" (apagado por defecto, se recuerda la última elección).
   Si está activo, cada video agregado guarda su archivo dentro de la app (`saveBlob`).
2. **Modo selección en la Biblioteca.** Botón "Seleccionar" en la barra; al activarlo, tocar una
   tarjeta la marca en vez de abrirla. Barra inferior con contador ("3 seleccionados"),
   "Seleccionar todos" (los visibles con los filtros actuales) y "Cancelar".
3. **Acciones en lote** sobre lo seleccionado:
   - Tipo de contenido (asignar uno, o quitarlo).
   - Orientación manual (Vertical / Horizontal / Cuadrado / Automática).
   - Favorito (marcar / desmarcar).
   - Eliminar, con confirmación que dice cuántos.
   - **Exportar.**
4. **Exportar.** Arma los archivos de los seleccionados que tienen copia y abre el menú de
   compartir del iPhone (`navigator.share` con `files`), donde ella elige CapCut, TikTok, Edits
   o "Guardar video". Exportar también desde la ficha de un video.
   - Si alguno no tiene copia: aviso "N no tienen copia guardada" con opción de exportar solo
     los que sí, o elegirlos de nuevo desde Fotos para guardar su copia.
   - Al terminar de compartir, la app pregunta "¿Quitar las copias para liberar espacio?".
     El video sigue en Fotos y la ficha se queda.
   - Si el navegador no puede compartir archivos (PC), se descargan.

## Qué NO se va a hacer

- Conectar con la galería de Fotos (una web app no puede; ver conversación del 15/10).
- Abrir CapCut / Edits directamente sin pasar por el menú de compartir.
- Etiquetas libres, estados de publicación o banco de ideas (quedan para después).

## Cómo sabremos que quedó

- [x] Agregar 3 videos con "Guardar copia para exportar" activo: los 3 quedan con copia.
- [x] Seleccionar 5 videos y asignarles un tipo en un paso: los 5 cambian y la agrupación por
      tipo lo refleja.
- [x] Orientación, favorito y eliminar en lote funcionan; eliminar pide confirmación.
- [x] "Seleccionar todos" respeta los filtros activos.
- [x] Exportar 2 videos con copia abre el menú de compartir con los 2 archivos (en la PC: se
      descargan). Al terminar, ofrece quitar las copias.
- [x] Exportar una selección con videos sin copia muestra el aviso y no falla.
- [x] Sin errores en consola en la prueba de punta a punta en el navegador de la PC (390 px).
- [ ] **En el iPhone (lo prueba Alejandra):** CapCut, TikTok y Edits aparecen en el menú de
      compartir y reciben el video. Si alguno no aparece, "Guardar video" funciona como respaldo.

## Estado (15/10/2026)

Comprobado con una prueba automática de punta a punta en Edge sin ventana, a 390 px, con videos
generados en el navegador: 9 de 9 flujos funcionan y no hubo errores en consola. El menú de
compartir se simuló (Edge en Windows sí puede compartir archivos, así que la descarga en PC no se
probó). Falta la prueba en el iPhone.
