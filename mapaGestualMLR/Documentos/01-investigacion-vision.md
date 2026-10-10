# Investigación de visión computarizada: manos sobre una superficie

> **Montaje vigente · 0.1.13 · 9 de octubre de 2026.** La cámara es **frontal, frente a la persona**, con manos completas en encuadre e iluminación uniforme; todo el encuadre corresponde al mapa. El planteamiento cenital y las comparaciones siguientes se conservan como investigación inicial, no como instrucciones del montaje actual. Modelo y gestos se mantienen; consultar [protocolo](./03-protocolo-validacion.md) y [entrega](./04-entrega-y-verificacion.md).

> **Nota histórica · 0.1.1 · 5 de octubre de 2026.** La navegación actual usa **dos OK**: mantener `180 ms`, mover ambas manos juntas para desplazar y cambiar su separación para zoom. El pan con una palma abierta se eliminó por una observación del usuario sobre activaciones accidentales. Índice para apuntar y OK de una mano para clic al soltar continúan. Halo y ripple se muestran sólo cuando el detector reporta exactamente una mano. El modelo, SDK y umbrales de detección conservan su configuración. La revisión final aprobó **37/37 pruebas: 34 de gestos y 3 de calibración**, además del smoke del paquete Mac, cinco checks de puntero y tres de navegación. Windows CI aprobó pruebas, build, smoke de runtime, distribución portable y smoke del contenido empaquetado; no se probó el arranque del envoltorio portable ni una cámara física. El texto siguiente mantiene la investigación y evidencia histórica de 0.1.0. La cámara cenital y Google con key siguen pendientes. Consultar el [protocolo vigente](./03-protocolo-validacion.md).

**Proyecto:** control gestual de mapa para La Reina. **Consulta de fuentes:** 5 de octubre de 2026. **Estado:** recomendación de arquitectura, comprobaciones de runtime con imágenes fijas y protocolo experimental; no constituye una validación con la cámara o el PC de la instalación.

## Decisión para el prototipo

Usar **MediaPipe Tasks Hand Landmarker full**, dos manos, modo `VIDEO`, inferencia local en un `Web Worker` dentro de la aplicación Electron, con un motor de gestos propio basado en geometría y estados temporales. Es la alternativa inicial más defendible por integración, seguimiento temporal y coste de despliegue. Es una decisión de ingeniería para este prototipo, **no una afirmación de que este modelo sea el más preciso en cualquier cámara cenital**.

El modelo produce 21 puntos por mano. Su pipeline localiza la palma y estima los puntos en un recorte; en video reutiliza la región seguida y vuelve al detector cuando pierde la mano. La documentación permite configurar dos manos y los tres umbrales de detección, presencia y seguimiento. [Guía oficial de Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker).

La vista cenital debe tratarse como una distribución de imágenes nueva. La ficha oficial de 2021 describe manos prominentes capturadas con smartphones, uso experimental y limitaciones ante guantes, oclusión, adornos y condiciones extremas. No proporciona una tasa de falsos clics en mesas cenitales. Por ello la elección definitiva depende de una comparación con grabaciones de la instalación. [Model card oficial, octubre de 2021](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf).

## Comparación de candidatos

| Candidato | Qué resuelve | Adecuación a este prototipo | Limitación que cambia la decisión |
| --- | --- | --- | --- |
| **MediaPipe Hand Landmarker full** | Localización y 21 landmarks con seguimiento de video | **Primera implementación**; CPU WASM, dos manos, modelo y runtime locales | Precisión cenital y tasa de activaciones involuntarias por medir |
| **MediaPipe Gesture Recognizer** | Landmarks más categorías de postura | Útil si luego se necesita distinguir muchas posturas discretas | Las categorías predeterminadas no incluyen OK; una postura estática no determina intención de clic o arrastre |
| **OpenCV Zoo palm + handpose MediaPipe** | Conversión ONNX de la misma familia de detector/landmarks | Alternativa para motor nativo C++/OpenCV u ONNX | No es evidencia de mayor precisión; implica implementar seguimiento e integración; evitar int8 sin validar |
| **RTMDet hand + RTMPose hand, MMPose** | Detector y estimador 2D de 21 puntos, entrenamiento configurable | **Primer candidato a comparar si falla el baseline**; permite adaptación supervisada al dominio | Más trabajo de datos, exportación y seguimiento; sus FPS famosos de cuerpo no se trasladan a manos |
| **HaMeR** | Reconstrucción de malla y pose 3D con Transformers | Referente de investigación si se necesita 3D articulado real | Complejidad y ruta CUDA; dependencias MANO; el mapa necesita sobre todo 2D estable |
| **WiLoR** | Localización y reconstrucción 3D en escenas diversas | Referente para futuras investigaciones sobre oclusiones | Ruta CUDA y licencias restrictivas; no hay evidencia suficiente de ventaja CPU para este uso |
| **HaGRIDv2 + detector/clasificador de gestos** | Detección/categorización de gestos como OK | Fuente de ejemplos y de negativos para futura clasificación | Mayor complejidad para movimiento continuo; dominio principalmente frontal; landmarks del dataset autoanotados con MediaPipe |

Gesture Recognizer incluye palma, landmarks, embedding y clasificador. Sus posturas predeterminadas son puño, palma abierta, índice hacia arriba, pulgares arriba/abajo, victoria e ILoveYou, además de ausencia de categoría. Puede incorporar un clasificador personalizado. **No usar la etiqueta de postura como evento directo:** el mismo OK puede mantenerse durante segundos y debe generar como máximo un clic o un arrastre según su evolución. [Guía oficial de Gesture Recognizer](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer).

OpenCV Zoo declara Apache 2.0 y que sus modelos proceden de una conversión TFLite→ONNX. Su README de handpose advierte que la variante int8 puede producir resultados inválidos por una caída importante de precisión. Elegir el modelo full original antes de introducir cuantización adicional. [Palm detector](https://github.com/opencv/opencv_zoo/tree/main/models/palm_detection_mediapipe), [Handpose](https://github.com/opencv/opencv_zoo/tree/main/models/handpose_estimation_mediapipe).

RTMPose publica un estimador de manos `256×256`, 21 puntos, entrenado con cinco datasets, y un detector RTMDet de manos. La tabla del modelo Hand5 indica PCK@0.2 de 96.4 en Hand5, pero deja vacías las columnas de latencia ORT/TRT. Esos resultados no miden precisión de clics ni cámara cenital; no son comparables directamente con métricas de MediaPipe. [Model zoo oficial RTMPose](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose). MMPose ofrece código de entrenamiento y se publica bajo Apache 2.0; revisar también las condiciones de los datos y pesos elegidos. [MMPose](https://github.com/open-mmlab/mmpose).

HaMeR publica entrenamiento y evaluación de mallas 3D, código MIT y una instalación de referencia con CUDA; requiere descargar MANO por separado. WiLoR también requiere MANO y documenta CUDA. Sus pesos se publican bajo CC BY-NC-ND 4.0. La licencia de MANO limita el uso a investigación/educación/arte no comerciales y restringe distribución. Estas condiciones hacen poco conveniente incorporarlos al `.exe` municipal como primera opción. [HaMeR](https://github.com/geopavlakos/hamer), [WiLoR](https://github.com/rolpotamias/WiLoR), [Licencia WiLoR](https://github.com/rolpotamias/WiLoR/blob/main/license.txt), [Licencia MANO](https://mano.is.tue.mpg.de/license.html).

## Latencia: qué se sabe y qué debe medirse

Google publica **17.12 ms CPU / 12.27 ms GPU**, promedio del pipeline Hand Landmarker full en **Pixel 6**. Es una referencia de viabilidad, no una promesa de latencia Windows, WASM, dos manos, captura ni respuesta del mapa. [Benchmark oficial](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#task_benchmarks).

El informe RTMPose anuncia 90+ FPS en Intel i7-11700 para su modelo de **cuerpo COCO**, no para detector+dos manos. Sus mediciones de pipeline pueden saltar detección durante cinco frames. No convertir esos FPS en una comparación con el resultado de Google o en una especificación de este programa. [Informe RTMPose, 2023](https://arxiv.org/abs/2303.07399).

Medir por separado:

1. Captura y disponibilidad del frame.
2. Transferencia, preprocesamiento e inferencia.
3. Filtro, geometría y decisión temporal del gesto.
4. Envío de la acción al mapa y siguiente frame visible.
5. Tiempo deliberado exigido al usuario para confirmar un clic.

Registrar p50, p95 y p99, no solo promedio/FPS. Medir tiempo desde imagen recibida hasta overlay/mapa visible mediante timestamps de la aplicación. Este valor **no incluye necesariamente la exposición, buffering o demora USB de la cámara**. Para latencia física gesto→pantalla, filmar mano y pantalla con otra cámara rápida o un montaje equivalente; reportar la resolución temporal de la medición. Publicar hardware, cámara, resolución, FPS real, backend, versión/hash del modelo, número de manos, ventanas de calentamiento, frames descartados y muestra total.

Objetivo inicial propuesto: respuesta de movimiento p95 menor de 100 ms y clic percibido dentro de 350 ms incluida la confirmación. Son criterios de aceptación a validar, no resultados alcanzados. Permitir menos confirmación si el ensayo demuestra que mantiene la precisión.

## Reducir falsos positivos antes de reentrenar

Separar **mano falsa**, **postura mal reconocida** y **acción involuntaria**. Un detector correcto puede producir muchos clics erróneos si la lógica convierte cada frame de OK en un clic.

Propuesta de motor de interacción:

- Área activa calibrada con margen; rechazar manos en los bordes, geometría degenerada, tamaño excesivamente pequeño y saltos incompatibles con un movimiento normal.
- Distancias en coordenadas con relación de aspecto corregida (`x×ancho`, `y×alto`), normalizadas por el tamaño de la palma; no usar solo distancia en coordenadas `[0,1]`, que distorsiona manos en video no cuadrado.
- Identidad temporal por continuidad espacial y tamaño, sin depender exclusivamente de la etiqueta izquierda/derecha. No mantener una pinza si una mano desaparece y otra ocupa su lugar.
- Histéresis: umbral de cerrar pinza diferente al de abrirla. Confirmar con duración en milisegundos, no con un número fijo de frames.
- Requerir apertura anterior para armar un clic. Una mano que entra ya haciendo OK no debe accionar el mapa.
- Un OK breve y estable, cerrado y vuelto a abrir, produce un clic. En la implementación v1, si la pinza se desplaza demasiado se cancela; el arrastre usa una palma abierta sostenida y no genera clic al soltar.
- Dos pinzas válidas pasan a modo zoom exclusivo; al salir no generan clics. Utilizar cambio relativo de separación y limitar variación por muestra para evitar saltos.
- Perder seguimiento, cambiar cámara, salir de la región o pausar cancela la acción y exige rearmar. Limpiar el estado también al reiniciar el worker.
- Suavizar cursor con filtro adaptativo, limitar ganancia y añadir una zona muerta pequeña. Medir la demora del filtro; no alisar hasta ocultar fallos de seguimiento.

La API web pública entrega landmarks y categorías de handedness; **el score de handedness estima izquierda/derecha, no fiabilidad de la mano**. No inventar un score de presencia por mano ni confiar en un `visibility` que este task no documenta como salida. La calidad adicional del prototipo será una heurística geométrica explícita. [Tipo oficial HandLandmarkerResult](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/hand_landmarker/hand_landmarker_result.d.ts).

Punto inicial implementado: detección, presencia y seguimiento 0.70 (ajustes 0.60/0.70/0.80); ajustarlos con curvas de precisión/recall y acciones erróneas, no por apariencia. Subirlos indiscriminadamente puede aumentar pérdidas y reinvocaciones del detector. Mantener valores y tiempos en una configuración auditable.

## Optimización de ejecución

La inferencia web es síncrona; Google recomienda un worker para que no bloquee la UI. Modelo, WASM y librería se empaquetan localmente, con versiones fijas y hashes. [Implementación web oficial, actualizada 17 agosto 2026](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

Diseño propuesto: como máximo un frame pendiente; cuando el worker está ocupado se descarta el siguiente frame y se procesa el más reciente disponible. Una cola de video aumenta latencia aunque el contador de FPS parezca correcto. Transferir `ImageBitmap` cuando sea compatible, cerrarlo tras procesarlo, no crear instancias del modelo por frame y evitar convertir cada frame a Base64. Mantener render del mapa y halo separado del reloj de inferencia. Probar CPU WASM primero; GPU solo si reduce p95 con el hardware y el mapa renderizando simultáneamente.

Comenzar con captura 640×480 o 960×540 a 30 FPS y comparar con 1280×720. La cámara debe dar manos de suficiente tamaño y evitar sombras fuertes y motion blur. Altura, exposición y enfoque bloqueados después de calibrar cuando el dispositivo lo permita; iluminación difusa y superficie mate. Una imagen más grande puede mejorar la adquisición de manos pequeñas, pero la red seguirá usando entradas internas fijas. Elegir la resolución mediante error de punta del índice y latencia, no por número de píxeles.

## Qué significa “tocar el modelo por dentro”

**Nivel 1 — recomendado ahora:** calibrar adquisición, geometría, filtro y máquina de estados. Resolver intentos falsos sin entrenamiento.

**Nivel 2 — clasificador de postura:** si persiste confusión OK/otras posturas con landmarks correctos, entrenar un clasificador pequeño con positivos y una clase amplia `none`. La guía Model Maker extrae landmarks y descarta imágenes en las que no encuentra manos; entrena el reconocimiento de gesto, **no reentrena el detector de palma ni el estimador de landmarks**. Además, la guía consultada declara Model Maker obsoleto y sin mantenimiento activo. Puede estudiarse en un entorno fijado, pero no fundamentar toda la arquitectura futura en ese flujo. [Customización oficial, actualizada 5 junio 2026](https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer).

**Nivel 3 — estimador cenital:** si la mano o los puntos fallan sistemáticamente aun con buena captura, reunir etiquetas propias y evaluar RTMPose/MMPose como ruta de ajuste supervisado y exportación ONNX. La documentación pública consultada no ofrece una receta de Model Maker para fine tuning de Hand Landmarker. Reentrenar/reemplazar un modelo MediaPipe exige conservar tensores, metadatos y pipeline compatibles; no basta modificar un `.task` o sus umbrales. Estimar coste antes de adoptar esa ruta.

**Nivel 4 — reconstrucción 3D o nueva cámara:** solo si las tareas medidas exigen profundidad/oclusiones no resueltas. No inferir altura física exacta ni contacto real con la mesa desde el `z` monocular. Mantener el control del mapa en coordenadas 2D mientras ese dato sea suficiente.

## Privacidad del runtime y aislamiento de red

El paquete instalado `@mediapipe/tasks-vision@1.0.1` contiene un aviso actualizado el 5 de junio de 2026: las imágenes se procesan en el dispositivo y no se envían a Google, **pero la librería sí envía métricas de rendimiento y utilización**. Procesamiento local y ausencia de telemetría son propiedades diferentes. [README del paquete oficial](https://www.npmjs.com/package/@mediapipe/tasks-vision), [aviso de privacidad oficial](https://goo.gle/mediapipe-privacy).

La inspección del `vision_bundle.js` local confirma un logger creado durante inicialización, transporte `fetch`, endpoint `https://odml.pa.googleapis.com/v1/log`, POST `application/x-protobuf`, credenciales de usuario deshabilitadas, flush cada 60 segundos y al cerrar el task. El código registra duración y contadores de procesamiento; esta inspección no pretende enumerar todos los campos de un protobuf opaco. Al fallar envío, limpia su cola y detiene el temporizador. Los tipos públicos de opciones consultados no presentan un interruptor para desactivar telemetría; no depender de métodos internos ni editar un minificado para garantizar privacidad.

Solución implementable: servir el **script del worker** con su propio header `Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'none'`. Mantener modelo y WASM en el mismo origen local. `connect-src 'self'` bloquea los fetch externos de ese worker; la política del renderer permite por separado las solicitudes necesarias del mapa. Una meta CSP en el documento no sustituye la política de respuesta que controla el worker. Añadir en Electron bloqueo del endpoint de métricas como segunda capa y registrar una prueba de violación CSP.

La prueba debe comprobar simultáneamente carga de assets, inferencia positiva, inferencia negativa y un intento de conexión al endpoint bloqueado por `connect-src`; si es posible comprobar el flush real al cerrar el task. Inspeccionar el tráfico del proceso y repetir tras cada actualización del runtime. La presencia de un fallo de fetch aislado no demuestra CSP: puede deberse a DNS, red o bloqueo posterior. Confirmar `SecurityPolicyViolationEvent`, directiva y modo `enforce`.

**Resultado observado el 5 octubre 2026:** ensayo aislado en Mac arm64, Electron 44.5.1 / Chromium 152.0.7977.130, paquete 1.0.1, modelo full y worker clásico CPU/SIMD. La fixture `thumbs-up.png` devolvió una mano con 21 puntos y una imagen gris sintética devolvió cero manos. Al llamar `model.close()` la librería real intentó su POST de métricas; el worker emitió `SecurityPolicyViolationEvent` para el endpoint con `effectiveDirective: connect-src` y `disposition: enforce`. El monitor `session.webRequest.onBeforeRequest` de este ensayo no observó solicitudes externas. El ensayo **no incluyó el bloqueo adicional del endpoint**, de modo que verificó la CSP por sí misma. Una prueba anterior en Chrome 154.0.8037.97 mostró el mismo bloqueo al cerrar.

La JPG oficial con dos pulgares arriba devolvió cero manos a umbrales 0.70 en ambos ensayos; no ocultar este caso ni asumir detección perfecta por ser una fixture oficial. Estas comprobaciones certifican carga y ejecución del pipeline y bloqueo del logger ensayado, no robustez cenital ni precisión de gestos. La primera inferencia fría de la PNG en el ensayo Electron tomó 92.5 ms; es una única llamada `IMAGE`, sin captura ni mapa y sin calentamiento, **no un benchmark de latencia de interacción**. Registro íntegro del ensayo: `work/cv-smoke-fixtures/qa-report.json`.

Este diseño permite afirmar, después de verificarlo, que **el worker de visión no tiene permitido conectarse a servicios externos**. La aplicación completa conserva conexiones del proveedor de mapas; no anunciar funcionamiento totalmente desconectado ni ausencia de solicitudes externas de toda la aplicación. No trasladar imágenes o landmarks a herramientas de analítica del renderer.

## Compatibilidad del runtime web 1.0.1

Inspección de `vision.d.ts` y `package.json` instalados: `FilesetResolver.forVisionTasks(basePath, false)` usa loaders clásicos, comprueba SIMD y selecciona `vision_wasm_internal.{js,wasm}` o `vision_wasm_nosimd_internal.{js,wasm}`. Con `useModule: true` el API asume SIMD y el paquete usa `vision_wasm_module_internal.{js,wasm}`; no contiene una pareja module/no-SIMD. Conservar nombres y parejas de la misma versión; no mezclar bundles y WASM de distintas releases. Para el baseline, worker clásico con el bundle y loaders correspondientes.

El worker necesita `OffscreenCanvas` para evitar rutas que esperan `document`, así como `ImageBitmap`, WebAssembly y la política que permita compilar WASM. En el Electron/Chromium de escritorio hay que probarlo tanto Mac arm64 como Windows x64; disponibilidad en Chrome no certifica todos los dispositivos ni runtimes. CPU es el primer delegate; GPU necesita un canvas/contexto WebGL compatible y no implica menor latencia. La guía oficial enumera Chrome y Safari, sin garantía general para cualquier navegador. [Setup web oficial](https://developers.google.com/edge/mediapipe/solutions/setup_web).

**Fixtures oficiales útiles para smoke**, no evaluación cenital: [`thumbs-up.png`](https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples/c2518ec444c3a3a99689e5d31eddadc240c83a0c/examples/hand_landmarker/ios/HandLandmarkerTests/thumbs-up.png), una mano pulgar arriba; [`test_image.jpg`](https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples/c2518ec444c3a3a99689e5d31eddadc240c83a0c/examples/hand_landmarker/android/app/src/androidTest/assets/test_image.jpg), dos manos pulgar arriba. Ambos están incluidos en tests del repositorio oficial [mediapipe-samples, Apache 2.0](https://github.com/google-ai-edge/mediapipe-samples/blob/c2518ec444c3a3a99689e5d31eddadc240c83a0c/LICENSE). No se encontró una licencia distinta junto a esos fixtures. Conservar licencia/procedencia si se redistribuyen. No son OK ni toma cenital y no justifican precisión de gestos.

Existe un pequeño conjunto de **fixtures de regresión** oficial con puño, pulgar arriba, manos izquierda/derecha, rotaciones y prototxt de resultados esperados. El [BUILD de testdata](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/testdata/vision/BUILD) declara Apache 2.0; las [reglas de descarga](https://github.com/google-ai-edge/mediapipe/blob/master/third_party/external_files.bzl) fijan SHA256 y generaciones de archivos. Ejemplos cuya disponibilidad se comprobó por HEAD: [`fist.jpg`, 71 KB](https://storage.googleapis.com/mediapipe-assets/tasks/testdata/vision/fist.jpg?generation=1782184710240231) y [`right_hands.jpg`, 55 KB](https://storage.googleapis.com/mediapipe-assets/tasks/testdata/vision/right_hands.jpg?generation=1782185275057115). Son útiles para regresión técnica; no representan el dominio municipal cenital ni una evaluación de baja tasa de falsas acciones.

## Dataset y ensayo cenital propuestos

Reunir videos voluntarios del montaje real, con consentimiento para evaluación, inicialmente 15–20 participantes y al menos dos sesiones/persona. Son cantidades de planificación, no suficiencia estadística garantizada. Incluir manos de tamaños/tonos diferentes, usuarios diestros/zurdos, manga larga, anillos, variaciones de iluminación, diferentes fondos, brazos entrando/saliendo, cruce de manos y una/dos manos. Incluir explícitamente guantes/oclusiones como pruebas de rechazo o limitación.

Mitad del tiempo debe cubrir **ausencia de intención**: mesa vacía, papeles, teléfono, objetos similares a dedos, mano descansando, conversación, ajuste de ropa, señalamientos casuales, recoger un objeto y OK fuera de la región. Anotar intervalos de intención y eventos, no solo frames “bonitos”. Etiquetar manualmente punta del índice, pulgar, palma y visibilidad en una muestra estratificada para diagnosticar landmarks. No usar la propia salida MediaPipe como verdad para demostrar mejora de MediaPipe.

Separar train/validación/test por **persona y sesión**, reservando además un dispositivo/condición de luz como prueba de cambio de dominio. Nunca repartir al azar frames vecinos del mismo video entre entrenamiento y test. Congelar el test antes de optimizar umbrales. Repetir exactamente los mismos videos y gestos para cada candidato, sin seleccionar solo segmentos favorables.

HaGRIDv2 contiene OK y `no_gesture`, diversidad de sujetos y partición por persona. Sus landmarks están autoanotados con MediaPipe; sirven para explorar posturas, no como referencia independiente de exactitud de este modelo. Su licencia es una variante propia de CC BY-SA: revisar texto exacto antes de reusar datos/pesos. [Repositorio y licencia oficial HaGRIDv2](https://github.com/hukenovs/hagrid). FreiHAND aporta puntos 3D, pero sus términos son solo investigación y prohíben uso comercial; no asumir autorización para un producto municipal futuro. [Términos FreiHAND](https://lmb.informatik.uni-freiburg.de/resources/datasets/FreihandDataset.en.html).

| Métrica | Definición para el ensayo |
| --- | --- |
| Falsas manos | Tracks falsos independientes/minuto sin mano, y porcentaje de tiempo ocupado; no contar todos sus frames como eventos separados |
| Falsos clics/min | Clics emitidos fuera de ventanas de intención / minutos negativos; distinguir sin mano, mano neutra y modo zoom |
| Falsos panes/zooms | Episodios involuntarios/min y desplazamiento/variación de escala causada |
| Precisión/recall de clic | Eventos emparejados una sola vez con verdad, ventana temporal fijada; clic duplicado cuenta como FP |
| Éxito de tarea | Seleccionar un marcador, abrir/cerrar popup, alcanzar objetivo de mapa y zoom; errores y tiempo |
| Estabilidad | Jitter del cursor inmóvil en px y como porcentaje de ancho de pantalla; deriva acumulada |
| Continuidad | Pérdidas de tracking, swaps de identidad y tiempo de readquisición p50/p95 |
| Latencia | p50/p95/p99 de etapas y del sistema; clic incluyendo/sin confirmación deliberada |

Criterios propuestos para pasar a un piloto: recall de clic ≥95%, ≤0.01 falsos clics/minuto, cero clics en transiciones de zoom/pan en el test y p95 de movimiento <100 ms. Publicar intervalo de confianza, diferencias por condición y duración total. Estos límites son negociables según el ensayo; no presentar “95% accuracy de postura” como “95% seguro para click”.

Con cero falsos clics en `T` minutos, bajo una aproximación Poisson, el límite superior unilateral de 95% es `-ln(0.05)/T ≈ 3/T`. **Una prueba de 5 minutos sin errores no demuestra una tasa baja**: para situar el límite bajo 0.01/min se necesitan aproximadamente 300 minutos negativos sin errores. Correlación, cambios de usuario y luz obligan a distribuir ese tiempo entre condiciones; documentar el supuesto y no ocultar los episodios difíciles.

## Conclusión técnica

La mejor ruta inmediata es un baseline MediaPipe local y una lógica temporal conservadora, seguido de un ensayo cenital reproducible. El beneficio prioritario está en la cámara, calibración, datos negativos y arbitraje de estados. Si el fallo está en landmarks, comparar un estimador entrenable; si está en intención, mejorar el motor temporal o su clasificador. Elegir un modelo de malla 3D más grande sin localizar primero el fallo añade coste y no demuestra reducción de falsos clics.

## Registro de fuentes primarias

Todas consultadas **2026-10-05**. Las páginas vivas pueden cambiar; fijar versiones y hashes de los artefactos realmente empaquetados.

- Google AI Edge, [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker), página indica actualización 2026-10-01.
- Google AI Edge, [Hand Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js), actualización 2026-08-17.
- Google AI Edge, [Gesture Recognizer](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer), actualización 2026-10-01.
- Google AI Edge, [Gesture customization](https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer), actualización 2026-06-05; contiene aviso de deprecación Model Maker.
- Google, [Model Card Hand Tracking](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf), octubre 2021; licencia Apache 2.0.
- Zhang et al., [MediaPipe Hands: On-device Real-time Hand Tracking](https://arxiv.org/abs/2006.10214), 2020.
- Jiang et al., [RTMPose](https://arxiv.org/abs/2303.07399), 2023; [implementación oficial](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose).
- Pavlakos et al., [HaMeR](https://github.com/geopavlakos/hamer), CVPR 2024.
- Potamias et al., [WiLoR](https://github.com/rolpotamias/WiLoR), CVPR 2025; README registra optimización `--fast` marzo 2026.
- [OpenCV Zoo palm detection](https://github.com/opencv/opencv_zoo/tree/main/models/palm_detection_mediapipe) y [handpose](https://github.com/opencv/opencv_zoo/tree/main/models/handpose_estimation_mediapipe).
- [HaGRIDv2](https://github.com/hukenovs/hagrid); [FreiHAND](https://lmb.informatik.uni-freiburg.de/resources/datasets/FreihandDataset.en.html); [MANO](https://mano.is.tue.mpg.de/license.html).
