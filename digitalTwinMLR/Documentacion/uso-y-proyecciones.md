# Uso y cambio de contenido

Estas notas quedan como documentación de apoyo. La [bitácora principal](../README.md) registra el proceso del proyecto.

## Recorrer y sentarse

En Mac, pulsa **Enter** o haz clic sobre la vista para comenzar; **Esc** libera el mouse. Acércate a una silla y mírala: cuando aparezca la indicación, pulsa **E** para sentarte. El mismo botón permite levantarte y retomar el recorrido.

| Control en Mac | Acción |
| --- | --- |
| WASD o flechas | Caminar |
| Mouse | Mirar alrededor, también desde la silla |
| E | Sentarse o levantarse |
| Enter / clic | Entrar al recorrido |
| Esc | Liberar el mouse |
| R | Volver al acceso |
| Tab | Abrir o cerrar ajustes |
| L | Alternar ambiente y luz de revisión |
| Espacio | Pausar o continuar los videos |
| H | Mostrar u ocultar la ayuda |
| U / J | Subir / bajar la mesa completa |
| I / K | Subir / bajar el mapa y su inserto respecto de la mesa |
| 0 | Restablecer las alturas iniciales de mesa y mapa |

Las once sillas tienen un punto de vista fijo para mirar alrededor sin desplazarse. En el recorrido de escritorio, los ojos están a **1,65 m de pie** y **1,18 m al sentarse**, con un campo de visión vertical de **60°**. Al levantarse se busca espacio libre junto a la silla. Las huellas avanzan con la posición del visitante, rodeando la mesa de izquierda a derecha desde la entrada; su avance se detiene mientras está sentado. La luz principal marca una sola pisada por vez, alternando derecha e izquierda.

La **copia independiente probada en Meta Quest 2** permite sentarse o levantarse con **A del mando derecho**. El stick izquierdo desplaza y el derecho gira de forma continua; el gatillo izquierdo permite apuntar al piso y soltar para teletransportarse. **B** reajusta la altura de pie. El visor conserva el seguimiento natural de la cabeza, también sentado, y muestra los mandos. Esta copia usa un mapa estático, sin cámara ni control gestual, y permanece separada de los cambios de Mac descritos aquí.

## Mesa y guía superior · versión 0.7

Se tomaron la mesa y la estructura orgánica del techo de una copia del modelo abierto en Blender el **22 de octubre de 2026**. El tablero conserva los **2,27046 × 2,80172 m** en planta, con **2,58 cm de espesor** y su parte superior a **0,780174 m** del piso. La proyección sigue siendo ovalada, de **1,87046 × 2,40172 m**, y llega a **0,792165 m**; mantiene la separación de 2 mm sobre el inserto. Los controles temporales de altura siguen funcionando y **0** vuelve a estas nuevas alturas iniciales.

La guía del techo conserva la curva del modelo: mide **26,42 m**, con un canal metálico oscuro y un difusor turquesa de **5 cm de ancho**, a **2,498 m** del piso. Se ilumina un tramo de **1,25 m**, que comienza **1,35 m por delante** de la posición del personaje. En este gemelo, esa posición hace de referencia para el encendido. La guía sigue el orden de entrada, lado izquierdo, fondo y lado derecho; se atenúa al liberar el mouse y se apaga al sentarse. Su extremo final no vuelve a encender el principio.

Las sillas, sus anclajes, el panorama, las huellas del piso y la pantalla circular se mantienen. La geometría y sus medidas quedan en [geometry_v7.json](./geometry_v7.json) y [verification_v7.json](./verification_v7.json). Las medidas anteriores se guardaron en [medidas-modelo-v0.6.json](./medidas-modelo-v0.6.json). Esta actualización corresponde a la aplicación de Mac.

## Registro anterior: mesa y sillas · versión 0.6

Se incorporó únicamente la mesa de **sala 002.fbx**. El resto de las modificaciones de ese archivo no se trasladó a la sala. Las once sillas y sus puntos para sentarse y levantarse se reacomodaron alrededor del nuevo tablero.

La disposición actual vuelve a una **U compacta**: cuatro sillas paralelas por lado y tres al fondo, con **72 cm entre centros contiguos**. El lado hacia la puerta queda sin sillas. No se cambió la escala ni la forma de los muebles; los ojos siguen a 1,18 m y el punto de regreso queda 82 cm detrás de cada silla. **Chair_10** es la silla central del fondo y el único puesto habilitado para el mapa gestual. Las posiciones y verificaciones están en [chairs_u_v5.json](./chairs_u_v5.json) y [verification_v5.json](./verification_v5.json).

En esa versión la mesa conservaba las dimensiones exteriores del archivo: **2,27046 × 2,80172 m**, con la parte superior del tablero a **0,762753 m** del piso. Se bajó el conjunto **5,3 cm** para apoyar la base en el suelo, sin escalarlo. En la versión 0.6, el borde blanco pasó de **30 a 20 cm**, medidos en los extremos de los dos ejes del óvalo, y el área de proyección aumentó a **1,87046 × 2,40172 m**. La proyección partía a **0,773177–0,773822 m**; se amplió solo en planta. La versión 0.7 conserva esa planta y actualiza el espesor y las alturas según el nuevo modelado.

La proyección tiene una malla con contorno ovalado y una máscara en el material, procesada por la GPU, para no mostrar las esquinas de una imagen rectangular fuera de la mesa. El contenido se adapta al área interior manteniendo sus proporciones, y los elementos importantes quedan dentro del óvalo.

El borde blanco es un anillo con un hueco real que coincide con el inserto ampliado. Así se puede bajar la imagen sin que quede tapada por una superficie blanca. Se conservan el espesor y el contorno exterior del tablero; las medidas y la revisión están en [table_geometry_v6.json](./table_geometry_v6.json) y [verification_v6.json](./verification_v6.json).

Las teclas **U/J** ajustan la mesa completa y **I/K**, el inserto y el mapa respecto del tablero. **0** restaura ambos valores. Estos ajustes son temporales y **no se guardan**: cada apertura parte con las alturas originales. El programa limita el movimiento para evitar que el inserto atraviese el pedestal. Las sillas y sus puntos de vista no cambian al ajustar la mesa.

## Pantalla de la sesión en el techo

La franja circular del techo muestra un panel que se repite **dos veces** alrededor de la mesa. Incluye la marca de la Municipalidad de La Reina, la hora local del dispositivo, el rótulo **ALCALDE** y el tiempo restante de intervención. El rótulo es parte de la demostración: todavía no identifica automáticamente a quien habla.

Al abrir la aplicación, el contador parte en **15:00 (900 segundos)** y baja hasta **00:00**, sin seguir a números negativos. La barra se va vaciando con el tiempo restante. Para comenzar otra intervención en Mac, abre **Tab** y pulsa **Reiniciar intervención · 15 minutos**.

Este contenido lo actualiza la aplicación, por lo que **no es un MP4**. La marca y la hoja se extrajeron del PDF gráfico del equipo; los textos y números se generaron con **Futura PT Heavy y Demi** instaladas mediante Adobe. Se incluyen imágenes rasterizadas, no los archivos de las fuentes. La paleta y la procedencia están en [los recursos gráficos de la pantalla](./ceiling_assets_provenance.json), y la disposición en [el panel de sesión](./ceiling_panel_layout.json).

La pantalla se guarda como un elemento aparte en `Modelado/Ceiling_Event_Display.blend`, para conservar la geometría base de la sala.

## Reemplazar los MP4

La entrega lee una carpeta **Proyecciones** junto a la aplicación, con los videos y **proyecciones.json**. El proyecto guarda el contenido de respaldo en `Unity/Assets/StreamingAssets/Proyecciones/`.

1. Guarda el nuevo MP4 en **Proyecciones**, con un nombre simple y sin rutas a otras carpetas.
2. Cambia `file` en el canal correspondiente de **proyecciones.json**, o conserva el nombre del archivo que estás reemplazando.
3. Abre **Tab** y pulsa **Recargar archivos de proyección**.

| Canal | Superficie | Muestra incluida |
| --- | --- | --- |
| `mesa` | Área ovalada interior de la mesa | `mesa_demo.mp4`, 720 × 950 px |
| `panorama` | Una superficie continua en U sobre las paredes | `panorama.mp4`, 4096 × 456 px |

Solo la mesa y el panorama usan estos MP4. Ambas muestras duran **8 segundos**, a **24 fps**, sin audio, en H.264 y BT.709. Cada canal usa un reproductor. Las paredes ya no se manejan como ocho pantallas separadas. Al usar por primera vez la silla principal en Mac, la imagen en vivo del mapa reemplaza el MP4 de la mesa. Al levantarse queda visible la última imagen del mapa, sin cámara ni gestos activos; el MP4 sirve como muestra inicial, antes de recibir el mapa.

Ejemplo del panorama:

```json
{
  "id": "panorama",
  "file": "panorama.mp4",
  "loop": true,
  "brightness": 1,
  "fit": "cover",
  "maxResolution": 4096
}
```

Conserva la lista `channels` y los ID `mesa` y `panorama`. `loop` controla la repetición y `brightness`, el brillo. `maxResolution` limita el lado mayor de la textura de video, entre 720 y 4096 px; el panorama usa 4096 para mantener su resolución horizontal.

| Ajuste `fit` | Resultado |
| --- | --- |
| `cover` | Llena toda la superficie conservando proporciones; recorta lo que sobra. Es el ajuste inicial de la mesa y del panorama. |
| `contain` | Conserva la imagen completa y sus proporciones; puede dejar espacio libre. |
| `stretch` | Llena la superficie estirando la imagen; puede deformarla. |

Para la mesa, prepara el contenido cerca de la proporción **0,779:1** de su área interior ampliada; el video incluido conserva **720 × 950 px** y se adapta con un pequeño recorte en modo `cover`. Aunque el archivo sea rectangular, la proyección visible mantiene el recorte ovalado. Deja textos, botones y puntos dentro de ese contorno: cambiar el ajuste de imagen no vuelve visibles las esquinas recortadas.

El panorama tiene un desarrollo de **24,267 m por 2,70 m de alto**, con dos curvas de **0,90 m de radio** y una sola coordenada de imagen compartida. Conviene preparar el contenido en una proporción cercana a **8,99:1**. Esta continuidad digital no sustituye la calibración de mapping, óptica y mezcla entre proyectores que necesitará el montaje físico.

En Quest, el APK incluye los videos de respaldo. También se contempla la carpeta `Proyecciones` en `Android/data/cl.mlr.sala.lareina/files/`, con el mismo JSON y los MP4. La carga desde esa carpeta debe comprobarse en el dispositivo. Antes de compilar, el JSON de `StreamingAssets/Proyecciones` se sincroniza con su copia para Android.

## Referencia gráfica y contenido

La paleta se obtuvo de los seis círculos del PDF **La Reina gráfica (1)** entregado por el equipo, página 1:

| Color | HEX sRGB |
| --- | --- |
| Azul petróleo | `#006A85` |
| Turquesa | `#00ADB2` |
| Morado | `#6E2663` |
| Verde | `#008D36` |
| Lima | `#AFC439` |
| Fucsia | `#E82D81` |

La mesa retoma el fondo blanco, los círculos y las barras redondeadas. Usa Futura instalada en Mac para generar las imágenes; no incluye archivos de fuente. El contorno conserva el GeoJSON comunal del proyecto, atribuido a IDE Chile / SUBDERE, DPA 2023. Sus tres nodos son esquemáticos y el rótulo **Contenido de demostración** permanece visible.

El panorama reúne fotografías de Mahuida, el entorno urbano, huertas, Plaza Gabriela Mistral, Parque Padre Hurtado y reforestación. Es un montaje de imágenes distintas con uniones suaves, no una toma de un único lugar. Sus colores son los originales y no contiene gráficos de datos.

## Mapa gestual en la silla principal · Mac

El mapa conserva la aplicación Electron y MediaPipe del [prototipo gestual](../../mapaGestualMLR/README.md), con la **cámara frontal**. Unity recibe su imagen y la coloca dentro de la máscara ovalada, sin sustituir el motor de gestos ni controlar un navegador externo. La selección mantiene el índice sobre un punto durante **1,5 segundos**; el desplazamiento usa al menos un puño y el zoom, las dos manos en pinza/OK.

1. Sentarse con **E** en **Chair_10**, la silla central del fondo, mirando hacia la entrada.
2. Esperar a que se inicie la cámara y aparezca el mapa sobre la mesa. Se abre automáticamente una ventana pequeña y flotante con la cámara y el esqueleto de seguimiento de las manos. En **Tab** se puede abrir la configuración de cámara del mapa. La cámara inicia **en modo espejo en cada apertura**, aunque se haya cambiado esa opción durante la sesión anterior.
3. Usar los gestos habituales. El modo de proyección permite procesarlos aunque el recorrido de Unity conserve el foco.
4. Levantarse con **E**: se desactiva la sesión, se libera la cámara y se cierra la vista flotante, pero la mesa conserva la última imagen del mapa. Sentarse en cualquiera de las otras diez sillas permite verla sin iniciar el control. Al volver a Chair_10 se reanuda la imagen en vivo y los gestos, y aparece otra vez la vista de seguimiento.

La comunicación ocurre solo en la Mac, por una conexión local a `127.0.0.1`, con una autorización temporal del puesto principal. La entrega incluye la aplicación auxiliar dentro de `Sala La Reina.app/Contents/Helpers/`. La imagen se envía como JPEG de **720 × 950 px**, con un máximo de **15 imágenes por segundo**; esto es la frecuencia de transmisión a Unity, no la frecuencia de detección de manos. Si Unity deja de renovar la autorización, la sesión expira en tres segundos y se bloquean los gestos y la entrega de imágenes.

El puente corresponde a `GestureTableBridge.cs` en Unity y a `electron/twin-bridge.cjs` en el prototipo. Se detiene al abandonar el puesto, desactivar el componente o cerrar la aplicación. Mantener la última textura en la mesa no mantiene activa la cámara ni permite gestos desde otro lugar. **Esta conexión está disponible solo en Mac; el mapa gestual todavía no está conectado en Quest.** El seguimiento de manos del visor no sustituye automáticamente a la cámara frontal del prototipo.

## Compilar y empaquetar la entrega para Mac

Estas instrucciones son de apoyo técnico. Desde la raíz del repositorio, primero se compila la aplicación gestual con Node y sus dependencias:

```sh
cd mapaGestualMLR
npm ci
npm run build
./node_modules/.bin/electron-builder --mac dir --arm64 --publish never
cd ..
```

Después se genera el recorrido con **Unity 6000.5.8f1**. El proyecto debe estar cerrado en el editor al usar esta compilación por línea de comandos:

```sh
"/Applications/Unity/Hub/Editor/6000.5.8f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode -buildTarget StandaloneOSX \
  -projectPath "$PWD/digitalTwinMLR/Unity" \
  -executeMethod LaReina.DigitalTwin.Editor.TwinProject.RebuildMac \
  -quit -logFile /tmp/mlr-unity-mac.log
node digitalTwinMLR/Tools/package-mac.cjs
```

El último paso incorpora `Mapa Gestual MLR.app` dentro de la aplicación de Unity, añade el texto de permiso de cámara si falta y firma y verifica el conjunto con una firma local. Falla si falta alguna aplicación o sus identificadores no corresponden al proyecto. El resultado queda en `digitalTwinMLR/Builds/Mac/Sala La Reina.app`.

Para empaquetar otra copia de la misma aplicación, se puede indicar su ruta: `node digitalTwinMLR/Tools/package-mac.cjs "/ruta/Sala La Reina.app"`. Este paso corresponde a Mac; no incorpora Electron al APK de Quest.

**Fuentes y archivos de apoyo:** [paleta del PDF](./paleta-referencia.json), [fuentes de las fotografías](./fuentes-panorama.json), [contenido de la mesa ovalada](./fuentes-mesa-v4.json), [medidas de la mesa nueva](./table_geometry_v4.json), [geometría del panorama](./panorama_geometry_v2.json) y [propuesta espacial](../../propuestaEspacialMLR/README.md). El modelo editable está en `Modelado/Sala_MLR.blend` y el proyecto en `Unity/` (editor 6000.5.8f1).
