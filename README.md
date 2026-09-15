# IUCN Tool — GitHub Pages + conector local

Interfaz web para consultar **IUCN Red List API v4** desde Excel, CSV o una lista manual, sin mantener un servidor central.

## Cómo funciona

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

Los Excel/CSV se leen y procesan en el navegador. La página normaliza nombres, calcula los nombres únicos, reconstruye las filas repetidas, muestra el progreso y genera el XLSX final. La extensión tiene una responsabilidad mínima: realizar la petición autenticada a IUCN que una página web normal no puede realizar de forma fiable por CORS.

No hay Cloud Run, Cloudflare Worker, servidor Jocotoco ni base de datos.

## Inicio rápido para usuarios

### 1. Instalar el conector — solo la primera vez

La propia página de IUCN Tool muestra un botón **Descargar conector (.zip)** cuando no detecta la extensión. El archivo también está incluido en este repositorio en:

```text
downloads/Jocotoco-IUCN-Connector.zip
```

#### Chrome

1. Descarga **Jocotoco-IUCN-Connector.zip** desde IUCN Tool.
2. Descomprime el ZIP en una **carpeta permanente**, por ejemplo:

   ```text
   Documentos/Jocotoco-IUCN-Connector/
   ```

3. En Chrome abre:

   ```text
   chrome://extensions
   ```

4. Activa **Modo de desarrollador** en la esquina superior derecha.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta descomprimida que contiene directamente:

   ```text
   manifest.json
   service-worker.js
   content-script.js
   popup.html
   ```

7. Vuelve a IUCN Tool y recarga la página.
8. Debe aparecer el estado verde **Conector IUCN listo**.

> **Importante:** no borres ni muevas la carpeta descomprimida después de instalarla. Una extensión cargada como *unpacked* se ejecuta desde esa carpeta.

#### Microsoft Edge

El procedimiento es el mismo, pero abre:

```text
edge://extensions
```

y utiliza **Cargar desempaquetado / Load unpacked**.

### 2. Usar IUCN Tool

1. Abre IUCN Tool.
2. Comprueba que aparezca **Conector IUCN listo**.
3. Carga un Excel/CSV o usa **Ingresar manualmente**.
4. Introduce tu token IUCN.
5. Pulsa **Consultar**.
6. Descarga el XLSX resultante.

Se consulta una sola vez cada nombre científico normalizado único. Las filas repetidas reutilizan el resultado.

## Qué verá el usuario

El bloque del conector es adaptativo:

- **Conector instalado:** solo muestra un estado verde compacto y no ocupa espacio adicional.
- **Conector ausente:** muestra la descarga y las instrucciones de instalación.
- **Desarrollo local con Python:** indica que el motor local de respaldo está disponible.

La instalación del conector se realiza una sola vez. Las futuras mejoras de la interfaz se publican en GitHub Pages y aparecen automáticamente al recargar, sin reinstalar la extensión mientras el protocolo del conector no cambie.

## Privacidad

- El archivo Excel/CSV no se sube a un servidor Jocotoco.
- El token se mantiene en memoria durante la sesión y la extensión no lo almacena.
- No se usa `localStorage`, `sessionStorage`, IndexedDB ni cookies para persistir token o datos.
- La extensión solo tiene permiso para `api.iucnredlist.org`.
- La extensión solo se inyecta en `jocoacoustics.github.io` y en `localhost` para desarrollo.
- El service worker rechaza destinos que no sean IUCN API v4.

## Publicar en GitHub Pages

Publica la raíz del proyecto mediante GitHub Pages. La extensión autoriza:

```text
https://jocoacoustics.github.io/*
```

Por ejemplo:

```text
https://jocoacoustics.github.io/iucn-tool/
```

El botón de descarga utiliza una ruta relativa:

```text
downloads/Jocotoco-IUCN-Connector.zip
```

por lo que sigue funcionando aunque cambie el nombre del repositorio dentro de `jocoacoustics.github.io`.

Si en el futuro se publica bajo otro dominio, hay que agregar ese dominio a `extension/manifest.json` y a la lista `ALLOWED_WEB_ORIGINS` de `extension/service-worker.js`.

## Desarrollo local

Se mantiene el motor Python validado como respaldo para desarrollo:

```bat
python local_server.py
```

Abre:

```text
http://127.0.0.1:8000
```

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
├── downloads/
│   └── Jocotoco-IUCN-Connector.zip   ← descarga desde la propia UX
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

## Seguridad del conector

El conector aplica dos límites además de los permisos de Chrome:

1. acepta mensajes únicamente cuando la pestaña pertenece a `jocoacoustics.github.io`, `localhost` o `127.0.0.1`;
2. construye las solicitudes exclusivamente sobre `https://api.iucnredlist.org/api/v4/`.

La autenticación replica el comportamiento del motor Python validado: `Authorization: <token>`.

## Actualizar la extensión

La mayoría de cambios de IUCN Tool ocurren en GitHub Pages y no requieren tocar la extensión. Si alguna vez cambia el conector:

1. descarga el ZIP nuevo;
2. reemplaza el contenido de la carpeta permanente del conector;
3. abre `chrome://extensions`;
4. pulsa **Recargar** en *Jocotoco IUCN Connector*;
5. recarga IUCN Tool.
