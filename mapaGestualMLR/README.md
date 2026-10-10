# Mapa Gestual MLR

Software de escritorio para explorar el mapa de La Reina con gestos de las manos, detectados por una cámara frontal hacia la persona. Permite desplazarse, hacer zoom y seleccionar información sin mouse ni teclado.

**Inicio:** 5 de octubre de 2026<br>
**Última actualización:** 10 de octubre de 2026<br>
**Equipo:** Emilio Abarca · Emilia Armstrong · Victoria Aracena<br>
**Versión:** 0.1.13 · cámara frontal

**[Leer la bitácora del prototipo](./Bitacora/README.md)**

La bitácora es el registro principal de este avance: reúne las decisiones, los cambios de gestos, las capturas y la arquitectura del sistema.

[Volver al README del repositorio](../README.md)

## Demostración

<table>
  <tr>
    <td align="center">
      <a href="https://youtu.be/mBsh8tRpk8A">
        <img src="https://i.ytimg.com/vi/mBsh8tRpk8A/hqdefault.jpg" alt="Ver video demostrativo del Mapa Gestual MLR" width="640" />
      </a>
    </td>
  </tr>
  <tr>
    <td><strong>Video demostrativo.</strong> <a href="https://youtu.be/mBsh8tRpk8A">Test software visualización de datos MLR</a>. Hacer clic en la imagen para ver el funcionamiento en YouTube.</td>
  </tr>
</table>

## Cómo funciona

MediaPipe Hand Landmarker Full detecta hasta dos manos y estima los 21 puntos de cada una. Nuestro programa analiza esos puntos con reglas propias para decidir la acción; el seguimiento se procesa en el equipo.

| Acción | Cómo se realiza |
|:---|:---|
| **Apuntar** | Mover la punta del índice. No hace falta recoger los otros dedos. |
| **Seleccionar** | Mantener el índice sobre un punto o botón seleccionable durante **1,5 segundos**. El aro indica cuánto falta y admite un margen para el pulso. |
| **Desplazar** | Cerrar **uno o dos puños** y moverlos. El seguimiento pasa a los nudillos. |
| **Zoom** | Hacer **OK con ambas manos**: separarlas acerca el mapa y juntarlas lo aleja. |

Dos OK tienen prioridad de zoom. En los demás casos, una mano no puño sobre un objetivo tiene prioridad de selección; los puños desplazan cuando no hay selección. Una segunda mano puede acompañar sin cortar la selección.

Una sombra muestra la posición de cada mano: azul al apuntar, violeta al desplazar y ámbar al hacer zoom. La cámara pequeña permite revisar el tracking. Todo el encuadre corresponde al mapa para alcanzar sus bordes.

Los tres puntos ficticios se activan en orden y el contorno delimita La Reina. **No son reportes municipales reales.** La aplicación tiene su propia ventana Electron y controla su mapa; no automatiza un navegador externo. Usa OpenStreetMap sin clave y permite configurar Google Maps con una API key propia. Los mapas requieren Internet.

## Abrir y preparar el programa

- **macOS Apple Silicon:** descomprimir `MapaGestualMLR-0.1.13-mac-arm64.zip` y abrir `Mapa Gestual MLR.app`.
- **Windows x64:** abrir `MapaGestualMLR-0.1.13-windows-x64.exe`.

La cámara se inicia desde la aplicación. Elegirla en Ajustes, conceder el permiso y mantener las manos completas en el encuadre, con iluminación uniforme. Comprobar que las sombras llegan a los bordes; Ajustes permite reflejar o rotar la imagen.

**Espacio** pausa el control y **Esc** cancela la acción. La pérdida de foco también pausa. Se conservan los controles de mouse y teclado para configurar y recuperar la interacción.

La distribución de desarrollo no tiene firma ni notarización. Si macOS bloquea su apertura, usar el menú contextual de la aplicación → **Abrir** y seguir la indicación del sistema.

Para ejecutar desde el código, con Node y npm instalados, usar esta carpeta:

```bash
npm ci
npm start
```

## Referentes y arquitectura

| Documento | Qué aporta |
|:---|:---|
| [Referentes de gestos y UX](./Documentos/02-gestos-y-ux.md) | Investigación para definir la interacción. |
| [Arquitectura del sistema](./Documentos/09-arquitectura-del-sistema.md) | Resumen por módulos y diagrama completo. |

## Cómo seguimos

El control funciona en las pruebas de uso del prototipo. El siguiente paso es medir errores y comodidad con distintas personas, distancias e iluminaciones, e incorporar información municipal real. Los resultados técnicos y el historial por versión se conservan en la carpeta [Documentos](./Documentos/).
