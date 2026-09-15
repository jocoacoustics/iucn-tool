# IUCN Tool — GitHub Pages + conector local

https://jocoacoustics.github.io/iucn-tool/

Interfaz para consultar **IUCN Red List API v4** desde Excel, CSV o una lista manual sin mantener un servidor central.

## Arquitectura principal

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

Los Excel/CSV se leen y procesan en el navegador. La página normaliza nombres, calcula únicos, reconstruye filas repetidas, muestra progreso y genera el XLSX final. La extensión tiene una responsabilidad mínima: realizar la petición autenticada a IUCN que una página web normal no puede realizar de forma fiable por CORS.

No hay Cloud Run, Cloudflare Worker, servidor Jocotoco ni base de datos.

## Privacidad

- El archivo Excel/CSV no se sube a un servidor Jocotoco.
- El token se mantiene en memoria durante la sesión y la extensión no lo almacena.
- No se usa `localStorage`, `sessionStorage`, IndexedDB ni cookies para persistir token o datos.
- La extensión solo tiene permiso para `api.iucnredlist.org`.
- La extensión solo se inyecta en `jocoacoustics.github.io` y en `localhost` para desarrollo.
- El service worker rechaza destinos que no sean IUCN API v4.

## Instalar la extensión

Consulta `INSTALL_EXTENSION.md`.

Resumen para Chrome:

```text
chrome://extensions
→ Modo de desarrollador
→ Cargar descomprimida
→ seleccionar la carpeta extension/
→ recargar IUCN Tool
```

La pantalla inicial muestra automáticamente si el conector fue detectado.

## Publicar la web en GitHub Pages

Sube el contenido del proyecto al repositorio de `jocoacoustics` y publica la raíz mediante GitHub Pages. La extensión ya autoriza:

```text
https://jocoacoustics.github.io/*
```

Por tanto puede funcionar en cualquier repositorio Pages de esa organización, por ejemplo:

```text
https://jocoacoustics.github.io/iucn-tool/
```

Si en el futuro se publica bajo otro dominio, hay que agregar ese dominio a `extension/manifest.json` y a la lista `ALLOWED_WEB_ORIGINS` de `extension/service-worker.js`.

## Consulta

1. Abre IUCN Tool.
2. Comprueba que diga **Conector IUCN instalado y disponible**.
3. Carga Excel/CSV o usa entrada manual.
4. Introduce tu token IUCN.
5. Pulsa **Consultar**.
6. Descarga el XLSX.

Se consulta una sola vez cada nombre normalizado único. Las filas repetidas reutilizan el resultado.

## Desarrollo local

Se mantiene el motor Python validado como respaldo para desarrollo:

```bat
python local_server.py
```

Abre `http://127.0.0.1:8000`.

Si la extensión está instalada, la web le da prioridad al conector. Si no está instalada y estás en localhost, utiliza el motor Python local.

## Estructura

```text
iucn-tool-github-extension/
├── index.html
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── extension-bridge.js
│       ├── iucn-core.js
│       ├── app.js
│       ├── table.js
│       └── config.js
├── extension/
│   ├── manifest.json
│   ├── content-script.js
│   ├── service-worker.js
│   └── popup.html
├── iucn_api.py
├── local_server.py
├── requirements.txt
├── examples/
├── tests/
├── INSTALL_EXTENSION.md
├── TESTING.md
└── THIRD_PARTY_NOTICES.md
```

## Seguridad del conector

El conector aplica dos límites además de los permisos de Chrome:

1. acepta mensajes únicamente cuando la pestaña pertenece a `jocoacoustics.github.io`, `localhost` o `127.0.0.1`;
2. construye las solicitudes exclusivamente sobre `https://api.iucnredlist.org/api/v4/`.

La autenticación replica el comportamiento del motor Python validado: `Authorization: <token>`.
