# Protocolo de validación del mapa gestual

**Fecha:** 6 de octubre de 2026<br>
**Versión vigente:** 0.1.5<br>
**Estado:** 104/104 pruebas, build/runtime y paquetes Mac/Windows 0.1.5 aprobados; ensayo USB cenital/frontal, métricas físicas, Google con key y envoltorio portable pendientes<br>
**Proyecto:** Mapa Gestual MLR · La Reina<br>
**Equipo del proyecto:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al prototipo](../README.md) · [Revisar investigación de visión](./01-investigacion-vision.md) · [Revisar gestos y UX](./02-gestos-y-ux.md)

## Qué queremos comprobar

Evaluar si una cámara cenital permite apuntar, seleccionar, desplazar y hacer zoom sin activar acciones durante movimientos cotidianos. Medir precisión, estabilidad y demora en el equipo de la instalación; no trasladar benchmarks de teléfonos o modelos de cuerpo a este prototipo.

Una buena detección de mano no garantiza un buen clic. Separar tres errores: detectar una mano inexistente, estimar mal su postura y ejecutar una acción que la persona no quería realizar.

La versión 0.1.1 responde a una observación del usuario: la palma abierta podía mover el mapa accidentalmente. Se elimina ese gesto de navegación. No se interpreta la observación como una tasa medida ni como un estudio de usuarios completado.

En 0.1.2 el usuario pide mantener OK durante **3 segundos** y ejecutar el clic automáticamente, sin soltar. El objetivo se conserva entre la postura de apuntado y OK para evitar que el cursor se recentre. Un OK inicial directo también está permitido y ancla la posición válida actual; no requiere apuntado previo. El [referente Meta Quest](./05-meta-quest-y-seleccion.md) orienta apuntado estable, hover y recuperación; no determina esos 3 segundos ni equivale a integrar su modelo 3D en una cámara USB.

En **0.1.4** el usuario reduce la confirmación a **1,5 segundos** y separa las posturas: **índice para apuntar**, **OK de una mano para clic automático**, **dos puños cerrados para pan** y **dos OK para zoom**. Tras `180 ms`, sólo los puños trasladan el mapa por su punto medio y sólo los OK cambian el zoom por separación. Las componentes no se combinan: variar separación con puños no amplía y trasladar dos OK no desplaza. Mezclas y una sola mano no navegan. Cambiar postura obliga a una nueva adquisición; abrir o perder una mano termina sin clic residual. Pausa con Espacio, pérdida de foco y Esc continúan.

Desde 0.1.3 cada mano detectada conserva una sombra fresca, incluso en reposo y durante navegación. En 0.1.4 azul indica apuntado/reposo, violeta identifica dos puños adquiridos y ámbar dos OK adquiridos, incluso quietos. El color depende de la postura, no del movimiento dominante. Las acciones bloqueadas muestran punteros grises. El aro y ripple de clic individual requieren exactamente una mano reportada por el detector. El aro avanza de `0` a `1` durante el mantenimiento y confirma en verde. Comprobar el conteo bruto antes de filtrar posturas: dos detecciones cancelan el clic individual aunque el motor acepte sólo una por geometría, sin ocultar sus sombras.

Todo el encuadre de cámara corresponde a todo el mapa mediante orientación y límites `0..1`, sin homografía ni esquinas guardadas. El recorrido tiene tres puntos ficticios numerados, un único activo con pulso y avance por clic nativo **1→2→3**. El límite comunal proviene de SUBDERE DPA 2023 y se documenta en [Límite de La Reina y recorrido](./07-limite-la-reina.md); no convierte los marcadores ficticios en datos municipales.

## Configuración que se debe registrar

| Elemento | Configuración inicial implementada |
|:---|:---|
| Runtime | `@mediapipe/tasks-vision` `1.0.1`; modelo Hand Landmarker full y WASM locales. |
| Inferencia | Worker, delegate CPU, modo video y hasta dos manos. |
| Umbrales del task | Detección `0,70`, presencia `0,70`, tracking `0,70`. |
| OK | Pinch pulgar–índice y al menos dos de los otros tres dedos extendidos. |
| Histéresis del pinch | Entrada `0,28`; salida `0,40`. |
| Confirmación y clic | OK válido durante `1500 ms`; clic automático al completar, sin soltar, con objetivo anclado. |
| Rearme y repetición | Un clic por mantenimiento hasta abrir `120 ms`; cooldown de clic `400 ms`. |
| Objetivo | Posición conservada entre posturas y anclada durante confirmación; OK inicial directo usa la posición válida actual, sin requisito de apuntado previo ni centro de pantalla como fallback. |
| Hover y candidatos | Resolución first/best de un solo objetivo visible, sin alternar destino durante el aro. |
| Marcadores y hitarea | Tres puntos numerados: dibujo nominal `40 px`, activo `56 px`, área exterior fija `56 × 56 px`; sólo el activo pulsa y se ofrece como objetivo del recorrido. |
| Recorrido | Clic nativo sobre el activo avanza una posición; tras 1→2→3 no queda pulso. Reinicio desde Ajustes; Inicio conserva progreso y el botón del popup no lo duplica. |
| Pan exclusivo | Dos puños adquiridos durante `180 ms`; sólo traslación del punto medio. La separación no cambia el zoom. |
| Zoom exclusivo | Dos OK adquiridos durante `180 ms`; sólo cambio de separación. La traslación común no cambia el centro. |
| Cambio de modo | Puños ↔ OK exige otros `180 ms`; mezclas no navegan y no conservan anclas anteriores. |
| Puño 0.1.5 | Evidencia positiva XYZ de curvatura/retracción y compactación de los cuatro dedos, exclusión de extensión y pulgar compacto/aducido; DIP recto sólo con cierre fuerte y pulgar sin flexión obligatoria. Segmentos válidos y mano de imagen dentro del frame. Umbrales experimentales descritos abajo; 104 pruebas y paquetes Mac/Windows aprobados. |
| Fuente del puño | Preferir `worldLandmarks` XYZ válidos de la misma mano/inferencia; fallback a XYZ normalizados con aspecto corregido sólo si world falta. World explícito inválido bloquea clic y navegación y conserva el puntero fresco. No mezclar puntos de distintas manos ni unidades entre fuentes. Cursor y acciones de mapa siguen en coordenadas de imagen. |
| Una mano abierta | No desplaza ni amplía el mapa. |
| Sombras | Una por cada mano con datos frescos, hasta dos, incluyendo posturas no elegibles; azul apuntado/reposo, violeta dos puños/pan, ámbar dos OK/zoom y gris bloqueo. |
| Aro y ripple | Sólo con exactamente una mano detectada; progreso `0→1` durante 1,5 segundos y confirmación verde, sobre el destino anclado. La segunda mano cancela el clic individual sin ocultar punteros. |
| Color de navegación | `pan` violeta con dos puños y `zoom` ámbar con dos OK, tras adquisición y aun quietos; los parámetros de dominancia de movimiento de 0.1.3 no definen el modo nuevo. |
| Zona muerta de desplazamiento | `panDeadband=0,003`, movimiento acumulado en unidades métricas normalizadas de cámara. |
| Zona muerta de zoom | `zoomDeadband=0,008` en cambio log2 y `zoomDistanceDeadband=0,003` de variación de separación; ambas condiciones deben superarse. |
| Filtro 1€ | `minCutoff=1,4`, `beta=6`, `derivativeCutoff=1`, unidades normalizadas de cámara. |
| Mapeo | Todo el frame a todo el mapa; espejo/rotación y límites `0..1`, sin homografía ni esquinas guardadas. Corrección breve de postura; recuperar posición absoluta al desplazarse y alcanzar bordes. |
| Calidad de imagen | Imagen casi totalmente negra/blanca o frame inválido cancela y bloquea acciones inmediatamente; recuperación no severa continua `600 ms`. Aviso estable tras `200 ms` de condición severa, sin permitir acciones durante esa espera. |
| Cámara | Brillo, contraste y compensación de exposición sólo con rangos válidos declarados por el track; solicitar modos continuos sólo si están disponibles y verificar ajustes reportados. |
| Preview permanente | Vista cenital fija arriba a la izquierda, ancho nominal `200 px` o `160 px` en pantallas pequeñas; imagen, skeleton fresco y conteo con cámara activa. Sin casilla ni botón de cierre. Cámara detenida: mensaje y datos anteriores limpios. |
| Diagnóstico | Métricas detalladas, exportación y Marcar falso clic en una sección desplegable de Ajustes. No iniciar cámara ni pedir permisos automáticamente. |
| Equipo principal | macOS arm64 y cámara USB; anotar modelos y versiones reales. |
| Segundo destino | Windows x64, `.exe` portable; verificación de cámara por separado. |
| Mapa | OpenStreetMap para pruebas sin key; Google Maps pendiente de credencial y comprobación. |

La corrección **0.1.5** conserva tiempos, modelo, SDK y umbrales de detección, y revisa únicamente la interpretación positiva del puño y el transporte de su mundo estimado. Las 104 pruebas, build/runtime y paquetes Mac/Windows están aprobados. Las 94 pruebas y paquetes 0.1.4 son evidencia histórica, no aprobación de esta actualización. El ensayo cenital USB, las métricas físicas, controles reales del driver, Google Maps con key y el envoltorio portable siguen pendientes. Los 1,5 segundos son preferencia del usuario; tamaños y umbrales son decisiones experimentales de la app, no valores Meta ni garantías universales.

El gate de calidad controla si se pueden emitir acciones, no la confianza del detector ni el número de manos. Las sombras siguen basándose en resultados frescos durante bloqueo. Una imagen con brillo y contraste aceptables puede contener landmarks erróneos; no afirmar que el gate garantiza pocos falsos positivos. Los avisos de bajo contraste o poco detalle no bloquean por sí solos. Registrar falsos bloqueos y tiempo habilitado, además de errores de gestos. La [investigación de cámara](./06-camara-y-contraste.md) define las métricas y los umbrales severos.

La distancia pulgar–índice se divide por una escala de palma obtenida de la muñeca–MCP del dedo medio y el ancho entre MCP de índice y meñique. Se corrige la relación ancho/alto de la cámara antes de comparar geometría. El rango entre `0,28` y `0,40` conserva el estado previo y evita alternancias alrededor de un único umbral.

### Geometría de puños cenitales y frontales

El skeleton de ambas manos permanece visible en el fallo reportado. En la revisión de 0.1.4, los ángulos usaban XYZ pero escala, longitudes y compactación usaban XY: un segmento orientado hacia la cámara puede proyectarse casi a un punto y resultar inválido pese a tener longitud 3D. Una rotación rígida sintética de la misma mano a 90° reprodujo ese rechazo dentro del encuadre; no se presenta como detección física ni como una tasa medida.

En 0.1.5 la geometría del puño se calcula de forma coherente en XYZ. Cada dedo largo debe aportar recogimiento y compactación positivos; se excluye la extensión en la propia geometría 3D. El pulgar debe mantenerse compacto/aducido, sin exigir que una articulación concreta esté doblada. No se define puño como simple ausencia de palma abierta u OK. La escala de palma, segmentos y distancias se calculan en la misma fuente; los parámetros siguientes son el contrato actual de implementación.

MediaPipe devuelve 21 puntos de imagen y 21 de mundo por mano: los primeros tienen x/y normalizados y z relativo a la muñeca; los segundos expresan XYZ en metros respecto al centro geométrico. Son estimaciones del modelo monocular. La fuente world se valida y asocia por índice dentro del mismo resultado; si world falta, el fallback normalizado corrige x/z por la relación ancho/alto. Un world explícito inválido bloquea clic y navegación, sin ocultar el puntero fresco ni inventar otra fuente. El cursor y la navegación utilizan la imagen. No se interpreta world como cámara de profundidad ni evidencia de visibilidad real. [Guía oficial Web, consultada 6-10-2026](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [conversión oficial de resultados](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/components/processors/landmark_result.ts).

| Evidencia positiva de puño 0.1.5 | Umbral experimental implementado |
|:---|:---|
| Fuente | 21 puntos XYZ finitos; world válido preferido. World ausente: normalized-3d. World explícito inválido: sin clic ni navegación; puntero fresco conservado. |
| Escala y segmentos | Palma y huesos medidos en la misma geometría 3D; cada segmento debe medir entre `0,015s` y `0,85s`. Rechazar palma/plano degenerados. |
| Curvatura de cada dedo largo | PIP ≤ `150°` y cuerda MCP–punta / longitud de cadena MCP→PIP→DIP→punta ≤ `0,72`. Además, DIP ≤ `155°` **o** cierre fuerte: cuerda/cadena ≤ `0,45` y retracción ≤ `0,90`. Un DIP recto no basta para aceptar una garra. |
| Retracción de cada dedo largo | Distancia punta–muñeca / PIP–muñeca ≤ `1,10`. |
| Compactación de cada dedo largo | Punta–MCP ≤ `0,90s` y punta–centro de palma ≤ `1,10s`, con escala 3D `s`. |
| Cercanía al plano de palma | Distancia perpendicular de la punta al plano ≤ `0,45s`; se admite hasta `0,75s` sólo si ese dedo tiene cierre fuerte: cuerda/cadena ≤ `0,45` y retracción ≤ `0,90`. La tolerancia permite grosor con evidencia positiva adicional, sin aceptar una garra sólo por PIP doblado. |
| Pulgar | Compacto/aducido: punta–centro de palma ≤ `0,85s`. No requiere un ángulo obligatorio de IP o MCP. |
| Extensión | Exclusión positiva de dedos extendidos en la propia geometría 3D. |
| Diagnóstico de fuente | `fistGeometrySource`: `world`, `normalized-3d`, `invalid-world` o `invalid-normalized-3d`. |

Si la imagen aporta evidencia positiva de apuntado, palma abierta u OK y el mundo aporta puño, `actionGeometryValid` bloquea clic y navegación conservando punteros: no se elige arbitrariamente entre dos posturas contradictorias.

Estos límites se aplican a landmarks estimados y constituyen hipótesis experimentales del motor. No equivalen a ángulos físicos medidos ni establecen visibilidad de articulaciones; no se añade un gate de `visibility`, otro clasificador ni segunda inferencia.

La mano de imagen completa debe quedar dentro del frame para habilitar pan; una mano recortada puede conservar su puntero fresco sin establecer esa postura de acción. El uso del mundo estimado no elimina pérdidas por oclusión, movimiento o iluminación. Las regresiones de giro fuera del plano, proyección frontal colapsada, datos XYZ ausentes/inválidos y posturas negativas están cubiertas por la suite final. El runtime ya comprueba tres vistas sintéticas; el ensayo físico cenital/frontal y falsos eventos siguen pendientes.

La continuidad se comprueba en el centro de palma **y en la pinza formada por los landmarks 4 y 8**. Un centro estable no debe permitir continuar si pulgar o índice saltan de forma anómala. Ante discontinuidad se cancela la acción de forma segura. Comprobar también que la separación filtrada sea válida y suficientemente alejada de cero antes de dividir o aplicar log2; rechazar esa condición sin generar pan, zoom ni clic residual.

Registrar commit, hash del modelo y build, versión del runtime, SO, CPU, resolución de pantalla, cámara, resolución/FPS reales, controles/capacidades reportados, exposición, iluminación, altura de montaje, encuadre, espejo y rotación. Cualquier cambio crea una condición nueva; no mezclar sus resultados sin identificarla.

## 1. Verificación de software

Ejecutar desde la carpeta del prototipo:

```bash
npm ci
npm test
npm run build
npm run test:app
```

La suite **0.1.5 aprobó 104/104 pruebas**. Incluye geometría positiva del puño en XYZ coherente, vistas cenitales/frontales, rotaciones fuera del plano, escorzo XY, escala/aspecto, world ausente/inválido, contradicciones de postura, garras rechazadas y cierre fuerte con DIP recto admitido, además de navegación exclusiva y cancelación del clic ante world inválido. La distribución y el runtime se registran más abajo; los resultados 0.1.4 son históricos.

La prueba de aplicación debe comprobar:

- Apertura de la ventana Electron y carga de UI construida.
- Carga del modelo y WASM empaquetados e inferencia sobre imagen sin mano.
- Inferencia positiva sobre fixture oficial con mano; esto comprueba integración, no precisión cenital.
- Restricciones de red del worker: intento bloqueado por CSP con evidencia de violación aplicada, además de carga e inferencia funcionales.
- Desplazamiento, zoom, apertura de popup y respuesta del botón de prueba dentro de la ventana propia.
- Entrada a Ajustes, pausa y cancelación sin eventos residuales.
- Mantener OK válido durante 1,5 segundos sobre un punto azul: ningún clic antes del umbral y un clic automático al completarlo, sin soltar.
- Repetir el ciclo completo sobre el botón del popup: un evento nativo dirigido al control propio y ninguna repetición mientras OK sigue cerrado.
- Abrir durante `120 ms` y seleccionar de nuevo; soltar después del clic no genera otro evento.
- Objetivo y aro estables en posiciones laterales durante la transición de índice a OK; no recentrar al faltar puntero en una postura intermedia.
- OK inicial directo con posición válida actual: iniciar mantenimiento sin exigir apuntado previo.
- Hover, hitarea propia y destino real coincidentes; un único candidato en áreas próximas, sin selección de controles ocultos.
- Una palma abierta de una mano sin desplazamiento ni zoom.
- Dos puños con movimiento paralelo: pan sin zoom; variar sólo su separación con punto medio quieto no debe cambiar la escala.
- Dos OK con punto medio fijo y separación variable: zoom sin desplazamiento involuntario.
- Dos OK con traslación y cambio de separación: sólo zoom, sin pan. Dos OK con separación constante no deben desplazar.
- Cambiar dos puños por dos OK y viceversa: adquirir otra vez `180 ms`, sin saltos ni eventos del modo anterior. Puño + OK y otras mezclas no navegan.
- Dos sombras independientes y frescas durante reposo, entrada a dos OK y navegación; no mostrar un único puntero en el punto medio.
- Cancelación y ocultación del aro/ripple de clic individual al detectar dos manos, incluso si una postura es descartada por el motor; conservar ambos halos.
- Azul en apuntado/reposo, violeta con dos puños adquiridos, ámbar con dos OK adquiridos y gris durante bloqueo; comprobar ambos colores aun quietos y ausencia de eventos por jitter.
- Preview siempre visible, pequeño y arriba a la izquierda; cámara activa con skeleton/conteo frescos, cámara detenida con mensaje y dibujo anterior limpio. Sin casilla ni botón para ocultarlo; permisos sólo al iniciar cámara explícitamente.
- Métricas, exportación y anotación manual accesibles en Ajustes → Diagnóstico de seguimiento, sin ampliar el preview.
- Pausa o bloqueo de calidad con resultados frescos: sombras grises sin eventos; pérdida o antigüedad excesiva de tracking: eliminar las sombras obsoletas.
- Extremos de cámara y centro a extremos de mapa y centro, incluyendo espejo/rotación; una transición de postura cerca del borde no debe impedir alcanzar `0` o `1`.
- Tres marcadores numerados, uno activo con pulso y área exterior fija; clic nativo sobre el activo avanza una vez 1→2→3, final sin pulso, reinicio desde Ajustes e Inicio sin pérdida de progreso.
- Objetivo estable durante el pulso y el mantenimiento de 1,5 segundos, sin clic temprano. Botón del popup sin segundo avance del recorrido.
- Frame casi totalmente negro/blanco e inválido: cancelación inmediata, sin completar progreso anterior, recuperación continua de `600 ms` y rearme antes de otro clic.
- Controles de cámara sólo si se declaran rangos válidos; modos automáticos sólo si están disponibles. Distinguir ajuste aplicado, ignorado, no reportado y rechazado.
- Límite comunal local y atribución SUBDERE DPA 2023 visibles en los proveedores; puntos ficticios diferenciados de la geometría oficial.
- Liberación, pérdida de mano y transición de navegación a una mano sin clic residual.
- Saltos anómalos de landmarks 4/8 aunque el centro de palma apenas cambie: cancelación sin pan/zoom/clic residual.
- Separación filtrada inválida o cercana a cero: ningún evento no finito y cancelación segura.

Conservar reportes y screenshot técnico si se genera. La prueba de UI puede usar un fondo de test sin cartografía para evitar depender de redes externas; esa ejecución no prueba disponibilidad de tiles OSM ni Google Maps.

El fixture positivo PNG tiene transparencia. En el smoke se compone sobre gris `#777` antes de pasar al worker de producción, cuyo análisis de calidad requiere una imagen opaca. Registrar esa condición del fixture. Las cámaras y la entrada real no se preprocesan así; no atribuir a una prueba de imagen compuesta mejoras de precisión en webcam ni de contraste del modelo.

### Verificación vigente: versión 0.1.5

La suite **0.1.5 aprobó 104/104 pruebas**: 65 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build Vite, runtime Mac/Windows y smoke del contenido de ambos paquetes están aprobados. El PNG positivo procesado por el modelo real entrega **21 `worldLandmarks`**; el clasificador integrado utiliza esa fuente. Los **seis checks `fistViewsFeedback`** aprueban carga y uso de world, `cenital-dorso`, `frontal-nudillos`, `frontal-palma` y `mixedOrientationsPan`: las vistas de puño son XYZ sintético, no puños capturados por cámara. El motor real adquiere pan sin zoom; mover coordenadas de imagen con un mundo local fijo por mano desplaza el mapa sin usar world como posición global.

También aprueban nueve checks de navegación exclusiva, siete de preview, ocho de punteros y ocho de calidad, además de cuatro clics nativos `isTrusted` de al menos `1500 ms`, sin temprano/repetición, con anclaje/aro y recorrido completo. El botón del popup no duplica el avance; el límite carga una entidad. Estas comprobaciones no miden recall, falsos positivos ni latencia física.

El código comprobado es `a2d778582443e0eea81cf386d5e6219815b99eb8`. Los reportes [Mac 0.1.5](./verificacion-paquete-mac-0.1.5.json) y [Windows 0.1.5](./verificacion-paquete-windows-0.1.5.json) confirman el smoke del contenido empaquetado. La [CI Windows 37417286255](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37417286255) terminó con éxito: 104 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Cámara USB cenital/frontal, métricas físicas y Google con key real siguen pendientes; la [entrega](./04-entrega-y-verificacion.md) identifica archivos y alcance por plataforma.

La `.app` Mac 0.1.5 se abrió y se verificó la cámara activa. La revisión detallada de Ayuda, Ajustes y skeleton de 0.1.4 queda histórica; esta corrección conserva esa interfaz. No se presenta la apertura ni el panel activo como benchmark físico de puños, precisión o latencia.

La revisión geométrica adicional comprobó **1452 casos sintéticos** sin fallos en sus condiciones definidas: 1260 con world, 135 de fallback normalizado, 9 inválidos, 24 posturas negativas, 12 garras y 12 cierres fuertes. Es un barrido de fixtures transformados, no 1452 participantes o capturas independientes; no permite inferir una tasa física de error.

| Mantenimiento nativo de 0.1.5 | Paquete Mac | Contenido empaquetado Windows |
|:---|:---|:---|
| Punto 1 | 1541,3 ms | 1521,4 ms |
| Botón del popup | 1540,9 ms | 1506,2 ms |
| Punto 2 | 1540,4 ms | 1538,3 ms |
| Punto 3 | 1537,5 ms | 1528,4 ms |

Son cuatro mantenimientos por plataforma con entradas sintéticas y reloj real, no una distribución de latencia cámara-a-pantalla. Los smoke comprueban la `.app` y `win-unpacked`; no ejecutan el envoltorio portable Windows.

### Evidencia histórica: versión 0.1.4

La suite aprobó **94/94 pruebas**: 55 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia.

El runtime Mac aprobó **nueve checks de navegación** con el `GestureEngine` real y entradas sintéticas: dos puños sólo pan, dos OK sólo zoom, mezcla sin navegación y nueva adquisición al cambiar de postura. Aprobaron **siete checks de preview** —detenido, activo, pausado, tamaño compacto, dibujo, limpieza y ausencia de casilla—, además de ocho de punteros y ocho de calidad.

Registró **cuatro clics nativos** (`trustedClicks=4`) en punto 1, botón de popup, punto 2 y punto 3, cada uno tras al menos `1500 ms`, sin clic temprano ni repetición. El objetivo y el aro permanecieron anclados; el recorrido terminó en orden y el botón no duplicó el avance.

| Paquete 0.1.4 | Punto 1 | Botón del popup | Punto 2 | Punto 3 |
|:---|---:|---:|---:|---:|
| [Mac](./verificacion-paquete-mac-0.1.4.json) | 1540,5 ms | 1541,1 ms | 1541,4 ms | 1540,0 ms |
| [Windows](./verificacion-paquete-windows-0.1.4.json) | 1507,4 ms | 1515,3 ms | 1533,6 ms | 1537,4 ms |

Son cuatro intervalos de mantenimiento por plataforma, con entradas sintéticas y reloj real. No constituyen una distribución de latencia física cámara→pantalla ni una medición de respuesta humana.

El código comprobado es `fe733f504f64a27cf577bf18a2c91ebd426b9ba2`. Los paquetes **Mac y Windows 0.1.4 están verificados**: [reporte Mac](./verificacion-paquete-mac-0.1.4.json) y [reporte Windows](./verificacion-paquete-windows-0.1.4.json). La [CI Windows 37415440930](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37415440930) terminó con éxito: 94 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Los smoke usan entradas sintéticas; el ensayo USB cenital y Google con key real siguen pendientes.

La inspección nativa Mac confirmó la ayuda de 1,5 segundos, dos puños para pan, dos OK para zoom y Ajustes sin casilla de preview. También se inspeccionó el preview con una cámara física y sus landmarks, sin guardar imágenes personales. Esa revisión visual no es un ensayo USB cenital ni un benchmark de gestos, falsos positivos o latencia física.

Los estímulos de los smoke son fixtures/landmarks sintéticos; usar el motor real en el runtime verifica la integración de navegación, no una evaluación de reconocimiento de puños en el montaje físico. Las tres pruebas de calibración permanecen como cobertura histórica de su helper: el mapeo vigente usa todo el frame, sin activar homografía.

### Evidencia histórica disponible: versión 0.1.3

La suite compartida aprobó **86/86 pruebas**. El smoke de desarrollo y los paquetes Mac/Windows del commit `f5716f0b134ef15d97f2a727990122b3dbf18e54` aprobaron la selección y el recorrido con eventos nativos dentro de la ventana propia. Los [reportes Mac](./verificacion-paquete-mac-0.1.3.json) y [Windows 0.1.3](./verificacion-paquete-windows-0.1.3.json) conservan:

| Comprobación de 0.1.3 | Resultado observado |
|:---|:---|
| Selección nativa | `trustedClicks=4`: punto 1, botón de popup, punto 2 y punto 3. |
| Temporización | Mantenimientos de al menos `3000 ms`, sin clic temprano ni repetición al seguir cerrado. |
| Objetivo y feedback | Anclaje y aro intermedio correctos; ningún recentrado para confirmar. |
| Recorrido | Finalización 1→2→3, un avance por punto activo; el botón del popup no duplica el avance. |
| Punteros | Dos sombras independientes, colores pan/zoom y alcance de extremos aprobados. |
| Bloqueo de imagen | Punteros frescos grises sin acciones mientras el control está bloqueado. |
| Calidad | Ocho checks `qualityFeedback` correctos: `normalAllows`, `darkCancels`, `heldBlocks`, `recoveryWaits`, `recovered`, `noBlockedInput`, `warningAfterGap` y `conditionalCameraControls`. |
| Controles condicionales | Ocultos sin capacidades; visibles/habilitados dentro de Ajustes con rangos válidos simulados. No comprueba soporte de una USB física. |
| Mantenimientos Mac | Punto 1 `3038,5 ms`, botón `3029,6 ms`, punto 2 `3032,6 ms`, punto 3 `3031,4 ms`; un clic por mantenimiento. |
| Mantenimientos Windows | Punto 1 `3008,3 ms`, botón `3011,5 ms`, punto 2 `3028,4 ms`, punto 3 `3028,8 ms`; un clic por mantenimiento. |
| Apertura y revisión real Mac | `.app` final abierta; Ajustes y ayuda revisados en la aplicación. |

La [CI Windows 0.1.3](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37414071782) terminó correctamente para el mismo commit: `npm ci`, 86 pruebas, build, runtime, construcción del portable y smoke del contenido empaquetado aprobados. El [reporte Windows 0.1.3](./verificacion-paquete-windows-0.1.3.json) confirmó `trustedClicks=4` y todos los checks de puntero, navegación y calidad correctos. Corresponde a la ejecución de `release/win-unpacked/Mapa Gestual MLR.exe`; no se ejecutó el envoltorio portable ni se usó una cámara física. El ZIP Mac arm64 y su smoke de paquete también están aprobados. La [guía de entrega](./04-entrega-y-verificacion.md) registra resultados, archivos y hashes por plataforma.

Estas comprobaciones utilizan fixtures/gestos sintéticos y un fondo de mapa de prueba; no validan cámara cenital física, latencia gesto→pantalla, cartografía disponible ni el SDK Google Maps con key real. No reutilizar los reportes de 0.1.2 como aprobación de la nueva visibilidad, colores, mapeo, calidad o recorrido.

### Evidencia histórica disponible: versión 0.1.2

El smoke de desarrollo y el de la `.app` Mac empaquetada aprobaron el ciclo nativo de 3 segundos sobre un punto azul y después sobre el botón del popup. El [reporte Mac 0.1.2](./verificacion-paquete-mac-0.1.2.json) corresponde al código `eb23ff4de28d6a1cea8fe12de576dce7737bec85` y conserva:

| Comprobación de 0.1.2 | Resultado observado |
|:---|:---|
| `nativeSelection` | Clic del marcador, apertura del popup y clic de su botón aprobados. |
| Eventos nativos | `trustedClicks=2`: uno por mantenimiento. |
| Anclaje y aro intermedio | `cursorLocked=true` y `ringHalfVisible=true`. |
| Temporización y repetición | `noEarlyClick=true` y `oneClickWhileHeld=true`. |
| Mantenimiento sobre el punto | `pointHold.elapsedMs=3018,2`, con un clic. |
| Mantenimiento sobre el botón | `buttonHold.elapsedMs=3018,6`, con un clic. |

Los dos intervalos usaron reloj real con entradas sintéticas en el modo OpenStreetMap de prueba. No son percentiles de latencia física ni una validación de webcam cenital o Google Maps.

La [CI Windows 0.1.2](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37267138909) aprobó **49 pruebas, build, runtime, construcción del portable y smoke del contenido empaquetado**. El [reporte Windows 0.1.2](./verificacion-paquete-windows-0.1.2.json) confirmó `trustedClicks=2`, objetivo fijo, aro intermedio, ausencia de clic temprano y una acción por mantenimiento. `pointHold` duró `3040,1 ms` y `buttonHold`, `3021 ms`, con reloj real. Ejecutó `release/win-unpacked/Mapa Gestual MLR.exe`; no se probó el arranque del envoltorio portable ni una cámara física. La [guía de entrega](./04-entrega-y-verificacion.md) reúne archivos y hashes; la [captura de selección](./seleccion-3s-0.1.2.png) conserva el feedback visible. Los reportes de 0.1.1 permanecen históricos.

### Evidencia histórica disponible: versión 0.1.1

La suite final de 37 casos, build Vite y ZIP Mac arm64 terminaron correctamente. `test:app` y el smoke del paquete Mac aprobaron WASM, fixture de una mano con 21 puntos, frame vacío sin manos, CSP, zoom, popup y selección. El [reporte Mac 0.1.1](./verificacion-paquete-mac-0.1.1.json) registró `ok:true`. La `.app` final abrió correctamente y se verificaron visualmente la ayuda y el pie de la interfaz.

Los checks `pointerFeedback.oneHand`, `twoHands`, `twoDetectedOneEligible`, `noHands` y `clearedRipple` devolvieron `true`. Cubren visibilidad con una mano, ocultación con dos detecciones —incluso si sólo una postura es elegible—, ausencia de manos y limpieza de ripple. Son comprobaciones automatizadas de feedback, no resultados de percepción ni precisión de cámara física.

Los checks `navigationFeedback.panWorks`, `combinedZoomWorks` y `hiddenDuringNavigation` devolvieron `true`: desplazamiento, zoom combinado y feedback oculto durante navegación. Inyectan eventos sintéticos para verificar el renderizado y el adaptador del mapa; la suite de gestos comprueba el motor por separado. No certifican detección de dos OK en cámara física.

La [CI Windows 0.1.1](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37264864301), commit `451509904cb8406eba84de961d5c4b9f69a46fb4`, aprobó **37/37 pruebas, build, smoke de runtime, construcción del portable y smoke del contenido empaquetado**. El [reporte Windows 0.1.1](./verificacion-paquete-windows-0.1.1.json) corresponde a `release/win-unpacked/Mapa Gestual MLR.exe`. No se probó el arranque del envoltorio portable ni una cámara física Windows.

### Evidencia histórica disponible: versión 0.1.0

Las comprobaciones siguientes corresponden a **0.1.0** y se conservan como antecedentes. No certifican las funciones ni los paquetes 0.1.5. La comprobación inicial en **Apple M5, macOS 26.6.2 y Electron 44.5.1** obtuvo:

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

## 2. Montaje cenital y encuadre completo

Fijar la cámara USB, iluminar de forma uniforme y delimitar una zona de mesa cómoda. Anotar la geometría antes de comparar modelos. Revisar que la mano mantenga suficiente detalle al moverse y que el foco no cambie de forma inestable.

Comprobar superior izquierda, superior derecha, inferior derecha, inferior izquierda, bordes y centro. La app usa el frame completo con espejo, rotación y límites `0..1`, sin homografía ni esquinas guardadas. Repetir la comprobación tras mover la cámara, cambiar resolución, espejo u orientación. Una corrección breve al cambiar de postura debe desaparecer al desplazarse y permitir alcanzar los extremos incluso con un recorrido pequeño cerca del borde. Durante OK quieto conservar el destino adquirido durante los 1,5 segundos. Evaluar por separado cambios de altura y deformación de la perspectiva.

Consultar las capacidades del track después de iniciar streaming y registrar los ajustes que realmente informa. Si brillo, contraste o compensación de exposición no están disponibles, no inventar sliders ni confundir soporte del navegador con soporte de la USB. Probar modos continuos únicamente si la cámara los anuncia; comparar imagen quieta y manos en movimiento para detectar autofocus inestable, ruido o blur. Una solicitud resuelta no demuestra que el hardware haya cambiado.

Ensayar bloqueo con frames severos y su recuperación: las acciones se detienen desde el primer frame inutilizable, los punteros frescos permanecen grises y el tiempo anterior del clic no se reutiliza. Comprobar el umbral continuo de `600 ms`, interrupciones durante recuperación y avisos sin bloqueo por fondo mate. Esto prueba la lógica del gate; no establece precisión cenital ni una garantía de falsos positivos.

Ensayar mano izquierda y derecha, rotaciones en el plano, manos de distinto tamaño, entrada por distintos bordes y dos manos simultáneas. El orden de detección del modelo puede cambiar; la aplicación debe conservar identidad o cancelar ante ambigüedad.

## 3. Tareas intencionales

Propuesta inicial: 15–20 participantes voluntarios y dos sesiones por persona. Esta cantidad ayuda a observar diversidad; no garantiza por sí sola suficiente potencia estadística. Obtener consentimiento antes de capturar imágenes y conservar únicamente material necesario.

Cada sesión incluye:

1. Apuntar a objetivos de diferentes tamaños y posiciones sin seleccionarlos.
2. Apuntar a un objetivo, formar OK y mantener 1,5 segundos: debe seleccionarlo automáticamente sin soltar.
3. Mantener OK después de completar: un solo clic. Abrir durante `120 ms` y volver a mantener para una segunda selección.
4. Interrumpir un OK demasiado corto, moverlo demasiado, ocultar la mano y recuperarla: no debe completar la selección cancelada.
5. Abrir y cerrar una ficha; accionar su botón con OK.
6. Formar dos puños, mantener `180 ms` y mover ambas manos juntas; debe desplazar sin zoom. Variar sólo la separación con punto medio quieto no debe ampliar. Abrir y reposicionar sin arrastrar.
7. Formar dos OK y variar su separación manteniendo el punto medio quieto; soltar primero una mano y después la otra sin clic residual.
8. Cruzar manos, añadir la segunda durante un click pendiente y retirar ambas.
9. Pausar con Espacio, cancelar con Esc y cambiar el foco de ventana durante cada acción.
10. Mover una palma abierta, cerrar y abrir dedos casualmente: no debe navegar.
11. Introducir una segunda mano durante un halo/ripple y mantener una postura no elegible: deben seguir visibles ambas sombras frescas, sin aro, ripple ni clic individual.
12. Combinar traslación y separación de dos OK: sólo zoom. Trasladar dos OK con separación constante: ningún pan. Cambiar a dos puños y adquirir otra vez; mezclas sin navegación.
13. Seleccionar objetivos laterales y cercanos entre sí; comprobar que cursor, hover, aro y clic coincidan sin saltar al centro.
14. Recorrer extremos y centro de cámara con una y dos manos; cambiar postura cerca del borde y alcanzar los límites del mapa sin offset residual.
15. Completar 1→2→3 mediante OK de 1,5 segundos sobre cada activo; comprobar un avance por clic nativo, pulso detenido al finalizar y reinicio desde Ajustes.
16. Mantener dos puños y dos OK quietos: observar violeta/ámbar según postura adquirida; pequeños temblores no deben producir eventos ni alternar modo.
17. Provocar una imagen extrema durante un clic o navegación, recuperar imagen y abrir para rearmar; no completar un temporizador previo. Las sombras frescas deben quedar grises durante bloqueo.
18. Revisar controles de cámara disponibles y ajustes reportados, sin asumir soporte de exposición o contraste en cualquier dispositivo.
19. Iniciar y detener cámara, reiniciar sesión y perder el stream: preview siempre visible, skeleton fresco sólo con datos vigentes, mensaje Cámara detenida y ningún dibujo o conteo anterior al detener. Confirmar diagnóstico en Ajustes y ausencia de controles para ocultar el preview.

Registrar intención, acción obtenida, objetivo, hora de inicio/fin, errores y necesidad de ayuda. Explicar la tarea antes de comenzar; no enseñar continuamente una corrección mientras se mide aprendizaje.

## 4. Periodos sin intención de control

Incluir mesa vacía, papeles, teléfono, objetos alargados, manos descansando, conversación, señalamientos casuales, recoger objetos, ajustar mangas y entrada/salida de personas. Evaluar por separado cámara cenital y frontal, inclinación de muñeca, pulgar compacto con IP recta, mano abierta de canto, dedos parcialmente recogidos, garra y puño recortado; no aceptar un fallo geométrico por falta de referencia independiente. Añadir puños casuales al tomar objetos, dos manos recogidas y mezclas puño/OK sin intención de navegar; distinguir reconocimiento de postura de intención real. Dedicar al menos la mitad del material a estas condiciones negativas.

Variar iluminación, fondo, altura de mano, anillos y oclusiones de forma registrada. Si guantes u otras condiciones no están cubiertas por el sistema, medir su rechazo y documentar la limitación; no descartarlas silenciosamente del informe.

Comparar versiones con y sin gate en condiciones equivalentes. Registrar falsos bloqueos, recuperaciones y tiempo total/habilitado: bloquear durante gran parte de una sesión no debe parecer una mejora de precisión por reducir el tiempo expuesto a errores. No usar buen contraste como verdad de intención ni landmarks del propio modelo como referencia independiente.

Contar episodios de acción y su duración. Una mano falsa sostenida durante 100 frames es un episodio, no 100 detecciones falsas independientes. Un clic duplicado sí cuenta como evento extra.

## 5. Métricas

| Métrica | Definición y registro |
|:---|:---|
| Clics accidentales | Eventos emitidos fuera de ventanas de intención / tiempo negativo; informar eventos/minuto y horas totales. |
| Precisión de clic | Eventos correctos / eventos emitidos. Cada intención se empareja una sola vez; duplicados cuentan como falsos positivos. |
| Recall de clic | Intenciones que producen un clic correcto / intenciones anotadas, con ventana temporal fijada antes del análisis. |
| Desplazamiento/zoom involuntario | Episodios, duración y movimiento o variación de escala provocada. |
| Éxito de tarea | Proporción completada, tiempo, errores y ayudas. |
| Jitter | Dispersión de cada puntero en px durante mano quieta, con viewport, resolución, espejo y orientación fijos. |
| Cobertura y feedback | Error de posición en extremos/centro, coincidencia sombra–objetivo–clic y cambios de color sin movimiento deliberado. |
| Gate de calidad | Falsos bloqueos, fracción de tiempo bloqueada y recuperación; informar tasas por tiempo total y por tiempo habilitado. |
| Recorrido | Avances correctos por clic activo, avances duplicados/fuera de orden y reinicio correcto, con objetivo estable durante pulso. |
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
| Arbitraje | Cero clics individuales al entrar/salir de cualquiera de los modos de dos manos en el test reservado. |
| Pan de una mano eliminado | Cero episodios de desplazamiento o zoom con una palma abierta de una mano en el test. |
| Pan de dos puños | Traslación desplaza sin zoom; separación pura con punto medio quieto no amplía. |
| Zoom de dos OK | Separación amplía sin pan; traslación común con separación constante no desplaza. |
| Cambio y mezcla | Puños ↔ OK exige adquirir de nuevo `180 ms`; mezclas no navegan y no heredan anclas. Registrar tolerancia geométrica y zonas muertas antes del ensayo. |
| Sombras | Una sombra por cada mano detectada con datos frescos, hasta dos, incluso en reposo y navegación; eliminar feedback obsoleto y conservar gris durante bloqueo. Cero aro/ripple o clic individual con dos detecciones en los casos ensayados. |
| Color de navegación | Dos puños adquiridos violeta y dos OK adquiridos ámbar, incluso quietos; sin alternar modo ni emitir eventos por jitter. |
| Preview | Siempre visible y pequeño arriba a la izquierda; datos vigentes con cámara activa, limpieza/mensaje al detener y sin controles para ocultar. Diagnóstico detallado en Ajustes. |
| Mapeo completo | Extremos y centro de cámara alcanzan extremos y centro del mapa según orientación; sin esquinas guardadas ni offset permanente tras cambiar postura. |
| Recorrido | Clic nativo sobre el único activo avanza exactamente 1→2→3; no avance por hover, otro punto o botón del popup; final sin pulso y reinicio desde Ajustes. |
| Calidad de imagen | Frames severos o inválidos cancelan inmediatamente; recuperación continua de `600 ms` sin reutilizar selección pendiente. Registrar falsos bloqueos y no inferir precisión del detector a partir del gate. |
| Controles de cámara | Mostrar y solicitar sólo capacidades válidas reportadas por el track; informar si el ajuste no se confirma y no garantizar soporte de USB no ensayadas. |
| Continuidad geométrica | Saltos anómalos de centro o pinza y separación filtrada inválida/cercana a cero cancelan sin eventos residuales ni valores no finitos. |
| Repetición | Un OK válido produce un clic al completar `1500 ms`; mantener cerrado y soltar después no repiten. Nueva selección requiere apertura de `120 ms`. |
| Objetivo estable | Cursor, hover, aro y clic conservan el destino adquirido durante la transición a OK, sin recentrado ni cambio silencioso de candidato. |
| Recall de clic | Al menos 95 % en las tareas y condiciones declaradas. |
| Falsos clics | Límite superior unilateral de 95 % por debajo de `0,01/min` en condiciones negativas representativas. |
| Respuesta de movimiento | p95 del recorrido medido por la aplicación menor de `100 ms`; medir y reportar aparte demora física de cámara/pantalla. |
| Selección | Reportar confirmación intencional de `1500 ms`, tiempo real mantenido y demora adicional hasta el evento/pantalla. No exigir un tiempo total inferior a los 1,5 segundos elegidos ni mezclarlo con latencia de inferencia. |
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
| Suite de 0.1.5 | 104/104 aprobadas: 65 gestos, 3 calibración histórica, 9 selección, 4 mapeo, 15 calidad/cámara y 8 secuencia. |
| Build y runtime Mac 0.1.5 | Aprobados; seis checks de world/vistas, navegación exclusiva, preview, punteros, calidad y cuatro clics nativos. Estímulos de postura sintéticos. |
| Runtime Windows 0.1.5 | Aprobado en CI 37417286255, incluyendo world21, vistas sintéticas y ciclo de selección nativo. |
| Paquete Mac 0.1.5 | ZIP y smoke de contenido empaquetado aprobados; world21, seis checks de vistas y cuatro clics nativos. |
| Paquete Windows 0.1.5 | Portable construido y smoke del contenido `win-unpacked` aprobado; envoltorio de arranque sin ensayo. |
| Apertura nativa Mac 0.1.5 | `.app` abierta y cámara activa verificadas; sin benchmark físico de puños. |
| Suite histórica de 0.1.4 | 94/94 aprobadas; distribución de casos descrita arriba. |
| Runtime histórico Mac y Windows 0.1.4 | Aprobados; clic1500ms, recorrido y checks de navegación, preview, punteros y calidad. |
| Windows CI histórica 0.1.4 | Ejecución 37415440930 terminada con éxito para fe733f504f64a27cf577bf18a2c91ebd426b9ba2. |
| Paquete histórico Mac 0.1.4 | ZIP construido y smoke del contenido empaquetado aprobado; cuatro clics nativos, nueve checks de navegación y siete de preview correctos. |
| Paquete histórico Windows 0.1.4 | Portable construido y smoke del contenido `win-unpacked` aprobado; envoltorio portable sin ensayo de arranque. |
| Inspección nativa Mac histórica 0.1.4 | Ayuda/Ajustes revisados; preview y landmarks inspeccionados con cámara física, sin guardar imagen personal y sin ensayo USB cenital. |
| Suite histórica de 0.1.3 | 86/86 pruebas de la suite compartida aprobadas. |
| Smoke histórico de desarrollo 0.1.3 | Aprobado: cuatro clics nativos de 3 segundos, anclaje/aro/sin clic temprano/sin repetición; recorrido, dos sombras, colores, bordes y bloqueo gris comprobados. |
| Runtime histórico Windows 0.1.3 | CI 37414071782: 86 pruebas y `test:app` aprobados para el commit f5716f0b134ef15d97f2a727990122b3dbf18e54. |
| Paquete histórico Mac 0.1.3 | ZIP arm64 construido y smoke de `.app` final aprobado: cuatro clics nativos, checks de puntero/navegación y ocho de calidad correctos. Apertura real, Ajustes y ayuda revisados. |
| Paquete histórico Windows 0.1.3 | CI 37414071782 terminada correctamente: `npm ci`, 86 tests, build, runtime, portable construido y smoke de `release/win-unpacked/Mapa Gestual MLR.exe` aprobados. |
| Suite histórica de 0.1.2 | 49/49 aprobados: 37 de gestos, 3 de calibración y 9 de selección. |
| Smoke histórico de desarrollo y paquete Mac 0.1.2 | Aprobados; dos ciclos nativos de 3 segundos, anclaje/aro/sin clic temprano/sin repetición correctos. |
| Windows histórico de 0.1.2 | CI 37267138909 aprobada: 49 tests, build, runtime, portable construido y smoke del contenido empaquetado, con dos clics nativos de 3 segundos. |
| Suite histórica de 0.1.1 | 37/37 aprobados: 34 de gestos y 3 de calibración; incluye continuidad de pinza y separación filtrada. |
| Build y paquete Mac de 0.1.1 | Vite, ZIP arm64, apertura de `.app` y smoke del paquete aprobados. |
| Smoke histórico de 0.1.1 | Modelo/CSP/UI, cinco checks de puntero y tres de navegación aprobados. |
| Windows histórico de 0.1.1 | CI 37264864301 aprobada: 37 tests, build, smoke de runtime, `.exe` portable construido y smoke del contenido empaquetado. |
| Suite histórica de 0.1.0 | 26/26 aprobados en Mac y Windows CI. |
| Build de interfaz, assets y Mac ZIP de 0.1.0 | Aprobado en el host Mac arm64. |
| Smoke de 0.1.0 con modelo real, PNG positivo/frame vacío, CSP y UI | Aprobado en Apple M5/macOS 26.6.2/Electron 44.5.1; alcance descrito arriba. |
| Apertura de `.app` y smoke del paquete Mac 0.1.0 | Aprobados; reporte histórico `verificacion-paquete-mac.json`. |
| Mac arm64 con cámara USB cenital | Pendiente de ensayo de instalación. |
| Controles con cámara y driver reales | Pendientes; tests de API y visibilidad condicional usan capacidades simuladas y no demuestran soporte físico. |
| Windows build y `.exe` portable de 0.1.0 | Artefacto construido en CI; 26 tests y smoke de runtime aprobados. |
| Contenido empaquetado Windows 0.1.0 | Smoke aprobado con `release/win-unpacked/Mapa Gestual MLR.exe` en CI. |
| Envoltorio portable Windows | Arranque no probado en esta verificación. |
| Windows con cámara USB física | Pendiente de ensayo de instalación. |
| Google Maps con key propia | Pendiente; no hay key del usuario configurada. |
| Evaluación de usuarios y falsos clics | Pendiente; no existe tasa medida publicada. |

Actualizar esta tabla sólo con evidencia de la condición específica. Una prueba positiva con fixture frontal no completa el ensayo cenital; un build Windows aprobado no completa la prueba de cámara Windows.

---

Protocolo preparado con asistencia técnica de Codex, 2026. Los resultados disponibles corresponden a verificaciones técnicas asistidas; no se atribuyen al equipo del proyecto ni a un ensayo municipal.

[Volver al prototipo](../README.md)
