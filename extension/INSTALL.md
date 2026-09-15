# Instalación de Jocotoco IUCN Connector

La extensión es un adaptador de red mínimo. No contiene la interfaz del programa, no guarda archivos, no usa base de datos y no persiste el token.

## Chrome — prueba / distribución interna

1. Descomprime el ZIP del proyecto en una carpeta permanente. No borres ni muevas la carpeta `extension` después de instalarla.
2. Abre una pestaña nueva y escribe:

   `chrome://extensions`

3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** / **Load unpacked**.
5. Selecciona **la carpeta `extension`** del proyecto. Debes seleccionar la carpeta que contiene `manifest.json`, no el ZIP completo.
6. Debe aparecer **Jocotoco IUCN Connector**.
7. Abre o recarga IUCN Tool en GitHub Pages. En la pantalla inicial debe aparecer:

   `Conector IUCN instalado y disponible`

8. Haz primero una prueba manual con `Panthera leo` y tu token.

## Microsoft Edge

El flujo es equivalente:

1. `edge://extensions`
2. Activa **Modo de desarrollador**.
3. **Cargar desempaquetada** / **Load unpacked**.
4. Selecciona la carpeta `extension`.
5. Recarga IUCN Tool.

## Qué permisos solicita

La extensión está limitada por `manifest.json` a:

- ejecutarse únicamente en `https://jocoacoustics.github.io/*` y, para desarrollo, `localhost` / `127.0.0.1`;
- hacer solicitudes únicamente a `https://api.iucnredlist.org/*`.

El motor de la extensión rechaza además cualquier ruta que no empiece por `/api/v4/`.

## Para distribución definitiva

El modo **Cargar descomprimida** es ideal para pruebas e instalación interna. Para una experiencia de un clic y actualizaciones automáticas, el siguiente paso es publicar la misma extensión en Chrome Web Store como extensión no listada o según la política de la organización. La aplicación de GitHub Pages no cambia.

## Si la página dice “Conector no detectado”

- confirma que la extensión está habilitada en `chrome://extensions`;
- recarga la página de IUCN Tool;
- abre el menú de la extensión y confirma que aparece “Conector instalado”;
- revisa que estás usando `jocoacoustics.github.io` o `localhost`;
- si Chrome restringió el acceso del sitio para la extensión, vuelve a permitirlo y recarga.
