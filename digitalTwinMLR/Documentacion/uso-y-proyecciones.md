# Uso y cambio de contenido

Estas notas quedan como documentación de apoyo. La bitácora principal registra el proceso del proyecto.

## Recorrer en Mac

Abre la aplicación incluida en la entrega. Pulsa **Enter** o haz clic sobre la vista para comenzar; **Esc** libera el mouse.

| Control | Acción |
| --- | --- |
| WASD o flechas | Caminar |
| Mouse | Mirar alrededor |
| Enter / clic | Entrar al recorrido |
| Esc | Liberar el mouse |
| R | Volver al acceso |
| Tab | Abrir o cerrar ajustes |
| L | Alternar ambiente y luz de revisión |
| Espacio | Pausar o continuar los videos |
| H | Mostrar u ocultar la ayuda |

La sala está organizada en metros, con colisiones para recorrerla. El modelo conserva la geometría final del FBX; las sillas y las carcasas de proyectores son aproximaciones de la propuesta, sin selección de fabricante ni cálculo óptico.

## Reemplazar los MP4

La entrega puede usar una carpeta **Proyecciones** al lado de la aplicación. Allí se guardan los videos y **proyecciones.json**. En el proyecto editable, los archivos de respaldo están en `Unity/Assets/StreamingAssets/Proyecciones/`.

1. Guarda el nuevo MP4 dentro de **Proyecciones**. Usa un nombre simple, sin rutas a otras carpetas.
2. En **proyecciones.json**, cambia `file` en el canal correspondiente. También puedes reemplazar un video conservando su nombre.
3. Abre los ajustes con **Tab** y pulsa **Recargar archivos de proyección**.

| ID | Superficie |
| --- | --- |
| `mesa` | Centro de la mesa |
| `pared01` a `pared08` | Ocho superficies de pared |

Ejemplo de un canal:

```json
{
  "id": "mesa",
  "file": "nuevo-video.mp4",
  "loop": true,
  "brightness": 0.9
}
```

`loop` controla la repetición y `brightness` el brillo. Conserva la lista `channels` y un ID único por superficie. De forma inicial, las ocho paredes comparten **pared_demo.mp4** y un solo reproductor, para evitar decodificar el mismo archivo ocho veces. La mesa usa **mesa_demo.mp4**. Es posible asignar otro archivo a cada pared, considerando el rendimiento del equipo.

Las muestras duran ocho segundos, no tienen audio y están codificadas en H.264: pared 720 × 1200 y mesa 720 × 1120. Incluyen el contorno comunal del GeoJSON del proyecto; los nodos y curvas son demostrativos. La atribución está en `MEDIA.json`.

## Preparación para realidad virtual

El proyecto contempla OpenXR para una futura versión en Meta Quest. El recorrido de Mac usa pantalla, teclado y mouse. **Todavía no se ha comprobado el funcionamiento en un visor.**

| Control previsto | Acción |
| --- | --- |
| Stick izquierdo | Caminar |
| Stick derecho | Girar en pasos de 30° |
| Gatillo izquierdo | Mantener para apuntar al piso y soltar para teletransportarse |

El teletransporte comprueba el suelo y el espacio de llegada. Antes de usarlo en una presentación debemos probar seguimiento, escala, comodidad y rendimiento en el dispositivo real.

## Archivos de trabajo y fuentes

- `Unity/`: escena, materiales, scripts y videos de respaldo. Editor: Unity 6000.5.8f1.
- `Modelado/Sala_MLR.blend`: modelo editable.
- `Documentacion/medidas-modelo.json`: dimensiones medidas y elementos añadidos.
- [Propuesta espacial del equipo](https://github.com/eeminionn/labTecnologiasEmergentes/tree/main/propuestaEspacialMLR).
- [Presentación del equipo, páginas 33–39](./propuesta-espacial-extracto.pdf).
- [Unity OpenXR 1.17](https://docs.unity3d.com/Packages/com.unity.xr.openxr@1.17/manual/index.html).
- [Unity Video Player](https://docs.unity3d.com/6000.5/Documentation/Manual/VideoPlayer-rendertexture.html).

En Quest, los videos de respaldo se incluyen dentro del APK. Para sustituirlos después, el programa también lee una carpeta `Proyecciones` dentro de `Android/data/cl.mlr.sala.lareina/files/`, con el mismo JSON y los MP4. No se encontró un visor conectado para comprobar esta carga en el dispositivo.

En el proyecto, edita el JSON de `StreamingAssets/Proyecciones`; su copia de respaldo para Android se sincroniza automáticamente antes de compilar. La visualización usa texturas de video sobre las superficies: la posición de los proyectores es una aproximación, sin simulación óptica ni medición real de lúmenes.
