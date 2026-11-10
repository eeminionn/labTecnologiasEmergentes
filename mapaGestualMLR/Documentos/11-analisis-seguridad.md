# Análisis territorial

**Actualización:** 10 de noviembre de 2026 · versión 0.9.0

[Volver a la bitácora](../README.md#actualización-análisis-territorial)

## Seguridad

El [CSV de seguridad](../public/analysis/seguridad-simulada.csv) reúne 60.000 incidentes simulados entre 2023 y 2025. El mapa de calor muestra su concentración relativa de verde a rojo. Podemos combinar año o mes, horario y tipo de robo.

Los cuatro grupos de consulta son **Violencia o intimidación, Por sorpresa, De vehículos y En inmuebles**. El último reúne los registros del CSV en lugar habitado y no habitado. Son agrupaciones de navegación basadas en el [glosario de la Biblioteca del Congreso Nacional](https://www.bcn.cl/siit/reportescomunales/glosario.html), no una clasificación legal nueva.

## Cámaras y cruce

El [CSV de cámaras](../public/analysis/camaras-seguridad.csv) contiene 320 emplazamientos representativos. Podemos verlos como puntos cian o densidad azul, combinar Domo, Fija y Lectora de patentes, y filtrar por estado. El período muestra el inventario instalado hasta el cierre elegido.

**Añadir comparación** abre el catálogo y permite superponer una segunda capa, con filtros y visibilidad independientes a izquierda y derecha. Al pasar el mouse o el índice por el mapa, una ficha consulta un radio de 250 metros con los filtros activos. En robos incluye los últimos siete días del período; en cámaras indica el inventario al corte. La proximidad no acredita cobertura visual.

El ejemplo de 2024 se construyó con pocos equipos cerca de tres focos de incidentes para mostrar una posible lectura conjunta. Las [fuentes de cámaras](./12-camaras-fuentes.md) y los metadatos conservan la procedencia de los datos. No son estadísticas ni un catastro municipal vigente.

## Controles

El catálogo separa **Incidentes y vigilancia** de **Recursos de seguridad**. Los [puntos fijos y botones de emergencia](./15-fuentes-recursos-seguridad.md) se pueden abrir desde el mapa o desde la lista. Un clic en el mapa fija la ficha del sector; Escape la cierra. **Consultar centro del mapa** ofrece el mismo detalle con el teclado.

Los selectores de fecha aparecen después de elegir Año o Mes. El menú Horario muestra las franjas del día con sus horas. Los botones de tipos permiten añadir y quitar opciones; seleccionar todos o quitar el último vuelve a Todos. **Restablecer filtros** recupera la consulta inicial.

La barra inferior recorre el día en **ocho segundos**. Se puede pausar, arrastrar el deslizador entre 00:00 y 24:00 o seleccionar una marca con la mano. Los colores se mezclan gradualmente entre los cuatro tramos horarios. Cambiar un filtro de robos, ocultar esta capa o salir de Análisis detiene la reproducción; las cámaras conservan su representación.
