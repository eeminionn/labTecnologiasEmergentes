# Cámara cenital, exposición y contraste

**Fecha de consulta:** 6 de octubre de 2026<br>
**Proyecto:** Mapa Gestual MLR · La Reina<br>
**Versión de implementación:** 0.1.3<br>
**Estado:** módulos implementados; 15/15 pruebas propias y 86/86 del proyecto aprobadas; ejecución integral y paquetes finales Mac/Windows aprobados; mediciones con USB real, falsos positivos, latencia y controles físicos pendientes<br>
**Documentación:** preparada con asistencia técnica de Codex.

[Volver al prototipo](../README.md) · [Revisar protocolo](./03-protocolo-validacion.md) · [Revisar selección](./05-meta-quest-y-seleccion.md)

La mejora consiste en identificar imágenes claramente inutilizables, cancelar los gestos pendientes y ofrecer ajustes que la cámara realmente admite. No consiste en garantizar que una imagen con buen contraste contiene landmarks correctos. Un detector puede equivocarse con iluminación normal; una mano puede seguir siendo visible sobre una mesa casi uniforme. El gate complementa la geometría, continuidad y temporizadores del motor.

## Evidencia que guía la decisión

| Fuente primaria | Qué establece | Consecuencia para este prototipo |
|:---|:---|:---|
| [Meta: Hands Technology](https://developers.meta.com/vr/design/hands-technology/) · actualización 17-08-2026 | La precisión depende de iluminación, posición respecto de las cámaras y oclusiones; el entrenamiento contempla condiciones variadas. | Controlar el montaje y comprobar validez antes de actuar. Quest usa su propio conjunto de sensores; sus cifras no se transfieren a una webcam RGB. |
| [Model Card Hand Tracking Lite/Full](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf) · octubre 2021, pág. 3 | Advierte límites de evaluación con poca luz, motion blur y dispositivos modestos; condiciones extremas pueden degradar calidad. Su uso previsto presenta manos prominentes. | No asumir rendimiento cenital demostrado. Esta ficha histórica acompaña la familia de modelos; no es un ensayo de nuestro montaje ni del paquete de la app. |
| [MediaPipe: Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) · actualización 01-10-2026 | El task incluye rotación, redimensionamiento, normalización y conversión de color; combina detección de palma y landmarks. | Conservar su contrato de entrada. El cambio de contraste no equivale a aumentar confianza o a reentrenar el modelo. |
| [OpenCV: ecualización y CLAHE](https://docs.opencv.org/4.13.0/d5/daf/tutorial_py_histogram_equalization.html) | La ecualización global puede perder detalles por sobrebrillo. La adaptación local puede amplificar ruido; CLAHE limita esa amplificación. | Un aspecto más contrastado no prueba mejor detección. No aplicar CLAHE automáticamente al bitmap del modelo. |
| [OpenCV: Laplace Operator](https://docs.opencv.org/4.13.0/d5/db5/tutorial_laplace_operator.html) | El operador representa variaciones espaciales y el ejemplo reduce ruido antes de aplicarlo. | Su energía depende de textura, ruido y escala. Usarla como diagnóstico de detalle, no como medición absoluta de enfoque. |
| [Basler: Optimizing Image Quality](https://docs.baslerweb.com/optimizing-image-quality) | Aumentar exposición puede producir blur y reducir la frecuencia; aumentar ganancia incrementa ruido. Recomienda iluminación suficiente sin exceso. | Priorizar iluminación y enfoque reales antes de subir artificialmente el contraste. Las unidades y controles del fabricante no se copian a una USB genérica. |

Los umbrales de abajo son **decisiones iniciales de ingeniería**, no valores indicados por Meta, Google ni OpenCV. No se encontró en las fuentes consultadas un umbral de luminancia, Laplaciano o contraste que garantice pocos falsos positivos para una cámara cenital municipal.

## Qué se mide

El worker analiza una copia pequeña en `OffscreenCanvas`, de **160 píxeles de ancho** y alto proporcional al frame: 120 para 4:3 o 90 para 16:9. Mantiene la proporción de la imagen. El modelo recibe su bitmap RGB sin CLAHE, ecualización ni filtro añadido. El renderer recibe agregados numéricos, no el buffer RGBA del análisis. El diagnóstico exporta `qualityMs` separado de `inferenceMs` y `captureToResultMs`, con percentiles p50/p95 de hasta 10.000 muestras recientes. El primero mide el análisis de calidad, el segundo la llamada al modelo y el tercero captura a resultado; este último excluye el buffer de la cámara y la presentación en pantalla.

`analyzeFrameQuality()` acepta datos RGBA8 opacos. Calcula una aproximación de luma `Y′ = redondear(0,2126 R + 0,7152 G + 0,0722 B)` entre 0 y 255. Es una magnitud de la imagen ya procesada por la cámara, **no lux, luminancia física ni exposición absoluta**.

| Métrica | Interpretación y límite |
|:---|:---|
| `meanLuma`, `stdLuma` | Brillo medio y dispersión; el fondo puede dominar ambos. |
| `p05`, `p95`, `contrast = p95 − p05` | Rango robusto que resta peso a pequeños reflejos o píxeles atípicos. Puede ignorar una mano que ocupa menos del 5 % del frame. |
| `darkFraction`, `brightFraction` | Fracción de píxeles con Y′ ≤ 5 o Y′ ≥ 250. Una superficie negra/blanca real puede parecer recorte. Un canal rojo saturado por sí solo no se trata como imagen blanca. |
| `laplacianVariance` | Varianza del Laplaciano discreto de cuatro vecinos, sin bordes. Valores bajos indican poca estructura local; una mesa lisa enfocada también puede dar cero. El ruido puede dar energía alta pese a una mano borrosa. |
| `meanGradient` | Cambio espacial medio; dato adicional para comparar configuraciones, sin bloqueo independiente. |

El ancho, proporción y ajustes de procesamiento deben permanecer constantes al comparar energía espacial. Cambiar tamaño, compresión o nitidez de cámara altera la métrica. El helper acepta una ROI rectangular normalizada `{x,y,width,height}`; la integración inicial mide el frame completo. Elegir ROIs específicas de manos y establecer una referencia de enfoque queda para ensayos posteriores.

## Gate implementado

| Condición | Decisión |
|:---|:---|
| Media ≤ 12 **y** al menos 98 % de píxeles con Y′ ≤ 5 | `too-dark`: impedir acciones del frame y cancelar interacción. |
| Media ≥ 248 **y** al menos 98 % de píxeles con Y′ ≥ 250 | `too-bright`: impedir acciones del frame y cancelar interacción. |
| Buffer inválido, transparente o ROI inválida | `invalid-frame`: impedir acciones; no inventar una medición. |
| Media < 35 o > 230, contraste < 12, o varianza de Laplaciano < 2 | Aviso numérico; **no bloquear por sí solo**. |

El recorte extremo actúa inmediatamente: no se completa un clic de 3 segundos utilizando ese frame. Tras **200 ms continuos** de condición severa aparece un aviso estable. Ese tiempo evita notificaciones por un frame aislado; no permite ejecutar acciones durante esos 200 ms. Después se necesitan **600 ms continuos de calidad no severa** para permitir acciones otra vez. Otra imagen severa reinicia la recuperación.

`FrameQualityGate.update(analysis, capturedAt)` devuelve `allowActions`, `cancelInteraction`, `state`, `showWarning`, `reasons` y `warnings`. Sus estados son `good`, `suspect`, `blocked` y `recovering`; `unknown` existe antes de la primera actualización. Un resultado inicial válido permite comenzar sin una espera artificial. Un salto de captura superior a 250 ms o un reloj inválido invalida la continuidad y obliga a recuperar; se debe hacer `reset()` al cambiar sesión o cámara. El watchdog del motor conserva su comprobación de resultados obsoletos por separado.

La integración cancela y suprime eventos mientras `allowActions` es falso. Sigue ejecutando inferencia para mostrar los halos frescos de ambas manos, en gris durante la pausa o el bloqueo por imagen extrema. Si no hay detección fresca, no mantiene una mano inventada. La calidad de la imagen no aumenta ni reduce artificialmente el número de manos reportado: el conteo bruto mantiene la protección del clic individual, que requiere exactamente una mano detectada, aunque otra postura sea descartada por geometría. Los temporizadores anteriores no se reutilizan y la selección requiere rearmado después de una cancelación.

Estos límites son deliberadamente extremos. No bloquean una imagen sólo porque su fondo sea mate o tenga poco detalle. Aun así, un fondo realmente negro/blanco que ocupa más del 98 % de la imagen puede provocar una pausa aunque haya una mano pequeña visible. Debe registrarse como falso bloqueo y resolverse con montaje/encuadre o umbrales validados, no afirmando que el gate mide calidad de la mano.

## Controles de cámara implementados

La especificación [W3C MediaStream Image Capture, secciones 9 y 10](https://www.w3.org/TR/image-capture/) define capacidades, modos y rangos. `getSupportedConstraints()` indica si el navegador reconoce una propiedad; **no demuestra que esta cámara la tenga**. Para esta app se consulta el track vivo con `getCapabilities()` y se verifica el efecto con `getSettings()`.

`getCameraControls(track)` enumera rangos finitos de `exposureCompensation`, `brightness` y `contrast`, más los modos disponibles de exposición, foco y balance de blancos. `applyCameraControls(track, values, {continuous:true})` solicita `continuous` sólo donde se anuncia ese modo. No activa propiedades inventadas ni toma un rango de otra cámara.

La compensación de exposición se expresa en EV y sólo tiene significado en exposición automática `continuous` o `single-shot`. Brillo y contraste conservan las unidades que anuncia el driver; no se convierten en un porcentaje de mejora. Tiempo de exposición manual, distancia de foco, temperatura de color y ganancia/ISO no están implementados como sliders en este helper.

La llamada valida números finitos, límites y pasos antes de tocar hardware. Mantiene las restricciones de resolución y dispositivo que ya tenía el track, reemplaza valores antiguos de los mismos controles y aplica un set `advanced`, siguiendo el patrón del [ejemplo oficial de Chrome Image Capture](https://developer.chrome.com/blog/imagecapture/). Esa guía también advierte que conviene consultar capacidades una vez iniciado el streaming. La integración asigna `video.srcObject`, espera `video.play()` y **después** consulta/aplica las capacidades del track; comprueba además que la sesión de cámara siga vigente antes y después de la operación. La UI ofrece sólo rangos disponibles; la preferencia de modos continuos permite iniciar la configuración sin elegir una cifra universal.

Una promesa resuelta puede dejar campos sin informar o un set avanzado sin efecto. El helper devuelve `ok` para la resolución de la llamada y un `status` separado: `applied`, `unverified`, `mismatch`, `unsupported`, `invalid`, `failed` o `unchanged`. También devuelve cada comparación en `verification`. No anunciar que se modificó la cámara si sólo se envió una solicitud. Algunos cambios pueden tardar en reflejarse; volver a consultar ajustes después de que se estabilicen y revisar la imagen real. La [documentación de applyConstraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints) explica reemplazo de constraints y rechazos; la aplicación conserva los anteriores explícitamente.

La [tabla del repositorio W3C](https://github.com/w3c/mediacapture-image/blob/main/implementation-status.md) registra soporte distinto según plataforma y notas de febrero de 2023; incluye varios controles Mac desde Chromium 111 y deja compensación de exposición Mac sin confirmar. No se usa esa tabla histórica como garantía del Electron, driver y USB instalados en 2026. El resultado del track y una prueba física son la autoridad para mostrar controles.

## Preparar y comprobar el montaje

Estas son propuestas de ensayo, no condiciones ya verificadas en la municipalidad:

1. Fijar la cámara y enfocar el plano donde realmente se forman los gestos; comprobar puntas de dedos y separaciones, no sólo el dibujo de la mesa.
2. Usar luz difusa distribuida sobre las manos y un fondo mate; evitar reflejos puntuales y que el cuerpo produzca grandes sombras sobre una sola mano. Elegir el fondo tras probar variedad de tonos de piel.
3. Empezar con exposición/foco/balance continuos cuando el hardware los admita. Si el autofocus cambia repetidamente al entrar dos manos, evaluar foco manual fijo mediante una herramienta del fabricante; registrar el ajuste y repetir pruebas. El helper actual no impone foco manual.
4. Antes de subir ganancia o tiempo de exposición, mejorar iluminación. Probar manos en movimiento además de manos quietas. Comprobar parpadeo y bandas con la luz real del lugar; no deducirlos de la media de brillo.
5. Pausar gestos durante ajustes. Registrar cámara, resolución/FPS reales, valores devueltos por `getSettings()`, altura de montaje, posición de luz y versión/hash del modelo.

No se define un nivel de lux, color de fondo, obturación ni cámara «óptimos» sin medidas del montaje. Exposición más corta puede mejorar bordes en movimiento a costa de señal; brillo y contraste extremos pueden perder detalle. La solución se elige con ensayos, no con la apariencia más vistosa del preview.

## Qué se probó y qué falta

`tests/frame-quality.test.js` aprueba **15 pruebas** de ambos módulos. Usa imágenes numéricas conocidas: negro/blanco/gris opacos, 5 % de reflejo, 90 % de fondo oscuro, un único canal rojo saturado, un patrón con blur gaussiano, rampa suave y ROI de contenido conocido. Comprueba clipping y luma, pérdida de energía bajo blur, avisos sin falsa promesa de foco, cancelación inmediata, 200/600 ms exactos, interrupciones, tiempo inválido y buffers inválidos.

Los tests de cámara usan tracks simulados para comprobar rangos, pasos, conservación de constraints, modos soportados, solicitudes inválidas, ajustes ignorados/no reportados y `OverconstrainedError`. Demuestran comportamiento del helper, **no soporte real de una USB**. El proyecto completo aprueba **86 pruebas** y la ejecución integral pasa en Mac y Windows. Los paquetes finales de ambas plataformas, del código `f5716f0b134ef15d97f2a727990122b3dbf18e54`, también aprueban los checks: en Windows, el pipeline final `37414071782` verifica además el smoke de `win-unpacked`. Dentro del smoke, `qualityFeedback` comprueba estas ocho condiciones:

| Comprobación | Resultado que verifica |
|:---|:---|
| `normalAllows` | Una imagen numérica normal permite acciones inicialmente. |
| `darkCancels` | El primer frame negro impide acciones y cancela la interacción. |
| `heldBlocks` | La condición severa sostenida pasa a estado `blocked`. |
| `recoveryWaits` | El primer frame normal posterior todavía no permite acciones. |
| `recovered` | La recuperación continua completa vuelve a permitirlas. |
| `noBlockedInput` | El renderer descarta un evento de clic bloqueado, sin ejecutar entrada, y conserva visible el halo gris. |
| `warningAfterGap` | Tras un salto de frames, el aviso aparece cuando se cumplen los 200 ms severos, aunque el estado ya fuese `blocked`. |
| `conditionalCameraControls` | En el diálogo abierto, las filas de controles con `hidden` están ocultas según su estilo CSS efectivo; al quitarlo, una fila vuelve a ser visible. No basta comprobar el atributo. |

La hoja de estilos aplica `[hidden]{display:none!important}` para que la presentación general de los labels no vuelva visibles controles ocultos. La apertura real de la aplicación Mac y sus diálogos de Ajustes y Ayuda también se verificó mediante uso de la interfaz: los sliders sin track de cámara permanecen ocultos. Estas comprobaciones verifican la UI de disponibilidad; no implican que una cámara real ofrezca esos controles.

La prueba visual integrada también verifica dos halos visibles durante navegación y bloqueo. El estímulo positivo de inferencia es un PNG fijo oficial con transparencia, compuesto sobre gris `#777` **sólo en el smoke** para producir una imagen opaca de prueba. Ese paso no se aplica a la cámara ni constituye preprocesamiento de su entrada al modelo.

Los paquetes finales Mac y Windows están aprobados; sus resultados quedan en los informes [Mac](./verificacion-paquete-mac-0.1.3.json) y [Windows](./verificacion-paquete-windows-0.1.3.json), junto con la [guía de entrega](./04-entrega-y-verificacion.md). No se capturó una USB real para calibrar estos umbrales, no se midió una tasa de falsos positivos y no se hizo un benchmark físico de latencia. La respuesta real de exposición, contraste, foco y balance de blancos también requiere verificar el hardware instalado. Esas mediciones siguen pendientes y no se deducen de los checks de los paquetes.

La validación física debe comparar versión con y sin gate sobre secuencias equivalentes: reposo, un OK, dos OK, transiciones, manos cruzadas, objetos sin manos, entradas/salidas y pausas. Variar iluminación, fondo, tono de piel, distancia, movimiento y controles admitidos. Etiquetar falsos clics y pan/zoom accidentales por minuto, recuperaciones, falsos bloqueos y fracción del tiempo bloqueada. Incluir el tiempo total y el tiempo habilitado en los denominadores para que pausar mucho no parezca una mejora de precisión. Separar `qualityMs`, inferencia y captura a resultado; ninguno sustituye por sí solo latencia cámara-a-pantalla.

## CLAHE y siguientes investigaciones

CLAHE queda **sin implementar** en la entrada del detector. Aumentar contraste no reconstruye detalle recortado ni movimiento perdido. Cambia la distribución de entrada de un modelo ya entrenado y puede realzar ruido. La normalización del task y una ecualización local son operaciones distintas.

Para justificarlo habría que hacer una comparación controlada con RGB original y variantes de CLAHE sobre luma, conservando color, usando exactamente las mismas secuencias y hardware. Medir landmarks frente a etiquetas independientes, falsos eventos, pérdida de manos, jitter y latencia p50/p95. Ajustar clip/tile en sesiones de desarrollo y probar en personas/sesiones reservadas. No usar los landmarks del propio detector como verdad de referencia ni seleccionar parámetros por una única imagen atractiva.

Referencias de código primario para esa exploración: [preprocesamiento de MediaPipe Tasks](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/components/processors/image_preprocessing_graph.cc), [ejemplos GoogleChrome Image Capture](https://github.com/GoogleChrome/samples/tree/gh-pages/image-capture) y [Windows Camera ControlMonitorApp](https://github.com/microsoft/Windows-Camera/blob/master/Samples/ControlMonitorApp/readme.md). El primero especifica conversión a tensor y normalización por metadatos; el segundo sirve de referencia de capacidades; el tercero muestra controles condicionales y cambios de configuración en Windows. No se incorpora código nativo ni nuevas dependencias a esta versión.
