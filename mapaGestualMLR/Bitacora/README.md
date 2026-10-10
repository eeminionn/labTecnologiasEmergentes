# Bitácora - Mapa Gestual MLR

**Inicio:** 5 de octubre de 2026<br>
**Última actualización:** 9 de octubre de 2026<br>
**Equipo:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al README principal](../../README.md) · [Revisar Etapa 2](../../Etapa-2/Bitacora/README.md)

## PROTOTIPO MESA INTERACTIVA 

En la etapa anterior planteamos reunir información municipal en un mismo mapa. Ahora nos concentramos en cómo recorrerlo con las manos frente a una cámara frontal que apunta hacia la persona. Elegimos MediaPipe para obtener los puntos de las manos y dedicar este avance a probar la interacción.

<table>
  <tr>
    <td align="center">
      <img src="../Imagenes/01-mapa-la-reina.jpg" alt="Aplicación con el contorno de La Reina y tres puntos numerados" width="640" />
    </td>
  </tr>
  <tr>
    <td><strong>Figura 1.</strong> Mapa del prototipo, contorno comunal y tres puntos ficticios. <strong>Fuente:</strong> captura de la aplicación; base OpenStreetMap y límite SUBDERE DPA 2023.</td>
  </tr>
</table>

## Lo que fuimos cambiando

La palma abierta a veces movía el mapa sin querer. Por eso cambiamos el desplazamiento a un puño cerrado y permitimos hacerlo con una sola mano. Mantuvimos dos OK para el zoom: separar las manos acerca el mapa y juntarlas lo aleja.

El OK fallaba para seleccionar en algunos ángulos. Probamos señalar con el índice, pero exigir los demás dedos retraídos también bloqueaba la selección. Finalmente dejamos que baste con mantener la punta del índice sobre el punto durante **1,5 segundos**, sin importar los otros dedos. Acortamos la espera para que sea más ágil y dejamos un margen amplio para el pulso. El aro muestra cuánto falta y la segunda mano no interrumpe la selección.

<table>
  <tr>
    <td align="center">
      <img src="../Imagenes/02-seleccion-con-aro.png" alt="Aro de selección en progreso y sombra de la segunda mano" width="640" />
    </td>
  </tr>
  <tr>
    <td><strong>Figura 2.</strong> Aro de carga y sombras durante la selección. <strong>Fuente:</strong> captura de una prueba automatizada del prototipo, con posiciones de manos simuladas.</td>
  </tr>
</table>

Dejamos una sombra por mano y colores distintos para desplazamiento y zoom, para entender el modo sin agregar iconos. La cámara pequeña permite revisar el seguimiento, y todo su encuadre corresponde al mapa para alcanzar los bordes. Los tres puntos se activan en orden para guiar la prueba; el contorno de La Reina ayuda a ubicarla en la comuna.

<table>
  <tr>
    <td align="center">
      <img src="../Imagenes/03-informacion-y-recorrido.jpg" alt="Información del punto 1 y punto 2 activo para continuar el recorrido" width="640" />
    </td>
  </tr>
  <tr>
    <td><strong>Figura 3.</strong> Información del primer punto y avance al segundo. <strong>Fuente:</strong> captura de la aplicación, abierta con clic para registrar la interfaz.</td>
  </tr>
</table>

Armamos una arquitectura para entender el recorrido de la imagen hasta la acción en el mapa y ubicar dónde pueden aparecer errores. Separar el modelo de las reglas nos ayudó a aclarar que MediaPipe entrega los puntos de las manos, mientras nuestro programa decide qué gesto hacer.

<table>
  <tr>
    <td align="center">
      <img src="../Imagenes/04-arquitectura-resumen.jpg" alt="Resumen del flujo desde la cámara frontal hasta la interacción con el mapa" width="640" />
    </td>
  </tr>
  <tr>
    <td><strong>Figura 4.</strong> Resumen de la arquitectura. El <a href="../Documentos/09-arquitectura-del-sistema.md">diagrama completo</a> incluye gestos, tiempos, ajustes y errores. <strong>Fuente:</strong> diagrama propio en draw.io, basado en el código del prototipo.</td>
  </tr>
</table>

## Cómo seguimos

Después de estos ajustes, el usuario confirmó que el control funciona bien. Ahora queremos evaluar ese montaje frontal, medir errores y comodidad, y luego incorporar información municipal real.

[Investigación de visión](../Documentos/01-investigacion-vision.md) · [Arquitectura completa](../Documentos/09-arquitectura-del-sistema.md) · [Detalle de los avances](../Documentos/08-historial-tecnico.md) · [Pruebas y entrega](../Documentos/04-entrega-y-verificacion.md)
