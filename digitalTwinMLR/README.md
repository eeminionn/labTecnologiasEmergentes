# Recorrido virtual de la sala

**Avance:** 16 de octubre de 2026 · versión 0.5<br>
**Equipo:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al proyecto](https://github.com/eeminionn/labTecnologiasEmergentes)

Pasamos la propuesta espacial a Unity para recorrer la sala y entender cómo se sienten la mesa, los puestos y las proyecciones desde adentro. Nos sirve para revisar decisiones antes de llevarlas al espacio real y preparar una futura experiencia en realidad virtual.

## Una sala más inmersiva

En esta versión dejamos las paredes lisas y quitamos las divisiones, marcos y anillos que interrumpían la imagen. Unimos las proyecciones en un panorama continuo en U, de piso a techo, con las dos esquinas frente a las sillas redondeadas. La idea es que las paredes acompañen los datos con imágenes del contexto: vecinos, barrios, áreas verdes y vida de La Reina. La muestra usa fotografías publicadas por la Municipalidad y el Parque Padre Hurtado; los datos quedan en la mesa.

También cambiamos la línea azul del piso por huellas de zapatos. El recorrido rodea la mesa de izquierda a derecha desde la entrada, y las huellas se iluminan y apagan según avanzamos. Así la guía se relaciona con el movimiento de la persona.

Al revisar el recorrido, vimos que las luces parecían avanzar de a pares. Las ajustamos para marcar una huella derecha y luego una izquierda, como al caminar. También usamos la franja circular del techo como pantalla de la sesión: muestra la hora, quién está hablando y una cuenta regresiva de 15 minutos. Repetimos la información dos veces para verla desde distintos puestos y dejamos las paredes para las fotografías del contexto.

En este avance tomamos **solo la mesa del nuevo archivo sala 002.fbx** y reacomodamos las once sillas a su alrededor. Ajustamos su apoyo en el piso sin cambiar el tamaño del mueble. También hicimos que la proyección siga la forma ovalada de la mesa, porque una imagen rectangular se salía del tablero. El contenido ahora se organiza dentro de ese contorno.

Después acercamos las sillas y volvimos a una **disposición en U**, con cuatro a cada lado y tres al fondo. Dejamos libre el lado que mira a la puerta para entrar y acercarse a la mesa con más claridad.

También conectamos el **mapa gestual en vivo** a la mesa. En Mac funciona únicamente cuando nos sentamos en la silla central del fondo, **Chair_10**, usando la cámara frontal. Conservamos los gestos que ya habíamos probado; al levantarnos o usar otra silla, se apagan la cámara y los gestos, pero la mesa mantiene la última imagen del mapa. Así podemos mirar lo que quedó seleccionado desde cualquier puesto, con un solo lugar para interactuar.

## Escala, gráfica y puntos de vista

Revisamos las medidas antes de agrandar los muebles: mantuvimos la sala de **8 × 9 m** y las once sillas con el asiento a **47 cm**. La nueva mesa mide **2,27 × 2,80 m**, con el tablero a **76,3 cm** del piso. Podemos sentarnos virtualmente, mirar alrededor desde una altura de ojos de **1,18 m** y volver a caminar. Esto nos permite comparar la experiencia de pie y sentados.

La nueva referencia gráfica del equipo nos llevó a usar los seis colores de La Reina, fondos blancos, círculos y formas redondeadas en el contenido de muestra de la mesa. Las fotografías mantienen sus colores originales. El panorama y la muestra inicial de la mesa siguen siendo MP4 reemplazables; una vez usado el mapa, su última imagen queda visible cuando dejamos el puesto principal.

<table>
  <tr>
    <td><img src="./Imagenes/sala-general.png" alt="Sala con paredes lisas y panorama continuo" width="380" /></td>
    <td><img src="./Imagenes/mesa-proyeccion.png" alt="Nueva mesa con la proyección adaptada a su contorno ovalado" width="380" /></td>
  </tr>
  <tr>
    <td>Panorama de contexto que envuelve la sala.</td>
    <td>Nueva mesa y contenido de demostración dentro del óvalo.</td>
  </tr>
  <tr>
    <td><img src="./Imagenes/sentado.png" alt="Punto de vista desde una silla" width="380" /></td>
    <td><img src="./Imagenes/huellas.png" alt="Huellas luminosas alrededor de la mesa" width="380" /></td>
  </tr>
  <tr>
    <td>Vista a la altura de una persona sentada.</td>
    <td>Una huella a la vez, alternando derecha e izquierda.</td>
  </tr>
  <tr>
    <td><img src="./Imagenes/pantalla-circular.png" alt="Pantalla circular en la franja del techo" width="380" /></td>
    <td><img src="./Imagenes/panel-sesion.png" alt="Marca municipal, alcalde, hora y tiempo restante de la sesión" width="380" /></td>
  </tr>
  <tr>
    <td>La información de la sesión rodea la mesa.</td>
    <td>Marca municipal y tiempo restante con la gráfica del proyecto.</td>
  </tr>
  <tr>
    <td><img src="./Imagenes/sillas-u.png" alt="Once sillas más juntas en U y espacio libre hacia la puerta" width="380" /></td>
    <td><img src="./Imagenes/mapa-gestual.png" alt="Mapa gestual en vivo sobre la mesa desde la silla central" width="380" /></td>
  </tr>
  <tr>
    <td>La U compacta deja abierto el acceso a la mesa.</td>
    <td>El control con las manos se activa solo desde el puesto principal.</td>
  </tr>
</table>

Por ahora es una **representación conceptual**, sin datos municipales en tiempo real. Las ubicaciones de los proyectores son provisionales y falta comprobar la experiencia en un visor Meta Quest.

La conexión gestual está implementada para **Mac**. Su uso en Quest todavía no está conectado y la revisión del recorrido con un visor real sigue pendiente.

**Fuentes:** [propuesta espacial del equipo](../propuestaEspacialMLR/README.md), [referencia gráfica entregada para este avance](./Documentacion/paleta-referencia.json) [fotografías oficiales del panorama](./Documentacion/fuentes-panorama.json) y [marca y tipografía de la pantalla](./Documentacion/ceiling_assets_provenance.json).
