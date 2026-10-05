# Protocolo de validación del mapa gestual

**Fecha:** 5 de octubre de 2026<br>
**Estado:** protocolo propuesto; pruebas técnicas y contenido empaquetado aprobados en Mac y Windows CI; cámara cenital pendiente<br>
**Proyecto:** Mapa Gestual MLR · La Reina<br>
**Equipo del proyecto:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al prototipo](../README.md) · [Revisar investigación de visión](./01-investigacion-vision.md) · [Revisar gestos y UX](./02-gestos-y-ux.md)

## Qué queremos comprobar

Evaluar si una cámara cenital permite apuntar, seleccionar, desplazar y hacer zoom sin activar acciones durante movimientos cotidianos. Medir precisión, estabilidad y demora en el equipo de la instalación; no trasladar benchmarks de teléfonos o modelos de cuerpo a este prototipo.

Una buena detección de mano no garantiza un buen clic. Separar tres errores: detectar una mano inexistente, estimar mal su postura y ejecutar una acción que la persona no quería realizar.

## Configuración que se debe registrar

| Elemento | Configuración inicial implementada |
|:---|:---|
| Runtime | `@mediapipe/tasks-vision` `1.0.1`; modelo Hand Landmarker full y WASM locales. |
| Inferencia | Worker, delegate CPU, modo video y hasta dos manos. |
| Umbrales del task | Detección `0,70`, presencia `0,70`, tracking `0,70`. |
| OK | Pinch pulgar–índice y al menos dos de los otros tres dedos extendidos. |
| Histéresis del pinch | Entrada `0,28`; salida `0,40`. |
| Confirmación y clic | OK estable `220 ms`; clic al soltar, con objetivo congelado. |
| Rearme y repetición | Apertura/neutral `120 ms`; cooldown de clic `400 ms`. |
| Entrada a desplazamiento y zoom | `180 ms` para cada modo. |
| Filtro 1€ | `minCutoff=1,4`, `beta=6`, `derivativeCutoff=1`, unidades normalizadas de cámara. |
| Calibración | Homografía de cuatro esquinas; espejo y rotación configurables. |
| Equipo principal | macOS arm64 y cámara USB; anotar modelos y versiones reales. |
| Segundo destino | Windows x64, `.exe` portable; verificación de cámara por separado. |
| Mapa | OpenStreetMap para pruebas sin key; Google Maps pendiente de credencial y comprobación. |

Estos números son defaults del motor actual. Son hipótesis de ingeniería que se ajustan con validación, no valores universalmente correctos ni resultados publicados. Los ejemplos exploratorios del documento de gestos deben leerse como propuestas, no como configuración ejecutada.

La distancia pulgar–índice se divide por una escala de palma obtenida de la muñeca–MCP del dedo medio y el ancho entre MCP de índice y meñique. Se corrige la relación ancho/alto de la cámara antes de comparar geometría. El rango entre `0,28` y `0,40` conserva el estado previo y evita alternancias alrededor de un único umbral.

Registrar commit, hash del modelo y build, versión del runtime, SO, CPU, resolución de pantalla, cámara, resolución/FPS reales, exposición, iluminación, altura de montaje, ROI y calibración. Cualquier cambio crea una condición nueva; no mezclar sus resultados sin identificarla.

## 1. Verificación de software

Ejecutar desde la carpeta del prototipo:

```bash
npm ci
npm test
npm run build
npm run test:app
```

La suite aprobó **26/26 casos: 23 de gestos y 3 de calibración** en la verificación del 5 de octubre. Conservar la salida de cada nueva ejecución; que un test exista no demuestra que siga pasando después de un cambio.

La prueba de aplicación debe comprobar:

- Apertura de la ventana Electron y carga de UI construida.
- Carga del modelo y WASM empaquetados e inferencia sobre imagen sin mano.
- Inferencia positiva sobre fixture oficial con mano; esto comprueba integración, no precisión cenital.
- Restricciones de red del worker: intento bloqueado por CSP con evidencia de violación aplicada, además de carga e inferencia funcionales.
- Desplazamiento, zoom, apertura de popup y respuesta del botón de prueba dentro de la ventana propia.
- Entrada a Ajustes, pausa y cancelación sin eventos residuales.

Conservar reportes y screenshot técnico si se genera. La prueba de UI puede usar un fondo de test sin cartografía para evitar depender de redes externas; esa ejecución no prueba disponibilidad de tiles OSM ni Google Maps.

### Evidencia técnica disponible

La comprobación inicial en **Apple M5, macOS 26.6.2 y Electron 44.5.1** obtuvo:

| Comprobación | Resultado observado y alcance |
|:---|:---|
| Frame vacío | `0` manos con modelo real. |
| PNG oficial positivo | `1` mano y `21` puntos; fixture frontal, no cenital. |
| Zoom, popup y botón de selección | Los tres checks de UI devolvieron `true` sobre fondo de test. |
| Probe de telemetría | Violación CSP confirmada desde worker. |
| Cierre real del task, ensayo aislado | POST a telemetría bloqueado por `connect-src`, `disposition=enforce`; sin requests externas del worker observadas. |
| Build Mac arm64 | ZIP generado correctamente. |
| `.app` final Mac | Abrió correctamente; smoke del paquete `ok:true`, con WASM, fixtures y controles de UI aprobados. |

El [reporte del paquete Mac](./verificacion-paquete-mac.json) registra la comprobación de la `.app` final.

En Windows, la [ejecución CI 37263075039](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37263075039), commit `d2a4e1948611012c24356dde2d2acbec927224f8`, aprobó **build, 26/26 tests, smoke de runtime y smoke de la aplicación empaquetada**. Se construyó el artefacto `.exe` portable. El smoke del paquete arrancó `release/win-unpacked/Mapa Gestual MLR.exe`, que contiene la aplicación y assets empaquetados; no arrancó el envoltorio portable. No se usó una cámara USB física en Windows.

En el ensayo aislado también se consultó un segundo fixture JPG con dos manos: devolvió `0` manos en esa configuración. Conservar ese dato; no extender el resultado del PNG a todos los fixtures o a dos manos reales. Las mediciones aisladas de inferencia sobre imágenes no son percentiles de una sesión de cámara.

Google Maps necesita otra comprobación con key autorizada, API habilitada, facturación, restricciones correctas y atribución visible. Registrar cambio de key, fallo de autenticación, recuperación, POI real y popup. Actualmente esa prueba está pendiente.

## 2. Montaje cenital y calibración

Fijar la cámara USB, iluminar de forma uniforme y delimitar una zona de mesa cómoda. Anotar la geometría antes de comparar modelos. Revisar que la mano mantenga suficiente detalle al moverse y que el foco no cambie de forma inestable.

Calibrar las cuatro esquinas en el orden mostrado. Comprobar superior izquierda, superior derecha, inferior derecha, inferior izquierda y centro. Repetir tras mover la cámara, cambiar resolución, espejo u orientación. La transformación supone un plano; evaluar por separado cuánto empeora al variar la altura de la mano.

Ensayar mano izquierda y derecha, rotaciones en el plano, manos de distinto tamaño, entrada por distintos bordes y dos manos simultáneas. El orden de detección del modelo puede cambiar; la aplicación debe conservar identidad o cancelar ante ambigüedad.

## 3. Tareas intencionales

Propuesta inicial: 15–20 participantes voluntarios y dos sesiones por persona. Esta cantidad ayuda a observar diversidad; no garantiza por sí sola suficiente potencia estadística. Obtener consentimiento antes de capturar imágenes y conservar únicamente material necesario.

Cada sesión incluye:

1. Apuntar a objetivos de diferentes tamaños y posiciones sin seleccionarlos.
2. Formar OK, mantenerlo el tiempo indicado y soltar para seleccionar.
3. Mantener OK durante varios segundos: debe producir como máximo un clic al soltar.
4. Interrumpir un OK demasiado corto, moverlo demasiado, ocultar la mano y recuperarla: no debe completar la selección cancelada.
5. Abrir y cerrar una ficha; accionar su botón con OK.
6. Desplazar el mapa, cerrar la mano y reposicionarla sin arrastrar.
7. Hacer zoom con dos OK; soltar primero una mano y después la otra sin clic residual.
8. Cruzar manos, añadir la segunda durante un click pendiente y retirar ambas.
9. Pausar con Espacio, cancelar con Esc y cambiar el foco de ventana durante cada acción.

Registrar intención, acción obtenida, objetivo, hora de inicio/fin, errores y necesidad de ayuda. Explicar la tarea antes de comenzar; no enseñar continuamente una corrección mientras se mide aprendizaje.

## 4. Periodos sin intención de control

Incluir mesa vacía, papeles, teléfono, objetos alargados, manos descansando, conversación, señalamientos casuales, recoger objetos, ajustar mangas y entrada/salida de personas. Dedicar al menos la mitad del material a estas condiciones negativas.

Variar iluminación, fondo, altura de mano, anillos y oclusiones de forma registrada. Si guantes u otras condiciones no están cubiertas por el sistema, medir su rechazo y documentar la limitación; no descartarlas silenciosamente del informe.

Contar episodios de acción y su duración. Una mano falsa sostenida durante 100 frames es un episodio, no 100 detecciones falsas independientes. Un clic duplicado sí cuenta como evento extra.

## 5. Métricas

| Métrica | Definición y registro |
|:---|:---|
| Clics accidentales | Eventos emitidos fuera de ventanas de intención / tiempo negativo; informar eventos/minuto y horas totales. |
| Precisión de clic | Eventos correctos / eventos emitidos. Cada intención se empareja una sola vez; duplicados cuentan como falsos positivos. |
| Recall de clic | Intenciones que producen un clic correcto / intenciones anotadas, con ventana temporal fijada antes del análisis. |
| Desplazamiento/zoom involuntario | Episodios, duración y movimiento o variación de escala provocada. |
| Éxito de tarea | Proporción completada, tiempo, errores y ayudas. |
| Jitter | Dispersión del cursor en px durante mano quieta, con viewport y calibración fijos. |
| Tracking | Pérdidas, intercambios de identidad y readquisición p50/p95. |
| Latencia de aplicación | p50/p95/p99 por tramo; separar inferencia, transporte, motor y envío del evento. |
| Demora de confirmación | Tiempo exigido al gesto y tiempo real mantenido por la persona; no ocultarlos dentro de la inferencia. |
| Confort | Esfuerzo percibido por bloques, pausas y postura observada de brazos. |

El diagnóstico exporta un **resumen agregado de sesión**: contadores, configuración, tiempos de inferencia y captura→resultado del worker, con un máximo de 10.000 muestras recientes. Sus milisegundos no incluyen la exposición/buffering USB completo, el procesamiento posterior de gestos ni el tiempo hasta que el píxel se presenta en pantalla. El botón **Marcar falso clic** incrementa una anotación manual; no determina la intención ni calcula tasas automáticamente. El resumen no sustituye periodos negativos cronometrados, anotaciones de intención ni revisión de falsos eventos. Para latencia física gesto→pantalla, filmar mano y pantalla con una cámara rápida y reportar resolución temporal del método.

No publicar sólo FPS o promedios. Informar condiciones, número de muestras, calentamiento, percentiles, intervalos de confianza y diferencias entre usuarios/dispositivos.

## 6. Criterios propuestos para pasar a un piloto

| Criterio | Condición inicial de aceptación |
|:---|:---|
| Cancelación | Cero acciones emitidas durante pausa, pérdida de foco, pérdida de mano y recuperación de un candidato cancelado en los casos ensayados. |
| Arbitraje | Cero clics individuales al entrar/salir de zoom en el test reservado. |
| Repetición | Un OK confirmado produce como máximo un clic al soltar; un OK corto no produce clic. |
| Recall de clic | Al menos 95 % en las tareas y condiciones declaradas. |
| Falsos clics | Límite superior unilateral de 95 % por debajo de `0,01/min` en condiciones negativas representativas. |
| Respuesta de movimiento | p95 del recorrido medido por la aplicación menor de `100 ms`; medir y reportar aparte demora física de cámara/pantalla. |
| Selección | Reportar confirmación de `220 ms`, tiempo real de mantenimiento y tiempo al soltar; objetivo exploratorio de selección breve dentro de `350 ms` bajo una pauta controlada. |
| Usabilidad | Al menos 95 % de tareas básicas completadas; sin necesidad de ayuda continua ni fatiga que impida terminar el bloque. |

Estos criterios son objetivos de evaluación, **no resultados alcanzados**. Revisarlos con usuarios municipales antes de aprobar despliegue. Si una condición falla, conservar el resultado y limitar el alcance en lugar de declarar éxito global.

### Tiempo necesario para una tasa baja de falsos clics

Si se observan cero eventos durante `T` minutos y se usa una aproximación Poisson, el límite superior unilateral de 95 % es `−ln(0,05)/T ≈ 3/T` eventos/minuto. Para situarlo por debajo de `0,01/min`, se requieren aproximadamente **300 minutos negativos sin errores**; usar un tiempo algo mayor para cumplir estrictamente el límite.

Este cálculo presupone una tasa estable e independencia aproximada. Errores agrupados, cambios de luz y de usuario invalidan una interpretación simple. Distribuir el tiempo entre condiciones y participantes, anotar agrupaciones y publicar el supuesto. Una prueba breve sin errores no demuestra fiabilidad municipal.

## 7. Comparar modelos y ajustar el motor

Dividir datos por persona y sesión: entrenamiento/calibración, validación y test reservado. No repartir frames vecinos entre conjuntos. Congelar el test antes de optimizar parámetros y reservar también una condición de dispositivo o iluminación distinta.

Comparar cada candidato con los mismos videos y tareas. Etiquetar una muestra de landmarks manualmente cuando sea necesario diagnosticar error geométrico. La salida de MediaPipe no sirve como verdad independiente para demostrar que una mejora de MediaPipe es correcta.

Cambiar una variable por comparación: montaje, umbral, filtro, ventana temporal o modelo. Registrar beneficio y coste en recall, falsos eventos y latencia. Subir un umbral puede reducir activaciones y aumentar pérdidas; no optimizar sólo una métrica.

## Registro de estado

| Verificación | Estado al preparar este documento |
|:---|:---|
| Suite de 26 casos | 26/26 aprobados en Mac y Windows CI. |
| Build de interfaz, assets y Mac ZIP | Aprobado en el host Mac arm64. |
| Smoke con modelo real, PNG positivo/frame vacío, CSP y UI | Aprobado en Apple M5/macOS 26.6.2/Electron 44.5.1; alcance descrito arriba. |
| Apertura de `.app` final y smoke del paquete Mac | Aprobados; reporte `verificacion-paquete-mac.json`. |
| Mac arm64 con cámara USB cenital | Pendiente de ensayo de instalación. |
| Windows build y `.exe` portable | Artefacto construido en CI; 26 tests y smoke de runtime aprobados. |
| Contenido empaquetado Windows | Smoke aprobado con `release/win-unpacked/Mapa Gestual MLR.exe` en CI. |
| Envoltorio portable Windows | Arranque no probado en esta verificación. |
| Windows con cámara USB física | Pendiente de ensayo de instalación. |
| Google Maps con key propia | Pendiente; no hay key del usuario configurada. |
| Evaluación de usuarios y falsos clics | Pendiente; no existe tasa medida publicada. |

Actualizar esta tabla sólo con evidencia de la condición específica. Una prueba positiva con fixture frontal no completa el ensayo cenital; un build Windows aprobado no completa la prueba de cámara Windows.

---

Protocolo preparado con asistencia técnica de Codex, 2026. Los resultados disponibles corresponden a verificaciones técnicas asistidas; no se atribuyen al equipo del proyecto ni a un ensayo municipal.

[Volver al prototipo](../README.md)
