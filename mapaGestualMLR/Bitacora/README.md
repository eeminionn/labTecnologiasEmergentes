# Bitácora - Mapa Gestual MLR

**Inicio:** 5 de octubre de 2026<br>
**Última actualización:** 6 de octubre de 2026<br>
**Equipo del proyecto:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

**Versión vigente:** 0.1.3 · 86/86 pruebas y paquetes Mac/Windows aprobados; cámara física, driver real, Google con key y envoltorio portable pendientes

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
| [Meta Quest y selección](../Documentos/05-meta-quest-y-seleccion.md) | Referentes oficiales sobre cursor estable, hover, confirmación y pérdida de tracking. |
| [Cámara y contraste](../Documentos/06-camara-y-contraste.md) | Fuentes y límites del control de calidad y de los ajustes disponibles según la cámara. |
| [Límite de La Reina y recorrido](../Documentos/07-limite-la-reina.md) | Procedencia SUBDERE DPA 2023 y lógica de los tres puntos ficticios. |

## 5 de octubre - Primer alcance

El encargo inicial combina desplazamiento del mapa, zoom, apertura de información mediante OK y una sombra azul que indique el punto de interacción. El alcance de esta versión se concentra en cámara, landmarks y motor de gestos. La integración de datos municipales y el ajuste final de UX quedan para un siguiente avance.

La aplicación es de escritorio. Electron dibuja el mapa y la interfaz en una ventana propia; el programa no controla un navegador externo. El equipo principal de instalación es un Mac Apple Silicon con cámara USB. Se construyeron una `.app` Mac arm64 y una distribución Windows portable; el montaje con cámara sigue pendiente.

## Cómo se eligió la primera ruta de visión

La investigación comparó detectores de manos, estimadores de landmarks y modelos de reconstrucción 3D. MediaPipe Hand Landmarker full es el punto de partida por su integración local y seguimiento temporal. Su elección no demuestra que sea el modelo más preciso en cualquier vista cenital.

El modelo se ejecuta en un worker con CPU y entrega puntos de las manos. El programa interpreta esos puntos con geometría, filtro y estados temporales. Una postura reconocida no se convierte directamente en una acción: tiene que cumplir adquisición, estabilidad y duración, además de rearme entre selecciones.

Si las pruebas muestran errores en los puntos, corresponderá mejorar el montaje y comparar otro estimador o adaptar uno entrenable. Si los puntos son correctos pero se activa un clic involuntario, la corrección corresponde a la lógica de intención. Esta separación evita cambiar el modelo sin saber qué está fallando.

## 5 de octubre - Ajuste a versión 0.1.1

El usuario observó que la navegación con una palma abierta podía desplazar el mapa accidentalmente. Por esa observación de uso se eliminó el pan de una mano. Este ajuste no se presenta como un estudio sistemático ni como una tasa de falsos positivos medida.

El control de navegación ahora requiere dos OK sostenidos durante `180 ms`. Mover las manos juntas desplaza el mapa mediante su punto medio; cambiar su separación hace zoom. El modelo y runtime de visión conservan su configuración.

La sombra azul queda reservada a la interacción de una mano. Cuando el detector reporta dos manos, se ocultan el halo y el ripple de clic, incluso si sólo una postura supera las comprobaciones geométricas del motor.

## 5 de octubre - Selección en versión 0.1.2

El usuario solicita mantener OK durante 3 segundos y confirmar sin tener que soltar. También reporta un cursor que vuelve al centro durante la transición a OK. El ajuste conserva el objetivo entre posturas y al iniciar la confirmación; separa la posición de apuntado del movimiento de pulgar e índice. También permite empezar directamente con OK y anclar la posición válida actual, sin exigir apuntado previo.

La selección incorpora hover y resolución first/best de un candidato visible, con hitareas mínimas de `44 × 44 px` en puntos propios. Un aro azul avanza de `0` a `1` y confirma en verde al completar el mantenimiento. Los 3 segundos y 44 px son decisiones del prototipo; no se atribuyen como valores predeterminados de Meta.

La investigación de [Meta Quest](../Documentos/05-meta-quest-y-seleccion.md) toma como referentes apuntado estable, objetivos tolerantes y cancelación ante pérdida de tracking. No incorpora el modelo propietario de Quest ni traslada sus poses 3D a nuestra cámara RGB.

## 6 de octubre - Visibilidad y recorrido en versión 0.1.3

El usuario solicita ver ambas manos durante la navegación, distinguir desplazamiento y zoom por color y alcanzar los extremos del mapa desde los extremos del encuadre. Se conserva una sombra fresca por mano, también en reposo y con palma abierta. Azul indica apuntado/reposo; violeta tenue, navegación adquirida; violeta, desplazamiento; ámbar, zoom dominante. La histéresis evita cambios por jitter. Pausa o bloqueo de acciones muestran las sombras en gris. El aro y ripple del clic individual siguen limitados a una sola mano detectada.

El mapeo pasa a usar toda la cámara para todo el mapa, con espejo, rotación y límites `0..1`. Se eliminan la homografía y las esquinas guardadas de versiones anteriores. La continuidad al cambiar de postura conserva el destino durante OK, pero la corrección se consume al mover la mano y permite alcanzar los bordes sin un desplazamiento permanente.

Los puntos ficticios se numeran 1, 2 y 3. El dibujo nominal mide 40 px y el activo 56 px, con pulso suave; el área exterior permanece fija en 56 × 56 px para no mover el objetivo durante los 3 segundos. Un clic nativo sobre el activo avanza una posición. Tras el tercero cesa el pulso; Ajustes permite reiniciar en el punto 1. El botón del popup no duplica el avance e Inicio conserva el recorrido. El contorno de la comuna procede de **SUBDERE, DPA 2023** y se documenta con su procedencia; no convierte los puntos de prueba en información municipal real.

La [investigación de cámara y contraste](../Documentos/06-camara-y-contraste.md) fundamenta un control conservador para frames casi totalmente negros o blancos. Cancela y bloquea acciones inmediatamente; exige 600 ms continuos de recuperación, manteniendo visibles los punteros frescos en gris. No constituye una garantía de precisión ni mide intención. Los controles de brillo, contraste y compensación de exposición aparecen sólo cuando el track de cámara declara capacidades válidas. Los modos automáticos continuos se solicitan únicamente si están anunciados y se distingue solicitud de ajuste confirmado.

La suite compartida de 0.1.3 aprobó **86/86 pruebas**. El smoke de desarrollo comprobó cuatro clics nativos (`trustedClicks=4`): punto 1, botón de popup, punto 2 y punto 3. Los mantenimientos completaron al menos 3 segundos, sin clic temprano ni repetición, con anclaje y aro correctos. El recorrido terminó en orden y el botón no produjo un segundo avance. También aprobaron dos sombras, colores de desplazamiento/zoom, bordes y punteros grises sin acciones al bloquearse la imagen.

El código se conserva en el commit `f5716f0b134ef15d97f2a727990122b3dbf18e54`. El ZIP Mac arm64 y la `.app` final aprobaron su smoke de paquete: cuatro clics nativos y todos los checks de puntero, navegación y calidad correctos. El [reporte Mac 0.1.3](../Documentos/verificacion-paquete-mac-0.1.3.json) conserva los resultados. También se abrió realmente la aplicación y se revisaron Ajustes y ayuda.

Los ocho checks de calidad incluyen `conditionalCameraControls`: sin capacidades, los controles se mantienen ocultos; al anunciar rangos válidos, aparecen habilitados dentro de Ajustes. Es una comprobación de UI con capacidades simuladas, no evidencia de soporte en cualquier USB. La [CI Windows 0.1.3](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37414071782) terminó correctamente para el commit final: `npm ci`, 86 pruebas, build, runtime, construcción del portable y smoke del contenido empaquetado aprobados. El [reporte Windows 0.1.3](../Documentos/verificacion-paquete-windows-0.1.3.json) registra la ejecución de `release/win-unpacked/Mapa Gestual MLR.exe`; el envoltorio portable no se abrió en ese ensayo. La [guía de entrega](../Documentos/04-entrega-y-verificacion.md) reúne la evidencia de ambas plataformas.

El fixture PNG positivo se compone sobre gris `#777` porque tiene transparencia, únicamente en el smoke; la cámara y la entrada real no se preprocesan así. La ejecución usa fixtures, gestos sintéticos y fondo de mapa de prueba: no valida precisión cenital física ni Google Maps con key real. Las comprobaciones de 0.1.2 se conservan como historia y no certifican las nuevas funciones. Sigue pendiente el ensayo con cámara USB, Google Maps propio y la medición de acciones accidentales y latencia física.

## Decisiones de interacción vigentes

- Índice para apuntar, un OK para seleccionar y dos OK para desplazar y hacer zoom.
- La palma abierta ya no desplaza el mapa.
- Un OK estable de una mano ejecuta el clic automáticamente al completar `3000 ms`, sin soltar.
- La posición seleccionada se conserva entre posturas y se ancla antes de cerrar el OK; el aro y clic comparten objetivo.
- Mantener cerrado no repite clics. Una apertura de `120 ms` rearma la selección; abrir después del clic no genera otro evento.
- Abrir antes del umbral cancela el mantenimiento. El aro azul confirma en verde cuando se ejecuta el clic.
- La segunda mano y la navegación con dos OK cancelan la selección individual pendiente.
- Una sombra por mano conserva feedback en reposo, clic y dos OK; el color distingue apuntado, desplazamiento, zoom dominante y acciones bloqueadas.
- Pausa, pérdida de foco, cancelación y pérdida de tracking detienen las acciones en curso.
- Todo el encuadre de cámara corresponde a todo el mapa con espejo, orientación y límites `0..1`, sin calibración de esquinas.
- El recorrido avanza por clic nativo sobre el punto activo; tras completar 1→2→3 se reinicia desde Ajustes.
- Una imagen extrema cancela acciones sin ocultar los punteros frescos; se exigen 600 ms continuos de recuperación.

Los tiempos elegidos son valores iniciales para probar. No se registran todavía como una solución validada por usuarios.

## Interfaz y mapas

La interfaz usa controles sobrios, bordes finos y tipografía de sistema, tomando Primer de GitHub como referente. El mapa ocupa el espacio principal; ajustes y diagnóstico aparecen cuando se necesitan. Las sombras comunican posición y estado de control, mientras el aro indica el tiempo de confirmación.

Los materiales de Stanford orientan una evaluación de usabilidad, prototipado y accesibilidad. No se asume que exista una lista única de leyes que permita certificar automáticamente esta interfaz. La revisión con usuarios deberá comprobar comprensión, control, recuperación y confort.

Sin API key, la base cartográfica es OpenStreetMap y los marcadores son ficticios. Google Maps queda disponible para configuración y verificación posterior con credenciales propias. Ninguna ficha de esta versión se presenta como un registro municipal real.

## Evidencia histórica - Versión 0.1.0

La ejecución técnica asistida aprobó 23 casos del motor de gestos y 3 de calibración. En Apple M5 con macOS 26.6.2 y Electron 44.5.1, el smoke obtuvo cero manos en un frame vacío y una mano con 21 puntos en un PNG oficial. También comprobó zoom, apertura de popup y botón de selección en el fondo de prueba de la interfaz.

Se confirmó bloqueo CSP del intento de telemetría del worker. Una comprobación aislada del cierre real del task registró el POST bloqueado por `connect-src` aplicado y ninguna solicitud externa del worker en ese ensayo. La aplicación completa sí se conecta a los proveedores de mapas. El ZIP de la aplicación Mac arm64 se construyó correctamente.

La `.app` final abrió correctamente y aprobó un smoke sobre el paquete entregado. Se conserva el [reporte de verificación Mac](../Documentos/verificacion-paquete-mac.json), con carga del WASM, inferencia sobre fixtures y controles de UI aprobados.

La [ejecución Windows CI 37263075039](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37263075039), para el commit `d2a4e1948611012c24356dde2d2acbec927224f8`, aprobó build, los 26 tests, smoke del runtime y smoke del contenido empaquetado. Generó el `.exe` portable. El smoke ejecutó `release/win-unpacked/Mapa Gestual MLR.exe`, por lo que no constituye una prueba del arranque mediante el envoltorio portable ni de una cámara Windows física.

Los resultados corresponden a comprobaciones técnicas asistidas, no a ensayos realizados por los integrantes del equipo. Tampoco certifican precisión con manos cenitales, dos manos reales ni latencia física de cámara.

Estos reportes pertenecen a 0.1.0. Los resultados de la nueva navegación se registran por separado a continuación.

## Evidencia histórica - Versión 0.1.1

La versión final aprobó **37/37 casos: 34 de gestos y 3 de calibración**. También terminaron correctamente el build Vite y el ZIP Mac arm64. La cobertura incorpora la palma abierta sin navegación, pan y zoom con dos OK, cancelación sin clic residual y las protecciones geométricas de la pinza.

El smoke de aplicación y el de la `.app` empaquetada aprobaron carga WASM, fixture positivo de una mano con 21 puntos, frame vacío sin manos, CSP, zoom, popup y selección. Los cinco checks de `pointerFeedback` (`oneHand`, `twoHands`, `twoDetectedOneEligible`, `noHands`, `clearedRipple`) devolvieron `true`. Los tres de `navigationFeedback` (`panWorks`, `combinedZoomWorks`, `hiddenDuringNavigation`) también aprobaron. Se conserva el [reporte Mac 0.1.1](../Documentos/verificacion-paquete-mac-0.1.1.json), distinto del reporte histórico. La `.app` final abrió correctamente y se verificaron visualmente la ayuda y el pie de la interfaz.

El motor comprueba la continuidad de la pinza, además del centro de la mano, y rechaza una separación filtrada cercana a cero. Las pruebas finales cubren la cancelación segura ante saltos anómalos de los landmarks 4 y 8.

La [CI Windows 0.1.1](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37264864301), commit `451509904cb8406eba84de961d5c4b9f69a46fb4`, aprobó las **37 pruebas**, build, smoke de runtime, distribución portable y smoke del contenido empaquetado. El [reporte Windows 0.1.1](../Documentos/verificacion-paquete-windows-0.1.1.json) corresponde a la ejecución de `release/win-unpacked/Mapa Gestual MLR.exe`, sin prueba del envoltorio portable ni de una cámara física. Estas comprobaciones siguen siendo técnicas y asistidas; no representan un ensayo cenital con usuarios ni certifican una tasa de acciones accidentales.

Estos reportes pertenecen a 0.1.1 y no certifican el nuevo clic de 0.1.2.

## Evidencia histórica - Versión 0.1.2

La suite de 0.1.2 aprobó **49/49 casos: 37 de gestos, 3 de calibración y 9 de selección**. El smoke de desarrollo y el de la `.app` Mac empaquetada aprobaron el ciclo completo de 3 segundos sobre un punto azul y el botón de su popup. Registraron `trustedClicks=2`, anclaje y aro intermedio correctos, sin clic temprano ni repetición. Los mantenimientos fueron `3018,2 ms` y `3018,6 ms`, con reloj real. El [reporte Mac 0.1.2](../Documentos/verificacion-paquete-mac-0.1.2.json) conserva estos resultados.

La verificación corresponde al código `eb23ff4de28d6a1cea8fe12de576dce7737bec85`. La [CI Windows 0.1.2](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37267138909) aprobó 49 tests, build, runtime, distribución portable y smoke del contenido empaquetado. El [reporte Windows 0.1.2](../Documentos/verificacion-paquete-windows-0.1.2.json) registró dos clics nativos, anclaje/aro intermedio correctos y ausencia de clic temprano/repetición, con intervalos de `3040,1 ms` y `3021 ms`. Se ejecutó `release/win-unpacked/Mapa Gestual MLR.exe`; no el envoltorio portable. El modo OpenStreetMap de prueba usa entradas sintéticas; no equivale a validar una webcam física ni Google Maps. La ayuda de la `.app` Mac entregada también se comprobó visualmente.

Todavía falta medir la cámara USB cenital, las acciones accidentales durante actividades cotidianas y la latencia física de gesto a pantalla. También queda pendiente Google Maps con una key autorizada, el arranque del envoltorio portable Windows y el ensayo con cámara física en Windows.

## Próximos pasos

1. Conservar reportes por versión y comprobar el arranque del envoltorio portable en Windows.
2. Fijar cámara, iluminación, orientación y encuadre completo para un montaje repetible.
3. Registrar tareas intencionales y periodos largos sin intención de control.
4. Medir errores por acción, estabilidad, pérdidas de tracking y latencia.
5. Probar comprensión de gestos y esfuerzo con participantes representativos.
6. Comparar alternativas de visión o ajustar estados sólo después de identificar los fallos.
7. Incorporar fuentes municipales y revisar permisos e interfaz en una etapa posterior.

---

Bitácora técnica preparada con asistencia de Codex, 2026. Describe decisiones y trabajo de prototipo; no documenta ensayos municipales ni participación del equipo en pruebas no realizadas.

[Volver al prototipo](../README.md) · [Volver al README principal](../../README.md)
