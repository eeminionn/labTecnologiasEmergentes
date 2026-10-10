# Límite de La Reina y recorrido de tres puntos

**Fecha:** 6 de octubre de 2026<br>
**Proyecto:** Mapa Gestual MLR · La Reina<br>
**Actualización de implementación:** 9 de octubre de 2026<br>
**Versión:** 0.1.13 · montaje frontal<br>
**Estado:** gestos conservados desde 0.1.12; verificación y paquetes vigentes en [Entrega y verificación](./04-entrega-y-verificacion.md). Evidencia numérica 0.1.12 histórica; ensayo frontal, métricas físicas, Google con key y envoltorio portable pendientes<br>
**Documentación:** preparada con asistencia técnica de Codex.

[Volver al prototipo](../README.md) · [Revisar protocolo](./03-protocolo-validacion.md) · [Revisar entrega](./04-entrega-y-verificacion.md)

## Fuente del contorno

Se utiliza la **División Política Administrativa 2023**, publicada el **29 de septiembre de 2023** en el Geoportal de IDE Chile. La institución proveedora es **SUBDERE**. La ficha describe el trabajo coordinado con IGM, DIFROL e INE, referencia SIRGAS Chile y escala de representación 1:50.000. Es la edición descargada para este prototipo; no se presenta como un límite actualizado o certificado en 2026. [Ficha oficial DPA 2023](https://geoportal.cl/geoportal/catalog/36391/Divisi%C3%B3n%20Pol%C3%ADtica%20Administrativa%202023).

La selección corresponde a **CUT_COM = 13113, COMUNA = La Reina**, provincia Santiago y Región Metropolitana de Santiago. La identificación se contrastó con el [reporte comunal de BCN](https://www.bcn.cl/siit/reportescomunales/comunas_v.html?idcom=13113).

La ficha solicita citar al proveedor e incluye esta leyenda:

> Autorizada su circulación por Resolución Nº50 del 2019 de la Dirección Nacional de Fronteras y Límites del Estado.

También distingue esa autorización del archivo fuente de la revisión de productos derivados por DIFROL. Esta implementación no afirma haber obtenido una validación de DIFROL para el software. La procedencia y la leyenda se conservan en el GeoJSON, en la atribución del mapa y en este documento. [Condiciones del metadato](https://geoportal.cl/geoportal/catalog/36391/Divisi%C3%B3n%20Pol%C3%ADtica%20Administrativa%202023).

## Extracción reproducible

El archivo original es el [ZIP oficial del Geoportal](https://geoportal.cl/geoportal/catalog/download/912598ad-ac92-35f6-8045-098f214bd9c2), descargado el 6 de octubre de 2026. Se conserva sólo la comuna necesaria en [assets/la-reina.geojson](../assets/la-reina.geojson); el ZIP completo no forma parte de la entrega.

1. Leer `COMUNAS/COMUNAS_v1.shp`, `.shx`, `.dbf` y `.prj` del ZIP.
2. Seleccionar exactamente un registro cuyo campo `CUT_COM` sea `13113`; comprobar nombre y región.
3. Interpretar el sistema geográfico de origen como **EPSG:5360, SIRGAS-Chile** y exportar a **EPSG:4326**, con orden longitud/latitud mediante `pyproj.Transformer(..., always_xy=True)`.
4. Conservar los vértices sin simplificar ni redibujar. Orientar el anillo exterior en sentido antihorario para GeoJSON RFC 7946.
5. Verificar polígono no vacío y válido, cierre del anillo, coordenadas finitas, caja geográfica y pertenencia de los tres puntos.

Herramientas de conversión: Python 3.12, pyshp 3.1.6, pyproj 3.8.0 y Shapely 2.1.2, instaladas en un entorno temporal fuera del repositorio. PROJ seleccionó una operación equivalente sin cambio numérico de las coordenadas (`proj=noop ellps=GRS80`). No se añadió un desplazamiento manual ni se realizó una medición de precisión geodésica.

| Campo | Resultado de la extracción |
|---|---|
| Archivo de salida | `assets/la-reina.geojson` |
| Entidades | 1 |
| Geometría | Polygon válido, un anillo exterior |
| Vértices del anillo | 306, incluido el cierre |
| Tamaño | 13.047 bytes |
| CUT región / provincia / comuna | 13 / 131 / 13113 |
| Superficie del atributo original | 23,39 km²; no recalculada por la app |
| Caja, longitud oeste / sur / este / norte | −70,584493467 / −33,465471297 / −70,486388282 / −33,428836805 |
| Tres puntos dentro del límite | Sí |

SHA-256 del ZIP original:

```text
8ac1ce872230b645c3cf04db2d980c1968e78f602144347f4513119dc9b945db
```

SHA-256 del GeoJSON empaquetado:

```text
598c9ad17d1e1088ac9847cda674f0db4496a2631ba9ab23dd4ede76675b3818
```

## Representación dentro de la aplicación

Vite importa el GeoJSON local durante la compilación. Dibujar el límite no requiere descargar cartografía al iniciar. Las teselas OpenStreetMap y el proveedor Google mantienen sus respectivos requisitos de red.

El contorno usa verde azulado `#0f766e`, trazo de 3 px y relleno de opacidad 0,05. No recibe clics. Leaflet lo representa con `L.geoJSON`; Google lo añade a su capa pública `Data`. “Inicio” encuadra el límite completo con un margen de 64 px y conserva el avance del recorrido. [Capa Data de Google Maps](https://developers.google.com/maps/documentation/javascript/datalayer).

La geometría no procede de OpenStreetMap; no se le atribuye licencia ODbL. Las teselas OSM conservan su atribución y los tres marcadores se identifican como **puntos ficticios**. Ninguno representa instalaciones, servicios o información municipal real.

## Recorrido y selección

Los tres puntos mantienen identidades estables `point-0`, `point-1` y `point-2`, con números visibles **1, 2 y 3**. Su apariencia nominal mide 40 px y el siguiente punto activo mide 56 px. Sólo el activo tiene un pulso suave; al completar el tercero, los tres quedan completos y dejan de pulsar.

El área exterior permanece fija en **56 × 56 px**. La animación afecta únicamente al elemento interior, por lo que no desplaza el centro ni invalida el objetivo durante la permanencia del landmark 8 sobre el destino por **1500 ms**. Google utiliza `OverlayView` y su pane de eventos para compartir los mismos marcadores DOM sin necesitar un Map ID. [API pública OverlayView](https://developers.google.com/maps/documentation/javascript/reference/overlay-view).

El aro de mantenimiento usa un contenedor de **96 × 96 px**, radio de **34 px** y trazo de 3 px. Su perímetro queda fuera del círculo activo de 56 px, de modo que el punto no oculta el progreso. Conserva el azul durante el mantenimiento y el verde al confirmar.

El clic sobre el marcador activo abre su popup y avanza una sola posición. Un marcador pendiente o completado no puede adelantar la secuencia. El botón “Seleccionar punto” del popup cambia su propio estado; no vuelve a avanzar el recorrido. No hay avance por movimiento, hover o clic genérico sobre el mapa.

`map.targets()` entrega únicamente el marcador activo; los controles visibles de los popups se consideran por separado en el renderer. Al terminar no quedan marcadores de la secuencia como objetivos de selección. `map.resetSequence()` cierra el popup y activa otra vez el punto 1. `map.home()` conserva el progreso.

Diagnóstico disponible mediante `map.info()`:

```js
{
  sequence: {
    activeIndex: 0,      // 0, 1, 2; null al completar
    completed: false,    // true sólo al completar los tres
    completedCount: 0,
    total: 3
  },
  boundaryLoaded: true,
  boundaryFeatureCount: 1
}
```

## Montaje frontal y gestos conservados

La cámara vigente es **frontal, apuntando hacia la persona**: manos completas en encuadre, iluminación uniforme y todo el encuadre correspondiente al mapa. Sustituye el planteamiento cenital inicial, conservado en antecedentes y comparaciones. Los gestos no cambian. Selección por **landmark 8 sobre objetivo durante 1500 ms**, sin exigir postura del índice ni de los demás dedos. No hay dwell sobre mapa vacío. Prioridad **dos OK → zoom; mano no puño sobre objetivo → selección; después puños → pan**. El aro conserva destino y región amplia; salir reinicia el reloj y, tras un clic, salir del destino original **120 ms** rearma sin retraer el índice. El [protocolo](./03-protocolo-validacion.md) concentra el contrato y la [bitácora](./08-historial-tecnico.md#9-de-octubre---selección-por-permanencia-sobre-objetivo-en-0112) registra la decisión. La evidencia aprobada de 0.1.12 permanece histórica. Alcance de verificación y paquetes vigentes en [04](./04-entrega-y-verificacion.md).

La exigencia de índice exclusivo de **0.1.11 es histórica**. Su suite/runtime/paquetes sintéticos aprobados no cubrieron el fallo físico reportado por el usuario: índice sobre punto 1 sin aro, con posible veto de otros dedos. No hay logs de esa captura que demuestren la causa exacta. [Reportes Mac](./verificacion-paquete-mac-0.1.11.json) y [Windows](./verificacion-paquete-windows-0.1.11.json). No se registra precisión física nueva ni se modifica el modelo.

La fuente SUBDERE DPA 2023, GeoJSON, contorno, posiciones y recorrido no cambian. Sólo un clic confirmado del actor sobre el punto activo avanza una vez. Su caja exterior fija de **56 × 56 CSS px** conserva la hitarea; el margen de retención no cambia el dibujo ni permite avanzar por otro marcador superpuesto. Home conserva progreso y el botón del popup no duplica el avance. Runtime y contenido de paquetes Mac/Windows nuevos aprobaron selección/recorrido. Consultar el [alcance](./04-entrega-y-verificacion.md).

## Interacción histórica de 0.1.10

En **0.1.10**, un OK válido seleccionaba durante **1500 ms** incluso acompañado; dos OK tenían prioridad para zoom y, sin OK, los puños hacían pan. Se incorporaron geometría XYZ positiva de OK, identidad/rearme por participante y continuidad con entrada/salida/reorden del acompañante. Es el contrato histórico probado, sustituido para selección por el índice exclusivo de 0.1.11. Los detalles de aquella postura y asistencia permanecen en la [bitácora](./08-historial-tecnico.md#9-de-octubre---selección-acompañada-y-perspectiva-en-0110-histórica) y el [protocolo histórico](./03-protocolo-validacion.md#interacción-histórica-de-0110).

La suite **0.1.10 aprobó 177/177 pruebas**: 117 de motor de gestos, 14 de geometría OK, 4 de participantes anónimos, 12 de selección, 3 de calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia/contorno. **Build y runtime Electron aprobados** sobre `b6184aa9f0ba62cfa6b0e1b39cd7615c4ea0e797`. Las tres regresiones de rearme comprueban que A pierde geometría y requiere apertura antes de seleccionar, tenga o no acompañante; B válido no se bloquea y A en puño readquiere pan durante **180 ms** sin apertura ni salto. El runtime ejecutó cuatro clics `isTrusted` con intervalos **1540,5 / 1500,3 / 1534,3 / 1541,0 ms**, conservando actor/objetivo/aro con acompañante cambiante y con puño permanente. Son landmarks sintéticos y eventos de la app, no rendimiento físico medido.

Los **paquetes finales Mac y Windows 0.1.10 están aprobados**: [reporte Mac](./verificacion-paquete-mac-0.1.10.json) y [reporte Windows](./verificacion-paquete-windows-0.1.10.json), ambos `ok:true` con cuatro clics nativos. Intervalos Mac **1503,7 / 1500,6 / 1500,5 / 1541,0 ms**; Windows **1526,5 / 1516,7 / 1524,2 / 1509,2 ms**. Acompañante cambiante, reorden y salida conservan actor/objetivo/aro; el botón mantiene compañero puño desde el inicio y actor secundario. Ambos reportes aprueban **24 checks de navegación** y todos los grupos Feedback. La [CI Windows 38006516067](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/38006516067) terminó con éxito para la misma fuente, incluido portable y smoke de `win-unpacked`; el envoltorio NSIS no se ejecutó como tal. La `.app` final abrió sin iniciar cámara. La [entrega](./04-entrega-y-verificacion.md) registra archivos, tamaños, hashes y capturas finales. Las **145/145 pruebas y paquetes Mac/Windows 0.1.9** permanecen históricos; esta evidencia nueva sigue siendo sintética y no mide gestos físicos.

## Evidencia histórica de 0.1.9

La **0.1.9** amplía el desplazamiento a **al menos un puño cerrado**. Pan usa sólo los puños: uno desplaza desde su media MCP 5/9/13/17 y dos desde el punto medio de ambas referencias de nudillos. Si la otra mano está abierta, apuntando, en reposo o en OK, conserva su sombra fresca pero no contribuye al movimiento; puño + palma u OK produce sólo pan, sin clic ni zoom. Todas las manos presentes deben conservar datos válidos; una mano extra inválida bloquea acciones. La postura se adquiere durante **180 ms**. Cambiar entre uno y dos puños participantes, o cambiar su identidad, exige otros **180 ms** y una nueva base, sin salto ni arrastre de un ancla anterior. Cambiar el número o identidad de **cualquier mano observada**, incluso la libre, también exige reestabilizar tracking y adquirir de nuevo durante **180 ms**; pan no requiere abrir para esa readquisición. Zoom continúa exclusivamente con **dos OK**, por separación entre índices 8; selección sólo con un OK y exactamente una mano detectada. Mezclas sin puño ni dos OK no navegan. Una palma abierta o un OK individual no desplazan el mapa.

Sólo los puños participantes adquiridos se muestran violetas; mano libre azul y adquisición sin aro de clic. Pan con una o dos manos no cambia GeoJSON, hash, posiciones, identidad ni avance de puntos. Inicio sigue encuadrando la comuna completa y conserva el recorrido; sólo clic sobre el punto activo avanza.

La suite **0.1.9 aprobó 145/145 pruebas**: 103 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. **Build y runtime Mac/Windows aprobados**. Los **23 checks `navigationFeedback`** incluyen pan1/pan2, mano libre azul sin aportar movimiento, cambios uno↔dos sin salto, adquisición sin aro/hover, delta físico independiente y bloqueo ante conteo/datos inválidos. Los **nueve `fistViewsFeedback`** verifican pan con uno y dos puños en tres vistas sintéticas; aprueban también seis checks de recuperación y cuatro clics nativos `isTrusted`, junto con el recorrido. Clic continúa en **1500 ms**, zoom sólo con dos OK y selección/recuperación 0.1.8 se conservan.

El código comprobado es `cb7d88071af0388d146d3719ae5c77744d3a8661`. El [paquete Mac 0.1.9](./verificacion-paquete-mac-0.1.9.json) está aprobado: 23 checks de navegación, nueve de vistas de puño, seis de recuperación y cuatro clics nativos con intervalos **1539,0 / 1539,8 / 1533,8 / 1533,0 ms** desde OK válido. La `.app` abrió, se revisó la ayuda de un puño y se observó cámara activa con cero manos; esa observación no es un ensayo físico de gestos. La [CI Windows 37466845521](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37466845521) terminó con éxito para esa misma revisión: 145 pruebas, build, runtime, construcción del portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto aprobados. El [reporte Windows 0.1.9](./verificacion-paquete-windows-0.1.9.json) confirma 23 checks de navegación, nueve de vistas de puño, seis de recuperación y cuatro clics nativos con intervalos **1529,0 / 1512,2 / 1514,4 / 1500,0 ms** desde OK válido, sin clic temprano ni repetición y con recorrido completo. Verifica el contenido empaquetado; no se ejecutó el envoltorio portable como tal. Los checks usan landmarks sintéticos con motor real y eventos nativos dentro de la app; no acreditan ensayo USB, latencia física ni tasa de falsos positivos. Las 132 pruebas y paquetes 0.1.8 quedan históricos.

## Evidencia histórica de 0.1.8

La prioridad de OK y el descarte suave de asistencia corrigen el bloqueo de selección sin cambiar GeoJSON, hash, posiciones, tamaños, identidad ni avance. `resetSelection` evita reutilizar un objetivo descartado. Sólo el punto activo avanza; un popup no duplica el recorrido. Los cierres sintéticos 0.1.7 no cubrían la deformación MCP del fallo posterior.

La suite **0.1.8 aprobó 132/132 pruebas**: 90 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build y runtime Mac están aprobados. El smoke nativo registra cuatro clics `isTrusted` tras al menos **1500 ms**, destino conservado, aro, ningún clic temprano ni repetición y recorrido completo. El punto fuerza `deformedPalm=true` con **MCP 5 desplazado +0,03 al primer OK**; el botón conserva `stationaryThumb=true`. Los seis checks `selectionRecoveryFeedback` aprobaron, incluida la prioridad de etiqueta «Zoom».

El código histórico comprobado es `323bc002a998babd9cc1d30825e68fc8383c7dee`. El [paquete Mac 0.1.8](./verificacion-paquete-mac-0.1.8.json) está aprobado: cuatro clics nativos con intervalos de **1538,9 / 1500,8 / 1500,9 / 1534,3 ms** desde OK válido, incluidos MCP 5 deformado y pulgar quieto, destino conservado y seis checks de recuperación. La [CI Windows 37464967238](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37464967238) terminó con éxito: 132 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El [reporte Windows 0.1.8](./verificacion-paquete-windows-0.1.8.json) confirma cuatro clics nativos con intervalos **1533,1 / 1509,3 / 1528,0 / 1532,4 ms**, MCP 5 deformado, pulgar quieto y seis checks de recuperación. El envoltorio portable no se ejecutó como tal. Estos checks usan landmarks sintéticos con el motor real y eventos nativos dentro de la app; no validan cámara USB, falsos positivos ni latencia física. Una auditoría independiente aprobó **167 casos adicionales**, separados de la suite del repositorio; no son 167 usuarios. Esta evidencia no certifica el pan de una mano ni los paquetes 0.1.9.

## Evidencia histórica de 0.1.7

La corrección de cierre gradual conserva intención de selección antes de OK, también con pulgar quieto. Una copia privada no congela sombra ni inicia reloj; la aproximación positiva puede mostrar `click-preparing` sin progreso ni eventos. Sólo OK válido inicia **1500 ms**; el asentamiento inicial de pinza de **300 ms** exige palma estable. Este ajuste no altera el GeoJSON, hash, posiciones, identidad de puntos, hitareas estáticas ni la secuencia. Un clic nativo sobre el activo sigue avanzando una sola vez; el botón de popup no duplica el avance. Dos OK por índice y dos puños por nudillos mantienen sus modos exclusivos.

La suite **0.1.7 aprobó 125/125 pruebas**: 83 de gestos, 12 de selección, 3 de helper/calibración histórica, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build y los runtime Mac/Windows están aprobados: cuatro clics nativos `isTrusted`, objetivo conservado durante cierre gradual, ningún clic antes de OK ni antes de completar **1500 ms**, sin repetición y recorrido completo. El botón de popup incluye cierre con pulgar quieto. Son entradas sintéticas con el motor real, no un ensayo físico de gestos.

El código comprobado es `249d6d31d3715b6bbee750a2e3c374735e5ee168`. El [paquete Mac 0.1.7](./verificacion-paquete-mac-0.1.7.json) está aprobado: los cuatro mantenimientos registran cierre gradual en 15 pasos, preparación observada, cero acción previa a OK y destino conservado. El botón verifica `stationaryThumb=true`. También aprueban 13 checks de seguimiento, seis de world/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. Las duraciones desde el primer OK válido son **1541,2 / 1541,6 / 1540,9 / 1532,6 ms**, sin clic temprano ni repetición.

La [CI Windows 37421399632](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37421399632) terminó con éxito para `249d6d31d3715b6bbee750a2e3c374735e5ee168`: dependencias, 125 pruebas, build, runtime, construcción del portable, smoke de `release/win-unpacked/Mapa Gestual MLR.exe` y publicación del artefacto aprobados. El [reporte Windows 0.1.7](./verificacion-paquete-windows-0.1.7.json) confirma intervalos de **1506,6 / 1508,4 / 1506,5 / 1510,4 ms** desde el primer OK válido. Esa ejecución verifica el contenido empaquetado; no ejecutó el envoltorio portable como tal. La `.app` Mac final abrió y su ayuda nueva se revisó; se observó Cámara activa y una mano. Esa observación no mide precisión física. Cámara USB cenital/frontal, métricas físicas, Google con key y arranque del envoltorio portable Windows siguen pendientes. La evidencia 0.1.6 se conserva como historia.

## Evidencia histórica de 0.1.6

El seguimiento cambia a índice 8 excepto puño, cuya referencia es media MCP 5/9/13/17. La transición temporal de 300 ms conserva continuidad; durante OK individual, objetivo, aro y halo mantienen su ancla 1500 ms. Pan usa punto medio de nudillos y zoom separación/punto medio de índices. No cambian el GeoJSON, hash, posiciones, identidades, tamaños ni avance por clic. Los puntos MCP son estimados, sin garantía de visibilidad física individual.

La suite **0.1.6 aprobó 113/113 pruebas**: 74 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. Los build, runtime y paquetes Mac/Windows están aprobados. Los **13 checks `indexTrackingFeedback`** verifican referencias de apuntado/palma abierta/reposo/OK/puño y mano del modelo real con 21 puntos, cambios sin salto, convergencia quieta a nudillos/índice y tres fallbacks: índice, nudillos y geometría desconocida con landmark 8.

También aprueban seis checks de fuente/vistas de puño, nueve de navegación, siete de preview, ocho de punteros y ocho de calidad. La selección registra cuatro clics nativos `isTrusted` de al menos `1500 ms`, objetivo/aro anclados, sin temprano/repetición, botón sin doble avance y recorrido completo. Las posturas de esos checks son sintéticas; el PNG positivo verifica la inferencia real, sin acreditar puños físicos ni una tasa de falsos positivos.

El código comprobado es `0c79d38b4aa65486553011495d9695acc6dec9b7`. Los reportes [Mac 0.1.6](./verificacion-paquete-mac-0.1.6.json) y [Windows 0.1.6](./verificacion-paquete-windows-0.1.6.json) confirman el smoke del contenido empaquetado y 13 checks de seguimiento con coordenadas esperadas calculadas directamente del índice 8 y la media MCP. La [CI Windows 37418725259](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37418725259) terminó con éxito: 113 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Google con key, cámara USB cenital/frontal y métricas físicas siguen pendientes; la [entrega](./04-entrega-y-verificacion.md) identifica archivos y alcance.

La `.app` Mac 0.1.6 abrió correctamente; la ayuda de índice/nudillos se verificó en la interfaz nativa y se observó la cámara activa. Esa revisión de UI no es un benchmark físico de gestos, skeleton, falsos positivos o latencia.

## Evidencia histórica de 0.1.5

La corrección de puños cenitales/frontales cambia la interpretación XYZ de esa postura; no altera el GeoJSON, su fuente, hashes, posiciones, identidades ni avance por clic. Conserva dos puños para pan, dos OK para zoom y OK individual de 1,5 segundos. El reconocimiento del puño y el mapeo de coordenadas de imagen son medidas distintas; el mundo estimado no mueve por sí solo el objetivo. Consultar el [protocolo vigente](./03-protocolo-validacion.md).

La suite **0.1.5 aprobó 104/104 pruebas**: 65 de gestos, 3 de calibración histórica, 9 de selección, 4 de mapeo, 15 de calidad/cámara y 8 de secuencia. El build Vite, runtime Mac/Windows y smoke del contenido de ambos paquetes están aprobados. El PNG positivo procesado por el modelo real entrega **21 `worldLandmarks`**; el clasificador integrado utiliza esa fuente. Los **seis checks `fistViewsFeedback`** aprueban carga y uso de world, `cenital-dorso`, `frontal-nudillos`, `frontal-palma` y `mixedOrientationsPan`: las vistas de puño son XYZ sintético, no puños capturados por cámara. El motor real adquiere pan sin zoom; mover coordenadas de imagen con un mundo local fijo por mano desplaza el mapa sin usar world como posición global.

También aprueban nueve checks de navegación exclusiva, siete de preview, ocho de punteros y ocho de calidad, además de cuatro clics nativos `isTrusted` de al menos `1500 ms`, sin temprano/repetición, con anclaje/aro y recorrido completo. El botón del popup no duplica el avance; el límite carga una entidad. Estas comprobaciones no miden recall, falsos positivos ni latencia física.

El código comprobado es `a2d778582443e0eea81cf386d5e6219815b99eb8`. Los reportes [Mac 0.1.5](./verificacion-paquete-mac-0.1.5.json) y [Windows 0.1.5](./verificacion-paquete-windows-0.1.5.json) confirman el smoke del contenido empaquetado. La [CI Windows 37417286255](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37417286255) terminó con éxito: 104 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Cámara USB cenital/frontal, métricas físicas y Google con key real siguen pendientes; la [entrega](./04-entrega-y-verificacion.md) identifica archivos y alcance por plataforma.

La `.app` Mac 0.1.5 se abrió y se verificó la cámara activa. La revisión detallada de Ayuda, Ajustes y skeleton de 0.1.4 queda histórica; esta corrección conserva esa interfaz. No se presenta la apertura ni el panel activo como benchmark físico de puños, precisión o latencia.

Los resultados siguientes de 0.1.4 son antecedentes, no verificación de la corrección actual; el GeoJSON y su hash se conservan.

## Evidencia histórica de 0.1.4

El recorrido mantiene las mismas identidades, posiciones, áreas fijas y fuente del límite. El clic cambia a **OK durante 1,5 segundos**, automático sin soltar. **Dos puños desplazan** y **dos OK hacen zoom**, en modos exclusivos; esa navegación no avanza el recorrido. El preview cenital pequeño permanece visible y sólo dibuja tracking fresco con cámara activa; detenida, muestra el mensaje y limpia los datos anteriores.

Las ocho pruebas de secuencia/GeoJSON se incluyen en las **94/94 aprobadas**. Registró **cuatro clics nativos** (`trustedClicks=4`) en punto 1, botón de popup, punto 2 y punto 3, cada uno tras al menos `1500 ms`, sin clic temprano ni repetición. El objetivo y el aro permanecieron anclados; el recorrido terminó en orden y el botón no duplicó el avance. Los smoke Mac y Windows aprobaron el recorrido y el contenido empaquetado; el reporte Mac confirma nueve checks de navegación y siete de preview, usando entradas sintéticas, y una entidad de límite cargada.

El código comprobado es `fe733f504f64a27cf577bf18a2c91ebd426b9ba2`. Los paquetes **Mac y Windows 0.1.4 están verificados**: [reporte Mac](./verificacion-paquete-mac-0.1.4.json) y [reporte Windows](./verificacion-paquete-windows-0.1.4.json). La [CI Windows 37415440930](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37415440930) terminó con éxito: 94 pruebas, build, runtime, portable y smoke de `release/win-unpacked/Mapa Gestual MLR.exe`. El envoltorio portable no se ejecutó como tal. Los smoke usan entradas sintéticas; el ensayo USB cenital y Google con key real siguen pendientes.

La inspección nativa Mac confirmó la ayuda de 1,5 segundos, dos puños para pan, dos OK para zoom y Ajustes sin casilla de preview. También se inspeccionó el preview con una cámara física y sus landmarks, sin guardar imágenes personales. Esa revisión visual no es un ensayo USB cenital ni un benchmark de gestos, falsos positivos o latencia física.

La fuente y el SHA-256 del GeoJSON no cambian; las comprobaciones históricas siguientes conservan su versión.

## Evidencia histórica de 0.1.3

En 0.1.3 las ocho pruebas de `tests/sequence.test.js` pasaron: inicio, orden e identidad de los clics, finalización sin repetición, reinicio, protección del estado, rechazo de identidades ambiguas, integridad del GeoJSON y pertenencia de los puntos al polígono. La extracción también comprobó validez topológica con Shapely. La suite completa de 0.1.3 pasó **86/86 pruebas**.

El runtime Mac y Windows verificó el recorrido **1 → 2 → 3** en el mapa sin teselas externas: tres clics sobre los marcadores activos y un clic sobre el botón del primer popup, **cuatro eventos nativos `isTrusted`**. El botón conservó `completedCount = 1`; los siguientes clics completaron el recorrido y dejaron `map.targets()` vacío. Se confirmó `boundaryLoaded = true` y `boundaryFeatureCount = 1`.

La app Mac empaquetada también completó el recorrido, registró cuatro clics nativos y confirmó una entidad de límite cargada. El [reporte del paquete Mac 0.1.3](./verificacion-paquete-mac-0.1.3.json) confirma `ok: true`, anclaje, aro intermedio, ausencia de clic temprano y una sola selección por mantenimiento. La apertura visual de la app confirmó teselas OpenStreetMap, contorno completo, tres puntos, ayuda y ajustes.

El código comprobado es `f5716f0b134ef15d97f2a727990122b3dbf18e54`. La ejecución final Windows de [GitHub Actions 37414071782](https://github.com/eeminionn/labTecnologiasEmergentes/actions/runs/37414071782) terminó con éxito: 86 pruebas, runtime, compilación del portable y smoke del contenido empaquetado en `release/win-unpacked/Mapa Gestual MLR.exe`. El [reporte del paquete Windows 0.1.3](./verificacion-paquete-windows-0.1.3.json) registra esa comprobación. El arranque del envoltorio portable como tal permanece pendiente.

| Comprobación de 0.1.3 | Estado al actualizar este documento |
|---|---|
| Pruebas unitarias y de integridad | 86/86 aprobadas |
| Runtime Mac y Windows: contorno y recorrido | Aprobado |
| App Mac empaquetada | Aprobada; recorrido completo, cuatro clics nativos y contorno cargado |
| Apertura visual Mac con teselas OpenStreetMap | Verificada |
| Windows: contenido de la app empaquetada | Aprobado; portable construido y smoke de `win-unpacked` aprobado |
| Arranque del envoltorio portable Windows | Pendiente |
| Cámara USB cenital física | Pendiente |
| Google Maps con API key real | Pendiente |

La [captura de navegación](./dos-manos-zoom-0.1.3.png) muestra dos halos ámbar visibles, posiciones de dedos y estados inyectados para revisar la interfaz; no acredita detección de manos con una cámara física. La verificación de los paquetes y sus reportes se registra en [Entrega y verificación](./04-entrega-y-verificacion.md).
