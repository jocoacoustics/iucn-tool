# Instalar Jocotoco IUCN Connector

IUCN Tool bloquea la carga de archivos y la entrada manual hasta detectar esta extensión. Solo debes instalarla una vez por perfil de navegador.

## Chrome

1. Descarga `Jocotoco-IUCN-Connector.zip` desde IUCN Tool.
2. Descomprime el ZIP en una carpeta permanente.
3. Abre `chrome://extensions`.
4. Activa **Modo de desarrollador**.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta que contiene `manifest.json`.
7. Regresa a IUCN Tool y recarga la página.

## Edge

Sigue los mismos pasos usando:

```text
edge://extensions
```

IUCN Tool detecta automáticamente Chrome o Edge para mostrar la ruta correspondiente.

## Token

La extensión puede recordar opcionalmente el token IUCN usando exclusivamente `chrome.storage.local`. No usa sincronización, cookies ni almacenamiento de servidor. El token guardado puede borrarse desde IUCN Tool con **Olvidar**.

> No borres ni muevas la carpeta descomprimida después de instalar una extensión mediante **Cargar descomprimida**.
