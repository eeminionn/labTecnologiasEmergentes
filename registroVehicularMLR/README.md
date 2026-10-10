# Registro Vehicular MLR

Aplicación móvil para medir semáforos y contar autos en cruces de La Reina. Aporta al levantamiento en terreno: reúne tiempos, conteos y ubicación para revisar las mediciones después.

[Abrir la aplicación](https://eeminionn.github.io/labTecnologiasEmergentes/registroVehicularMLR/) · [Revisar la bitácora](./BITACORA.md)

## Cómo funciona

- Mide el verde y el rojo con un cronómetro de inicio y pausa.
- Cuenta autos con un botón grande mientras se mide el verde.
- Guarda cruce, dirección, día, horario, duraciones y total de autos.
- Ordena los registros por día y permite filtrarlos por fecha, cruce y dirección.
- Permite entrar con Google, compartir mediciones y borrar los registros propios con confirmación.

## Decisiones del avance

Partimos desde el celular porque la herramienta se usa parado en la calle. Concentramos el conteo en un botón grande y evitamos menús largos para poder mirar el cruce mientras se registra.

Después cambiamos los tiempos escritos a mano por la medición del verde y el rojo observados. El registro se habilita cuando ambos están medidos y el contador responde sólo durante el verde.

Al probar otra cuenta, abrimos el acceso a cualquier persona que inicie sesión con Google. Las mediciones quedan compartidas, pero cada persona conserva el control sobre el borrado de sus registros.

Documentación técnica: [Documentos](./Documentos/).
