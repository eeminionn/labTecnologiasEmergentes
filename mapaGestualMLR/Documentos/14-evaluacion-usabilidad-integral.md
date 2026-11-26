# Evaluación de usabilidad del Mapa Gestual La Reina

10 de noviembre de 2026 · versión 0.9.0

Revisamos el mapa inicial, el visor de gráficos, el control por gestos, la ayuda, los ajustes y Análisis. Tomamos como referencia una reunión en la que un alcalde debe encontrar un sector, explicar qué muestran las cifras y volver a la vista general. La revisión se hizo sobre la versión 0.8.0 con sus capturas y comportamiento documentado. La gravedad se estimó según frecuencia, impacto y persistencia. Usamos 3 para problemas mayores, 2 para menores y 1 para presentación. [Heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Escala de gravedad](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/)

| Principio | Hallazgo en 0.8.0 | Respuesta de diseño en 0.9.0 |
|---|---|---|
| Visibilidad del estado · 3 | La cámara ocupaba espacio incluso apagada. Al perder el foco, costaba descubrir cómo reanudar. | Mostrar el estado junto al control de cámara y reservar la vista frontal para cuando aporte información. Hacer visible la acción de reanudar. |
| Lenguaje familiar · 2 | Un pin numerado y los símbolos del visor exigían recordar qué significaba cada acción. | Nombrar el caso y las acciones con palabras reconocibles. Usar las mismas etiquetas para las capas en el selector, la leyenda y la ficha. |
| Control y libertad · 3 | El atajo de pausa interceptaba Espacio sobre botones. La ficha desaparecía al mover el puntero para leerla. | Reservar Espacio para la acción nativa del control enfocado. Fijar la ficha con clic y cerrarla con Escape o su botón. |
| Consistencia · 2 | La leyenda de temas parecía interactiva. La comparación estaba diseñada para dos categorías concretas. | Distinguir acciones de referencias visuales. Usar el mismo catálogo para elegir la capa principal y una segunda capa opcional. |
| Prevención de errores · 3 | En el cruce podían confundirse dos fechas o interpretarse el color como una medida de riesgo absoluto. | Mostrar períodos independientes, concentración relativa y radio de consulta. En recursos, indicar fuente y alcance de la información disponible. |
| Reconocer antes que recordar · 3 | Había que descubrir que el pin 1 abría gráficos y que apuntar al mapa revelaba una ficha. | Dar acceso escrito a los gráficos y a la consulta. Agrupar el catálogo en «Incidentes y vigilancia» y «Recursos de seguridad». |
| Flexibilidad y eficiencia · 3 | El detalle del sector dependía de apuntar con el mouse o con la mano. | Conservar ambas formas de apuntar. Agregar la consulta del centro del mapa para teclado y un detalle seleccionable para los recursos. |
| Diseño y jerarquía · 2 | La vista frontal apagada y las opciones técnicas de cámara y cartografía competían con la tarea. | Dar prioridad al mapa y dejar la configuración técnica en opciones avanzadas. Mantener los filtros propios de cada capa. |
| Recuperación ante errores · 2 | Algunos errores de cámara eran técnicos, fugaces o mencionaban una cámara USB aunque se usara la integrada. | Expresar qué falló y cómo reintentar. Dejar visible la posibilidad de continuar con mouse y teclado. |
| Ayuda · 2 | Los párrafos de gestos obligaban a leer antes de saber por dónde empezar. | Organizar la ayuda por acciones y separar la primera consulta de las instrucciones para mover y ampliar el mapa con las manos. |

## Recorrido cognitivo

En cada paso se examinó si el objetivo era reconocible, si la acción estaba a la vista, si su nombre anticipaba el resultado y si había confirmación después de actuar. Este recorrido y la evaluación heurística fueron revisiones expertas sin participantes. [Método de Wharton, Rieman, Lewis y Polson](https://www.colorado.edu/ics/sites/default/files/attached-files/93-07.pdf)

| Tarea | Señal que permite completarla |
|---|---|
| Abrir los gráficos y volver al mapa con la cámara apagada | El mapa ofrece un acceso con nombre. El visor muestra la página y cómo volver. |
| Consultar robos de julio de 2024 | «Período» abre las fechas al elegir Mes. La tarjeta confirma el mes y la leyenda explica el color. |
| Leer las cifras de un sector y seguir conversando | Apuntar muestra la ficha con el radio de 250 m. El clic la fija y pausa el recorrido si se está reproduciendo. El teclado permite consultar el centro del mapa y cerrarla. |
| Cruzar robos con un punto fijo o un botón de emergencia | El catálogo reúne recursos en un grupo. La capa seleccionada se reconoce por nombre y símbolo. El detalle indica fuente y estado. |
| Probar gestos, cambiar de ventana y continuar | El estado indica si los gestos están disponibles o pausados. El control permite reanudar. |

## Verificación puntual de accesibilidad

- **Color y contraste.** Comprobar que nombres y símbolos diferencien las capas y que el gradiente de robos tenga etiquetas. El azul petróleo sobre blanco da 6,18:1 y el morado sobre su fondo claro da 8,71:1 para los colores nominales. Los acentos turquesa y lima quedan como decoración sobre superficies claras. Revisar contraste también sobre el mapa y con la transparencia aplicada.
- **Teclado y foco.** Revisar Tab, Enter, Espacio y Escape en el mapa, los selectores y la ficha. El foco debe verse y los paneles no deben cubrirlo por completo. Para los controles más frecuentes, preferir áreas amplias que también faciliten apuntar con la mano.
- **Contenido al apuntar.** Comprobar que se pueda pasar del mapa a la ficha sin perderla, cerrarla sin mover el puntero y fijarla para leer. La consulta mediante teclado debe mostrar el mismo tipo de información.

La verificación aplica criterios concretos de las Pautas de Accesibilidad para el Contenido Web 2.2. No certifica conformidad integral. La cámara física y el uso en una sesión real quedan para una prueba con alcaldes o personal municipal. Conviene observar si completan las tareas sin indicaciones, qué confunden en el cruce y si pueden explicar en voz alta el radio y el período de la ficha. [Pautas de accesibilidad](https://www.w3.org/TR/WCAG22/) · [Contenido al pasar el puntero o enfocar](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus)

[Fuentes de puntos fijos y botones de emergencia](./15-fuentes-recursos-seguridad.md)
