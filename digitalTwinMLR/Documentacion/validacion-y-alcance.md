# Revisión y alcance

## Cambios de la versión 0.5

Las sillas vuelven a una U compacta y el mapa gestual se conecta en Mac solo desde la silla central **Chair_10**. La geometría se revisó en [verification_v5.json](./verification_v5.json), con posiciones en [chairs_u_v5.json](./chairs_u_v5.json). Se conservan la mesa y su máscara ovalada de la versión 0.4, documentadas en [verification_v4.json](./verification_v4.json) y [table_geometry_v4.json](./table_geometry_v4.json). Las paredes siguen registradas en [verification_v2.json](./verification_v2.json) y [panorama_geometry_v2.json](./panorama_geometry_v2.json).

La geometría y la ejecución de la versión 0.5 están aprobadas en Mac. Se revisaron las once sillas y la conexión con la cámara física: el mapa se activa en Chair_10, queda congelado al levantarse y retoma el mismo estado al volver. También pasaron las 197 pruebas del prototipo gestual y la prueba del puente Electron con cámara sintética y el modelo real de MediaPipe.

| Revisión | Estado |
| --- | --- |
| Sala | Se mantiene la referencia de 8 × 9 m y la altura nominal de muros de 2,70 m. |
| Mesa | Mesa ovalada de sala 002.fbx: 2,27046 × 2,80172 m. Tablero a 0,76275 m, inserto físico a 0,77182 m y proyección a 0,77382 m. Pedestal apoyado en el piso mediante traslación, sin cambiar la escala. |
| Sillas | Once puestos en U: cuatro por lado y tres al fondo, a 72 cm entre centros. Entrada libre; separación mínima conservadora de 7,4 cm entre muebles contiguos. Asiento de 0,50 × 0,49 m, a 0,47 m del suelo, sin cambiar la escala. Exportación FBX y materiales comprobados. |
| Paredes | Superficie lisa en U, sin las divisiones, marcos y anillos anteriores; dos esquinas con radio de 0,90 m. |
| Panorama | Un solo material y coordenadas continuas de imagen; desarrollo aproximado de 24,267 × 2,70 m. |
| Máscara de mesa | Malla original ovalada y recorte elíptico en el material. Área UV del óvalo comprobada antes de combinar las mallas; máscara activa comprobada en ejecución y contorno revisado visualmente. |
| Gráfica y videos | Paleta extraída del PDF. Los dos MP4 se reproducen y avanzan: panorama de 4096 × 456 px y mesa de 720 × 950 px. Duración y BT.709 registrados en sus metadatos. |
| Sentarse y levantarse | Prueba aprobada en las once sillas: ojos a 1,18 m, posición fija al mirar alrededor y regreso a un espacio libre. No se registró desplazamiento de la cámara durante el giro. |
| Huellas y recorrido | Escala y colisiones comprobadas en Mac. Se verificó el avance del recorrido de 46 huellas. Se comprobó la secuencia 1 → 2 → 3 → 4, con cambio de pie y una sola luz encendida en cada pulso. Las capturas muestran dos pasos consecutivos. Una cápsula de 51 cm de diámetro y 1,78 m de alto recorre los puntos de la guía sin encontrar obstáculos. |
| Pantalla circular | Geometría exterior del techo conservada; panel repetido dos veces. Reloj local y contador comprobados: 900 → 899 segundos. El tiempo llega a cero sin hacerse negativo y puede reiniciarse desde ajustes. Lectura revisada desde el frente y un costado. |
| Control gestual | Puente local implementado para Mac: solo Chair_10 sentada autoriza la cámara y la imagen en vivo. Levantarse, usar otra silla o perder la autorización desactiva cámara y gestos; la última imagen del mapa queda visible en la mesa. Prueba integrada aprobada: cámara física, inferencia, imagen en la mesa, recarga, salida, bloqueo en otra silla y reingreso sin reiniciar. |
| APK para Meta Quest | La versión 0.5.0 fue compilada en ARM64 y su firma verificada. El mapa gestual no está conectado en Quest y la prueba del recorrido en un visor real sigue pendiente. |

## Qué representa el modelo

El recorrido permite evaluar el espacio y sustituir contenido audiovisual. Las paredes muestran contexto fotográfico de La Reina. La mesa parte con una muestra gráfica y pasa al mapa gestual en vivo desde el puesto principal en Mac. Al dejar ese puesto se conserva la última imagen del mapa, con cámara y gestos apagados; todavía no hay conexión con datos municipales en tiempo real.

La altura de ojos de escritorio es una referencia de **1,65 m de pie y 1,18 m sentado**, con campo de visión vertical de **60°**. Sirve para comparar proporciones, pero no representa las medidas de todas las personas. En realidad virtual se conserva el movimiento natural de la cabeza.

Los proyectores y soportes mantienen una ubicación provisional. La imagen continua en Unity no calcula tiro, lúmenes, sombras, corrección óptica ni mezcla entre varios proyectores. Esas decisiones requieren medir y calibrar el espacio físico.

El archivo [validacion-runtime-mac.json](./validacion-runtime-mac.json) reúne los resultados de ejecución en Mac de la **versión 0.5**, incluida la revisión por silla y la progresión de las huellas. La pantalla añade una superficie sin cambiar el tamaño de la estructura; sus medidas están en [ceiling-event-geometry.json](./ceiling-event-geometry.json). La verificación del modelo original queda en [verificacion-modelado.json](./verificacion-modelado.json); la versión 0.2 modifica las paredes y conserva las dimensiones principales y los muebles.

La versión 0.4 tomó solo la mesa del nuevo FBX. En la versión 0.5 se modificaron únicamente las posiciones y rotaciones de las sillas y sus anclajes; las formas, materiales y UV de todos los demás objetos permanecen idénticos. Los puntos para levantarse quedan a 82 cm detrás de cada puesto y a un mínimo conservador de 49,4 cm de los muebles. El funcionamiento del mapa y su alcance se explican en [documentación de apoyo](./uso-y-proyecciones.md#mapa-gestual-en-la-silla-principal--mac).

Durante la compilación de Android, el validador del paquete OpenXR registró una excepción al consultar el grupo seleccionado del editor. La compilación terminó correctamente y el APK pasó la revisión de firma; este resultado no reemplaza la prueba pendiente en un visor.
