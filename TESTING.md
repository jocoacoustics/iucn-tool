# QA ejecutado

## Sintaxis

```text
node --check assets/js/app.js
node --check assets/js/extension-bridge.js
node --check extension/service-worker.js
node --check extension/content-script.js
python -m py_compile local_server.py iucn_api.py
```

## Pruebas automáticas

```text
node tests/extension_worker.test.js
node tests/core_extension_transport.test.js
python tests/test_engine_mock.py
python tests/test_local_api_mock.py
```

Verifican:

- origen web permitido/rechazado;
- allowlist exclusiva de IUCN API v4;
- autenticación `Authorization: <token>`;
- guardado, lectura y borrado opcional del token en `chrome.storage.local`;
- uso del token local guardado cuando la petición no entrega uno;
- deduplicación de nombres científicos;
- reconstrucción de filas repetidas;
- motor Python de validación local.

## QA de UX incorporado

- IUCN Tool arranca bloqueado y difuminado hasta que el conector responde al `ping`.
- No existe botón para cerrar el bloqueo sin instalar la extensión.
- Al desaparecer el conector durante una sesión, un heartbeat vuelve a bloquear la aplicación.
- Chrome/Edge se detectan para mostrar icono y ruta correctos.
- El botón de extensiones intenta abrir la ruta interna y la copia como respaldo.
- El token recordado se recupera al iniciar y puede eliminarse con **Olvidar**.
- La persistencia no usa `localStorage`, `sessionStorage`, IndexedDB, cookies ni `chrome.storage.sync`.


## UX instalación 2026-09-14

- La app permanece bloqueada hasta detectar el conector.
- Se eliminó el intento de abrir `chrome://extensions` / `edge://extensions` desde la web.
- La ventana muestra la ruta correcta según Chrome o Edge para copiar/pegar en la barra de direcciones.
- Chrome usa el texto actual **Cargar extensión sin empaquetar**.
- Edge usa **Cargar desempaquetado**.
- El control **Recordar token** está en la misma línea del campo del token y usa un switch compacto.
- Desmarcar “Recordar token” borra la persistencia local sin vaciar el token de la sesión actual.
