# Entrega técnica - Mapa Gestual MLR 0.1.1

**Fecha:** 5 de octubre de 2026<br>
**Estado:** distribuciones Mac y Windows verificadas; validación cenital pendiente

[Volver al prototipo](../README.md)

## Cambio de navegación

El usuario observó que la palma abierta podía desplazar el mapa al posicionar las manos. La versión 0.1.1 elimina esa acción: mover el mapa requiere dos manos en OK durante 180 ms. El movimiento común desplaza; separar o juntar las pinzas controla el zoom. Abrir o perder cualquiera de las manos detiene la navegación. La sombra y el ripple azul sólo aparecen con una detección de mano, contando también manos fuera del área calibrada.

El clic individual conserva su confirmación al soltar. Se cancela al aparecer otra mano. Los saltos anómalos de pinza y las separaciones filtradas inválidas cancelan la navegación para evitar cambios bruscos de zoom.

## Archivos entregados

Código de los binarios: `451509904cb8406eba84de961d5c4b9f69a46fb4`.

| Archivo | Plataforma | SHA-256 |
| --- | --- | --- |
| `MapaGestualMLR-0.1.1-mac-arm64.zip` | macOS Apple Silicon; contiene `Mapa Gestual MLR.app` | `55b8c73544498c0435d6e98f11af38a9990681e21b033a7f2bb8e79a070c7ee7` |
| `MapaGestualMLR-0.1.1-windows-x64.exe` | Windows x64; portable | `91cefa5f31f022c0d51025f09d9920b297cf48ed81a909bcb6b148681dba2498` |

Los ejecutables incluyen el modelo Hand Landmarker full y los loaders WASM. No requieren Node ni Python en el equipo de uso. Los mapas utilizan Internet. Esta distribución de desarrollo no tiene certificados de firma/notarización.

El portable utiliza un contenedor autoextraíble NSIS de 32 bits que transporta la aplicación Electron x64. La arquitectura del contenedor no cambia el objetivo x64 del programa.

## Evidencia de 0.1.1

- **37/37 pruebas:** 34 de gestos y 3 de calibración. Cubren navegación con dos OK, ausencia de pan con palma, movimiento combinado, jitter, continuidad de pinza, pérdida de tracking, cancelación sin clic, rearme y geometría.
- **Mac:** build Vite, ZIP arm64 y [smoke del paquete](./verificacion-paquete-mac-0.1.1.json) aprobados en Apple M5/macOS 26.6.2. La `.app` actualizada abrió correctamente; footer y ayuda muestran los gestos nuevos.
- **Windows:** [ejecución CI 37264864301](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37264864301) desde el commit indicado; 37 pruebas, build, smoke del runtime, portable y [smoke del contenido empaquetado](./verificacion-paquete-windows-0.1.1.json) aprobados. Se ejecutó `release/win-unpacked/Mapa Gestual MLR.exe`; no se ejecutó el envoltorio portable NSIS directamente.
- El smoke carga modelo y WASM locales: frame vacío con cero manos, fixture oficial PNG con una mano y 21 puntos, bloqueo CSP del worker, zoom y selección de popup.
- `pointerFeedback` verifica sombra con una mano, ocultación con dos o ninguna, dos detecciones con sólo una mano elegible y cancelación del ripple.
- `navigationFeedback` verifica pan, pan con zoom y sombra oculta en el adaptador del mapa mediante eventos inyectados. Las pruebas del motor verifican la condición de dos OK.

Los smoke utilizan cartografía de prueba sin teselas externas. Sus controles se activan mediante DOM y eventos de prueba; no certifican cámara → gesto → input nativo → POI Google. Los tiempos de dos inferencias son muestras aisladas, no un benchmark de latencia física.

## Evidencia histórica y validación pendiente

La investigación y los reportes sin versión de 0.1.0 se conservan como antecedentes. El [ensayo aislado de visión](./verificacion-vision-mac.json) comprobó bloqueo CSP del POST real del logger al cerrar el task, sin requests externas observadas; no se repitió como ensayo independiente en esta actualización.

Queda medir precisión, acciones accidentales y latencia con la cámara USB cenital según el [protocolo](./03-protocolo-validacion.md). También falta Google Maps con API key autorizada, cámara física y arranque del envoltorio portable en Windows, y evaluación de accesibilidad antes de una instalación municipal.
