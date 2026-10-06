# Entrega técnica - Mapa Gestual MLR 0.1.5

**Fecha:** 6 de octubre de 2026<br>
**Estado:** 104 pruebas y paquetes Mac/Windows aprobados

[Volver al prototipo](../README.md)

## Interacción vigente

Una sola mano detectada selecciona al mantener **OK durante 1,5 segundos**. El aro y el clic comparten el objetivo anclado, sin salto al centro. Mantener cerrado no repite; abrir 120 ms rearma. Pérdida de tracking, discontinuidad, movimiento excesivo, otra mano, cambio/ocultación del objetivo, pausa o pérdida de foco cancelan la selección como antes.

**Dos puños completamente cerrados desplazan** el mapa mediante el movimiento del centro de ambas manos. **Dos OK controlan sólo zoom**, separando para acercar y juntando para alejar. Mover ambos OK juntos no desplaza el mapa. Las parejas mixtas o una sola mano no navegan. Abrir cualquiera de las manos termina el modo; cambiar entre puños y OK necesita 180 ms de adquisición nueva, sin arrastrar movimiento anterior.

Las sombras permanecen independientes y frescas. Violeta identifica pan con puños y ámbar zoom con OK, también al estar quietos dentro del modo adquirido. Azul representa apuntado/reposo y gris acciones bloqueadas. El mapeo completo, tres puntos en orden 1 → 2 → 3, contorno SUBDERE/IDE Chile DPA 2023 y controles condicionales de exposición se conservan.

En 0.1.4, una rotación del puño hacia la cámara acortaba los segmentos proyectados en XY, rechazando el gesto pese a conservar sus ángulos. El usuario confirmó que el skeleton de ambas manos seguía presente. **0.1.5 usa XYZ consistente para reconocer el puño**, con world landmarks ya estimados por Hand Landmarker; no aplica aspectRatio a esas coordenadas métricas. Cuando world está ausente utiliza XYZ normalizado con corrección de aspecto. Cursor, pan, separación para zoom y skeleton siguen en coordenadas de imagen. [Contrato oficial de MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js#handle_and_display_results).

Se requiere curvatura y retracción positiva de los cuatro dedos, puntas compactas y pulgar aducido. DIP flexionado o cierre macro fuerte descartan una garra con segmentos distales rectos; no se exige observar un DIP doblado ni doblar el pulgar de una manera fija. El plano de palma tolera más espesor si la retracción/compactación son fuertes. Mundo explícito inválido o contradictorio cancela acciones y conserva punteros. Una mano incompleta no activa pan. No se utiliza visibility como indicador de articulación observada. Los valores son hipótesis de ingeniería; world es estimación monocular, no profundidad medida ni certeza sobre dedos ocultos.

## Cámara pequeña permanente

El panel **Vista cenital** permanece arriba a la izquierda, de 200 px de ancho (160 px en ventanas pequeñas), con vídeo, skeleton de manos y conteo. No existe casilla de preview ni botón para ocultarlo. Con cámara detenida muestra un estado claro y limpia landmarks; con vídeo activo siempre dibuja las detecciones frescas, también durante pausa. Una pérdida de datos frescos limpia el skeleton anterior.

Se mantienen Iniciar/Detener cámara y la elección de USB en Ajustes; no se solicita acceso automáticamente al abrir. La imagen del preview respeta la proporción real del vídeo. Inferencia/FPS, calidad, exportación de sesión y marcado de falso clic quedan en **Diagnóstico de seguimiento**, desplegable en Ajustes.

## Archivos entregados

Código de los binarios: `a2d778582443e0eea81cf386d5e6219815b99eb8`.

| Archivo | Plataforma | SHA-256 |
| --- | --- | --- |
| `MapaGestualMLR-0.1.5-mac-arm64.zip` | macOS Apple Silicon; contiene `Mapa Gestual MLR.app` | `312c52dddb90b2a04566ab462d2054eea57963cb6b90f04e87201ef22f961d58` |
| `MapaGestualMLR-0.1.5-windows-x64.exe` | Windows x64; portable | `abd5b25b8f4c873364b9547e4f53650a3b1e0710769dc4cd9c9e81f661102682` |

Los paquetes incluyen modelo full, loaders WASM y contorno. No requieren Node ni Python al usar el programa. Las teselas necesitan Internet. Esta distribución de desarrollo no tiene firma/notarización. El portable NSIS es un contenedor autoextraíble de 32 bits que transporta Electron x64; el programa objetivo sigue siendo x64.

## Evidencia de 0.1.5

- **104/104 pruebas:** 65 de gestos, 3 del helper histórico de calibración, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia/contorno. La calibración histórica no participa en el flujo actual.
- El motor comprueba 1499 ms sin clic y 1500 ms con un único clic, exclusión pan/zoom, poses mixtas y parciales, cambios de modo, quietud, geometría bajo rotación/aspecto y continuidad. Los filtros de navegación se vinculan a identidad; invertir el orden de manos inmóviles no genera zoom accidental.
- **Mac:** Vite, ZIP arm64 y [smoke del paquete](./verificacion-paquete-mac-0.1.5.json) aprobados. La `.app` 0.1.5 se abrió y la cámara arrancó. Ayuda, Ajustes y vídeo/landmarks de una cámara física se inspeccionaron en la UI 0.1.4, que conserva el mismo contenido en esta corrección.
- **Windows aprobado:** [CI 37417286255](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37417286255), runtime, portable y [smoke de win-unpacked](./verificacion-paquete-windows-0.1.5.json). El arranque mediante envoltorio NSIS se valida por separado.
- El smoke carga modelo/WASM reales, frame vacío/positivo, calidad y bloqueo CSP. El PNG positivo oficial con alpha se compone sobre gris #777 sólo como estímulo fijo; no se transforma así la cámara real.
- `navigationFeedback` utiliza poses sintéticas y **GestureEngine real** antes del adaptador: pan funciona sin zoom, zoom funciona sin pan, traslación de dos OK no actúa, cambio requiere nueva adquisición y mezcla no navega. También verifica ambas sombras y descarte de eventos del modo incorrecto en el renderer.
- Los seis `fistViewsFeedback` verifican world21 del fixture positivo real y uso de la fuente world, más pan con vistas XYZ sintéticas cenital-dorso, frontal-nudillos y frontal-palma, y dos puños con distinta orientación. Cada mano conserva su origen world local: mover sólo sus coordenadas de imagen desplaza el mapa sin zoom.
- Los siete `previewFeedback` comprueban panel visible detenido/activo/pausado, tamaño/posición, dibujo de landmarks del fixture, limpieza del dibujo obsoleto y ausencia de casilla/botón de ocultación.
- Los ocho `qualityFeedback` y ocho `pointerFeedback` mantienen controles de cámara condicionales, bloqueo/recuperación, colores, ambas sombras y bordes.
- **Cuatro clics nativos isTrusted por plataforma**: puntos 1, 2, 3 y botón del primer popup. Cada mantenimiento dura al menos 1500 ms, con cursor/aro anclados, sin clic temprano ni repetido. El botón no avanza dos veces y el recorrido se completa. El programa queda reiniciado en punto 1 después del smoke.

![Preview pequeño permanente y mapa](./preview-permanente-0.1.5.png)

![Aro durante selección de 1,5 segundos](./seleccion-1-5s-0.1.5.png)

Las imágenes y navegación del smoke usan geometría/landmarks de prueba sin teselas externas. Las tres vistas de puño son rotaciones XYZ sintéticas: comprueban el intérprete, no constituyen imágenes reales detectadas por el modelo. No representan un ensayo de gestos físicos. El preview se prueba con landmarks del fixture real del detector; sus estados activo/pausado se simulan sin abrir hardware. La inspección adicional del preview con una cámara física confirma vídeo y dibujo de landmarks; no es un ensayo de gestos con USB cenital. Una inferencia aislada no es un benchmark de latencia física.

## Antecedentes y validación pendiente

Los informes 0.1.0–0.1.4 conservan la evidencia anterior; [Mac 0.1.4](./verificacion-paquete-mac-0.1.4.json) y [Windows 0.1.4](./verificacion-paquete-windows-0.1.4.json) no certifican los cambios nuevos. Se mantienen Hand Landmarker full y sus pesos; sólo se modifica interpretación/UI.

Falta medir puños naturales desde cenital/frontal/dorso/palma, manos parciales, descanso, oclusión, cruces, luz y acciones accidentales con USB cenital real, además de comodidad y latencia física. También quedan driver/controles reales, Google con API key y POI reales, arranque del portable en Windows y accesibilidad antes del uso municipal. [Protocolo vigente](./03-protocolo-validacion.md) · [Investigación de cámara](./06-camara-y-contraste.md).
