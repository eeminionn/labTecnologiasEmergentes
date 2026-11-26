# Evaluación de usabilidad y próximas capas

10 de noviembre de 2026 · Mapa Gestual La Reina 0.8.0

Revisamos la versión 0.7.1 desde la perspectiva de una autoridad municipal que abre el mapa por primera vez: localizar robos, cambiar la fecha, consultar un sector y compararlo con cámaras. Es una revisión experta, sin participantes. Aplicamos las [diez heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/) y priorizamos los problemas según su [gravedad](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/): 3 = mayor, 2 = menor, 1 = de presentación.

| Heurística | Hallazgo y ajuste |
|---|---|
| Visibilidad del estado · 3 | El resultado quedaba separado de la selección. La tarjeta reúne total, fecha y horario; cámaras muestra el corte del inventario. |
| Lenguaje familiar · 2 | «Seguridad» podía referirse a ambas capas. Usamos «Robos», «Cámaras» y «Horario», con las horas de cada franja. |
| Control y libertad · 2 | Había dos salidas del análisis. Quedaron «Volver al mapa» arriba, «Restablecer filtros» en el panel y pausa y deslizador en el recorrido. |
| Consistencia · 2 | Los filtros competían con los botones de acción. Ambos paneles comparten orden, estilos y etiquetas; cada capa conserva su leyenda. |
| Prevención de errores · 3 | Los colores podían confundirse con riesgo absoluto. La leyenda indica concentración relativa; comparar conserva visibles los períodos de ambas capas. |
| Reconocer antes que recordar · 3 | Había que reconstruir qué filtros estaban activos. Los selectores muestran su valor y despliegan las opciones al abrirlos. |
| Flexibilidad y eficiencia · 2 | La comparación pedía una selección redundante. Abre la segunda capa en un paso; se puede ajustar cada lado. El recorrido diario dura ocho segundos. |
| Diseño y jerarquía · 3 | Capa, filtros y acciones tenían el mismo peso. El orden ahora es qué ver, resultados, filtros y lectura; retiramos acciones y filtros secundarios. |
| Recuperación ante errores · 2 | Un resultado vacío podía parecer un problema del mapa. Se distingue sin resultados de error de carga y se indica cómo recuperar la consulta. |
| Ayuda · 1 | La ficha del sector y el deslizador no eran evidentes. Agregamos una instrucción breve junto a cada uno. |

La [identidad de La Reina](https://lareina.cl/nuestra-imagen/) y las fichas de la [Cuenta Pública 2025](https://www.lareina.cl/wp-content/uploads/2026/04/CP-2025.pdf) guiaron el uso de acentos, cifras grandes y etiquetas breves. En la interfaz, el azul petróleo indica selección y acción; morado y petróleo distinguen los resultados de robos y cámaras. Conservamos la tipografía del proyecto, el vidrio claro y leyendas con texto. El verde a rojo se reserva para la concentración relativa de robos; el azul se reserva para los datos de cámaras sobre el mapa.

La próxima validación debería observar si personal municipal puede localizar los robos de un mes, explicar el significado del rojo y añadir o quitar cámaras sin ayuda. Los datos de robos son de demostración. Los cortes temporales se interpretan por separado: proximidad a una cámara no implica cobertura y el recorrido muestra una transición entre franjas agregadas.

## Capas sugeridas

| Capa | Uso y disponibilidad |
|---|---|
| **Puntos fijos de seguridad ciudadana** | Mostrar centros de atención, con ubicación y horario. Hay ubicaciones documentadas para [Mariano Sánchez Fontecilla con Eliécer Parada](https://lareina.cl/nuevo-avance-en-seguridad-la-reina-tiene-su-primer-centro-de-atencion-integral/) y [Fidias con Leonardo da Vinci](https://lareina.cl/estado-de-emergencia/). |
| **Botones de emergencia** | Ubicar dispositivos de acceso público y distinguir los que están dentro de recintos. El municipio informó instalaciones en [paraderos](https://www.lareina.cl/wp-content/uploads/2024/10/Revista-CP-2024-mod.pdf#page=14) y [un piloto en recintos](https://lareina.cl/la-reina-incorpora-botones-de-panico-en-lugares-estrategicos-de-la-comuna/). Falta verificar las coordenadas, el acceso y la operación de cada punto. |
| **Anegamientos e inundaciones** | Marcar 28 puntos históricos y cruzarlos con rutas y equipamiento. El [anexo comunal 2025–2027](https://www.lareina.cl/wp-content/uploads/2025/09/ANEXO_PLAN_AMENAZA_INUNDACIONES_2025-2027.pdf#page=6) identifica cruces como Tobalaba con La Cañada. |
| **Albergues y servicios de respuesta** | Ubicar albergues predesignados y servicios de Bomberos, Carabineros y salud. El [Plan Comunal de Emergencia](https://www.lareina.cl/wp-content/uploads/2025/09/PLAN_COMUNAL_EMERGENCIA_LAREINA_2025-2027.pdf#page=49) lista cuatro albergues; su disponibilidad depende de la activación. |
| **Aluviones y rutas de evacuación** | Dibujar rutas seguras y marcar señalética o sensores donde se disponga de coordenadas. [La Reina Preparada](https://lareina.cl/la-reina-preparada-3/) identifica los ejes de Bilbao y Fernando Castillo Velasco. |
| **Amenaza de incendio forestal** | Delimitar zonas expuestas y cruzarlas con rutas o servicios de respuesta. Fuentes: [anexo municipal](https://www.lareina.cl/wp-content/uploads/2025/09/ANEXO_PLAN_AMENAZA_INCENDIO_FORESTAL_2025-2027.pdf) y [Visor Chile Preparado](https://www.senapred.cl/visor-chile-preparado/). |
| **Siniestros viales** | Localizar cruces con incidentes y explorar horarios. [CONASET registró 183 siniestros en la comuna en 2024](https://www.conaset.cl/wp-content/uploads/2025/10/La-Reina.pdf#page=2); hay que confirmar el detalle geográfico antes de trazar los puntos. |

Empezar por **puntos fijos, anegamientos y albergues**: ya cuentan con referencias territoriales. Incorporar botones de emergencia cuando se pueda verificar el inventario operativo.
