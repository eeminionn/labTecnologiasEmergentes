# Revisión y alcance

## Revisión de la versión 0.8.1

La vista elevada quedó **aprobada en las once sillas de Mac**: cámara a **1,53 m al sentarse** y **1,65 m al levantarse**, sin mover los anclajes ni perder la posición al mirar alrededor. Pasaron la autorización del puesto principal, las colisiones, el descenso del mapa y las guías del piso y del techo. Los resultados están en [validacion-runtime-mac.json](./validacion-runtime-mac.json).

Los 35 cm añadidos son un ajuste de visualización para leer la mesa. **La cámara física y la inferencia gestual no se volvieron a ensayar**; el gestor y la copia VR permanecen intactos. El resultado anterior está en [validacion-runtime-mac-v0.8.json](./validacion-runtime-mac-v0.8.json).

## Revisión de la versión 0.8 · 22 de octubre de 2026

La ejecución de la versión 0.8 en Mac quedó **aprobada** en [validacion-runtime-mac-v0.8.json](./validacion-runtime-mac-v0.8.json). Se comprobó el descenso del mapa de **20 cm con K**, de **79,2 a 59,2 cm** del piso, y su combinación con el ajuste de la mesa. El pedestal mantiene el apoyo en el piso, se adapta sin atravesar el inserto y recupera su altura al restablecer con **0**. También pasaron la revisión de colisiones, la separación de 2 mm, la máscara y las proporciones del mapa.

Pasaron los **13 casos de la guía del techo** y los **7 del piso**: avance, retroceso, cambio de tramo, salida y reingreso. Fuera de la ruta conservan la última ubicación y al sentarse se pausan. El anticipo del techo sigue siendo **1,35 m**. Las once sillas, los videos y la autorización exclusiva de Chair_10 también pasaron.

La geometría de Blender y las medidas iniciales de la versión 0.7 permanecen iguales. El control gestual y la copia VR no se modificaron; **la cámara física y la inferencia no se volvieron a ensayar** en esta revisión. El resultado aprobado anterior se conserva en [validacion-runtime-mac-v0.7.json](./validacion-runtime-mac-v0.7.json) y sus medidas, en [medidas-modelo-v0.7.json](./medidas-modelo-v0.7.json).

## Cambios de la versión 0.6

El borde blanco de la mesa pasa de 30 a **20 cm**, y el mapa ocupa un área mayor sin cambiar el tamaño exterior ni las alturas iniciales. Se incorporan ajustes temporales de altura, inicio de cámara en espejo y una vista flotante de seguimiento al usar la silla principal. La geometría está revisada en [verification_v6.json](./verification_v6.json), con medidas en [table_geometry_v6.json](./table_geometry_v6.json). La disposición en U de las sillas permanece idéntica a la registrada en [verification_v5.json](./verification_v5.json) y [chairs_u_v5.json](./chairs_u_v5.json).

La versión 0.6 está aprobada en ejecución en Mac con cámara física: inicio en espejo, ventana de tracking, mapa ampliado, ajustes y restablecimiento de altura. También se comprobaron las once sillas, el bloqueo fuera de Chair_10 y la imagen congelada al levantarse. Pasaron las **198 pruebas** del prototipo gestual; la prueba aislada del preview confirma que usa el mismo flujo de cámara y no quita el foco del recorrido.

| Revisión | Estado |
| --- | --- |
| Sala | Se mantiene la referencia de 8 × 9 m y la altura nominal de muros de 2,70 m. |
| Mesa | Exterior conservado: 2,27046 × 2,80172 m. Borde blanco de 20 cm y área interior de 1,87046 × 2,40172 m. Alturas iniciales iguales: tablero a 0,76275 m, inserto a 0,77182 m y proyección a 0,77382 m. |
| Sillas | Once puestos en U: cuatro por lado y tres al fondo, a 72 cm entre centros. Entrada libre; separación mínima conservadora de 7,4 cm entre muebles contiguos. Asiento de 0,50 × 0,49 m, a 0,47 m del suelo, sin cambiar la escala. Exportación FBX y materiales comprobados. |
| Paredes | Superficie lisa en U, sin las divisiones, marcos y anillos anteriores; dos esquinas con radio de 0,90 m. |
| Panorama | Un solo material y coordenadas continuas de imagen; desarrollo aproximado de 24,267 × 2,70 m. |
| Máscara de mesa | Malla ovalada ampliada y UV 0–1 conservadas. Hueco real en el borde blanco: 256 rayos verticales sin obstáculos en su interior y 64 rayos confirman la continuidad del anillo. Máscara y visibilidad del mapa rebajado comprobadas también en ejecución. |
| Ajustes de altura | U/J para la mesa; I/K para inserto y mapa; 0 restablece ambos. No persisten entre aperturas y el inicio conserva las alturas anteriores. Comprobados los límites, el apoyo del pedestal, la separación de 2 mm y el regreso a las alturas originales. |
| Gráfica y videos | Paleta extraída del PDF. Los dos MP4 se reproducen y avanzan: panorama de 4096 × 456 px y mesa de 720 × 950 px. Duración y BT.709 registrados en sus metadatos. |
| Sentarse y levantarse | Prueba aprobada en las once sillas: ojos a 1,18 m, posición fija al mirar alrededor y regreso a un espacio libre. No se registró desplazamiento de la cámara durante el giro. |
| Huellas y recorrido | Escala y colisiones comprobadas en Mac. Se verificó el avance del recorrido de 46 huellas. Se comprobó la secuencia 1 → 2 → 3 → 4, con cambio de pie y una sola luz encendida en cada pulso. Las capturas muestran dos pasos consecutivos. Una cápsula de 51 cm de diámetro y 1,78 m de alto recorre los puntos de la guía sin encontrar obstáculos. |
| Pantalla circular | Geometría exterior del techo conservada; panel repetido dos veces. Reloj local y contador comprobados: 900 → 899 segundos. El tiempo llega a cero sin hacerse negativo y puede reiniciarse desde ajustes. Lectura revisada desde el frente y un costado. |
| Control gestual | Puente local implementado para Mac: solo Chair_10 sentada autoriza la cámara y la imagen en vivo. Levantarse, usar otra silla o perder la autorización desactiva cámara y gestos; la última imagen del mapa queda visible en la mesa. Prueba integrada aprobada: cámara física, inferencia, imagen en la mesa, recarga, salida, bloqueo en otra silla y reingreso sin reiniciar. |
| Cámara y vista flotante | Inicio en espejo en cada apertura. Vista con cámara y tracking que aparece al entrar a Chair_10 y se cierra al salir. Apertura, entrega de imagen y cierre al abandonar el puesto comprobados en Mac. |
| APK para Meta Quest | La versión 0.6.0 fue compilada en ARM64 y su firma verificada. El mapa gestual no está conectado en Quest y la prueba del recorrido en un visor real sigue pendiente. |

## Qué representa el modelo

El recorrido permite evaluar el espacio y sustituir contenido audiovisual. Las paredes muestran contexto fotográfico de La Reina. La mesa parte con una muestra gráfica y pasa al mapa gestual en vivo desde el puesto principal en Mac. Al dejar ese puesto se conserva la última imagen del mapa, con cámara y gestos apagados; todavía no hay conexión con datos municipales en tiempo real.

La cámara de escritorio está a **1,65 m de pie** y, desde la versión 0.8.1, usa una **vista sentada elevada a 1,53 m**: suma 35 cm al anclaje original de 1,18 m para leer mejor la mesa. Esta elevación es una decisión de visualización, no una medida antropométrica. El campo de visión vertical es de **60°**. En realidad virtual se conserva el movimiento natural de la cabeza y no se aplica este cambio.

Los proyectores y soportes mantienen una ubicación provisional. La imagen continua en Unity no calcula tiro, lúmenes, sombras, corrección óptica ni mezcla entre varios proyectores. Esas decisiones requieren medir y calibrar el espacio físico.

El archivo [validacion-runtime-mac-v0.6.json](./validacion-runtime-mac-v0.6.json) reúne los resultados de ejecución en Mac de la **versión 0.6**, incluida la revisión por silla y la progresión de las huellas. La pantalla añade una superficie sin cambiar el tamaño de la estructura; sus medidas están en [ceiling-event-geometry.json](./ceiling-event-geometry.json). La verificación del modelo original queda en [verificacion-modelado.json](./verificacion-modelado.json); la versión 0.2 modifica las paredes y conserva las dimensiones principales y los muebles.

La versión 0.4 tomó solo la mesa del nuevo FBX. En la versión 0.5 se modificaron únicamente las posiciones y rotaciones de las sillas y sus anclajes; las formas, materiales y UV de todos los demás objetos permanecen idénticos. Los puntos para levantarse quedan a 82 cm detrás de cada puesto y a un mínimo conservador de 49,4 cm de los muebles. El funcionamiento del mapa y su alcance se explican en [documentación de apoyo](./uso-y-proyecciones.md#mapa-gestual-en-la-silla-principal--mac).

En la versión 0.6 solo cambian las mallas del borde blanco, el inserto y la proyección. Los hashes confirman que sillas, anclajes, sala y techo no se modificaron. Las medidas anteriores se conservan en [medidas-modelo-v0.5.json](./medidas-modelo-v0.5.json) y las de esa etapa, en [medidas-modelo-v0.6.json](./medidas-modelo-v0.6.json).

## Avance del 22 de octubre de 2026 · versión 0.7

Incorporamos la mesa más delgada y el recorrido orgánico del techo desde el modelo actualizado de Blender. El tablero queda a **78,0 cm**, con **2,58 cm de espesor**; conserva el borde de 20 cm y la proyección ovalada. La tira LED enciende un tramo entre **1,35 y 2,60 m por delante** para guiar el recorrido.

La ejecución de la versión 0.7 en Mac quedó aprobada en [validacion-runtime-mac-v0.7.json](./validacion-runtime-mac-v0.7.json): pasaron los ocho casos de la guía, las once sillas, los ajustes de altura, la máscara del mapa, las huellas y la autorización del puesto principal. La geometría y las UV están revisadas en [verification_v7.json](./verification_v7.json), con las medidas de esa versión en [medidas-modelo-v0.7.json](./medidas-modelo-v0.7.json). La cámara y la inferencia gestual no se volvieron a ensayar en esta comprobación; su prueba física anterior queda en el respaldo de la versión 0.6.

Estos cambios corresponden a **Mac**. La copia independiente probada en **Quest 2**, con giro continuo, mandos visibles y mapa estático sin cámara, permanece aparte.
