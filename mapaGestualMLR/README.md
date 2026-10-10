 # Mapa Gestual MLR

Prototipo de escritorio para recorrer un mapa de La Reina con las manos, usando una cámara frontal apuntando hacia la persona. Las manos completas quedan dentro del encuadre, con iluminación uniforme; todo el encuadre corresponde al mapa. Este montaje sustituye el planteamiento cenital inicial. En esta etapa probamos la detección, la selección y el movimiento; la interfaz y la integración municipal se ajustarán después.

**Inicio:** 5 de octubre de 2026<br>
**Última actualización:** 10 de octubre de 2026<br>
**Equipo del proyecto:** Emilio Abarca · Emilia Armstrong · Victoria Aracena<br>
**Versión vigente:** 0.1.13 · corrección del montaje frontal<br>
**Estado:** gestos y detector conservados; verificación y paquetes de 0.1.13 en la [entrega](./Documentos/04-entrega-y-verificacion.md). Los resultados de 0.1.12 quedan históricos. Ensayo frontal, métricas físicas, Google con key y envoltorio portable pendientes<br>

[Volver al README principal](../README.md) · [Revisar la bitácora](./Bitacora/README.md)

## Qué hace

- Detecta hasta dos manos con MediaPipe Hand Landmarker y procesa las imágenes en este equipo.
- Permite apuntar, abrir información, desplazar el mapa y acercar o alejar la vista.
- Muestra una sombra por cada mano detectada con datos frescos: azul al apuntar o reposar, violeta con uno o dos puños para desplazar y ámbar con dos OK para zoom. Durante pausa o bloqueo aparecen grises.
- Selecciona al mantener **landmark 8 sobre un objetivo durante 1500 ms**, sin exigir postura del índice ni recoger los otros dedos. Objetivo y aro quedan anclados con acompañante; dos OK tienen prioridad de zoom y el puño queda reservado para pan.
- Lleva todo el encuadre de cámara a todo el mapa; permite elegir cámara, reflejar o rotar la imagen.
- Mantiene una Vista frontal pequeña siempre visible arriba a la izquierda, con video, skeleton fresco y conteo de manos cuando la cámara está activa. Detenida, muestra Cámara detenida y limpia los datos anteriores; no pide permisos ni activa la cámara al arrancar.
- Reúne métricas, exportación y Marcar falso clic en Diagnóstico de seguimiento, una sección desplegable de Ajustes.
- Ofrece brillo, contraste y compensación de exposición sólo si la cámara declara esas capacidades; solicita modos automáticos continuos cuando están disponibles.
- Incluye un recorrido de tres puntos ficticios numerados y el límite oficial de La Reina procedente de SUBDERE, DPA 2023.
- Mantiene controles de mouse y teclado para configurar, pausar y recuperar la interacción.
- Usa OpenStreetMap sin clave para las primeras pruebas. Google Maps se puede configurar con una API key propia.

Los puntos de prueba son **datos ficticios**. No corresponden a reportes municipales ni conectan con sistemas de la Municipalidad de La Reina. OpenStreetMap y Google Maps son proveedores distintos; seleccionar uno no convierte los datos del otro en información municipal.

## Software propio

La aplicación tiene su propia ventana de escritorio, cámara, motor de gestos y controles. Electron incorpora un renderer Chromium para dibujar la interfaz y el mapa; el programa no controla Google Maps en Chrome ni automatiza un navegador externo.

```mermaid
flowchart LR
    A[Cámara frontal] --> B[Captura local]
    B --> C[Worker: Hand Landmarker CPU]
    C --> D[21 puntos de imagen y mundo estimado por mano]
    D --> E[Estados de gestos y filtro 1€]
    E --> F[Orientación y encuadre completo]
    F --> G[Desplazamiento y zoom del mapa]
    F --> H[Clic validado en ventana propia]
    H --> I[Marcador o popup]
    G --> J[OpenStreetMap o Google Maps]
    K[Modelo y WASM empaquetados] --> C
```

La interfaz se sirve dentro de la aplicación desde `http://127.0.0.1:47831`. Los mapas requieren Internet. La inferencia se ejecuta con modelo y runtime locales. Una prueba aislada comprobó que CSP bloquea el intento de telemetría del worker al cerrar el task; esto no significa que la aplicación completa, que carga mapas, esté desconectada.

## Abrir el programa empaquetado

La [guía de entrega](./Documentos/04-entrega-y-verificacion.md) identifica los archivos, hashes y alcance de la distribución vigente **0.1.13**. Como antecedente, **0.1.12 aprobó 192 pruebas, build, runtime y smoke de su contenido empaquetado en Mac/Windows** sobre `3bfd3c50bce3abbaafb145096a3d00403b199701`; la `.app` abrió con cámara detenida y Windows comprobó `win-unpacked`. Esos resultados no se reasignan a 0.1.13. El envoltorio portable se verifica por separado.

Como evidencia histórica, la `.app` Mac **0.1.3** aprobó el smoke del paquete y su apertura real, Ajustes y ayuda se revisaron en la aplicación. Windows **0.1.3** aprobó pruebas, build, runtime, construcción del portable y smoke del contenido empaquetado. La [guía de entrega](./Documentos/04-entrega-y-verificacion.md) identifica archivos, hashes y resultados por plataforma.

**macOS Apple Silicon:** descomprimir el ZIP para obtener `Mapa Gestual MLR.app` y abrirla. Elegir la cámara USB y conceder el acceso a cámara cuando macOS lo solicite. Esta versión de desarrollo no tiene firma ni notarización. Si Gatekeeper bloquea su apertura, usar el menú contextual de la aplicación → **Abrir** y seguir la indicación de macOS; no desactivar la protección global del equipo.

**Windows x64:** abrir el `.exe` portable de la versión indicada en la entrega. No necesita instalar Node ni una terminal. El `.exe` es para Windows; en Mac se utiliza la `.app`. Como evidencia histórica, la [CI Windows 0.1.12](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/38011189028) aprobó suite, build, runtime, portable y smoke `win-unpacked` para la fuente final; reporte y hashes en la [entrega](./Documentos/04-entrega-y-verificacion.md). Arranque del envoltorio portable y cámara USB/driver físicos pendientes.

La carpeta de artefactos se genera en `release/`. Registrar el nombre, hash y plataforma de cada entrega junto con los resultados de verificación. Construir un archivo no demuestra por sí solo que la detección funcione con la cámara de la instalación.

## Gestos

| Acción | Cómo se realiza, conservado desde 0.1.12 |
|:---|:---|
| Apuntar | Mover la punta del índice dentro del encuadre; la sombra usa landmark 8 cuando la mano no es un puño. No hace falta extender el índice en una postura concreta. |
| Clic | Llevar esa punta sobre un objetivo seleccionable y mantener **1500 ms**. Aparece un aro anclado y el clic se ejecuta al completar. Los otros dedos pueden estar abiertos, recogidos o cambiar sin cancelar por su postura. |
| Desplazar | Formar uno o dos puños cuando no hay dos OK ni una mano libre sobre un objetivo. Pan usa sólo sus nudillos; una mano no puño que mantiene su índice sobre un objetivo tiene prioridad sobre el puño acompañante. |
| Zoom | Formar **OK con ambas manos** y adquirir durante **180 ms**. Separar sus índices 8 acerca y juntarlos aleja; traslación común sin cambio de separación no desplaza. |

**Pausa:** pulsar Espacio. La pérdida de foco detiene la interacción. Esc cancela la acción en curso.

La prioridad vigente es **dos OK → zoom; punta de índice de mano no puño sobre objetivo → selección; uno o dos puños → pan**. El motor consulta los objetivos antes de iniciar el mantenimiento: sobre mapa vacío no hay reloj ni clic. El acompañante puede entrar, salir o cambiar de orden sin cancelar al actor válido; objetivo y tiempo pertenecen a su identidad.

El aro conserva el destino durante temblor dentro de su región amplia de retención, sin saltar a un vecino por solapamiento. Salir de la región reinicia el tiempo; reentrar exige **1500 ms** completos. Después de un clic, salir del ID del destino original durante **120 ms** lo rearma para esa mano; no hay que recoger ni retraer el índice. Otro destino puede iniciar inmediatamente **1500 ms** nuevos, sin heredar tiempo ni repetir el original al volver en menos de 120 ms. El [protocolo vigente](./Documentos/03-protocolo-validacion.md) concentra regiones, callbacks y comprobaciones.

La revisión responde al reporte físico del usuario: en **0.1.11** podía situar el índice sobre el punto 1 sin obtener aro, con un posible veto de otros dedos. No hay logs de landmarks de esa captura que demuestren la condición exacta. Sus pruebas sintéticas aprobadas no cubrieron esa dificultad real. **0.1.12 elimina el requisito de índice exclusivo y de dedos restantes recogidos**, sin incorporar un modelo, SDK ni inferencia nuevos. La [entrada de 0.1.12 en la bitácora](./Documentos/08-historial-tecnico.md#9-de-octubre---selección-por-permanencia-sobre-objetivo-en-0112) registra el cambio; la [investigación de selección](./Documentos/05-meta-quest-y-seleccion.md) conserva los referentes de hover y confirmación.

Cada mano conserva una sombra fresca independiente: azul al apuntar o reposar, violeta sólo en puños participantes adquiridos y ámbar en dos OK adquiridos. Gris indica bloqueo. El aro azul representa los **1500 ms** y confirma en verde; no confirma navegación ni avanza por mapa vacío.

Los tres puntos ficticios muestran **1, 2 y 3**. Su dibujo nominal mide **40 px** y el activo, **56 px**; su caja exterior fija de **56 × 56 px** permanece estable durante el pulso. Un clic nativo sobre el activo avanza una vez. Tras el tercero termina el pulso; **Reiniciar recorrido**, en Ajustes, vuelve al punto 1. El botón del popup no vuelve a avanzar e Inicio conserva progreso. [Fuente y recorrido](./Documentos/07-limite-la-reina.md).

La Vista frontal permanece visible arriba a la izquierda, unos **200 px** de ancho o **160 px** en pantallas pequeñas. Iniciar/Detener cámara es explícito; detener o perderla limpia skeleton y conteo. Métricas y exportación permanecen en Ajustes.

**Antecedente de verificación: suite, build, runtime y contenido de paquetes Mac/Windows 0.1.12 aprobados.** Los **1500 ms** son preferencia del usuario y la región de retención es una decisión experimental. La evidencia anterior permanece histórica y no valida precisión física de esta revisión.

## Preparar el montaje frontal

1. Fijar la cámara frente a la persona, apuntando hacia sus manos completas dentro del encuadre, con iluminación uniforme y fondo mate.
2. Abrir Ajustes y elegir la cámara. Revisar la orientación y el reflejo con el diagnóstico.
3. Usar todo el encuadre como zona de interacción: comprobar las cuatro esquinas, los bordes y el centro antes de probar clics.
4. Revisar los controles que ofrece la cámara. Ajustar luz y enfoque reales; probar brillo, contraste o compensación de exposición sólo si están disponibles y comprobar el resultado.
5. Probar los marcadores ficticios y pausar antes de cambiar cámara, orientación o montaje.

La versión 0.1.3 transforma coordenadas normalizadas mediante orientación y límites `0..1`: **todo el frame corresponde a todo el mapa**. No usa homografía ni conserva esquinas guardadas de versiones anteriores. Tras mover la cámara o cambiar resolución/orientación, repetir la comprobación del encuadre. Mantener los brazos cómodos y permitir descansos.

Una imagen casi totalmente negra o blanca impide acciones inmediatamente. Tras volver a una imagen no severa se exigen `600 ms` continuos de recuperación. Las sombras frescas siguen visibles en gris durante el bloqueo; no se completa un clic pendiente ni se reutiliza su tiempo. Este control de calidad no garantiza landmarks correctos ni pocos falsos positivos. La [investigación de cámara y contraste](./Documentos/06-camara-y-contraste.md) describe umbrales, controles y pruebas pendientes.

## Google Maps

No se incluye una API key de Google. Sin una clave configurada, las pruebas usan OpenStreetMap.

Para habilitar el proveedor Google, crear una key propia con **Maps JavaScript API** habilitada y facturación configurada. Restringirla a esa API y al referrer `http://127.0.0.1:47831/*`. Guardarla en Ajustes y verificar que el mapa carga correctamente. Las políticas, restricciones y precios del proveedor deben revisarse antes del uso municipal. [Configuración oficial de Google](https://developers.google.com/maps/documentation/javascript/get-api-key).

La key se guarda en `localStorage` de esta aplicación. Es una credencial cliente visible y recuperable del equipo o renderer; no se convierte en un secreto por estar dentro de una `.app` o `.exe`. No guardarla en Git ni compartir capturas donde aparezca. [Guía de seguridad de Google](https://developers.google.com/maps/api-security-best-practices).

La atribución del mapa permanece visible. OpenStreetMap requiere atribución y uso moderado de sus tiles; su servicio comunitario no garantiza disponibilidad ni permite descargar regiones para funcionamiento offline. [Política de tiles OSM](https://operations.osmfoundation.org/policies/tiles/).

## Abrir en local

Desde esta carpeta, con Node y npm disponibles:

```bash
npm ci
npm start
```

`npm start` prepara los assets, construye la interfaz y abre la ventana Electron. El modelo y el WASM se incluyen en el build. Las descargas necesarias para preparar los assets requieren conexión; la distribución empaquetada no necesita instalar estas herramientas.

## Revisar antes de entregar

```bash
npm test
npm run build
npm run test:app
```

### Evidencia histórica: versión 0.1.12

La **0.1.12 aprobó 192/192 pruebas**, build y runtime Electron sobre `3bfd3c50bce3abbaafb145096a3d00403b199701`. El runtime ejecutó **cuatro clics nativos `isTrusted` tras al menos 1500 ms**, con aro/destino conservados; todos los grupos Feedback aprobaron, incluidos 24 checks de navegación, siete de recuperación y siete de tolerancia. El [protocolo](./Documentos/03-protocolo-validacion.md) registra la distribución y alcance. Son entradas sintéticas con motor real, sin benchmark de precisión física.

Los **contenidos de paquetes Mac y Windows 0.1.12 están aprobados**. Los [reportes Mac](./Documentos/verificacion-paquete-mac-0.1.12.json) y [Windows](./Documentos/verificacion-paquete-windows-0.1.12.json) confirman `ok:true`, cuatro clics nativos por plataforma y todos los grupos Feedback. La [CI Windows 38011189028](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/38011189028) terminó con éxito para `3bfd3c50bce3abbaafb145096a3d00403b199701`: 192 pruebas, build, runtime, portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto. La `.app` instalada abrió con **Cámara detenida**, footer/ayuda de hover revisados y respaldo 0.1.11 conservado. La [entrega](./Documentos/04-entrega-y-verificacion.md) concentra reportes, capturas, hashes e intervalos. **El envoltorio portable Windows no se ejecutó como tal; ensayo USB, métricas físicas y Google con key siguen pendientes.**

### Evidencia histórica: versión 0.1.11

La **0.1.11 aprobó 180/180 pruebas**: 95 de motor de gestos, 15 de OK en perspectiva, 21 de índice exclusivo 3D, 4 de participantes, 15 de selección, 3 de calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia/contorno. **Build y runtime Electron aprobados** sobre `11c5b049dd76c7575c26a65e7e0dabe93f03b0d5`. El runtime emitió cuatro clics nativos `isTrusted` tras al menos **1500 ms**, con temblor de índice de **42 × 32 CSS px** y continuidad del acompañante; aprobó **24 checks de navegación** y los siete `selectionToleranceFeedback`, incluidos espacio vacío, salida/reinicio, otros dedos y pulgar. Son entradas sintéticas interpretadas por el motor real y eventos nativos dentro de la app; no un ensayo físico de gestos.

Los **paquetes Mac y Windows 0.1.11 aprobaron el smoke nativo** de la fuente final. El [reporte Mac](./Documentos/verificacion-paquete-mac-0.1.11.json) y [Windows](./Documentos/verificacion-paquete-windows-0.1.11.json) confirman cuatro clics nativos y todos los grupos Feedback por plataforma. La [CI Windows 38009217606](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/38009217606) terminó con éxito sobre la misma fuente: pruebas, build, runtime, portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto. La `.app` instalada abrió y se revisaron ayuda/footer de índice exclusivo con **Cámara detenida**; se conserva el respaldo 0.1.10. La [entrega](./Documentos/04-entrega-y-verificacion.md) concentra reportes, hashes, capturas e intervalos. **Envoltorio portable, ensayo USB, métricas físicas y Google con key siguen pendientes.**

### Evidencia histórica: versión 0.1.10

La suite **0.1.10 aprobó 177/177 pruebas**: 117 de motor de gestos, 14 de geometría OK, 4 de participantes anónimos, 12 de selección, 3 de calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia/contorno. **Build y runtime Electron aprobados** sobre `b6184aa9f0ba62cfa6b0e1b39cd7615c4ea0e797`. Las tres regresiones de rearme comprueban que A pierde geometría y requiere apertura antes de seleccionar, tenga o no acompañante; B válido no se bloquea y A en puño readquiere pan durante **180 ms** sin apertura ni salto. El runtime ejecutó cuatro clics `isTrusted` con intervalos **1540,5 / 1500,3 / 1534,3 / 1541,0 ms**, conservando actor/objetivo/aro con acompañante cambiante y con puño permanente. Son landmarks sintéticos y eventos de la app, no rendimiento físico medido.

Los **paquetes finales Mac y Windows 0.1.10 están aprobados**: [reporte Mac](./Documentos/verificacion-paquete-mac-0.1.10.json) y [reporte Windows](./Documentos/verificacion-paquete-windows-0.1.10.json), ambos `ok:true` con cuatro clics nativos. Intervalos Mac **1503,7 / 1500,6 / 1500,5 / 1541,0 ms**; Windows **1526,5 / 1516,7 / 1524,2 / 1509,2 ms**. Acompañante cambiante, reorden y salida conservan actor/objetivo/aro; el botón mantiene compañero puño desde el inicio y actor secundario. Ambos reportes aprueban **24 checks de navegación** y todos los grupos Feedback. La [CI Windows 38006516067](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/38006516067) terminó con éxito para la misma fuente, incluido portable y smoke de `win-unpacked`; el envoltorio NSIS no se ejecutó como tal. La `.app` final abrió sin iniciar cámara. La [entrega](./Documentos/04-entrega-y-verificacion.md) registra archivos, tamaños, hashes y capturas finales. Las **145/145 pruebas y paquetes Mac/Windows 0.1.9** permanecen históricos; esta evidencia nueva sigue siendo sintética y no mide gestos físicos.

### Evidencia histórica: versión 0.1.9

La **0.1.9** amplía el desplazamiento a **al menos un puño cerrado**. Pan usa sólo los puños: uno desplaza desde su media MCP 5/9/13/17 y dos desde el punto medio de ambas referencias de nudillos. Si la otra mano está abierta, apuntando, en reposo o en OK, conserva su sombra fresca pero no contribuye al movimiento; puño + palma u OK produce sólo pan, sin clic ni zoom. Todas las manos presentes deben conservar datos válidos; una mano extra inválida bloquea acciones. La postura se adquiere durante **180 ms**. Cambiar entre uno y dos puños participantes, o cambiar su identidad, exige otros **180 ms** y una nueva base, sin salto ni arrastre de un ancla anterior. Cambiar el número o identidad de **cualquier mano observada**, incluso la libre, también exige reestabilizar tracking y adquirir de nuevo durante **180 ms**; pan no requiere abrir para esa readquisición. Zoom continúa exclusivamente con **dos OK**, por separación entre índices 8; selección sólo con un OK y exactamente una mano detectada. Mezclas sin puño ni dos OK no navegan. Una palma abierta o un OK individual no desplazan el mapa.

La suite **0.1.9 aprobó 145/145 pruebas**: 103 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. **Build y runtime Mac/Windows aprobados**. Los **23 checks `navigationFeedback`** incluyen pan1/pan2, mano libre azul sin aportar movimiento, cambios uno↔dos sin salto, adquisición sin aro/hover, delta físico independiente y bloqueo ante conteo/datos inválidos. Los **nueve `fistViewsFeedback`** verifican pan con uno y dos puños en tres vistas sintéticas; aprueban también seis checks de recuperación y cuatro clics nativos `isTrusted`, junto con el recorrido. Clic continúa en **1500 ms**, zoom sólo con dos OK y selección/recuperación 0.1.8 se conservan.

El código comprobado es `cb7d88071af0388d146d3719ae5c77744d3a8661`. El [paquete Mac 0.1.9](./Documentos/verificacion-paquete-mac-0.1.9.json) está aprobado: 23 checks de navegación, nueve de vistas de puño, seis de recuperación y cuatro clics nativos con intervalos **1539,0 / 1539,8 / 1533,8 / 1533,0 ms** desde OK válido. La `.app` abrió, se revisó la ayuda de un puño y se observó cámara activa con cero manos; esa observación no es un ensayo físico de gestos. La [CI Windows 37466845521](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37466845521) terminó con éxito para esa misma revisión: 145 pruebas, build, runtime, construcción del portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto aprobados. El [reporte Windows 0.1.9](./Documentos/verificacion-paquete-windows-0.1.9.json) confirma 23 checks de navegación, nueve de vistas de puño, seis de recuperación y cuatro clics nativos con intervalos **1529,0 / 1512,2 / 1514,4 / 1500,0 ms** desde OK válido, sin clic temprano ni repetición y con recorrido completo. Verifica el contenido empaquetado; no se ejecutó el envoltorio portable como tal. Los checks usan landmarks sintéticos con motor real y eventos nativos dentro de la app; no acreditan ensayo USB, latencia física ni tasa de falsos positivos. Las 132 pruebas y paquetes 0.1.8 quedan históricos.

### Evidencia histórica: versión 0.1.8

La suite **0.1.8 aprobó 132/132 pruebas**: 90 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build y runtime Mac están aprobados. El smoke nativo registra cuatro clics `isTrusted` tras al menos **1500 ms**, destino conservado, aro, ningún clic temprano ni repetición y recorrido completo. El punto fuerza `deformedPalm=true` con **MCP 5 desplazado +0,03 al primer OK**; el botón conserva `stationaryThumb=true`. Los seis checks `selectionRecoveryFeedback` aprobaron, incluida la prioridad de etiqueta «Zoom».

El código histórico comprobado es `323bc002a998babd9cc1d30825e68fc8383c7dee`. El [paquete Mac 0.1.8](./Documentos/verificacion-paquete-mac-0.1.8.json) está aprobado: cuatro clics nativos con intervalos de **1538,9 / 1500,8 / 1500,9 / 1534,3 ms** desde OK válido, incluidos MCP 5 deformado y pulgar quieto, destino conservado y seis checks de recuperación. La [CI Windows 37464967238](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37464967238) terminó con éxito: 132 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El [reporte Windows 0.1.8](./Documentos/verificacion-paquete-windows-0.1.8.json) confirma cuatro clics nativos con intervalos **1533,1 / 1509,3 / 1528,0 / 1532,4 ms**, MCP 5 deformado, pulgar quieto y seis checks de recuperación. El envoltorio portable no se ejecutó como tal. Estos checks usan landmarks sintéticos con el motor real y eventos nativos dentro de la app; no validan cámara USB, falsos positivos ni latencia física. Una auditoría independiente aprobó **167 casos adicionales**, separados de la suite del repositorio; no son 167 usuarios. Esta evidencia no certifica el pan de una mano ni los paquetes 0.1.9.

### Evidencia histórica: versión 0.1.7

Las pruebas sintéticas de 0.1.7 no incluían la deformación aislada de MCP que podía dejar bloqueada la asistencia. El reporte físico posterior motivó 0.1.8; la aprobación de aquellos smoke no acreditó selección física del usuario.


La suite **0.1.7 aprobó 125/125 pruebas**: 83 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build y los runtime Mac/Windows están aprobados: cuatro clics nativos `isTrusted`, objetivo conservado durante cierre gradual, ningún clic antes de OK ni antes de completar **1500 ms**, sin repetición y recorrido completo. El botón de popup incluye cierre con pulgar quieto. Son entradas sintéticas con el motor real, no un ensayo físico de gestos.

El código comprobado es `249d6d31d3715b6bbee750a2e3c374735e5ee168`. El [paquete Mac 0.1.7](./Documentos/verificacion-paquete-mac-0.1.7.json) está aprobado: los cuatro mantenimientos registran cierre gradual en 15 pasos, preparación observada, cero acción previa a OK y destino conservado. El botón verifica `stationaryThumb=true`. También aprueban 13 checks de seguimiento, seis de world/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. Las duraciones desde el primer OK válido son **1541,2 / 1541,6 / 1540,9 / 1532,6 ms**, sin clic temprano ni repetición.

La [CI Windows 37421399632](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37421399632) terminó con éxito para `249d6d31d3715b6bbee750a2e3c374735e5ee168`: dependencias, 125 pruebas, build, runtime, construcción del portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto aprobados. El [reporte Windows 0.1.7](./Documentos/verificacion-paquete-windows-0.1.7.json) confirma intervalos de **1506,6 / 1508,4 / 1506,5 / 1510,4 ms** desde el primer OK válido. Esa ejecución verifica el contenido empaquetado; no ejecutó el envoltorio portable como tal. La `.app` Mac final abrió y su ayuda nueva se revisó; se observó Cámara activa y una mano. Esa observación no mide precisión física. Cámara USB cenital/frontal, métricas físicas, Google con key y arranque del envoltorio portable Windows siguen pendientes. La evidencia 0.1.6 se conserva como historia.

### Evidencia histórica: versión 0.1.6

La suite **0.1.6 aprobó 113/113 pruebas**: 74 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. Los build, runtime y paquetes Mac/Windows están aprobados. Los **13 checks `indexTrackingFeedback`** verifican referencias de apuntado/palma abierta/reposo/OK/puño y mano del modelo real con 21 puntos, cambios sin salto, convergencia quieta a nudillos/índice y tres fallbacks: índice, nudillos y geometría desconocida con landmark 8.

También aprueban seis checks de fuente/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. La selección registra cuatro clics nativos `isTrusted` de al menos `1500 ms`, objetivo/aro anclados, sin temprano/repetición, botón sin doble avance y recorrido completo. Las posturas de esos checks son sintéticas; el PNG positivo verifica la inferencia real, sin acreditar puños físicos ni una tasa de falsos positivos.

El código comprobado es `0c79d38b4aa65486553011495d9695acc6dec9b7`. Los reportes [Mac 0.1.6](./Documentos/verificacion-paquete-mac-0.1.6.json) y [Windows 0.1.6](./Documentos/verificacion-paquete-windows-0.1.6.json) confirman el smoke del contenido empaquetado y 13 checks de seguimiento con coordenadas esperadas calculadas directamente del índice 8 y la media MCP. La [CI Windows 37418725259](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37418725259) terminó con éxito: 113 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Google con key, cámara USB cenital/frontal y métricas físicas siguen pendientes; la [entrega](./Documentos/04-entrega-y-verificacion.md) identifica archivos y alcance.

La `.app` Mac 0.1.6 abrió correctamente; la ayuda de índice/nudillos se verificó en la interfaz nativa y se observó la cámara activa. Esa revisión de UI no es un benchmark físico de gestos, skeleton, falsos positivos o latencia.

### Evidencia histórica: versión 0.1.5

La suite **0.1.5 aprobó 104/104 pruebas**: 65 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build Vite, runtime Mac/Windows y smoke del contenido de ambos paquetes están aprobados. El PNG positivo procesado por el modelo real entrega **21 `worldLandmarks`**; el clasificador integrado utiliza esa fuente. Los **seis checks `fistViewsFeedback`** aprueban carga y uso de world, `cenital-dorso`, `frontal-nudillos`, `frontal-palma` y `mixedOrientationsPan`: las vistas de puño son XYZ sintético, no puños capturados por cámara. El motor real adquiere pan sin zoom; mover coordenadas de imagen con un mundo local fijo por mano desplaza el mapa sin usar world como posición global.

También aprueban nueve checks de navegación exclusiva, siete de preview, ocho de punteros y ocho de calidad, además de cuatro clics nativos `isTrusted` de al menos `1500 ms`, sin temprano/repetición, con anclaje/aro y recorrido completo. El botón del popup no duplica el avance; el límite carga una entidad. Estas comprobaciones no miden recall, falsos positivos ni latencia física.

El código comprobado es `a2d778582443e0eea81cf386d5e6219815b99eb8`. Los reportes [Mac 0.1.5](./Documentos/verificacion-paquete-mac-0.1.5.json) y [Windows 0.1.5](./Documentos/verificacion-paquete-windows-0.1.5.json) confirman el smoke del contenido empaquetado. La [CI Windows 37417286255](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37417286255) terminó con éxito: 104 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Cámara USB cenital/frontal, métricas físicas y Google con key real siguen pendientes; la [entrega](./Documentos/04-entrega-y-verificacion.md) identifica archivos y alcance por plataforma.

La `.app` Mac 0.1.5 se abrió y se verificó la cámara activa. La revisión detallada de Ayuda, Ajustes y skeleton de 0.1.4 queda histórica; esta corrección conserva esa interfaz. No se presenta la apertura ni el panel activo como benchmark físico de puños, precisión o latencia.

### Evidencia histórica: versión 0.1.4

La versión **0.1.4** aprobó **94/94 pruebas**: 55 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia.

El runtime Mac aprobó **nueve checks de navegación** con el `GestureEngine` real y entradas sintéticas: dos puños sólo pan, dos OK sólo zoom, mezcla sin navegación y nueva adquisición al cambiar de postura. Aprobaron **siete checks de preview** —detenido, activo, pausado, tamaño compacto, dibujo, limpieza y ausencia de casilla—, además de ocho de punteros y ocho de calidad.

Registró **cuatro clics nativos** (`trustedClicks=4`) en punto 1, botón de popup, punto 2 y punto 3, cada uno tras al menos `1500 ms`, sin clic temprano ni repetición. El objetivo y el aro permanecieron anclados; el recorrido terminó en orden y el botón no duplicó el avance.

El código comprobado es `fe733f504f64a27cf577bf18a2c91ebd426b9ba2`. Los paquetes **Mac y Windows 0.1.4 están verificados**: [reporte Mac](./Documentos/verificacion-paquete-mac-0.1.4.json) y [reporte Windows](./Documentos/verificacion-paquete-windows-0.1.4.json). La [CI Windows 37415440930](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37415440930) terminó con éxito: 94 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Los smoke usan entradas sintéticas; el ensayo USB cenital y Google con key real siguen pendientes.

La inspección nativa Mac confirmó la ayuda de 1,5 segundos, dos puños para pan, dos OK para zoom y Ajustes sin casilla de preview. También se inspeccionó el preview con una cámara física y sus landmarks, sin guardar imágenes personales. Esa revisión visual no es un ensayo USB cenital ni un benchmark de gestos, falsos positivos o latencia física.

### Evidencia histórica: versión 0.1.3

La suite compartida de **0.1.3 aprobó 86/86 casos automatizados**. Incluye clic automático y anclaje de 3 segundos, punteros de ambas manos, navegación y colores con histéresis, alcance de bordes, mapeo completo, calidad de imagen, controles de cámara y recorrido.

El smoke de desarrollo aprobó **cuatro clics nativos** (`trustedClicks=4`): punto 1, botón de su popup, punto 2 y punto 3. Cada mantenimiento completó al menos 3 segundos, sin clic temprano ni repetición, con objetivo y aro anclados. El recorrido finalizó en orden; el botón no duplicó el avance. También aprobaron dos sombras independientes, colores pan/zoom, alcance de bordes y punteros grises sin acciones durante bloqueo de imagen.

El código verificado es `f5716f0b134ef15d97f2a727990122b3dbf18e54`. El [reporte Mac 0.1.3](./Documentos/verificacion-paquete-mac-0.1.3.json) registra el smoke del paquete aprobado, con cuatro clics nativos y todos los checks de puntero, navegación y calidad correctos. Los ocho checks de calidad incluyen controles ocultos sin capacidades y visibles/habilitados cuando se anuncia una capacidad válida dentro de Ajustes. La apertura real, Ajustes y ayuda de la `.app` también se revisaron; no equivale a probar una USB física.

La [CI Windows 0.1.3](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37414071782) terminó correctamente para el mismo commit: `npm ci`, 86 pruebas, build, runtime, portable y smoke del contenido empaquetado aprobados. El [reporte Windows 0.1.3](./Documentos/verificacion-paquete-windows-0.1.3.json) conserva el resultado de `win-unpacked`; no verifica el arranque del envoltorio portable. Ambas plataformas tienen paquetes verificados; la cámara física, el soporte real del driver y Google Maps con key propia siguen pendientes.

El PNG positivo tiene transparencia y se compone sobre gris `#777` **únicamente en el smoke**, antes de enviarlo al worker de producción. Las cámaras y la entrada real no reciben ese preprocesamiento. Estas comprobaciones usan fixtures/gestos sintéticos y un fondo de mapa de prueba: no validan precisión cenital física, disponibilidad de cartografía ni el SDK Google Maps con key real.

### Evidencia histórica: versión 0.1.2

La versión **0.1.2 aprobó 49/49 casos automatizados: 37 de gestos, 3 de calibración y 9 de selección**. Incluyen clic automático a los 3 segundos, no repetición, objetivo anclado, selección de candidatos, navegación con dos OK y cancelación segura.

El smoke de desarrollo y el de la `.app` Mac empaquetada aprobaron el ciclo completo sobre un punto azul y el botón de su popup: **dos eventos nativos** (`trustedClicks=2`), objetivo fijo, aro intermedio visible, ningún clic temprano y ninguna repetición. Los mantenimientos registrados fueron `3018,2 ms` y `3018,6 ms` con reloj real. Son pruebas con entradas sintéticas en el modo OpenStreetMap de prueba, no mediciones de cámara USB o latencia física. El [reporte Mac 0.1.2](./Documentos/verificacion-paquete-mac-0.1.2.json) conserva la evidencia.

El código verificado corresponde a `eb23ff4de28d6a1cea8fe12de576dce7737bec85`. La [CI Windows 0.1.2](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37267138909) aprobó **49 pruebas, build, runtime, construcción del portable y smoke del contenido empaquetado**. Registró dos clics nativos, objetivo fijo, aro intermedio y ausencia de clic temprano/repetición; los mantenimientos fueron `3040,1 ms` y `3021 ms`. El [reporte Windows 0.1.2](./Documentos/verificacion-paquete-windows-0.1.2.json) conserva la evidencia. El envoltorio portable, cámara física y Google con key siguen pendientes. La [captura de selección](./Documentos/seleccion-3s-0.1.2.png) muestra el feedback de esta versión.

### Evidencia histórica: versión 0.1.1

La versión **0.1.1** aprobó **37/37 casos automatizados: 34 del motor de gestos y 3 de calibración**, además del build Vite y el ZIP Mac arm64. La cobertura incluye la eliminación de pan con palma, navegación con dos OK, cancelación sin clic residual, saltos anómalos de landmarks de la pinza y separación filtrada cercana a cero.

`test:app` y el smoke de la `.app` empaquetada aprobaron carga WASM, una mano con 21 puntos en el fixture positivo, cero manos en frame vacío, CSP y controles de zoom, popup y selección. Los cinco checks de `pointerFeedback` (`oneHand`, `twoHands`, `twoDetectedOneEligible`, `noHands`, `clearedRipple`) devolvieron `true`. Los tres de `navigationFeedback` (`panWorks`, `combinedZoomWorks`, `hiddenDuringNavigation`) también aprobaron: comprueban desplazamiento, zoom combinado y ocultación del feedback durante navegación. El [reporte Mac 0.1.1](./Documentos/verificacion-paquete-mac-0.1.1.json) conserva el resultado `ok:true`.

La [CI Windows 0.1.1](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37264864301), commit `451509904cb8406eba84de961d5c4b9f69a46fb4`, aprobó **37/37 pruebas**, build, smoke de runtime, construcción del `.exe` portable y smoke del contenido empaquetado. Este último arrancó `release/win-unpacked/Mapa Gestual MLR.exe`; el [reporte Windows 0.1.1](./Documentos/verificacion-paquete-windows-0.1.1.json) conserva los resultados. No se probó el arranque mediante el envoltorio portable ni una cámara Windows física. Estas comprobaciones automatizadas no miden una tasa de falsos clics ni latencia de cámara cenital.

### Evidencia histórica: versión 0.1.0

La versión 0.1.0 aprobó **26/26 casos automatizados: 23 del motor de gestos y 3 de calibración**. El smoke de Electron `44.5.1` en Apple M5 con macOS `26.6.2` confirmó cero manos en un frame vacío, una mano con 21 puntos en un PNG oficial y funcionamiento de zoom, popup y botón de selección. Confirmó también una violación CSP al intentar la conexión de telemetría desde el worker. Una comprobación aislada del cierre real del task registró el POST bloqueado por `connect-src` en modo `enforce`, sin solicitudes externas del worker observadas en ese ensayo.

El build ZIP de Mac arm64 terminó correctamente. La `.app` final abrió correctamente y su smoke empaquetado devolvió `ok:true`, con carga del WASM, frame vacío, fixture positivo y controles de UI aprobados. El [reporte del paquete Mac](./Documentos/verificacion-paquete-mac.json) conserva esos resultados.

En Windows CI aprobaron build, **26/26 tests**, smoke de runtime y smoke de la aplicación empaquetada. La [ejecución 37263075039](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37263075039) corresponde al commit `d2a4e1948611012c24356dde2d2acbec927224f8`. El smoke del paquete ejecutó `release/win-unpacked/Mapa Gestual MLR.exe`; el `.exe` portable se generó, pero su envoltorio no fue ejecutado en esa comprobación.

Estas son comprobaciones de integración; no miden precisión cenital, latencia con cámara USB ni detección de dos manos reales. Los fixtures son imágenes de prueba y no corresponden al montaje municipal.

Los reportes anteriores identifican sus respectivas versiones. Los resultados de una versión anterior no certifican las reglas ni los paquetes 0.1.12.

Estas pruebas no sustituyen el ensayo con cámara USB cenital. Google Maps todavía no está probado con una key del usuario. Consultar el [protocolo de validación](./Documentos/03-protocolo-validacion.md) para medir falsos clics, estabilidad y latencia en condiciones reales.

## Generar las distribuciones

```bash
npm run dist:mac
npm run dist:win
```

`dist:mac` genera el ZIP de la `.app` arm64. `dist:win` genera el `.exe` portable x64. La ruta recomendada para Windows es el flujo de CI en Windows; un intento de compilación cruzada depende de las herramientas del host y no constituye una prueba de ejecución.

## Material del prototipo

| Documento | Qué muestra |
|:---|:---|
| [Bitácora](./Bitacora/README.md) | Punto de partida, alcance, decisiones y verificación pendiente. |
| [Investigación de visión](./Documentos/01-investigacion-vision.md) | Comparación de modelos, elección inicial y ruta de mejora. |
| [Gestos y UX](./Documentos/02-gestos-y-ux.md) | Referentes de interacción, diseño y requisitos de mapas. |
| [Protocolo de validación](./Documentos/03-protocolo-validacion.md) | Configuración implementada, métricas y criterios para un piloto. |
| [Entrega y verificación](./Documentos/04-entrega-y-verificacion.md) | Archivos, hashes, resultados disponibles y límites de las pruebas. |
| [Meta Quest y selección](./Documentos/05-meta-quest-y-seleccion.md) | Referentes oficiales para estabilización, hover y cancelación; el tiempo de clic se define en la app. |
| [Cámara y contraste](./Documentos/06-camara-y-contraste.md) | Calidad de imagen, recuperación y controles disponibles según la cámara. |
| [Límite de La Reina y recorrido](./Documentos/07-limite-la-reina.md) | Geometría SUBDERE DPA 2023 y secuencia de los tres puntos ficticios. |
| [Arquitectura del sistema](./Documentos/09-arquitectura-del-sistema.md) | Resumen por módulos, diagrama editable y detalle técnico desplegable. |

## Configuración técnica inicial

MediaPipe Tasks Vision `1.0.1`, Hand Landmarker full, modo video, hasta dos manos y delegate CPU en worker local. Umbrales iniciales de detección, presencia y tracking: `0,70`.

El modelo Hand Landmarker full, SDK, pesos e inferencia CPU se conservan. La versión **0.1.12** inicia selección únicamente cuando el landmark 8 fresco de una mano no puño está sobre un objetivo seleccionable. No requiere geometría de índice extendido ni recogimiento de los otros dedos. Dwell de **1500 ms**, retención del destino, rearme por salida y prioridades de navegación se prueban por separado; Suite **192/192**, build/runtime y contenido de paquetes Mac/Windows aprobados. Los **180 casos y paquetes de 0.1.11** son históricos.

El diagnóstico muestra tiempos de inferencia y captura→resultado del worker. **No incluye toda la demora física de cámara USB ni de presentación de pantalla.** Exportar la sesión permite conservar un resumen agregado de hasta 10.000 muestras recientes. El botón **Marcar falso clic** suma una anotación manual; no detecta errores ni calcula una tasa de falsos positivos automáticamente. Para medir esa tasa se requiere tiempo negativo e intención anotados.

---

Documentación técnica del prototipo, preparada con asistencia de Codex, 2026.

[Volver al README principal](../README.md)
