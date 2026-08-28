# Bitácora

## 24 de agosto de 2026

### Punto de partida

La idea era hacer una herramienta muy directa para usar parado en la calle. Por eso partí pensando todo desde el celular y dejé fuera gráficos, menús largos y textos que distraen.

### Interfaz

Armé dos semáforos dibujados. El estado elegido queda brillante y el otro baja bastante su opacidad, así se entiende rápido incluso mirando de reojo.

El conteo quedó concentrado en un botón verde grande. También agregué vibración corta, botón para corregir un auto y un temporizador que pasa de verde a rojo usando los segundos definidos.

### Datos

Cada ciclo guarda:

- cruce;
- dirección;
- fecha y hora de Santiago;
- segundos de verde y rojo;
- cantidad de autos;
- inicio y cierre del verde.

Los registros se ven en una segunda pestaña, ordenados por día. Se pueden filtrar por fecha, cruce y dirección.

### Firebase

Creé el proyecto `registro-vehicular-mlr` y una base Firestore Standard en Santiago. Dejé Google como acceso y protegí la colección para que solo funcione con la cuenta autorizada. La aplicación no guarda nombre, correo ni otros datos personales dentro de los registros.

También revisé las reglas contra lecturas públicas, cuentas ajenas, campos inventados, valores enormes, cambios de propietario y modificaciones o eliminaciones posteriores.

### Pruebas

Probé la pantalla a 390 × 844 px, revisé el cambio de estados, el conteo, el temporizador, los filtros y las tarjetas del historial. Las pruebas automáticas y la construcción de producción quedaron pasando sin errores.

### Publicación

Preparé un flujo de GitHub Pages que prueba y construye la app antes de publicarla. Todo el código, la configuración, las pruebas y esta bitácora viven dentro de `registroVehicularMLR`; solo el archivo obligatorio del flujo queda en `.github/workflows`.

### Segundo ajuste

Reemplacé los tiempos escritos a mano por una medición real. Ahora se elige verde o rojo, se toca iniciar cuando comienza el color y se pausa justo cuando cambia. La app guarda el resultado de cada color y habilita el registro cuando los dos están medidos. El contador de autos solo responde mientras está corriendo el verde.

También sumé un botón para borrar registros desde el historial. Antes de eliminar aparece una confirmación con el cruce, la dirección y la cantidad de autos para evitar errores. En Firebase el borrado quedó limitado al dueño original del registro.

Renové toda la interfaz con una estética más cercana a Apple: fondo gris claro, tarjetas blancas, transparencias suaves, tipografía del sistema, controles redondeados y azul como color principal. El verde y el rojo quedan reservados para el semáforo y las alertas, así la lectura sigue siendo rápida en terreno.

### Acceso abierto con Google

Al probar con una segunda cuenta notamos que la regla inicial solo aceptaba mi correo. Cambié ese criterio para que cualquier persona que inicie sesión con Google pueda entrar, revisar los registros compartidos y sumar nuevas mediciones. Cada registro sigue guardando el UID de quien lo creó y solamente esa persona puede borrarlo; las cuentas sin sesión y otros métodos de acceso siguen bloqueados.

## 25 de agosto de 2026

### Uso en terreno

La aplicación dejó de ser solo una prueba y pasó a ser parte de la investigación. La usamos para registrar ciclos en distintos cruces de Salvador Izquierdo, Aguas Claras, Mateo de Toro y Zambrano, Príncipe de Gales y Padre Hurtado.

En una de las series reunimos 20 mediciones, 304 autos y un verde promedio de 39,6 segundos. También comparamos Padre Hurtado cerca de las 19:00 y de las 21:00. En hora punta el verde era más largo, pero pasaban menos autos por minuto. Eso nos mostró que guardar el horario y la duración completa del ciclo era tan importante como contar vehículos.

## 28 de agosto de 2026

### De la medición a una idea más grande

La app nos sirvió para comprobar que una herramienta pequeña puede ordenar datos que normalmente quedarían en notas, fotos o planillas separadas. Esa experiencia influyó en el nuevo enfoque del proyecto: pensar una plataforma territorial capaz de integrar información de tránsito, clima, infraestructura, seguridad y reportes vecinales.

Decidimos mantener Registro Vehicular MLR como un prototipo funcional y como ejemplo de una posible fuente de datos. La futura plataforma no tendría que reemplazarla, sino conectarse con herramientas como esta y mostrar su información junto a las demás capas del territorio.
