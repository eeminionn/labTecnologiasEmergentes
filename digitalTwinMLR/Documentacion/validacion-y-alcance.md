# Revisión y alcance

## Cambios de la versión 0.4

La mesa y las once posiciones se revisan en [verification_v4.json](./verification_v4.json), con medidas en [table_geometry_v4.json](./table_geometry_v4.json). La revisión de las paredes queda registrada en [verification_v2.json](./verification_v2.json) y las medidas, en [panorama_geometry_v2.json](./panorama_geometry_v2.json). La prueba de ejecución de la versión 0.4 en Mac comprobó la escala, las colisiones, los dos videos y el uso de las once sillas.

| Revisión | Estado |
| --- | --- |
| Sala | Se mantiene la referencia de 8 × 9 m y la altura nominal de muros de 2,70 m. |
| Mesa | Mesa ovalada de sala 002.fbx: 2,27046 × 2,80172 m. Tablero a 0,76275 m, inserto físico a 0,77182 m y proyección a 0,77382 m. Pedestal apoyado en el piso mediante traslación, sin cambiar la escala. |
| Sillas | Once puestos; asiento de 0,50 × 0,49 m, a 0,47 m del suelo. Se redistribuyeron alrededor de la nueva mesa; no se aumentó su escala. |
| Paredes | Superficie lisa en U, sin las divisiones, marcos y anillos anteriores; dos esquinas con radio de 0,90 m. |
| Panorama | Un solo material y coordenadas continuas de imagen; desarrollo aproximado de 24,267 × 2,70 m. |
| Máscara de mesa | Malla original ovalada y recorte elíptico en el material. Área UV del óvalo comprobada antes de combinar las mallas; máscara activa comprobada en ejecución y contorno revisado visualmente. |
| Gráfica y videos | Paleta extraída del PDF. Los dos MP4 se reproducen y avanzan: panorama de 4096 × 456 px y mesa de 720 × 950 px. Duración y BT.709 registrados en sus metadatos. |
| Sentarse y levantarse | Prueba aprobada en las once sillas: ojos a 1,18 m, posición fija al mirar alrededor y regreso a un espacio libre. No se registró desplazamiento de la cámara durante el giro. |
| Huellas y recorrido | Escala y colisiones comprobadas en Mac. Se verificó el avance del recorrido de 46 huellas. Se comprobó la secuencia 1 → 2 → 3 → 4, con cambio de pie y una sola luz encendida en cada pulso. Las capturas muestran dos pasos consecutivos. Una cápsula de 51 cm de diámetro y 1,78 m de alto recorre los puntos de la guía sin encontrar obstáculos. |
| Pantalla circular | Geometría exterior del techo conservada; panel repetido dos veces. Reloj local y contador comprobados: 900 → 899 segundos. El tiempo llega a cero sin hacerse negativo y puede reiniciarse desde ajustes. Lectura revisada desde el frente y un costado. |
| APK para Meta Quest | Compilado en ARM64, versión 0.4.0, y firma verificada. Falta probar esta versión en el visor: seguimiento, controles, comodidad y rendimiento. |

## Qué representa el modelo

El recorrido permite evaluar el espacio y sustituir contenido audiovisual. Las paredes muestran contexto fotográfico de La Reina y la mesa contiene una demostración gráfica; todavía no hay conexión con datos municipales en tiempo real.

La altura de ojos de escritorio es una referencia de **1,65 m de pie y 1,18 m sentado**, con campo de visión vertical de **60°**. Sirve para comparar proporciones, pero no representa las medidas de todas las personas. En realidad virtual se conserva el movimiento natural de la cabeza.

Los proyectores y soportes mantienen una ubicación provisional. La imagen continua en Unity no calcula tiro, lúmenes, sombras, corrección óptica ni mezcla entre varios proyectores. Esas decisiones requieren medir y calibrar el espacio físico.

El archivo [validacion-runtime-mac.json](./validacion-runtime-mac.json) reúne los resultados de ejecución en Mac de la **versión 0.4**, incluida la revisión por silla y la progresión de las huellas. La pantalla añade una superficie sin cambiar el tamaño de la estructura; sus medidas están en [ceiling-event-geometry.json](./ceiling-event-geometry.json). La verificación del modelo original queda en [verificacion-modelado.json](./verificacion-modelado.json); la versión 0.2 modifica las paredes y conserva las dimensiones principales y los muebles.

La versión 0.4 toma solo la mesa del nuevo FBX y reorganiza las sillas. Se verificaron 72 objetos ajenos a estos cambios sin modificaciones. La conexión del mapa gestual sigue sin aplicar; su viabilidad está resumida en [documentación de apoyo](./uso-y-proyecciones.md#posible-conexión-con-el-mapa-gestual--todavía-no-aplicada).
