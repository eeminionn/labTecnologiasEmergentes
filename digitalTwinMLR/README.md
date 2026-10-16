# Recorrido virtual de la sala

**Avance:** 16 de octubre de 2026 · versión 0.4<br>
**Equipo:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al proyecto](https://github.com/eeminionn/labTecnologiasEmergentes)

Pasamos la propuesta espacial a Unity para recorrer la sala y entender cómo se sienten la mesa, los puestos y las proyecciones desde adentro. Nos sirve para revisar decisiones antes de llevarlas al espacio real y preparar una futura experiencia en realidad virtual.

## Una sala más inmersiva

En esta versión dejamos las paredes lisas y quitamos las divisiones, marcos y anillos que interrumpían la imagen. Unimos las proyecciones en un panorama continuo en U, de piso a techo, con las dos esquinas frente a las sillas redondeadas. La idea es que las paredes acompañen los datos con imágenes del contexto: vecinos, barrios, áreas verdes y vida de La Reina. La muestra usa fotografías publicadas por la Municipalidad y el Parque Padre Hurtado; los datos quedan en la mesa.

También cambiamos la línea azul del piso por huellas de zapatos. El recorrido rodea la mesa de izquierda a derecha desde la entrada, y las huellas se iluminan y apagan según avanzamos. Así la guía se relaciona con el movimiento de la persona.

Al revisar el recorrido, vimos que las luces parecían avanzar de a pares. Las ajustamos para marcar una huella derecha y luego una izquierda, como al caminar. También usamos la franja circular del techo como pantalla de la sesión: muestra la hora, quién está hablando y una cuenta regresiva de 15 minutos. Repetimos la información dos veces para verla desde distintos puestos y dejamos las paredes para las fotografías del contexto.

En este avance tomamos **solo la mesa del nuevo archivo sala 002.fbx** y reacomodamos las once sillas a su alrededor. Ajustamos su apoyo en el piso sin cambiar el tamaño del mueble. También hicimos que la proyección siga la forma ovalada de la mesa, porque una imagen rectangular se salía del tablero. El contenido ahora se organiza dentro de ese contorno.

## Escala, gráfica y puntos de vista

Revisamos las medidas antes de agrandar los muebles: mantuvimos la sala de **8 × 9 m** y las once sillas con el asiento a **47 cm**. La nueva mesa mide **2,27 × 2,80 m**, con el tablero a **76,3 cm** del piso. Podemos sentarnos virtualmente, mirar alrededor desde una altura de ojos de **1,18 m** y volver a caminar. Esto nos permite comparar la experiencia de pie y sentados.

La nueva referencia gráfica del equipo nos llevó a usar los seis colores de La Reina, fondos blancos, círculos y formas redondeadas en el contenido de la mesa. Las fotografías mantienen sus colores originales. Ambos contenidos siguen siendo MP4 reemplazables.

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
</table>

Por ahora es una **representación conceptual**, sin datos municipales en tiempo real. Las ubicaciones de los proyectores son provisionales y falta comprobar la experiencia en un visor Meta Quest.

Revisamos también la posibilidad de mostrar el mapa gestual funcionando en vivo sobre la mesa: es viable conservar la aplicación que ya probamos y conectar su imagen, pero esa integración todavía no está aplicada.

**Fuentes:** [propuesta espacial del equipo](../propuestaEspacialMLR/README.md), [referencia gráfica entregada para este avance](./Documentacion/paleta-referencia.json) [fotografías oficiales del panorama](./Documentacion/fuentes-panorama.json) y [marca y tipografía de la pantalla](./Documentacion/ceiling_assets_provenance.json).
