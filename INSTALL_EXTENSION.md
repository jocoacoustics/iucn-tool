# Instalar Jocotoco IUCN Connector

IUCN Tool bloquea la carga de archivos y la entrada manual hasta detectar esta extensión. Solo debes instalarla una vez por perfil de navegador.

## Chrome

1. Descarga `Jocotoco-IUCN-Connector.zip` desde IUCN Tool.
2. Descomprime el ZIP en una **carpeta permanente**.
3. Copia esta ruta y pégala directamente en la barra de direcciones:

   ```text
   chrome://extensions
   ```

4. En **Extensiones**, activa **Modo de desarrollador**.
5. Pulsa **Cargar extensión sin empaquetar**.
6. Selecciona la carpeta que contiene directamente `manifest.json`.
7. Regresa a IUCN Tool y pulsa **Ya lo instalé · Recargar y comprobar**.

## Microsoft Edge

1. Descarga y descomprime el mismo ZIP en una carpeta permanente.
2. Copia y pega en la barra de direcciones:

   ```text
   edge://extensions
   ```

3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar desempaquetado**.
5. Selecciona la carpeta que contiene directamente `manifest.json`.
6. Regresa a IUCN Tool y recarga/comprueba el conector.

IUCN Tool detecta Chrome o Edge y muestra automáticamente la ruta y el texto de instalación correspondientes en la ventana inicial.

## Token

La extensión puede recordar opcionalmente el token IUCN usando exclusivamente `chrome.storage.local`. El control **Recordar token** aparece a la derecha del campo del token. No usa sincronización, cookies ni almacenamiento de servidor. El token guardado puede borrarse desde IUCN Tool con **Olvidar**.

> **Importante:** no borres ni muevas la carpeta descomprimida mientras uses la extensión cargada de forma local.
