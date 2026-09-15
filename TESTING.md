# QA ejecutado

## Sintaxis

- `extension/service-worker.js`: `node --check`
- `extension/content-script.js`: `node --check`
- `assets/js/extension-bridge.js`: `node --check`
- `assets/js/iucn-core.js`: `node --check`
- `assets/js/app.js`: `node --check`
- `extension/manifest.json`: JSON válido
- `iucn_api.py` y `local_server.py`: compilación Python

## Pruebas automáticas ejecutadas

### Extensión

`tests/extension_worker.test.js`

Verifica con `fetch` simulado que:

- acepta el origen `jocoacoustics.github.io`;
- rechaza orígenes no autorizados;
- restringe las llamadas a `https://api.iucnredlist.org/api/v4/`;
- transmite exactamente `Authorization: <token>`;
- no actúa como proxy general.

### Núcleo web + transporte de extensión

`tests/core_extension_transport.test.js`

Verifica que:

- `Panthera leo` se consulta en `/api/v4/taxa/scientific_name`;
- el token llega al transporte de extensión;
- se interpreta taxonomía y categoría IUCN;
- nombres repetidos/normalizados generan una sola consulta por único;
- se reconstruyen todas las filas originales.

### Motor Python de respaldo

- `tests/test_engine_mock.py`: deduplicación y resultado.
- `tests/test_local_api_mock.py`: API local de trabajos, progreso y resultado.

## Límite de esta QA

No se incluye un token IUCN en el repositorio ni en las pruebas. La llamada live autenticada se valida con el token del usuario. El motor Python original ya fue validado live por el usuario; la extensión replica su header `Authorization: <token>` y endpoint API v4.

## Onboarding y descarga integrada

- `downloads/Jocotoco-IUCN-Connector.zip` existe dentro del sitio publicable.
- `index.html` enlaza al ZIP mediante una ruta relativa.
- Si el conector está disponible, el onboarding de instalación se oculta.
- Si el conector no está disponible, se muestran descarga + instrucciones desplegables.
