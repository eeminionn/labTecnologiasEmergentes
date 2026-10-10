# Arquitectura del sistema - Mapa Gestual MLR

**Fecha:** 9 de octubre de 2026<br>
**Versión:** 0.1.13 · cámara frontal<br>
**Estado:** descripción de la implementación actual; evidencia de ejecución y paquetes en [Entrega y verificación](./04-entrega-y-verificacion.md). Precisión, falsos positivos y latencia física del montaje frontal pendientes de medir.<br>

[Volver al prototipo](../README.md) · [Protocolo de validación](./03-protocolo-validacion.md) · [Investigación de visión](./01-investigacion-vision.md)

## Diagrama y alcance

[Diagrama editable draw.io](./arquitectura-sistema-0.1.13.drawio) · [Vista SVG](./arquitectura-sistema-0.1.13.svg) · [Vista en imagen](./arquitectura-sistema-0.1.13.jpg) · [Página del diagrama en diagrams.net](https://app.diagrams.net/#G1zH-QVmRpldlNZucDmFmq9p4cygZ1nvYE#%7B%22pageId%22%3A%22CZj6euw5avdMBHTIqb5E%22%7D)

La aplicación tiene una ventana Electron propia. Una cámara **frontal mirando hacia la persona** entrega imágenes RGB; las manos deben aparecer completas y con iluminación uniforme. El renderer muestra mapa, video y feedback; un worker ejecuta la visión; el proceso principal valida permisos y clics nativos. OpenStreetMap o Google Maps aportan el mapa por Internet. El programa no automatiza un navegador externo.

## Flujo implementado

| Etapa | Entrada, decisión y salida | Implementación |
|:---|:---|:---|
| Preparar recursos | Copiar WASM y fixtures; descargar el modelo fijo sólo si falta; verificar SHA-256 en cada build. Vite empaqueta el worker como IIFE. | [prepare-assets](../scripts/prepare-assets.mjs), [Vite](../vite.config.js), [paquete](../package.json) |
| Abrir aplicación | Instancia única; servidor de archivos en `127.0.0.1:47831`; ventana con preload aislado. Cargar preferencias y mapa. La cámara queda detenida y todavía no se crea el modelo. | [Electron principal](../electron/main.cjs), [renderer](../src/main.js) |
| Iniciar cámara | Acción explícita → permiso `getUserMedia` sin audio → `video.play()` → capacidades y ajustes disponibles. Usar resolución real para calcular ancho/alto; crear motor y gate nuevos. | [renderer](../src/main.js), [controles de cámara](../src/camera-quality.js) |
| Inicializar visión | Crear worker; resolver WASM local con SIMD si el entorno lo admite; cargar HandLandmarker Full, delegate CPU, modo `VIDEO`, máximo dos manos. Esperar `ready` antes de capturar para inferencia. | [worker](../src/vision.worker.js) |
| Capturar | Bucle `requestAnimationFrame`: exigir video listo, frame distinto, worker listo y `busy=false`. Crear bitmap de ancho 640 y alto proporcional; transferirlo con timestamp. Hay un frame en vuelo, sin cola de bitmaps. | [renderer](../src/main.js) |
| Analizar e inferir | Copia de análisis de ancho 160 y alto proporcional → métricas de calidad. El bitmap del modelo sigue sin correcciones de contraste. `detectForVideo` es síncrono dentro del worker; cerrar bitmap incluso ante error. | [worker](../src/vision.worker.js), [calidad](../src/frame-quality.js) |
| Recibir y validar | Liberar `busy`; descartar resultado obsoleto; actualizar skeleton, manos y métricas. Gate de calidad, pausa, foco y diálogos deciden si se permiten acciones. La inferencia sigue durante pausa o bloqueo para conservar feedback fresco. | [renderer](../src/main.js), [gate](../src/frame-quality.js) |
| Interpretar intención | Asignar identidades locales por continuidad, filtrar punteros y consultar objetivos visibles por mano. Reglas propias arbitran zoom, selección y pan; otro actor no hereda el reloj. | [motor](../src/gestures.js), [geometría OK](../src/ok-geometry.js), [retención](../src/selection.js) |
| Ejecutar y mostrar | Orientar coordenadas al mapa; sombras por mano y aro del actor. Pan/zoom llaman al adaptador. Clic pasa por preload/IPC y validación de foco/origen/viewport antes de mouseMove/down/up nativos. | [mapeo](../src/mapping.js), [mapa](../src/map.js), [preload](../electron/preload.cjs), [Electron](../electron/main.cjs) |

Al detener o desconectar la cámara se paran los tracks, se termina el worker y se limpian skeleton y acciones. Una generación de sesión evita aceptar una captura o un inicio antiguo. Error del worker detiene la cámara; captura fallida libera `busy` para permitir otro intento. Pérdida de foco u ocultación pausa el control; volver a enfocar no lo reanuda automáticamente.

Los objetivos gestuales son el marcador propio actualmente activo y los botones visibles habilitados; los POIs arbitrarios de Google no se incorporan automáticamente. La entrada nativa activa el manejador DOM: el marcador abre popup y avanza una vez el recorrido 1→2→3; el botón ejecuta su acción sin avanzar otra vez. La respuesta IPC sólo informa si se aceptó el envío y permite contar clics y mostrar ripple.

Cancelar Ajustes no persiste ni reinicia la cámara; se respeta una pausa previa. Guardar reinicia sólo una cámara activa, salvo cambio de proveedor/key, que recarga la interfaz y deja la cámara detenida.

## Detección neural y reglas de gestos

El modelo preentrenado estima la mano; **el modelo no decide el clic ni la intención del usuario**. El `.task` local contiene `hand_detector.tflite` y `hand_landmarks_detector.tflite`; sus metadatos identifican las redes Full de palma y landmarks. El pipeline de MediaPipe detecta la palma, prepara su recorte y estima puntos; en video puede reutilizar una región seguida y volver al detector cuando pierde continuidad. No se debe dibujar detección de palma obligatoria en cada frame. La procedencia y documentación primaria están en [Investigación de visión](./01-investigacion-vision.md).

El worker devuelve **21 landmarks de imagen y 21 worldLandmarks estimados por mano**, junto con calidad y tiempos. Conserva ambos arrays en el mismo orden. XY de imagen posiciona skeleton, cursor y mapa; Z normalizada es relativa, mientras world XYZ describe una mano local estimada en metros. World no representa la distancia global entre dos manos ni aporta profundidad medida por otra cámara. **Handedness no se postea ni se usa**; no hay score de fiabilidad por mano empleado por el motor.

Metadatos verificados del modelo local: detector de palma `palmdetector_full_192x192_2021_09_30_v0` y red de puntos `handskeleton_handflag_handedness_full_2021_10_07_v0`.

Las reglas propias mantienen esta prioridad:

1. **Dos OK válidos:** zoom por separación de sus índices 8, sin pan ni clic.
2. **Índice 8 de mano no puño sobre un objetivo:** selección tras 1500 ms; sin exigir índice extendido ni otros dedos recogidos. Mapa vacío no inicia reloj. Destino, aro y tiempo pertenecen al actor y al ID del objetivo.
3. **Uno o dos puños:** pan por media de MCP 5/9/13/17 de los participantes, si no hay selección prioritaria.

Geometría XYZ positiva distingue OK y puño; world válido se prefiere y el fallback normalizado corrige aspecto cuando world está ausente. No se entrenan pesos nuevos ni se usa Gesture Recognizer. El hover se valida por tracking de imagen y objetivo, sin recuperar el veto de dedos de 0.1.11. Entrada/salida/reorden de un acompañante no participante conserva la acción. Las reglas completas y umbrales experimentales están en el [protocolo](./03-protocolo-validacion.md).

## Relojes y tolerancias diferentes

| Parámetro | Valor y función |
|:---|:---|
| Cámara solicitada | Ideal 640×480; ideal/máximo 30 FPS. Resolución efectiva consultada al video. |
| Resultado obsoleto | Más de **150 ms** desde la solicitud de captura: descartar; cancelar si ya hubo seguimiento fresco. |
| Vigilancia del renderer | Más de **180 ms** sin resultado después de uno fresco: cancelar y limpiar preview. |
| Continuidad del motor | Gap **≥180 ms** o timestamp no creciente: no contar tiempo atravesando la interrupción. |
| Calidad | Negro/blanco severo o datos inválidos bloquean inmediatamente; aviso severo estable **200 ms**, recuperación saludable **600 ms**, gap **>250 ms**. |
| Navegación | Adquisición **180 ms** al cambiar modo o participantes; base nueva, sin movimiento heredado. |
| Selección | **1500 ms** completos; deriva máxima **0,15 unidades de alto de cámara** desde origen fijo; retención del destino **+36 CSS px por lado** sobre hitarea mínima 44 px. |
| Rearme | Tras confirmar, salir del ID original **120 ms** para esa mano. Otro destino inicia su propio reloj; no repetir al volver antes. Cancelación de seguridad sin destino conocido exige hit-test nulo estable. |
| Feedback | Transición índice/nudillos **300 ms**; filtro One Euro suaviza movimiento. La guarda de retención usa índice actual, sin ese filtro. |

El análisis de calidad calcula luminancia, histograma, contraste por percentiles y detalle. Sólo los casos extremos globales bloquean por imagen; poco detalle o contraste son diagnósticos, sin garantía de foco o landmarks correctos. No se aplica CLAHE. Umbrales y controles físicos condicionales en [Cámara frontal, exposición y contraste](./06-camara-y-contraste.md).

## Configuración, privacidad y diagnóstico

Preferencias locales: cámara, espejo, orientación 0/90/180/270°, proveedor y API key, confianza 0,60/0,70/0,80, preferencia de modos continuos y controles admitidos por el track. La confianza predeterminada **0,70** se aplica a detección, presencia y tracking; no significa una garantía de acierto del 70 %. Brillo, contraste y compensación de exposición sólo aparecen con capacidades declaradas. Se verifican valores tras `applyConstraints`; el diagnóstico distingue ajustes no confirmados o rechazados.

El frame completo se mapea al mapa con espejo/orientación, sin homografía activa. Imágenes, bitmaps y landmarks se procesan en el equipo; la exportación de diagnóstico no incluye frames RGB. El worker recibe una CSP exclusiva con `connect-src 'self'`, y Electron bloquea además el endpoint de métricas de MediaPipe `odml.pa.googleapis.com`. La CSP del renderer permite los proveedores de mapas: **la aplicación completa requiere conexiones externas**. El proceso principal limita permisos a media desde su ventana/origen local, excluye audio y valida los clics dentro del viewport, fuera de barra superior y footer.

El diagnóstico exporta contadores, anotaciones manuales de falsos clics y p50/p95 separados de **calidad**, **inferencia** y **captura→resultado**, con hasta 10.000 muestras recientes. El último incluye creación del bitmap y traslado entre hilos; excluye buffer físico de cámara y presentación en pantalla. No es latencia extremo a extremo ni una tasa de falsos positivos medida. La evidencia de pruebas y sus límites se mantienen en [Entrega y verificación](./04-entrega-y-verificacion.md).
