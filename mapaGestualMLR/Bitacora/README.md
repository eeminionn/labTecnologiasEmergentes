# Bitácora - Mapa Gestual MLR

**Inicio:** 5 de octubre de 2026<br>
**Última actualización:** 9 de octubre de 2026<br>
**Equipo del proyecto:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

**Versión vigente:** 0.1.10 · 177/177 pruebas, build, runtime y paquetes Mac/Windows finales aprobados. La evidencia 0.1.9 queda histórica. Ensayo USB cenital/frontal, métricas físicas, Google con key y envoltorio portable pendientes

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

## 6 de octubre - Evidencia histórica: modos exclusivos y preview en 0.1.4

El usuario reduce la confirmación de OK de 3 segundos a **1,5 segundos** y separa las acciones de navegación. **Dos puños cerrados desplazan** el mapa según el movimiento de su punto medio; cambiar su separación no hace zoom. **Dos OK hacen zoom** por separación; trasladarlos juntos no desplaza el mapa. Una mezcla de posturas no navega. La nueva postura requiere `180 ms` de adquisición, también al cambiar de modo. El puño se reconoce por dedos flexionados y compactos y pulgar cercano a la palma; no basta con que la mano deje de parecer abierta u OK.

El preview Vista cenital permanece arriba a la izquierda, con unos **200 px de ancho** —160 px en pantallas pequeñas—, imagen, skeleton fresco y conteo de manos. Se retiran la casilla para mostrarlo y el botón de cierre. La cámara mantiene Iniciar/Detener y no se activa ni solicita permisos al arrancar. Al detenerla, el panel muestra Cámara detenida y limpia video, skeleton y conteo antiguos. Las métricas, exportación y anotación manual de falsos clics pasan a Diagnóstico de seguimiento, desplegable dentro de Ajustes.

Se conservan el objetivo anclado, aro azul/confirmación verde, un clic por mantenimiento y rearme de `120 ms`. Las sombras permanecen independientes y frescas: violeta para dos puños y ámbar para dos OK, una vez adquirida la postura, sin depender del movimiento dominante. El detector y SDK conservan su configuración.

La suite de 0.1.4 aprobó **94/94 pruebas**: 55 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El runtime Mac aprobó **nueve checks de navegación** con el `GestureEngine` real y entradas sintéticas: dos puños sólo pan, dos OK sólo zoom, mezcla sin navegación y nueva adquisición al cambiar de postura. Aprobaron **siete checks de preview** —detenido, activo, pausado, tamaño compacto, dibujo, limpieza y ausencia de casilla—, además de ocho de punteros y ocho de calidad.

Registró **cuatro clics nativos** (`trustedClicks=4`) en punto 1, botón de popup, punto 2 y punto 3, cada uno tras al menos `1500 ms`, sin clic temprano ni repetición. El objetivo y el aro permanecieron anclados; el recorrido terminó en orden y el botón no duplicó el avance.

El código comprobado es `fe733f504f64a27cf577bf18a2c91ebd426b9ba2`. Los paquetes **Mac y Windows 0.1.4 están verificados**: [reporte Mac](../Documentos/verificacion-paquete-mac-0.1.4.json) y [reporte Windows](../Documentos/verificacion-paquete-windows-0.1.4.json). La [CI Windows 37415440930](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37415440930) terminó con éxito: 94 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Los smoke usan entradas sintéticas; el ensayo USB cenital y Google con key real siguen pendientes.

La inspección nativa Mac confirmó la ayuda de 1,5 segundos, dos puños para pan, dos OK para zoom y Ajustes sin casilla de preview. También se inspeccionó el preview con una cámara física y sus landmarks, sin guardar imágenes personales. Esa revisión visual no es un ensayo USB cenital ni un benchmark de gestos, falsos positivos o latencia física. Las 86 pruebas y los paquetes de 0.1.3 permanecen identificados como antecedentes.

## 6 de octubre - Evidencia histórica: puños cenitales/frontales en 0.1.5

El usuario confirma que el skeleton aparece en ambas manos cerradas, pero el programa no adquiere el desplazamiento. Se investiga la interpretación de la postura: en 0.1.4 se combinaban ángulos XYZ con longitudes, escala y compactación XY, que el escorzo frontal puede colapsar. Una rotación rígida sintética de la misma mano reprodujo un rechazo a 90° sin cambiar su forma 3D ni salir del encuadre; ese caso identifica un defecto geométrico, no un benchmark de cámara.

La corrección utiliza evidencia positiva del puño en XYZ: curvatura/retracción y compactación de los cuatro dedos, exclusión de extensión y pulgar compacto/aducido. Un DIP recto exige cierre fuerte con cuerda/cadena ≤ `0,45` y retracción ≤ `0,90`; no se acepta una garra sólo por PIP doblado. Prefiere `worldLandmarks` válidos, asociados por índice a los landmarks de imagen del mismo resultado; si world falta, utiliza fallback XYZ normalizado con corrección de aspecto. Un world explícito inválido bloquea clic y navegación, sin ocultar el puntero fresco. El mundo es estimado por MediaPipe, no una medición de profundidad ni una garantía de visibilidad. Cursor, pan y zoom conservan su geometría de imagen.

No cambia Hand Landmarker full, su SDK, pesos ni los umbrales del task, y no añade una segunda inferencia. Se conservan clic de 1,5 segundos, dos puños exclusivamente para pan, dos OK exclusivamente para zoom y preview permanente. Los parámetros y la cobertura final se registran en el [protocolo](../Documentos/03-protocolo-validacion.md). Las 94 pruebas y entregas 0.1.4 son antecedentes y no certifican esta corrección.

La suite **0.1.5 aprobó 104/104 pruebas**: 65 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build Vite, runtime Mac/Windows y smoke del contenido de ambos paquetes están aprobados. El PNG positivo procesado por el modelo real entrega **21 `worldLandmarks`**; el clasificador integrado utiliza esa fuente. Los **seis checks `fistViewsFeedback`** aprueban carga y uso de world, `cenital-dorso`, `frontal-nudillos`, `frontal-palma` y `mixedOrientationsPan`: las vistas de puño son XYZ sintético, no puños capturados por cámara. El motor real adquiere pan sin zoom; mover coordenadas de imagen con un mundo local fijo por mano desplaza el mapa sin usar world como posición global.

También aprueban nueve checks de navegación exclusiva, siete de preview, ocho de punteros y ocho de calidad, además de cuatro clics nativos `isTrusted` de al menos `1500 ms`, sin temprano/repetición, con anclaje/aro y recorrido completo. El botón del popup no duplica el avance; el límite carga una entidad. Estas comprobaciones no miden recall, falsos positivos ni latencia física.

El código comprobado es `a2d778582443e0eea81cf386d5e6219815b99eb8`. Los reportes [Mac 0.1.5](../Documentos/verificacion-paquete-mac-0.1.5.json) y [Windows 0.1.5](../Documentos/verificacion-paquete-windows-0.1.5.json) confirman el smoke del contenido empaquetado. La [CI Windows 37417286255](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37417286255) terminó con éxito: 104 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Cámara USB cenital/frontal, métricas físicas y Google con key real siguen pendientes; la [entrega](../Documentos/04-entrega-y-verificacion.md) identifica archivos y alcance por plataforma.

La `.app` Mac 0.1.5 se abrió y se verificó la cámara activa. La revisión detallada de Ayuda, Ajustes y skeleton de 0.1.4 queda histórica; esta corrección conserva esa interfaz. No se presenta la apertura ni el panel activo como benchmark físico de puños, precisión o latencia.

## 6 de octubre - Evidencia histórica: seguimiento de índice y nudillos en 0.1.6

Cada sombra sigue la **punta del índice, landmark 8**, en reposo, palma abierta, apuntado, OK y zoom. Cuando la postura se reconoce como puño, utiliza la media de los **MCP 5, 9, 13 y 17**, sin muñeca: un punto de nudillos estimado por el modelo, no garantía de visibilidad física de cada articulación. `pointerReference()` comparte esa elección con el fallback del renderer; sin geometría clasificable, éste conserva el índice 8 fresco sin habilitar acciones.

Cambiar entre índice y nudillos conserva inicialmente la posición mostrada y elimina su corrección durante **300 ms** con `smoothstep`, incluso si la mano queda quieta. La referencia vuelve a su posición absoluta, sin un offset que sólo desaparezca al mover la palma. Continúa el filtro 1€; pérdida de tracking no permite animar ni seleccionar con datos antiguos.

**Excepción de selección individual:** objetivo, aro y halo permanecen anclados durante el OK de `1500 ms`. Se puede iniciar con OK directo; al entrar se conserva una posición reciente cuando existe. Abrir antes del umbral cancela y completar produce un único clic hasta abrir `120 ms`. Cancelar/liberar regresa suavemente desde la posición mostrada al índice. Dos OK no heredan un offset del clic individual.

La navegación sigue exclusiva y exige `180 ms`: **dos puños desplazan por el punto medio de sus referencias de nudillos**; **dos OK hacen zoom por separación de los índices 8**, con ancla en su punto medio. La pinza 4/8 conserva la detección de OK, el control de drift y la comprobación de continuidad/identidad; ya no define la posición del halo ni la distancia de zoom. Modelo, SDK, umbrales de puño XYZ, mapa, recorrido y UI se conservan.

La suite **0.1.6 aprobó 113/113 pruebas**: 74 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. Los build, runtime y paquetes Mac/Windows están aprobados. Los **13 checks `indexTrackingFeedback`** verifican referencias de apuntado/palma abierta/reposo/OK/puño y mano del modelo real con 21 puntos, cambios sin salto, convergencia quieta a nudillos/índice y tres fallbacks: índice, nudillos y geometría desconocida con landmark 8.

También aprueban seis checks de fuente/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. La selección registra cuatro clics nativos `isTrusted` de al menos `1500 ms`, objetivo/aro anclados, sin temprano/repetición, botón sin doble avance y recorrido completo. Las posturas de esos checks son sintéticas; el PNG positivo verifica la inferencia real, sin acreditar puños físicos ni una tasa de falsos positivos.

El código comprobado es `0c79d38b4aa65486553011495d9695acc6dec9b7`. Los reportes [Mac 0.1.6](../Documentos/verificacion-paquete-mac-0.1.6.json) y [Windows 0.1.6](../Documentos/verificacion-paquete-windows-0.1.6.json) confirman el smoke del contenido empaquetado y 13 checks de seguimiento con coordenadas esperadas calculadas directamente del índice 8 y la media MCP. La [CI Windows 37418725259](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37418725259) terminó con éxito: 113 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Google con key, cámara USB cenital/frontal y métricas físicas siguen pendientes; la [entrega](../Documentos/04-entrega-y-verificacion.md) identifica archivos y alcance.

La `.app` Mac 0.1.6 abrió correctamente; la ayuda de índice/nudillos se verificó en la interfaz nativa y se observó la cámara activa. Esa revisión de UI no es un benchmark físico de gestos, skeleton, falsos positivos o latencia.

## 6 de octubre - Evidencia histórica: preparación de intención en 0.1.7

El usuario reporta que cerrar OK desplaza el índice y pierde la selección aunque la mano siga detectada. La revisión distingue el movimiento de los dedos al cerrar del desplazamiento deliberado de la palma: conservar sólo la última posición de cada frame podía sobrescribir el objetivo antes de reconocer OK.

La corrección **0.1.7** conserva la intención de selección antes de que el cierre gradual desplace el índice fuera del objetivo. Con apuntado estable y fresco, curvar el índice y reducir la razón de pinza puede guardar una **intención latente privada**: la sombra sigue al índice, sin anclaje visible, progreso, reloj ni eventos. Esa copia sólo se consume al validar OK, conservando el destino previo aunque el pulgar permanezca quieto. Un acercamiento positivo adicional del pulgar o del índice hacia su lado anatómico puede mostrar `click-preparing` antes de OK: objetivo y halo anclados, progreso `0`, sin eventos. Apuntar o hacer hover no completa una selección. OK inicial directo sigue permitido sin apuntado previo.

Sólo al validar **OK** comienza el mantenimiento continuo de **1500 ms**. Los primeros **300 ms** admiten un asentamiento acotado del punto medio de la pinza 4/8, condicionado a que la palma siga estable respecto del inicio del mantenimiento. Terminado ese intervalo se conserva el control de deriva habitual; no se reinicia el reloj ni se mueve el destino. Esta tolerancia no permite arrastrar la mano, continuar a ciegas ni acumular tiempo de preparación como OK.

Fuera de selección, se mantienen índice 8, dos OK para zoom por separación de índices y dos puños para pan por el punto medio de sus medias MCP 5/9/13/17. La transición visual de referencia con `smoothstep` durante **300 ms** es un mecanismo distinto del asentamiento inicial de la pinza. Continúan las cancelaciones por segunda mano, pérdida, datos obsoletos/discontinuos, pausa o bloqueo; un clic por mantenimiento y rearme tras abrir **120 ms**.

La suite **0.1.7 aprobó 125/125 pruebas**: 83 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build y los runtime Mac/Windows están aprobados: cuatro clics nativos `isTrusted`, objetivo conservado durante cierre gradual, ningún clic antes de OK ni antes de completar **1500 ms**, sin repetición y recorrido completo. El botón de popup incluye cierre con pulgar quieto. Son entradas sintéticas con el motor real, no un ensayo físico de gestos.

El código comprobado es `249d6d31d3715b6bbee750a2e3c374735e5ee168`. El [paquete Mac 0.1.7](../Documentos/verificacion-paquete-mac-0.1.7.json) está aprobado: los cuatro mantenimientos registran cierre gradual en 15 pasos, preparación observada, cero acción previa a OK y destino conservado. El botón verifica `stationaryThumb=true`. También aprueban 13 checks de seguimiento, seis de world/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. Las duraciones desde el primer OK válido son **1541,2 / 1541,6 / 1540,9 / 1532,6 ms**, sin clic temprano ni repetición.

La [CI Windows 37421399632](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37421399632) terminó con éxito para `249d6d31d3715b6bbee750a2e3c374735e5ee168`: dependencias, 125 pruebas, build, runtime, construcción del portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto aprobados. El [reporte Windows 0.1.7](../Documentos/verificacion-paquete-windows-0.1.7.json) confirma intervalos de **1506,6 / 1508,4 / 1506,5 / 1510,4 ms** desde el primer OK válido. Esa ejecución verifica el contenido empaquetado; no ejecutó el envoltorio portable como tal. La `.app` Mac final abrió y su ayuda nueva se revisó; se observó Cámara activa y una mano. Esa observación no mide precisión física. Cámara USB cenital/frontal, métricas físicas, Google con key y arranque del envoltorio portable Windows siguen pendientes. La evidencia 0.1.6 se conserva como historia.

Consultar las fuentes primarias Meta y Ultraleap en el [referente de selección](../Documentos/05-meta-quest-y-seleccion.md); sus pipelines XR no se incorporan al detector USB.

## 6 de octubre - Recuperación de selección en 0.1.8 (antecedente)

Las pruebas sintéticas 0.1.7 aprobaron cierres ideales, pero no la deformación MCP añadida en la reproducción técnica del fallo posterior. Que una OK habilitara zoom y no clic orientó la revisión hacia la asistencia y el rearme, no hacia cambiar el modelo.

La corrección **0.1.8** responde a un bloqueo informado durante uso físico y reproducido con landmarks sintéticos: una deformación aislada de MCP podía abortar la ayuda previa y dejar `clickBlocked` activo, aunque OK válido sí servía para zoom. La asistencia de cierre es **opcional**. Un OK válido tiene prioridad: si su copia sigue fresca, de menos de **1200 ms**, y el movimiento robusto de palma no supera **0,055**, conserva el objetivo e inicia un mantenimiento nuevo de **1500 ms** antes de aplicar las condiciones estrictas de preparación. OK directo sigue permitido.

Cuando una intención latente o preparación vence o se aborta antes de un hold, se descarta suavemente. Se limpian copia, historial del cursor y anclaje visual; `resetSelection` obliga al renderer a borrar el objetivo antiguo y volver al índice actual. El descarte no activa un bloqueo persistente ni reutiliza tiempo. Las cancelaciones de un **hold activo**, pérdida/discontinuidad/identidad, paso de dos manos a una, world inválido, foco, pausa y calidad mantienen el bloqueo de seguridad y exigen apertura válida de **120 ms**. El clic sigue siendo automático al completar OK de **1500 ms**, uno por mantenimiento, sin confirmar al soltar.

La palma se mide respecto de una base fija mediante el **máximo entre la mediana de los desplazamientos de las cinco referencias 0/5/9/13/17 y el desplazamiento de su centroide**. Una MCP aislada deformada no representa por sí sola traslación de toda la mano; una traslación rígida acumulada sigue limitada. El índice 8, las referencias de nudillos, los modos exclusivos de dos puños/dos OK, el asentamiento inicial de pinza de **300 ms**, modelo, SDK, pesos y umbrales del task se conservan. Esta medida es una hipótesis geométrica, no una garantía de precisión física.

El diagnóstico usa la métrica existente de **Ajustes → Diagnóstico de seguimiento**: «Abre la pinza para habilitar la selección», «Usa una sola mano para seleccionar» o «Postura no válida para seleccionar». Mientras se navega, «Zoom» o «Desplazando» tiene prioridad. Al abrir Ajustes se conserva el último motivo de control, aunque el diálogo impida acciones. La exportación añade estado y conteos de razones, sin frames de cámara ni landmarks; no calcula una tasa de falsos positivos.

La suite **0.1.8 aprobó 132/132 pruebas**: 90 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build y runtime Mac están aprobados. El smoke nativo registra cuatro clics `isTrusted` tras al menos **1500 ms**, destino conservado, aro, ningún clic temprano ni repetición y recorrido completo. El punto fuerza `deformedPalm=true` con **MCP 5 desplazado +0,03 al primer OK**; el botón conserva `stationaryThumb=true`. Los seis checks `selectionRecoveryFeedback` aprobaron, incluida la prioridad de etiqueta «Zoom».

El código histórico comprobado es `323bc002a998babd9cc1d30825e68fc8383c7dee`. El [paquete Mac 0.1.8](../Documentos/verificacion-paquete-mac-0.1.8.json) está aprobado: cuatro clics nativos con intervalos de **1538,9 / 1500,8 / 1500,9 / 1534,3 ms** desde OK válido, incluidos MCP 5 deformado y pulgar quieto, destino conservado y seis checks de recuperación. La [CI Windows 37464967238](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37464967238) terminó con éxito: 132 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El [reporte Windows 0.1.8](../Documentos/verificacion-paquete-windows-0.1.8.json) confirma cuatro clics nativos con intervalos **1533,1 / 1509,3 / 1528,0 / 1532,4 ms**, MCP 5 deformado, pulgar quieto y seis checks de recuperación. El envoltorio portable no se ejecutó como tal. Estos checks usan landmarks sintéticos con el motor real y eventos nativos dentro de la app; no validan cámara USB, falsos positivos ni latencia física. Una auditoría independiente aprobó **167 casos adicionales**, separados de la suite del repositorio; no son 167 usuarios. Esta evidencia no certifica el pan de una mano ni los paquetes 0.1.9.

## 6 de octubre - Pan con uno o dos puños en 0.1.9 (histórico)

El usuario solicita poder desplazar con al menos una mano cerrada. No se recupera el gesto histórico de palma abierta.

La **0.1.9** amplía el desplazamiento a **al menos un puño cerrado**. Pan usa sólo los puños: uno desplaza desde su media MCP 5/9/13/17 y dos desde el punto medio de ambas referencias de nudillos. Si la otra mano está abierta, apuntando, en reposo o en OK, conserva su sombra fresca pero no contribuye al movimiento; puño + palma u OK produce sólo pan, sin clic ni zoom. Todas las manos presentes deben conservar datos válidos; una mano extra inválida bloquea acciones. La postura se adquiere durante **180 ms**. Cambiar entre uno y dos puños participantes, o cambiar su identidad, exige otros **180 ms** y una nueva base, sin salto ni arrastre de un ancla anterior. Cambiar el número o identidad de **cualquier mano observada**, incluso la libre, también exige reestabilizar tracking y adquirir de nuevo durante **180 ms**; pan no requiere abrir para esa readquisición. Zoom continúa exclusivamente con **dos OK**, por separación entre índices 8; selección sólo con un OK y exactamente una mano detectada. Mezclas sin puño ni dos OK no navegan. Una palma abierta o un OK individual no desplazan el mapa.

Sólo los puños que ya participan en pan se muestran **violetas**; la mano libre permanece **azul** y no aporta al desplazamiento. Dos OK adquiridos se muestran ámbar. Durante los **180 ms** de adquisición de navegación no se muestra hover ni aro de clic. Cambiar número o identidad de manos detectadas también exige reestabilizar tracking durante **180 ms**, con nueva base y sin exigir apertura para pan.

La suite **0.1.9 aprobó 145/145 pruebas**: 103 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. **Build y runtime Mac/Windows aprobados**. Los **23 checks `navigationFeedback`** incluyen pan1/pan2, mano libre azul sin aportar movimiento, cambios uno↔dos sin salto, adquisición sin aro/hover, delta físico independiente y bloqueo ante conteo/datos inválidos. Los **nueve `fistViewsFeedback`** verifican pan con uno y dos puños en tres vistas sintéticas; aprueban también seis checks de recuperación y cuatro clics nativos `isTrusted`, junto con el recorrido. Clic continúa en **1500 ms**, zoom sólo con dos OK y selección/recuperación 0.1.8 se conservan.

El código comprobado es `cb7d88071af0388d146d3719ae5c77744d3a8661`. El [paquete Mac 0.1.9](../Documentos/verificacion-paquete-mac-0.1.9.json) está aprobado: 23 checks de navegación, nueve de vistas de puño, seis de recuperación y cuatro clics nativos con intervalos **1539,0 / 1539,8 / 1533,8 / 1533,0 ms** desde OK válido. La `.app` abrió, se revisó la ayuda de un puño y se observó cámara activa con cero manos; esa observación no es un ensayo físico de gestos. La [CI Windows 37466845521](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37466845521) terminó con éxito para esa misma revisión: 145 pruebas, build, runtime, construcción del portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto aprobados. El [reporte Windows 0.1.9](../Documentos/verificacion-paquete-windows-0.1.9.json) confirma 23 checks de navegación, nueve de vistas de puño, seis de recuperación y cuatro clics nativos con intervalos **1529,0 / 1512,2 / 1514,4 / 1500,0 ms** desde OK válido, sin clic temprano ni repetición y con recorrido completo. Verifica el contenido empaquetado; no se ejecutó el envoltorio portable como tal. Los checks usan landmarks sintéticos con motor real y eventos nativos dentro de la app; no acreditan ensayo USB, latencia física ni tasa de falsos positivos. Las 132 pruebas y paquetes 0.1.8 quedan históricos.

## 9 de octubre - Selección acompañada y perspectiva en 0.1.10

El usuario solicita conservar control y selección cuando aparece la segunda mano y aceptar OK en más perspectivas. La revisión modifica reglas de interacción y geometría, sin reemplazar ni entrenar el modelo.

La **0.1.10** separa acción y acompañante con esta prioridad: **dos OK válidos hacen zoom; un OK válido selecciona; sin OK, uno o dos puños desplazan**. Un OK puede mantener el clic de **1500 ms** aunque la otra mano esté abierta, en reposo o cerrada en puño: OK + puño selecciona, no desplaza. Pan utiliza sólo los nudillos de los puños y zoom la separación entre índices 8. No se combinan acciones ni se hereda progreso al entrar en zoom.

Se valida a los **participantes de la acción**. Una mano ajena inválida o neutra no debe bloquear a un actor válido. Si el acompañante entra, sale o cambia de identidad sin participar, el actor conserva su objetivo, reloj y continuidad; no se reinicia el hold ni la base de pan por el simple cambio del conteo. La pérdida, invalidez o discontinuidad del actor, foco, pausa y calidad global siguen siendo guardas de seguridad. El segundo OK válido sí activa la prioridad de zoom y termina la selección individual. La adquisición de navegación y el rearme se resuelven por participantes: cambiar un acompañante ajeno no reinicia la acción; cambiar el conjunto real de puños o pasar a zoom adquiere una base nueva durante **180 ms**, sin salto ni tiempo heredado.

El feedback pertenece al actor: el aro y halo de selección permanecen anclados en su objetivo aunque haya dos manos detectadas, mientras el acompañante conserva su sombra fresca independiente. Sólo participantes de pan se muestran violetas y los dos OK de zoom, ámbar; la mano libre permanece azul. Se mantienen preview pequeño permanente, controles de cámara explícitos y diagnóstico en Ajustes. Modelo, pesos, SDK e inferencia no cambian.

El rearme se conserva **por mano**. Si cambia el actor de A a B, B puede iniciar un mantenimiento nuevo de **1500 ms**, sin heredar tiempo, objetivo ni bloqueo de A. Cada mano conserva rearme de **120 ms** y cooldown de **400 ms**. Tras zoom o reaparición de una mano que perdió tracking se exige apertura válida antes de seleccionar, para evitar un clic al salir del zoom. El renderer dirige hover, aro y clic por **`selectionHandId`**, no por posición `0` del array ni por conteo; invertir el orden del resultado no cambia al actor.

La guarda de geometría se aplica también al **puño participante de pan**. Si A pierde geometría válida y luego vuelve en OK, debe abrir para rearmarse, con o sin acompañante. B válido conserva su propia capacidad de seleccionar; no hereda el bloqueo de A. Si A recupera un puño válido, puede readquirir pan durante **180 ms** sin exigir apertura, tomando base nueva y sin salto.

La ayuda de cierre sigue siendo opcional. Si el acompañante ya está en puño, una intención privada de la mano libre puede conservarse sin mostrar `click-preparing` ni interrumpir pan. Sólo OK validado tiene prioridad para selección y comienza los **1500 ms** completos. No todos los cierres muestran preparación pública: se debe comprobar objetivo válido retenido al primer OK y ausencia de clic previo, además del mantenimiento posterior.

OK utiliza una única geometría **XYZ consistente**: `worldLandmarks` válidos de la misma mano, o XYZ normalizado con aspecto corregido cuando world no existe. La razón pulgar 4–índice 8 / palma entra en `0,28` y sale en `0,40`, acompañada de evidencia positiva semiextendida en al menos dos de los otros tres dedos y de cierre del índice o oposición compacta del pulgar. No exige dedos perfectamente rectos ni un círculo perfecto; una superposición XY con separación Z no sustituye la proximidad 3D. World es una estimación monocular, no una medición de contacto físico. Los umbrales experimentales del módulo se detallan en el protocolo. La geometría y el rearme por participante se comprobaron sintéticamente, en runtime y en paquetes finales; la validación física sigue pendiente. La comprobación física sigue pendiente.

La suite **0.1.10 aprobó 177/177 pruebas**: 117 de motor de gestos, 14 de geometría OK, 4 de participantes anónimos, 12 de selección, 3 de calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia/contorno. **Build y runtime Electron aprobados** sobre `b6184aa9f0ba62cfa6b0e1b39cd7615c4ea0e797`. Las tres regresiones de rearme comprueban que A pierde geometría y requiere apertura antes de seleccionar, tenga o no acompañante; B válido no se bloquea y A en puño readquiere pan durante **180 ms** sin apertura ni salto. El runtime ejecutó cuatro clics `isTrusted` con intervalos **1540,5 / 1500,3 / 1534,3 / 1541,0 ms**, conservando actor/objetivo/aro con acompañante cambiante y con puño permanente. Son landmarks sintéticos y eventos de la app, no rendimiento físico medido.

Los **paquetes finales Mac y Windows 0.1.10 están aprobados**: [reporte Mac](../Documentos/verificacion-paquete-mac-0.1.10.json) y [reporte Windows](../Documentos/verificacion-paquete-windows-0.1.10.json), ambos `ok:true` con cuatro clics nativos. Intervalos Mac **1503,7 / 1500,6 / 1500,5 / 1541,0 ms**; Windows **1526,5 / 1516,7 / 1524,2 / 1509,2 ms**. Acompañante cambiante, reorden y salida conservan actor/objetivo/aro; el botón mantiene compañero puño desde el inicio y actor secundario. Ambos reportes aprueban **24 checks de navegación** y todos los grupos Feedback. La [CI Windows 38006516067](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/38006516067) terminó con éxito para la misma fuente, incluido portable y smoke de `win-unpacked`; el envoltorio NSIS no se ejecutó como tal. La `.app` final abrió sin iniciar cámara. La [entrega](../Documentos/04-entrega-y-verificacion.md) registra archivos, tamaños, hashes y capturas finales. Las **145/145 pruebas y paquetes Mac/Windows 0.1.9** permanecen históricos; esta evidencia nueva sigue siendo sintética y no mide gestos físicos.

## Decisiones de interacción vigentes

- Prioridad: dos OK válidos para zoom, un OK válido para seleccionar incluso acompañado y, sin OK, uno o dos puños para desplazar.
- La palma abierta ya no desplaza el mapa.
- El puño exige evidencia positiva XYZ de recogimiento y compactación, preferentemente del mundo estimado; la posición del control sigue usando la imagen. Escorzo frontal y vista cenital deben evaluarse por separado.
- Un OK estable de una mano ejecuta el clic automáticamente al completar `1500 ms`, sin soltar.
- La sombra sigue índice 8 salvo puño, que usa media de MCP 5/9/13/17; transición temporal de 300 ms incluso quieto.
- La asistencia de cierre es opcional: un descarte previo sin hold no bloquea el siguiente OK válido; limpia el destino viejo. Sólo OK válido inicia los `1500 ms`. Durante OK individual el objetivo, aro y halo quedan anclados; cancelar/liberar regresa suavemente al índice. Dos OK no heredan offsets de ese clic.
- Mantener cerrado no repite clics. Una apertura de `120 ms` rearma la selección; abrir después del clic no genera otro evento.
- Abrir antes del umbral cancela el mantenimiento. El aro azul confirma en verde cuando se ejecuta el clic.
- Un acompañante neutro que entra, sale o cambia de identidad no cancela el hold ni reinicia la base de navegación del actor estable. OK + puño selecciona. Un segundo OK válido pasa a zoom y no hereda progreso. Invalidez de mano ajena neutra no veta al actor válido; foco, calidad y pérdida/invalidez del participante continúan como guardas.
- Una sombra por mano conserva feedback en reposo, clic y navegación; violeta identifica sólo puños participantes adquiridos, mano libre azul y ámbar dos OK. Adquisición sin aro/hover de clic. No se ejecuta pan y zoom a la vez.
- El preview pequeño está siempre visible; sólo muestra skeleton fresco con cámara activa y se limpia al detenerla. El diagnóstico detallado está en Ajustes.
- Pausa, pérdida de foco, cancelación y pérdida de tracking detienen las acciones en curso.
- Todo el encuadre de cámara corresponde a todo el mapa con espejo, orientación y límites `0..1`, sin calibración de esquinas.
- El recorrido avanza por clic nativo sobre el punto activo; tras completar 1→2→3 se reinicia desde Ajustes.
- Una imagen extrema cancela acciones sin ocultar los punteros frescos; se exigen 600 ms continuos de recuperación.

Los tiempos elegidos son valores iniciales para probar. No se registran todavía como una solución validada por usuarios.

## Interfaz y mapas

La interfaz usa controles sobrios, bordes finos y tipografía de sistema, tomando Primer de GitHub como referente. El mapa ocupa el espacio principal y el preview pequeño permanece visible arriba a la izquierda. Los ajustes y el diagnóstico detallado se despliegan cuando se necesitan. Las sombras comunican posición y estado de control, mientras el aro indica el tiempo de confirmación.

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
