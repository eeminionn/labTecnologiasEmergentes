# Componentes de terceros

Mapa Gestual MLR 0.1.0, prototipo académico del proyecto territorial de La Reina.

- **MediaPipe Tasks Vision 1.0.1 y Hand Landmarker float16 v1:** Google, Apache License 2.0. [Código y licencia](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE), [modelo y ficha](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#models). SHA-256 del paquete de modelo: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- **Electron 44.5.1:** Electron contributors, MIT. [Licencia](https://github.com/electron/electron/blob/main/LICENSE). El ejecutable incluye también las licencias Chromium/Electron distribuidas con el runtime.
- **Leaflet 1.9.4:** Vladimir Agafonkin y colaboradores, BSD 2-Clause. [Licencia](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE).
- **OpenStreetMap:** datos © OpenStreetMap contributors, ODbL. Las teselas conservan su atribución visible y las condiciones de su [servicio](https://operations.osmfoundation.org/policies/tiles/). Se descargan únicamente vistas que la persona consulta; no se distribuye cartografía offline ni se precargan regiones.
- **Google Maps JavaScript API:** servicio propietario, no se redistribuye. Se carga por Internet solo cuando el usuario configura una API key. [Políticas](https://developers.google.com/maps/documentation/javascript/policies). Se conservan los logos y las atribuciones exigidos por el proveedor.
- **Imagen de prueba thumbs-up.png:** Google, fixture del repositorio MediaPipe Samples, Apache 2.0. [Archivo original](https://github.com/google-ai-edge/mediapipe-samples/blob/c2518ec444c3a3a99689e5d31eddadc240c83a0c/examples/hand_landmarker/ios/HandLandmarkerTests/thumbs-up.png), [licencia](https://github.com/google-ai-edge/mediapipe-samples/blob/c2518ec444c3a3a99689e5d31eddadc240c83a0c/LICENSE). SHA-256 `b373f1dd029cd339e11cb7921c30085e7604b3a051b1f7bfc47494d639f325c3`. Se incluye para comprobar inferencia positiva; no valida precisión cenital.

MediaPipe 1.0.1 incluye un logger de métricas de uso. Este prototipo restringe la red del worker a su origen local mediante una política CSP propia y bloquea adicionalmente `odml.pa.googleapis.com` en Electron. Los frames se entregan al worker en memoria. El mapa conserva su acceso de red y no recibe los frames de la cámara desde el código del prototipo.

Las licencias originales de dependencias instaladas acompañan sus paquetes. La investigación distingue la licencia de código de las restricciones de datasets/modelos alternativos que no se distribuyen aquí.
