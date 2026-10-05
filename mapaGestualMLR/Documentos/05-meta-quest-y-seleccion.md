# Meta Quest y selección estable con las manos

**Fecha de consulta:** 5 de octubre de 2026<br>
**Proyecto:** Mapa Gestual MLR · La Reina<br>
**Versión vigente:** 0.1.2<br>
**Estado:** interacción implementada; 49/49 pruebas y smoke Mac/Windows aprobados en modo OpenStreetMap de prueba<br>
**Documentación:** preparada con asistencia técnica de Codex.

[Volver al prototipo](../README.md) · [Revisar protocolo](./03-protocolo-validacion.md) · [Revisar entrega](./04-entrega-y-verificacion.md)

El usuario solicita mantener un OK durante **3 segundos** y ejecutar el clic al completar ese tiempo, sin tener que soltar. También reporta que el cursor se desplaza al centro al formar OK. La versión 0.1.2 conserva el objetivo, muestra un aro azul de progreso y confirma en verde al ejecutar el clic. Permite cancelar antes del umbral y comenzar directamente con OK, anclando la posición válida actual sin exigir apuntado previo.

Los 3 segundos son una preferencia del usuario para este prototipo. No son un tiempo de selección recomendado por Meta ni una mejora demostrada de precisión. Las fuentes consultadas distinguen apuntar, seleccionar y liberar; no establecen ese temporizador como valor general.

## Qué aporta Meta y qué depende de Quest

Meta integra tracking de manos, poses espaciales, estados de pinch, confianza y una pose de apuntado en el runtime del visor. Sus guías recientes incluyen modos para movimiento rápido, poses inferidas fuera del campo de visión e interacción simultánea con manos y controles. El modo rápido tiene un compromiso entre respuesta y jitter; Meta recomienda empezar por el modo normal y probar el rápido cuando exista una necesidad concreta. Eso no determina la frecuencia ni la latencia de nuestra cámara USB. [Hands Technology](https://developers.meta.com/vr/design/hands-technology/).

La arquitectura Quest usa las cámaras del visor y reconstrucción de manos en 3D, dentro de su sistema de tracking. Su publicación técnica original describe cámaras monocromas integradas, aprendizaje profundo y seguimiento basado en modelo; no exige un sensor activo de profundidad para ese pipeline. Nuestra toma cenital es una sola vista RGB, con landmarks estimados y una homografía de mesa: no ofrece las mismas observaciones multicámara ni un ray espacial nativo. [Descripción técnica oficial del tracking Quest](https://developers.meta.com/vr/blog/hand-tracking-sdk-for-oculus-quest-available/).

Por tanto, la mejora aplicable es el **diseño de interacción**: apuntado estable, adquisición de objetivo, confirmación y cancelación. `PointerPose`, `HandPointerPose` y `XR_FB_hand_tracking_aim.aimPose` pertenecen al runtime XR; no reciben directamente el video de una webcam ni sustituyen a MediaPipe. Las fuentes consultadas ofrecen APIs y componentes de interacción, no un checkpoint Quest para adaptar dentro de este proyecto.

El ejemplo oficial [First Hand](https://github.com/oculus-samples/Unity-FirstHand) sirve como referencia de interacciones. Su README diferencia los scripts del ejemplo de los componentes del SDK y advierte licencias separadas para terceros y material Oculus. Publicar el ejemplo no implica que el detector del visor o sus pesos sean abiertos. La implementación conserva el modelo y SDK actuales de la app.

## Hallazgos que orientan el ajuste

| Tema | Hallazgo de la fuente primaria | Aplicación al mapa cenital |
|:---|:---|:---|
| Pinch y temblor | Meta describe que cerrar pinch desplaza ligeramente la mano y puede sacar el cursor de controles pequeños. Recomienda Ray Interactor, filtrado y asistencia de apuntado. | Separar el punto de apuntado del movimiento de los dedos al cerrar OK; conservar el objetivo adquirido. [Interacción indirecta](https://developers.meta.com/vr/design/indirect_interactions_bp/). |
| Puntero y gesto | `RayInteractor` determina el rayo; un `ISelector` determina selección y liberación. `HandPointerPose` usa la pose de apuntado del sistema; su origen no coincide con el pequeño indicador visual entre dedos. | No calcular el destino de clic a partir de la posición cambiante del cierre de la pinza. Aro y evento deben compartir una misma coordenada de selección. [Ray Interactions](https://developers.meta.com/vr/documentation/unity/unity-isdk-ray-interaction/). |
| Validación del dato | Meta indica comprobar `IsPointerPoseValid`, tracking y confianza antes de usar la pose o actuar sobre pinch. La fuerza continua y el estado booleano de pinch son datos distintos. | Los landmarks y la geometría tienen que seguir válidos durante el mantenimiento. El progreso representa tiempo confirmado, no probabilidad de intención ni fuerza real de contacto. [Interactions Setup](https://developers.meta.com/vr/documentation/unity/unity-handtracking-interactions/). |
| Adquirir un objetivo | Recomienda cursor o hover del objeto y resolver candidatos cercanos mediante first/best hover. | Elegir un único objetivo visible y mantenerlo durante la confirmación. Evitar que pequeños cambios entre dos marcadores cambien el destino sin aviso. [Hands Interaction Types](https://developers.meta.com/vr/design/hands-interaction-types/). |
| Hitboxes y disposición | Distingue área de interacción y tamaño visual, recomienda espacio entre objetivos y advierte contra layouts que cambian al hacer hover. | Ampliar el área invisible de puntos propios y botones sin agregar más elementos ni desplazar el popup durante el aro. [Hands UI best practices](https://developers.meta.com/vr/design/hands-ui-best-practices/). |
| Pérdida de tracking | Una pose inferida puede continuar mientras la detección del gesto se pierde; Meta requiere definir recuperación y señala que pinch se libera al perder tracking. | Una mano perdida cancela el mantenimiento y no confirma un clic. Readquirir exige volver a armar la selección. [Adapting from controllers](https://developers.meta.com/vr/design/hands-adapting-from-controllers/). |

El first/best hover es una resolución de candidatos del SDK, no una garantía de leer la intención. Nuestra implementación 2D necesita reglas propias y pruebas en objetivos cercanos.

Los flags de validez y confianza de Quest son referentes funcionales, no campos que deban suponerse disponibles en MediaPipe. La app debe conservar sus umbrales actuales y comprobar geometría, continuidad y antigüedad de los resultados sin inventar una confianza por landmark.

Meta cita **48 dp**, unos **22 mm** en determinadas condiciones de panel y tamaños angulares para XR. No equivalen automáticamente a píxeles CSS de nuestra pantalla. El área de **44 × 44 px** para puntos propios es una decisión inicial de esta app, que debe comprobarse con resolución, escala de pantalla y tamaño real del montaje; no se presenta como especificación Meta.

## Decisiones implementadas en 0.1.2

1. **Apuntar y adquirir.** El renderer conserva el cursor filtrado entre posturas y muestra hover sobre un objetivo visible. Elige un candidato por distancia y prioridad visual, mantiene el candidato previo en áreas superpuestas y descarta elementos ocultos. Una postura intermedia sin puntero no crea un destino al centro de pantalla.
2. **Capturar al entrar a OK.** El aro, sombra y clic comparten un objetivo anclado. Si se viene desde apuntado, se conserva ese destino; **un OK inicial directo también está permitido**, usando la posición válida actual. No se exige una postura previa. Si el objetivo desaparece, se mueve significativamente, cambia el viewport o comienza navegación, la selección pendiente se cancela.
3. **Mantener 3 segundos.** El motor cuenta tiempo continuo válido con reloj monotónico. El aro completa `tiempo válido / 3000 ms`; el primer resultado válido que alcanza el umbral emite **un clic inmediato**, aunque OK siga cerrado. La animación CSS no es la autoridad para ejecutar la acción.
4. **Confirmar y rearmar.** El aro confirma en verde y el feedback de clic comunica la ejecución. Mantener OK después no produce más clics. Abrir durante `120 ms` rearma una nueva selección; soltar después del clic no genera otro evento. La ayuda indica: «Mantén OK 3 s para seleccionar».
5. **Cancelar sin efectos.** Soltar antes del umbral, perder tracking, recibir datos obsoletos o discontinuos, detectar una segunda mano, pausar, perder foco o pulsar Esc cancela el progreso. El tiempo anterior no se conserva para otra mano ni después de una pérdida. Las comprobaciones de continuidad incluyen centro y landmarks 4/8.
6. **Mantener navegación separada.** Los dos OK siguen destinados a pan y zoom. Con dos manos detectadas no se muestran sombra, aro ni ripple de clic, aunque sólo una postura sea elegible. La transición desde dos manos a una no completa un temporizador individual anterior.

La ampliación de hitareas y el hover se aplican a controles y marcadores que la app administra. No permiten modificar arbitrariamente el picking de POI del proveedor. La asistencia debe ser local y predecible: no atraer el cursor a objetivos lejanos ni alterar visualmente todo el mapa.

La interfaz mantiene sombra azul, aro de progreso y hover del objetivo. El diagnóstico detallado sigue disponible en Ajustes. La ayuda y el pie de la `.app` Mac entregada se comprobaron visualmente con el contrato de selección automática.

La guía de interacción indirecta también advierte contra esperas largas y mantener posturas incómodas. Implementar la preferencia de 3 segundos exige evaluar esfuerzo y tiempo de tarea, sin confundir la demora intencional con latencia del modelo. Una demora mayor por sí sola no demuestra menos falsos positivos.

## Comprobaciones y alcance

| Caso | Resultado esperado |
|:---|:---|
| Apuntar a un marcador lateral y cerrar OK | Cursor, objetivo y aro conservan ese destino; ningún salto al centro. |
| Empezar directamente con OK | Anclaje de la posición válida actual y mantenimiento completo; no exigir apuntado previo. |
| OK válido antes de 3 segundos | Cero clics. Aro proporcional al tiempo confirmado. |
| Alcanzar 3 segundos sin soltar | Un clic al completar el umbral; mantener y soltar después no repiten. |
| Soltar antes del umbral | Cancelación, sin clic residual. |
| Perder tracking o recibir un frame tardío | Cancelación; no acumular tiempo a ciegas ni completar con datos antiguos. |
| Añadir una segunda mano o formar dos OK | Cancelación individual, feedback de clic oculto, navegación independiente. |
| Dos hitareas propias próximas | Un candidato inequívoco; hover y destino real coinciden. |
| Objetivo retirado o popup movido durante el aro | Cancelación o readquisición explícita; nunca confirmar un control diferente. |
| Pausa, blur, Esc y readquisición | Ningún clic pendiente al volver; nueva adquisición y mantenimiento completo. |

La suite de **49/49 casos** aprobó 37 pruebas de gestos, 3 de calibración y 9 de selección. Las comprobaciones de desarrollo y de la `.app` Mac empaquetada, y el runtime/contenido empaquetado Windows, aprobaron el ciclo nativo de selección con reloj real:

| Plataforma y reporte | Marcador | Botón del popup | Otros resultados |
|:---|:---|:---|:---|
| [Mac 0.1.2](./verificacion-paquete-mac-0.1.2.json) | `3018,2 ms`, un clic. | `3018,6 ms`, un clic. | `trustedClicks=2`; anclaje, aro intermedio, sin clic temprano y sin repetición aprobados. |
| [Windows 0.1.2](./verificacion-paquete-windows-0.1.2.json) | `3040,1 ms`, un clic. | `3021 ms`, un clic. | `trustedClicks=2`; anclaje, aro intermedio, sin clic temprano y sin repetición aprobados. |

El código corresponde a `eb23ff4de28d6a1cea8fe12de576dce7737bec85`; la [CI Windows 37267138909](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37267138909) aprobó 49 tests, build, runtime, construcción del portable y smoke del contenido empaquetado. Este último ejecutó `release/win-unpacked/Mapa Gestual MLR.exe`, no su envoltorio portable. La [entrega](./04-entrega-y-verificacion.md) registra archivos y hashes; la [captura de selección](./seleccion-3s-0.1.2.png) conserva el feedback visible.

La verificación usó entradas sintéticas en el modo OpenStreetMap de prueba y eventos nativos dentro de la ventana propia. No prueba una webcam física, disponibilidad de cartografía real, precisión cenital o Google Maps sin key. Los cuatro intervalos no son una distribución de latencia física. El ensayo cenital sigue siendo necesario para medir fallos, accesibilidad y comodidad con 3 segundos de mantenimiento; el arranque del envoltorio portable Windows queda pendiente.

## Fuentes consultadas

Las fuentes son documentación o repositorios oficiales Meta. Se obtuvo contenido de las guías actuales directamente; la publicación histórica de lanzamiento se consultó también mediante su contenido indexado. Las fechas siguientes son las actualizaciones que mostraban las páginas; no implican pruebas realizadas por el equipo municipal.

| Fuente directa | Fecha mostrada |
|:---|:---|
| [Hands Technology](https://developers.meta.com/vr/design/hands-technology/) | 17 de agosto de 2026. |
| [Hands Interaction Types](https://developers.meta.com/vr/design/hands-interaction-types/) | 17 de agosto de 2026. |
| [Interactions Setup, Unity](https://developers.meta.com/vr/documentation/unity/unity-handtracking-interactions/) | 25 de agosto de 2026. |
| [Indirect interaction best practices](https://developers.meta.com/vr/design/indirect_interactions_bp/) | 9 de septiembre de 2026. |
| [Adapting from controllers](https://developers.meta.com/vr/design/hands-adapting-from-controllers/) | 9 de septiembre de 2026. |
| [Hands UI best practices](https://developers.meta.com/vr/design/hands-ui-best-practices/) | 24 de septiembre de 2026. |
| [Ray Interactions, Unity](https://developers.meta.com/vr/documentation/unity/unity-isdk-ray-interaction/) | 4 de noviembre de 2025. |
| [Hand Tracking SDK for Oculus Quest Available](https://developers.meta.com/vr/blog/hand-tracking-sdk-for-oculus-quest-available/) | Publicación histórica del lanzamiento; explica la arquitectura inicial, no un benchmark actual. |
| [First Hand, repositorio oficial](https://github.com/oculus-samples/Unity-FirstHand) | Consultado el 5 de octubre de 2026; no se usa como fuente de versión vigente del runtime. |

---

Investigación y documentación técnica preparadas con asistencia de Codex, 2026. La adaptación se implementó en una app 2D con cámara RGB; sus comprobaciones de software no certifican prestaciones equivalentes a Meta Quest.
