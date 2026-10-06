# Meta Quest y selección estable con las manos

**Fecha de consulta:** 5 de octubre de 2026<br>
**Última actualización de implementación:** 6 de octubre de 2026<br>
**Proyecto:** Mapa Gestual MLR · La Reina<br>
**Versión vigente:** 0.1.6<br>
**Estado:** 113/113 pruebas, build/runtime y paquetes Mac/Windows 0.1.6 aprobados; ensayo USB cenital/frontal, métricas físicas, Google con key y envoltorio portable pendientes<br>
**Documentación:** preparada con asistencia técnica de Codex.

[Volver al prototipo](../README.md) · [Revisar protocolo](./03-protocolo-validacion.md) · [Revisar entrega](./04-entrega-y-verificacion.md)

## Nota de versión vigente: 0.1.6

Se conserva **OK continuo durante 1500 ms (1,5 segundos)**, elegido por el usuario en 0.1.4. Se conservan objetivo anclado, aro proporcional, un clic automático al completar y rearme tras abrir `120 ms`; no se confirma al soltar ni se reutiliza un mantenimiento cancelado. El tiempo es una preferencia de este prototipo, no un valor recomendado por Meta. Las comprobaciones de 0.1.2 y 0.1.3 se conservan como historia y no certifican esta actualización.

Desde 0.1.3 permanecen visibles las sombras frescas de ambas manos. En 0.1.4 **dos puños cerrados sólo desplazan** por su punto medio y **dos OK sólo hacen zoom** por separación. Cambiar de postura exige adquirir el nuevo modo durante `180 ms`; una mezcla no navega y no se combinan componentes. Azul indica apuntado/reposo; violeta identifica dos puños adquiridos y ámbar dos OK adquiridos, incluso quietos; gris indica acciones bloqueadas. El aro y ripple del clic individual siguen requiriendo exactamente una mano detectada. La regla histórica de ocultar toda sombra con dos manos ya no se aplica.

Todo el encuadre se corresponde con todo el mapa mediante orientación y límites `0..1`, sin homografía ni esquinas guardadas. La selección conserva el destino durante el clic; fuera de ese mantenimiento, la transición temporal elimina correcciones aun con la mano quieta. Los tres puntos ficticios miden 40 px nominales y 56 px cuando están activos, con área exterior fija de 56 × 56 px. Un clic nativo sobre el activo avanza **1→2→3**; tras el tercero se detiene el pulso y Ajustes permite reiniciar. Estos tamaños, colores y tiempos son decisiones de la app, no especificaciones Meta.

El control de imágenes casi negras o blancas bloquea acciones y requiere **600 ms** continuos de recuperación, conservando punteros frescos en gris. No garantiza landmarks correctos ni una tasa baja de falsos positivos. Brillo, contraste, compensación de exposición y modos continuos dependen de las capacidades anunciadas por la cámara. Los detalles vigentes están en el [protocolo](./03-protocolo-validacion.md), la [investigación de cámara](./06-camara-y-contraste.md) y el [recorrido y límite SUBDERE DPA 2023](./07-limite-la-reina.md).

El preview **Vista cenital** queda siempre visible arriba a la izquierda: unos 200 px de ancho, o 160 px en pantallas pequeñas, con imagen, skeleton fresco y conteo de manos. No incluye casilla ni botón para ocultar. Iniciar/Detener cámara sigue siendo explícito, sin permisos automáticos al abrir; detenida, muestra el mensaje y limpia los datos anteriores. Las métricas, exportación y anotación manual quedan en Ajustes → Diagnóstico de seguimiento.

La corrección 0.1.5 aborda puños cuyo skeleton ya aparece pero cuya geometría se rechaza por escorzo frontal. Se utiliza evidencia positiva XYZ consistente, preferentemente del mundo estimado de MediaPipe. Sólo world ausente permite fallback XYZ normalizado; si llega inválido, clic y navegación se bloquean y el puntero permanece. No importa el modelo propietario de Quest, cambia los pesos ni añade una segunda inferencia. Los cuatro dedos deben aportar recogimiento/compactación y el pulgar permanecer compacto, el DIP puede quedar recto sólo con cierre fuerte y el pulgar no requiere flexión obligatoria. Posición de cursor y navegación siguen en la imagen; world no garantiza visibilidad ni precisión física. La definición y fuentes primarias se detallan en el [protocolo](./03-protocolo-validacion.md).

## Seguimiento de índice y nudillos en 0.1.6

Cada sombra sigue la **punta del índice, landmark 8**, en reposo, palma abierta, apuntado, OK y zoom. Cuando la postura se reconoce como puño, utiliza la media de los **MCP 5, 9, 13 y 17**, sin muñeca: un punto de nudillos estimado por el modelo, no garantía de visibilidad física de cada articulación. `pointerReference()` comparte esa elección con el fallback del renderer; sin geometría clasificable, éste conserva el índice 8 fresco sin habilitar acciones.

Cambiar entre índice y nudillos conserva inicialmente la posición mostrada y elimina su corrección durante **300 ms** con `smoothstep`, incluso si la mano queda quieta. La referencia vuelve a su posición absoluta, sin un offset que sólo desaparezca al mover la palma. Continúa el filtro 1€; pérdida de tracking no permite animar ni seleccionar con datos antiguos.

**Excepción de selección individual:** objetivo, aro y halo permanecen anclados durante el OK de `1500 ms`. Se puede iniciar con OK directo; al entrar se conserva una posición reciente cuando existe. Abrir antes del umbral cancela y completar produce un único clic hasta abrir `120 ms`. Cancelar/liberar regresa suavemente desde la posición mostrada al índice. Dos OK no heredan un offset del clic individual.

La navegación sigue exclusiva y exige `180 ms`: **dos puños desplazan por el punto medio de sus referencias de nudillos**; **dos OK hacen zoom por separación de los índices 8**, con ancla en su punto medio. La pinza 4/8 conserva la detección de OK, el control de drift y la comprobación de continuidad/identidad; ya no define la posición del halo ni la distancia de zoom. Modelo, SDK, umbrales de puño XYZ, mapa, recorrido y UI se conservan.

### Verificación vigente de 0.1.6

La suite **0.1.6 aprobó 113/113 pruebas**: 74 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. Los build, runtime y paquetes Mac/Windows están aprobados. Los **13 checks `indexTrackingFeedback`** verifican referencias de apuntado/palma abierta/reposo/OK/puño y mano del modelo real con 21 puntos, cambios sin salto, convergencia quieta a nudillos/índice y tres fallbacks: índice, nudillos y geometría desconocida con landmark 8.

También aprueban seis checks de fuente/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. La selección registra cuatro clics nativos `isTrusted` de al menos `1500 ms`, objetivo/aro anclados, sin temprano/repetición, botón sin doble avance y recorrido completo. Las posturas de esos checks son sintéticas; el PNG positivo verifica la inferencia real, sin acreditar puños físicos ni una tasa de falsos positivos.

El código comprobado es `0c79d38b4aa65486553011495d9695acc6dec9b7`. Los reportes [Mac 0.1.6](./verificacion-paquete-mac-0.1.6.json) y [Windows 0.1.6](./verificacion-paquete-windows-0.1.6.json) confirman el smoke del contenido empaquetado y 13 checks de seguimiento con coordenadas esperadas calculadas directamente del índice 8 y la media MCP. La [CI Windows 37418725259](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37418725259) terminó con éxito: 113 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Google con key, cámara USB cenital/frontal y métricas físicas siguen pendientes; la [entrega](./04-entrega-y-verificacion.md) identifica archivos y alcance.

La `.app` Mac 0.1.6 abrió correctamente; la ayuda de índice/nudillos se verificó en la interfaz nativa y se observó la cámara activa. Esa revisión de UI no es un benchmark físico de gestos, skeleton, falsos positivos o latencia.

### Evidencia histórica de 0.1.5

La suite **0.1.5 aprobó 104/104 pruebas**: 65 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build Vite, runtime Mac/Windows y smoke del contenido de ambos paquetes están aprobados. El PNG positivo procesado por el modelo real entrega **21 `worldLandmarks`**; el clasificador integrado utiliza esa fuente. Los **seis checks `fistViewsFeedback`** aprueban carga y uso de world, `cenital-dorso`, `frontal-nudillos`, `frontal-palma` y `mixedOrientationsPan`: las vistas de puño son XYZ sintético, no puños capturados por cámara. El motor real adquiere pan sin zoom; mover coordenadas de imagen con un mundo local fijo por mano desplaza el mapa sin usar world como posición global.

También aprueban nueve checks de navegación exclusiva, siete de preview, ocho de punteros y ocho de calidad, además de cuatro clics nativos `isTrusted` de al menos `1500 ms`, sin temprano/repetición, con anclaje/aro y recorrido completo. El botón del popup no duplica el avance; el límite carga una entidad. Estas comprobaciones no miden recall, falsos positivos ni latencia física.

El código comprobado es `a2d778582443e0eea81cf386d5e6219815b99eb8`. Los reportes [Mac 0.1.5](./verificacion-paquete-mac-0.1.5.json) y [Windows 0.1.5](./verificacion-paquete-windows-0.1.5.json) confirman el smoke del contenido empaquetado. La [CI Windows 37417286255](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37417286255) terminó con éxito: 104 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Cámara USB cenital/frontal, métricas físicas y Google con key real siguen pendientes; la [entrega](./04-entrega-y-verificacion.md) identifica archivos y alcance por plataforma.

La `.app` Mac 0.1.5 se abrió y se verificó la cámara activa. La revisión detallada de Ayuda, Ajustes y skeleton de 0.1.4 queda histórica; esta corrección conserva esa interfaz. No se presenta la apertura ni el panel activo como benchmark físico de puños, precisión o latencia.

### Evidencia histórica de 0.1.4

La suite aprobó **94/94 pruebas**: 55 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia.

Registró **cuatro clics nativos** (`trustedClicks=4`) en punto 1, botón de popup, punto 2 y punto 3, cada uno tras al menos `1500 ms`, sin clic temprano ni repetición. El objetivo y el aro permanecieron anclados; el recorrido terminó en orden y el botón no duplicó el avance.

El runtime Mac aprobó **nueve checks de navegación** con el `GestureEngine` real y entradas sintéticas: dos puños sólo pan, dos OK sólo zoom, mezcla sin navegación y nueva adquisición al cambiar de postura. Aprobaron **siete checks de preview** —detenido, activo, pausado, tamaño compacto, dibujo, limpieza y ausencia de casilla—, además de ocho de punteros y ocho de calidad.

El código comprobado es `fe733f504f64a27cf577bf18a2c91ebd426b9ba2`. Los paquetes **Mac y Windows 0.1.4 están verificados**: [reporte Mac](./verificacion-paquete-mac-0.1.4.json) y [reporte Windows](./verificacion-paquete-windows-0.1.4.json). La [CI Windows 37415440930](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37415440930) terminó con éxito: 94 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Los smoke usan entradas sintéticas; el ensayo USB cenital y Google con key real siguen pendientes.

La inspección nativa Mac confirmó la ayuda de 1,5 segundos, dos puños para pan, dos OK para zoom y Ajustes sin casilla de preview. También se inspeccionó el preview con una cámara física y sus landmarks, sin guardar imágenes personales. Esa revisión visual no es un ensayo USB cenital ni un benchmark de gestos, falsos positivos o latencia física. Mantener la evaluación de accesibilidad y esfuerzo con la nueva demora; los resultados sintéticos no demuestran pocos falsos positivos ni confort cenital.

### Evidencia histórica de 0.1.3

La comprobación histórica del commit `f5716f0b134ef15d97f2a727990122b3dbf18e54` aprobó **cuatro clics nativos**: punto 1, botón de popup, punto 2 y punto 3; al menos 3 segundos por mantenimiento, sin clic temprano ni repetición, con anclaje y aro correctos. Se completó el recorrido y aprobaron ambas sombras, colores, bordes y punteros grises sin acciones al bloquear la imagen. El [smoke de la `.app` Mac final](./verificacion-paquete-mac-0.1.3.json) también aprobó esos resultados; la apertura real, Ajustes y ayuda se revisaron en la app.

Los ocho checks de calidad incluyen controles ocultos cuando no hay capacidades y visibles/habilitados dentro de Ajustes al anunciar rangos válidos. Se comprueba la UI con capacidades simuladas, no el hardware USB. La [CI Windows 0.1.3](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37414071782) terminó correctamente para el commit final: `npm ci`, 86 pruebas, build, runtime, portable y smoke del contenido empaquetado aprobados. El [reporte Windows 0.1.3](./verificacion-paquete-windows-0.1.3.json) corresponde a `release/win-unpacked/Mapa Gestual MLR.exe`; no prueba el arranque de su envoltorio portable.

El PNG transparente se compone sobre gris `#777` sólo en el smoke. La cámara y entrada real no reciben ese preprocesamiento. Los fixtures/gestos sintéticos y el fondo de mapa de prueba comprueban integración y selección, no precisión física cenital ni el SDK Google Maps con key real. La evidencia final de paquetes se registra en [Entrega y verificación](./04-entrega-y-verificacion.md).

## Alcance investigado e implementado en 0.1.2

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

## Comprobaciones históricas de 0.1.2 y alcance

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
