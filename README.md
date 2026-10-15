# AleStudio

Guía en español para publicar e instalar la app desde una PC con Windows, sin Mac y sin cuenta de pago de Apple.

## 1. Qué es AleStudio y qué hace

AleStudio es una app para iPhone donde Alejandra organiza sus videos. Ella elige los videos desde su iPhone y la app:

- **Detecta la orientación** de cada video (Vertical, Horizontal o Cuadrado) y permite corregirla a mano.
- **Los agrupa por duración**: Hasta 15 s, 15–30 s, 30–60 s, 1–3 min, 3–10 min y Más de 10 min.
- **Los agrupa por tipo de contenido**: Tutorial, Vlog, Reel / Tendencia, Colaboración / Marca, Detrás de cámaras, Lifestyle y Otro. Los tipos se pueden renombrar, cambiar de color, agregar o eliminar en **Ajustes**.
- Guarda de cada video una miniatura, título, notas y la marca de favorito.
- Tiene buscador, filtros, orden (más recientes, más cortos, etc.) y una pestaña **Resumen** con el conteo por orientación, duración y tipo.
- Opcionalmente guarda una **copia del video dentro de la app** para reproducirlo ahí mismo. Se puede activar al agregar videos (“Guardar copia para exportar”).
- **Exporta a CapCut, TikTok o Edits**: los videos con copia se mandan por el menú de compartir del iPhone; después la app ofrece quitar la copia para liberar espacio.
- **Edición en lote**: con “Seleccionar” se marcan varios videos y se les cambia juntos el tipo, la orientación o favorito, o se eliminan.

Funciona sin internet después de la primera vez que se abre, y todos los datos se quedan en el iPhone: no hay cuentas, servidores ni seguimiento.

## 2. Por qué no necesita la App Store

AleStudio es una **PWA** (aplicación web progresiva): una página web que Safari permite instalar en la pantalla de inicio. Se abre a pantalla completa, con su propio ícono, como cualquier otra app. No pasa por la App Store, no requiere la cuenta de desarrollador de Apple (99 USD al año) y no hace falta una Mac ni Xcode. Publicarla es gratis.

Requisito: iPhone con **iOS 16.4 o más reciente**.

Limitaciones que conviene conocer:

- **No lee la galería de Fotos sola.** Alejandra toca **+** y elige los videos que quiere agregar. Si graba videos nuevos, tiene que agregarlos ella.
- **La app guarda una ficha del video, no el video.** Por defecto solo se guardan la miniatura y los datos (duración, tamaño, orientación, tipo, notas). Para reproducir un video dentro de la app hay que activar **"Guardar copia dentro de la app"** en el detalle de ese video, y eso ocupa espacio del iPhone.
- **Los datos viven solo en ese iPhone.** No se sincronizan con iCloud ni con otros dispositivos. Si se borra la app o se borran los datos de sitios web de Safari, la biblioteca se pierde. Por eso hay que exportar respaldos (sección 7).
- **Hay que instalarla en la pantalla de inicio.** iOS puede borrar los datos de sitios web que no se usan durante varios días si solo se abren en Safari. Instalada en la pantalla de inicio, la app queda protegida de esa limpieza.
- **No tiene notificaciones.** No las necesita.
- Abierta en Safari y abierta desde el ícono son dos espacios de datos separados en iOS: lo que se agregue en Safari antes de instalarla no aparece en la app instalada. Conviene instalarla primero y agregar los videos después; la propia app lo avisa mientras se usa en Safari. Si ya se agregaron videos en Safari, se pasan con **Exportar respaldo** en Safari e **Importar respaldo** en la app instalada (sección 7).

## 3. Probarla en la PC

La app no tiene paso de compilación ni dependencias. Solo hay que servir la carpeta con un servidor local (abrir `index.html` con doble clic no funciona). Elige una opción:

**Opción A: Node.js**

```
cd C:\dev\AleStudio
npx serve
```

Abre la dirección que muestra la terminal, normalmente `http://localhost:3000`.

**Opción B: Python**

```
cd C:\dev\AleStudio
python -m http.server 8000
```

Abre `http://localhost:8000`.

**Opción C: Visual Studio Code**

Instala la extensión **Live Server**, abre la carpeta, haz clic derecho sobre `index.html` y elige **Open with Live Server**.

En Chrome o Edge puedes presionar F12 y activar la vista de dispositivo móvil para verla con tamaño de iPhone.

**Importante:** el iPhone exige **HTTPS** para instalar la app y para que funcione sin internet. `http://localhost` solo sirve en la propia PC. Si abres desde el iPhone la dirección de la PC en la red wifi (por ejemplo `http://192.168.1.20:8000`), la página se ve, pero no se instala correctamente ni funciona sin conexión. Para probarla en el iPhone, publícala primero (sección 4).

## 4. Publicarla gratis

Cualquiera de estas opciones entrega una dirección `https://` gratuita. La carpeta se sube tal cual.

### Alternativa A: Netlify Drop (la más rápida)

1. Abre <https://app.netlify.com/drop> en el navegador de la PC.
2. Arrastra la carpeta `AleStudio` completa a la página.
3. En unos segundos aparece una dirección del tipo `https://nombre-al-azar.netlify.app`.
4. Crea una cuenta gratuita de Netlify cuando lo pida (con un correo basta). Sin cuenta, el sitio se borra al poco tiempo.
5. Opcional: en **Site configuration → Change site name** puedes poner un nombre más fácil, por ejemplo `alestudio-ale.netlify.app`.

No hay que instalar nada en la PC.

### Alternativa B: GitHub Pages

1. Crea una cuenta gratuita en <https://github.com>.
2. Arriba a la derecha, **+ → New repository**. Nombre: `AleStudio`. Visibilidad: **Public** (GitHub Pages gratis requiere repositorio público). Clic en **Create repository**.
3. En la página del repositorio, clic en **uploading an existing file**.
4. Abre `C:\dev\AleStudio` en el Explorador de Windows, selecciona **todo su contenido** (`index.html`, `sw.js`, `manifest.webmanifest` y las carpetas `css`, `js`, `icons`) y arrástralo a la página. Deben subirse las carpetas con sus archivos adentro, no la carpeta `AleStudio` como tal: `index.html` tiene que quedar en la raíz del repositorio.
5. Clic en **Commit changes**.
6. Ve a **Settings → Pages**. En **Source** elige **Deploy from a branch**, rama **main**, carpeta **/ (root)**, y **Save**.
7. Espera uno o dos minutos. La dirección queda así: `https://TU-USUARIO.github.io/AleStudio/`.

Nota: el código del repositorio es público, pero los videos y datos de Alejandra nunca se suben; se quedan en su iPhone.

### Tercera opción

**Cloudflare Pages** (<https://pages.cloudflare.com>) también es gratis y permite subir la carpeta directamente desde el navegador.

## 5. Instalarla en el iPhone de Alejandra

1. Envíale la dirección `https://...` por mensaje.
2. Debe abrirla en **Safari**. No sirve Chrome ni el navegador interno de Instagram, WhatsApp o TikTok. Si el enlace se abre dentro de otra app, hay que tocar el menú y elegir **Abrir en Safari**, o copiar el enlace y pegarlo en Safari.
3. Tocar el botón **Compartir** (el cuadrado con la flecha hacia arriba).
4. Bajar en la lista y tocar **"Agregar a inicio"** (en algunos iPhone dice **"Añadir a pantalla de inicio"**).
5. Confirmar con **Agregar**.
6. Cerrar Safari y abrir AleStudio **desde su ícono** en la pantalla de inicio. A partir de ahí siempre se usa desde el ícono.

La primera vez que se abre desde el ícono necesita internet (aunque ya se haya abierto antes en Safari). Después funciona sin conexión.

## 6. Cómo actualizar la app

1. Haz los cambios en los archivos.
2. Abre `sw.js` y sube el número de la constante `CACHE_VERSION`, que está al inicio del archivo:

   ```js
   const CACHE_VERSION = 'v2';   // cámbialo a 'v3', luego 'v4', etc.
   ```

   Ese cambio le avisa a los iPhone que ya tienen la app instalada que hay una versión nueva. Si agregas archivos nuevos (por ejemplo dentro de `js/`), añádelos también a la lista `PRECACHE` del mismo archivo.
3. Vuelve a subir los archivos:
   - **Netlify:** entra al sitio, pestaña **Deploys**, y arrastra de nuevo la carpeta completa.
   - **GitHub Pages:** en el repositorio, **Add file → Upload files**, arrastra los archivos modificados y **Commit changes**.
4. En el iPhone, con internet: abrir la app, cerrarla por completo (deslizar hacia arriba desde el selector de apps) y volver a abrirla. Si todavía se ve la versión anterior, repetirlo una vez más.

Actualizar la app **no borra** los videos ni los datos guardados. Tampoco hay que reinstalarla.

## 7. Copias de seguridad y cambio de teléfono

Todo está en **Ajustes → Copia de seguridad**.

**Exportar**

1. Tocar **Exportar respaldo**. Aparece la hoja **Respaldo listo**.
2. Tocar **Guardar respaldo**. En el menú del iPhone, elegir **Guardar en Archivos** (idealmente en iCloud Drive), o enviárselo a sí misma por correo o AirDrop.
3. Se genera un archivo llamado `alestudio-respaldo-AAAA-MM-DD.json`. Conviene comprobar en la app Archivos que quedó guardado.

Si el menú del iPhone no se abre, la hoja muestra el botón **Abrir el archivo de respaldo**: tocarlo y, desde ahí, usar Compartir → **Guardar en Archivos**.

El respaldo incluye títulos, notas, tipos de contenido, orientación, duración, favoritos y miniaturas. **No incluye los archivos de video** ni las copias guardadas dentro de la app: los videos originales siguen en Fotos.

Conviene exportar cada cierto tiempo, y siempre antes de cambiar de iPhone, restaurarlo o borrar la app.

**Importar (por ejemplo, en un iPhone nuevo)**

1. Instalar AleStudio en el iPhone nuevo (sección 5).
2. Ir a **Ajustes → Importar respaldo** y elegir el archivo `.json`.
3. La app indica cuántos videos fueron nuevos y cuántos se actualizaron. Importar el mismo respaldo dos veces no duplica nada.
4. Si quiere volver a reproducir un video dentro de la app, abre su detalle, activa **Guardar copia dentro de la app** y elige el video otra vez desde Fotos.

Si el respaldo trae videos que ya están en la biblioteca, la app pide confirmación antes de importar. Los videos que se hayan editado en el iPhone después de crear el respaldo no se reemplazan, y los tipos de contenido que se hayan renombrado o cambiado de color en el iPhone conservan su nombre y color.

**Videos repetidos:** al agregar videos, la app omite los que ya están en la biblioteca (mismo nombre de archivo y mismo tamaño) y lo avisa.

## 8. Estructura del proyecto

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Página única de la app; carga los estilos, el código y registra el service worker. |
| `manifest.webmanifest` | Nombre, colores e íconos que usa el iPhone al instalarla. |
| `sw.js` | Service worker: guarda los archivos de la app para que funcione sin internet. Contiene `CACHE_VERSION`. |
| `icons/icon-180.png` | Ícono de la pantalla de inicio del iPhone. |
| `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-512-maskable.png` | Íconos para otros tamaños y dispositivos. |
| `css/base.css` | Estilos base: colores, tipografía, modo claro y oscuro, pantalla de carga. |
| `css/app.css` | Estilos de las pantallas: tarjetas, filtros, hojas de detalle, barra de pestañas. |
| `js/app.js` | Interfaz: Biblioteca, Resumen, Ajustes, detalle del video, respaldo. |
| `js/db.js` | Guardado de datos en el iPhone (IndexedDB), respaldo y restauración. |
| `js/classify.js` | Reglas de orientación, rangos de duración, tipos de contenido por defecto y formatos de texto. |
| `js/media.js` | Lee duración, tamaño y miniatura de cada video elegido. |
| `README.md` | Esta guía. |
