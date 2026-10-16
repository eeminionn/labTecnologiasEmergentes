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

Las once sillas tienen un punto de vista fijo para mirar alrededor sin desplazarse. En el recorrido de escritorio, los ojos están a **1,65 m de pie** y **1,18 m al sentarse**, con un campo de visión vertical de **60°**. Al levantarse se busca espacio libre junto a la silla. Las huellas avanzan con la posición del visitante, rodeando la mesa de izquierda a derecha desde la entrada; su avance se detiene mientras está sentado. La luz principal marca una sola pisada por vez, alternando derecha e izquierda.

En Meta Quest, el control previsto para sentarse o levantarse es **A del mando derecho**. El stick izquierdo permite caminar, el derecho gira en pasos de 30° y el gatillo izquierdo permite apuntar al piso y soltar para teletransportarse. El visor conserva el seguimiento natural de la cabeza, también sentado. **La comprobación en un visor real sigue pendiente.**

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
| `mesa` | Centro de la mesa | `mesa_demo.mp4`, 720 × 1120 px |
| `panorama` | Una superficie continua en U sobre las paredes | `panorama.mp4`, 4096 × 456 px |

Solo la mesa y el panorama usan estos MP4. Ambas muestras duran **8 segundos**, a **24 fps**, sin audio, en H.264 y BT.709. Cada canal usa un reproductor. Las paredes ya no se manejan como ocho pantallas separadas.

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
| `cover` | Llena toda la superficie conservando proporciones; recorta lo que sobra. Es el ajuste inicial del panorama. |
| `contain` | Conserva la imagen completa y sus proporciones; puede dejar espacio libre. Es el ajuste inicial de la mesa. |
| `stretch` | Llena la superficie estirando la imagen; puede deformarla. |

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

**Fuentes y archivos de apoyo:** [paleta del PDF](./paleta-referencia.json), [fuentes de las fotografías](./fuentes-panorama.json), [contenido de la mesa](./fuentes-mesa-v2.json), [geometría del panorama](./panorama_geometry_v2.json) y [propuesta espacial](../../propuestaEspacialMLR/README.md). El modelo editable está en `Modelado/Sala_MLR.blend` y el proyecto en `Unity/` (editor 6000.5.8f1).
