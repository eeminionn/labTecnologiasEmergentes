# Bitácora - Mapa Gestual MLR

**Inicio:** 5 de octubre de 2026<br>
**Última actualización:** 5 de octubre de 2026<br>
**Equipo del proyecto:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al prototipo](../README.md) · [Volver al README principal](../../README.md) · [Revisar Etapa 2](../../Etapa-2/Bitacora/README.md)

## De dónde veníamos

La Etapa 2 planteó una herramienta territorial común para relacionar información que hoy se encuentra distribuida entre plataformas y áreas municipales. Antes de integrar esas fuentes, este avance explora una forma de navegar y seleccionar información en un mapa compartido.

La pregunta actual es concreta: ¿podemos controlar un mapa con manos observadas desde una cámara cenital, manteniendo una respuesta fluida y pocas acciones accidentales?

## Material de este avance

| Documento | Qué muestra |
|:---|:---|
| [Aplicación y guía de uso](../README.md) | Gestos, preparación de la cámara y apertura del software. |
| [Investigación de visión](../Documentos/01-investigacion-vision.md) | Alternativas de detección, límites y recomendación inicial. |
| [Gestos y UX](../Documentos/02-gestos-y-ux.md) | Papers, vocabulario de interacción y criterios de interfaz. |
| [Protocolo de validación](../Documentos/03-protocolo-validacion.md) | Pruebas que faltan para evaluar precisión y latencia. |

## 5 de octubre - Primer alcance

El encargo inicial combina desplazamiento del mapa, zoom, apertura de información mediante OK y una sombra azul que indique el punto de interacción. El alcance de esta versión se concentra en cámara, landmarks y motor de gestos. La integración de datos municipales y el ajuste final de UX quedan para un siguiente avance.

La aplicación es de escritorio. Electron dibuja el mapa y la interfaz en una ventana propia; el programa no controla un navegador externo. El equipo principal de prueba es un Mac Apple Silicon con cámara USB. También se prepara una distribución Windows portable.

## Cómo se eligió la primera ruta de visión

La investigación comparó detectores de manos, estimadores de landmarks y modelos de reconstrucción 3D. MediaPipe Hand Landmarker full es el punto de partida por su integración local y seguimiento temporal. Su elección no demuestra que sea el modelo más preciso en cualquier vista cenital.

El modelo se ejecuta en un worker con CPU y entrega puntos de las manos. El programa interpreta esos puntos con geometría, filtro y estados temporales. Una postura reconocida no se convierte directamente en una acción: tiene que cumplir adquisición, estabilidad, duración y liberación.

Si las pruebas muestran errores en los puntos, corresponderá mejorar el montaje y comparar otro estimador o adaptar uno entrenable. Si los puntos son correctos pero se activa un clic involuntario, la corrección corresponde a la lógica de intención. Esta separación evita cambiar el modelo sin saber qué está fallando.

## Decisiones de interacción

- Índice para apuntar, palma abierta para desplazar y dos OK para zoom.
- Un OK estable de una mano confirma la selección; el clic ocurre al soltar.
- La posición seleccionada se congela antes de cerrar el OK para evitar que la punta del índice desplace el objetivo.
- Mantener cerrado no repite clics. Se exige rearme y se limita la repetición temporal.
- La segunda mano y el zoom cancelan la selección individual pendiente.
- Pausa, pérdida de foco, cancelación y pérdida de tracking detienen las acciones en curso.
- La calibración de cuatro esquinas adapta la mesa a la vista del mapa; se puede corregir espejo y orientación.

Los tiempos elegidos son valores iniciales para probar. No se registran todavía como una solución validada por usuarios.

## Interfaz y mapas

La interfaz usa controles sobrios, bordes finos y tipografía de sistema, tomando Primer de GitHub como referente. El mapa ocupa el espacio principal; ajustes y diagnóstico aparecen cuando se necesitan. La sombra azul sirve como feedback del puntero y de la confirmación.

Los materiales de Stanford orientan una evaluación de usabilidad, prototipado y accesibilidad. No se asume que exista una lista única de leyes que permita certificar automáticamente esta interfaz. La revisión con usuarios deberá comprobar comprensión, control, recuperación y confort.

Sin API key, la base cartográfica es OpenStreetMap y los marcadores son ficticios. Google Maps queda disponible para configuración y verificación posterior con credenciales propias. Ninguna ficha de esta versión se presenta como un registro municipal real.

## Verificación técnica inicial

La ejecución técnica asistida aprobó 23 casos del motor de gestos y 3 de calibración. En Apple M5 con macOS 26.6.2 y Electron 44.5.1, el smoke obtuvo cero manos en un frame vacío y una mano con 21 puntos en un PNG oficial. También comprobó zoom, apertura de popup y botón de selección en el fondo de prueba de la interfaz.

Se confirmó bloqueo CSP del intento de telemetría del worker. Una comprobación aislada del cierre real del task registró el POST bloqueado por `connect-src` aplicado y ninguna solicitud externa del worker en ese ensayo. La aplicación completa sí se conecta a los proveedores de mapas. El ZIP de la aplicación Mac arm64 se construyó correctamente.

Los resultados corresponden a comprobaciones técnicas asistidas, no a ensayos realizados por los integrantes del equipo. Tampoco certifican precisión con manos cenitales, dos manos reales ni latencia física de cámara.

Todavía falta medir la cámara USB cenital, las acciones accidentales durante actividades cotidianas y la latencia física de gesto a pantalla. También queda pendiente Google Maps con una key autorizada y el ensayo del `.exe` en Windows con cámara.

## Próximos pasos

1. Conservar los reportes técnicos y repetir las comprobaciones tras cambios de runtime o modelo.
2. Fijar cámara, iluminación y calibración para un montaje repetible.
3. Registrar tareas intencionales y periodos largos sin intención de control.
4. Medir errores por acción, estabilidad, pérdidas de tracking y latencia.
5. Probar comprensión de gestos y esfuerzo con participantes representativos.
6. Comparar alternativas de visión o ajustar estados sólo después de identificar los fallos.
7. Incorporar fuentes municipales y revisar permisos e interfaz en una etapa posterior.

---

Bitácora técnica preparada con asistencia de Codex, 2026. Describe decisiones y trabajo de prototipo; no documenta ensayos municipales ni participación del equipo en pruebas no realizadas.

[Volver al prototipo](../README.md) · [Volver al README principal](../../README.md)
