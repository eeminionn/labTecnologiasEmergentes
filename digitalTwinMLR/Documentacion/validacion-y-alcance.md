# Revisión y alcance

## Cambios de la versión 0.2

La revisión geométrica queda registrada en [verification_v2.json](./verification_v2.json) y las medidas, en [panorama_geometry_v2.json](./panorama_geometry_v2.json). La prueba de ejecución de la versión 0.2 en Mac comprobó la escala, las colisiones, los dos videos y el uso de las once sillas.

| Revisión | Estado |
| --- | --- |
| Sala | Se mantiene la referencia de 8 × 9 m y la altura nominal de muros de 2,70 m. |
| Mesa | Se conservan 2 × 3,10 m y la superficie a 0,76 m del suelo. |
| Sillas | Once puestos; asiento de 0,50 × 0,49 m, a 0,47 m del suelo. No se aumentó su escala. |
| Paredes | Superficie lisa en U, sin las divisiones, marcos y anillos anteriores; dos esquinas con radio de 0,90 m. |
| Panorama | Un solo material y coordenadas continuas de imagen; desarrollo aproximado de 24,267 × 2,70 m. |
| Gráfica y videos | Paleta extraída del PDF. Los dos MP4 se reproducen y avanzan: panorama de 4096 × 456 px y mesa de 720 × 1120 px. Duración y BT.709 registrados en sus metadatos. |
| Sentarse y levantarse | Prueba aprobada en las once sillas: ojos a 1,18 m, posición fija al mirar alrededor y regreso a un espacio libre. No se registró desplazamiento de la cámara durante el giro. |
| Huellas y recorrido | Escala y colisiones comprobadas en Mac. Se verificó el avance del recorrido de 47 huellas. Las capturas muestran las suelas, el tramo iluminado y cómo cambia al avanzar. |
| APK para Meta Quest | Compilado en ARM64, versión 0.2.0, y firma verificada. Falta probar esta versión en el visor: seguimiento, controles, comodidad y rendimiento. |

## Qué representa el modelo

El recorrido permite evaluar el espacio y sustituir contenido audiovisual. Las paredes muestran contexto fotográfico de La Reina y la mesa contiene una demostración gráfica; todavía no hay conexión con datos municipales en tiempo real.

La altura de ojos de escritorio es una referencia de **1,65 m de pie y 1,18 m sentado**, con campo de visión vertical de **60°**. Sirve para comparar proporciones, pero no representa las medidas de todas las personas. En realidad virtual se conserva el movimiento natural de la cabeza.

Los proyectores y soportes mantienen una ubicación provisional. La imagen continua en Unity no calcula tiro, lúmenes, sombras, corrección óptica ni mezcla entre varios proyectores. Esas decisiones requieren medir y calibrar el espacio físico.

El archivo [validacion-runtime-mac.json](./validacion-runtime-mac.json) reúne los resultados de ejecución en Mac de la **versión 0.2**, incluida la revisión por silla y la progresión de las huellas. La verificación del modelo original queda en [verificacion-modelado.json](./verificacion-modelado.json); la versión 0.2 modifica las paredes y conserva las dimensiones principales y los muebles.
