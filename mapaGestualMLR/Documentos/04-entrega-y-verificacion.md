# Entrega técnica - Mapa Gestual MLR 0.1.0

**Fecha:** 5 de octubre de 2026<br>
**Estado:** distribuciones construidas; validación cenital pendiente

[Volver al prototipo](../README.md)

## Archivos entregados

| Archivo | Plataforma | SHA-256 |
| --- | --- | --- |
| `MapaGestualMLR-0.1.0-mac-arm64.zip` | macOS Apple Silicon; contiene `Mapa Gestual MLR.app` | `fd3e32e012df4d51a8e842da079269d0498a37ca5c5948c34ad6a7fa41a9ce7e` |
| `MapaGestualMLR-0.1.0-windows-x64.exe` | Windows x64; portable | `e56d5606e0c9ce581807a37a397d97b406cfb371b065f68b3a9a68403e28651e` |

Los ejecutables incluyen el modelo Hand Landmarker full y los loaders WASM. No requieren Node ni Python en el equipo de uso. Los mapas utilizan Internet. Esta distribución de desarrollo no tiene certificados de firma/notarización; no se modificaron las protecciones del equipo.

El ejecutable portable usa un contenedor autoextraíble NSIS de 32 bits que transporta la aplicación Electron x64. La arquitectura del contenedor no cambia el objetivo x64 del programa.

## Evidencia disponible

- **26/26 pruebas** de estados, geometría, aspecto, pérdida de mano, zoom, clic y calibración.
- **Mac:** apertura visual de la `.app` final; [smoke del paquete](./verificacion-paquete-mac.json) aprobado en Apple M5, macOS 26.6.2.
- **Windows:** [CI aprobado](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37263075039), construido desde `d2a4e1948611012c24356dde2d2acbec927224f8`. [Reporte del contenido empaquetado](./verificacion-paquete-windows.json) aprobado al ejecutar `release/win-unpacked/Mapa Gestual MLR.exe`.
- En ambos runtimes: carga de modelo y WASM locales; frame vacío con cero manos; fixture oficial PNG con una mano y 21 puntos; intento de conexión bloqueado por CSP del worker; zoom, apertura de popup y selección del botón propios.
- [Ensayo aislado de visión en Mac](./verificacion-vision-mac.json): bloqueo CSP en modo `enforce` del POST real del logger al cerrar el task, sin requests externas observadas. El fixture adicional JPG de dos manos produjo cero detecciones a estos umbrales; se conserva el resultado.
- Revisión visual manual: el mapa real OpenStreetMap carga en la ventana propia; apertura y selección del popup y ajustes comprobados.

Los smoke tests usan cartografía de prueba sin teselas externas. Los clicks de esos smoke son activaciones DOM de controles propios; no certifican el recorrido completo de cámara → gesto → input nativo → POI Google. La prueba Windows ejecuta el contenido empaquetado; no se ejecutó directamente su envoltorio portable NSIS durante CI.

Los tiempos de dos inferencias del smoke son muestras aisladas, algunas frías. No representan un benchmark de latencia ni percentiles de una sesión de cámara.

## Lo que falta validar

1. Montaje real de cámara USB cenital: iluminación, campo visual, oclusión, ROI y precisión de puntero.
2. Gestos intencionales y periodos negativos con usuarios, para medir falsos eventos, recall y latencia física según el [protocolo](./03-protocolo-validacion.md).
3. Google Maps con API key autorizada, incluido click sobre POI nativo, foco y zoom anclado.
4. Uso del portable y de una cámara física en Windows antes de declarar esa instalación validada.
5. Evaluación de accesibilidad, comprensión y fatiga antes de una instalación municipal.

La entrega es un prototipo verificable y documentado, no un sistema municipal validado ni una garantía de una tasa específica de falsos positivos.
