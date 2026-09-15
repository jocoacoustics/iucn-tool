# IUCN Tool — GitHub Pages + conector local

Interfaz web para consultar **IUCN Red List API v4** desde Excel, CSV o una lista manual, sin mantener un servidor central.

## Arquitectura

```text
GitHub Pages
HTML + CSS + JavaScript
        │
        │ mensaje local del navegador
        ▼
Jocotoco IUCN Connector
Extensión Chrome/Edge · Manifest V3
        │
        │ HTTPS · Authorization: <token>
        ▼
IUCN Red List API v4
```

Los Excel/CSV se leen y procesan en el navegador. La página normaliza nombres, consulta una sola vez cada nombre científico único, reconstruye las filas repetidas, muestra progreso y genera el XLSX final. La extensión tiene una responsabilidad mínima: realizar el `fetch` autenticado a IUCN que una página web normal no puede realizar de forma fiable por CORS.

No hay Cloud Run, Cloudflare Worker, servidor Jocotoco ni base de datos.

## Experiencia del usuario

IUCN Tool **no permite cargar archivos ni usar la entrada manual hasta detectar el conector**.

Cuando la extensión no está instalada o está desactivada, la aplicación queda difuminada y bloqueada detrás de una ventana de instalación. Esa ventana desaparece únicamente cuando IUCN Tool detecta correctamente la extensión.

La ventana incluye:

- descarga directa de `Jocotoco-IUCN-Connector.zip`;
- instrucciones completas;
- detección automática de Chrome o Edge para mostrar **solo la ruta interna correcta** y el icono correspondiente;
- el nombre del botón de carga de extensión adaptado al navegador;
- botón **Ya lo instalé · Recargar y comprobar**.

La aplicación **no intenta abrir** `chrome://extensions` ni `edge://extensions` desde la web, porque los navegadores pueden bloquear las URLs internas iniciadas por una página HTTPS. En su lugar, muestra la ruta correcta para copiarla y pegarla en la barra de direcciones.

## Instalación del conector — una sola vez

### Chrome

1. En IUCN Tool pulsa **Descargar conector (.zip)**.
2. Descomprime el ZIP en una **carpeta permanente**, por ejemplo:

   ```text
   Documentos/Jocotoco-IUCN-Connector/
   ```

3. IUCN Tool mostrará la ruta correcta para Chrome. Cópiala y pégala directamente en la barra de direcciones:

   ```text
   chrome://extensions
   ```

4. En la página **Extensiones**, activa **Modo de desarrollador**.
5. Pulsa **Cargar extensión sin empaquetar**.
6. Selecciona la carpeta que contiene directamente:

   ```text
   manifest.json
   service-worker.js
   content-script.js
   popup.html
   ```

7. Vuelve a IUCN Tool y pulsa **Ya lo instalé · Recargar y comprobar**.
8. Si el conector responde correctamente, la ventana desaparece y la aplicación queda habilitada.

> **Importante:** no borres ni muevas la carpeta descomprimida mientras uses una extensión cargada como *unpacked*.

### Microsoft Edge

El proceso es idéntico. IUCN Tool detecta Edge y muestra:

```text
edge://extensions
```

Copia esa ruta y pégala en la barra de direcciones. En Edge, activa **Modo de desarrollador** y pulsa **Cargar desempaquetado**.

## Uso

Una vez instalado el conector:

1. Abre IUCN Tool.
2. La ventana de instalación debe desaparecer automáticamente.
3. Carga un Excel/CSV o pulsa **Ingresar manualmente**.
4. Introduce el token IUCN. A la derecha del campo puedes activar **Recordar token**.
5. Si lo activas, el token queda guardado únicamente en la extensión local de ese navegador.
6. Pulsa **Consultar**.
7. Descarga el XLSX resultante.

## Recordar el token

El token **solo puede persistirse de forma local y opcional**.

Si el usuario marca **Recordar token en este navegador**:

- se guarda en `chrome.storage.local` de **Jocotoco IUCN Connector**;
- permanece únicamente en ese perfil local del navegador;
- no utiliza `chrome.storage.sync`;
- no utiliza `localStorage`, `sessionStorage`, IndexedDB ni cookies de la página;
- no se envía a servidores de Jocotoco;
- se recupera automáticamente al volver a abrir IUCN Tool;
- puede eliminarse con **Olvidar**;
- el control **Recordar token** aparece en la misma línea que el campo del token para mantener la interfaz compacta.

El token sí se transmite por HTTPS a IUCN cuando se realiza una consulta, porque es la credencial requerida por IUCN API v4.

## Privacidad

- El Excel/CSV permanece en el navegador del usuario.
- La aplicación no tiene backend propio.
- Los resultados se construyen localmente.
- El token solo se usa para IUCN.
- La persistencia del token es opcional y exclusivamente local en la extensión.
- La extensión solo tiene permiso de host para `api.iucnredlist.org`.
- El service worker rechaza rutas que no pertenezcan a `/api/v4/`.
- El content script solo se inyecta en `jocoacoustics.github.io`, `localhost` y `127.0.0.1`.

## Publicar en GitHub Pages

Publica la raíz del proyecto mediante GitHub Pages. La extensión autoriza:

```text
https://jocoacoustics.github.io/*
```

Por ejemplo:

```text
https://jocoacoustics.github.io/iucn-tool/
```

El ZIP del conector está dentro del propio proyecto:

```text
downloads/Jocotoco-IUCN-Connector.zip
```

y la UX usa una ruta relativa, por lo que funciona independientemente del nombre del repositorio bajo `jocoacoustics.github.io`.

Si se publica bajo otro dominio, hay que agregarlo a:

- `extension/manifest.json` → `content_scripts.matches`;
- `extension/service-worker.js` → `ALLOWED_WEB_ORIGINS`.

## Desarrollo local

Puedes servir el proyecto con el servidor Python incluido:

```bat
python local_server.py
```

Luego abre:

```text
http://127.0.0.1:8000
```

La UX de esta versión **sigue exigiendo que la extensión esté instalada** antes de habilitar carga de archivos o entrada manual. El servidor Python se conserva únicamente como herramienta de desarrollo y validación.

## Estructura

```text
iucn-tool-github-extension/
├── index.html
├── assets/
│   ├── css/styles.css
│   ├── icons/
│   │   ├── chrome.svg
│   │   └── edge.svg
│   └── js/
│       ├── extension-bridge.js
│       ├── iucn-core.js
│       ├── app.js
│       ├── table.js
│       └── config.js
├── downloads/
│   └── Jocotoco-IUCN-Connector.zip
├── extension/
│   ├── manifest.json
│   ├── content-script.js
│   ├── service-worker.js
│   ├── popup.html
│   └── INSTALL.md
├── iucn_api.py
├── local_server.py
├── requirements.txt
├── examples/
├── tests/
├── INSTALL_EXTENSION.md
├── TESTING.md
└── THIRD_PARTY_NOTICES.md
```

## Actualizar la extensión

La mayoría de mejoras de IUCN Tool ocurren en GitHub Pages y no requieren reinstalar el conector. Si cambia la extensión:

1. descarga el ZIP nuevo;
2. reemplaza el contenido de la carpeta permanente;
3. abre `chrome://extensions` o `edge://extensions`;
4. pulsa **Recargar** en *Jocotoco IUCN Connector*;
5. recarga IUCN Tool.
