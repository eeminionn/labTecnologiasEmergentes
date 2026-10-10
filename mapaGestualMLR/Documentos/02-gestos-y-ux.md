# Gestos, UX y Google Maps

> **Nota de vigencia · 0.1.13 · 9 de octubre de 2026.** Cámara **frontal apuntando hacia la persona**, manos completas en encuadre, luz uniforme y todo el encuadre mapeado al mapa. Sustituye el montaje cenital inicial; la investigación de abajo se conserva como antecedente. Los gestos se mantienen desde 0.1.12. Mantener la **punta del índice, landmark 8, sobre un objetivo seleccionable 1500 ms**; sin exigir índice extendido ni otros dedos recogidos. Los cambios de esos dedos no vetan selección por postura. Prioridad: **dos OK → zoom; mano no puño con índice sobre objetivo → selección; uno o dos puños → pan**. Aro/destino anclados en región amplia; salir reinicia el tiempo y, después de clicar, salir del destino original **120 ms** rearma sin retraer el índice. No hay dwell sobre mapa vacío. Acompañante por identidad, modelo/SDK/pesos y controles de calidad se conservan. La evidencia aprobada de 0.1.12 queda histórica; verificación y paquetes vigentes en la entrega. El fallo físico informado tras las pruebas sintéticas de 0.1.11 motiva retirar el veto de otros dedos; sus [reportes Mac](./verificacion-paquete-mac-0.1.11.json) y [Windows](./verificacion-paquete-windows-0.1.11.json) quedan históricos. Detalles en [protocolo](./03-protocolo-validacion.md), [bitácora](./08-historial-tecnico.md#9-de-octubre---selección-por-permanencia-sobre-objetivo-en-0112), [selección](./05-meta-quest-y-seleccion.md) y [entrega](./04-entrega-y-verificacion.md). La investigación inicial de abajo se conserva como antecedente.

Fecha de consulta: 5 de octubre de 2026. Documento de investigación y decisiones propuestas. Los valores temporales y geométricos siguientes son parámetros iniciales de ingeniería; no son resultados medidos ni umbrales universales publicados.

## Decisión de interacción

Usar un vocabulario pequeño y una máquina de estados encima del detector de manos. Reconocer una mano no debe ejecutar una acción. Separar **apuntar**, **seleccionar**, **desplazar**, **zoom** y **reposo**. La precisión de los landmarks, el estado temporal y la instalación de la cámara determinan los falsos positivos de acciones tanto como el modelo.

| Intención | Gesto propuesto | Condición de activación | Efecto y salida |
| --- | --- | --- | --- |
| Apuntar | Índice extendido, resto recogido; pulgar relajado | Mano dominante adquirida de forma estable | La punta del índice mueve la sombra azul; no mueve el mapa |
| Seleccionar | OK: pulgar e índice se acercan, al menos 2 de los otros 3 dedos extendidos | Viene desde puntero/neutral armado, posición estable y cierre mantenido al menos 220 ms; una mano de control | Un click al soltar el OK confirmado; mantener el OK no repite |
| Desplazar | Palma abierta con 4 dedos largos extendidos | Mantener 180–220 ms y superar desplazamiento mínimo | Arrastre relativo según centro de palma; cerrar o perder mano termina |
| Acercar/alejar | Dos manos en OK; separar/acercar ambas | Dos tracks fiables, dos cierres sostenidos 180–220 ms | Zoom según distancia relativa; soltar cualquiera termina |
| Descansar | Mano recogida o fuera del área activa | Inmediato | No hay acciones; cursor se desvanece |
| Pausa explícita | Botón y barra espaciadora | Siempre disponible | Congela interacción y muestra estado breve |

La exigencia de extender los dedos restantes ayuda a distinguir el OK de recoger un objeto o de un pinch casual. Si perjudica a participantes con movilidad reducida, ofrecer un perfil de pinch simple calibrado, con mayor estabilidad temporal. Eso requiere validación; no atribuirle menor tasa de falsos positivos sin datos.

**Límite óptico:** una cámara RGB cenital puede medir proximidad proyectada entre dedos, pero no certificar contacto físico ni que exista un círculo cerrado. El software reconoce una geometría compatible con OK. La vista cenital puede mostrar el dorso; evaluar precisamente esa orientación.

## Referentes primarios y qué aportan

### Gestos definidos por usuarios

Wobbrock, Morris y Wilson (CHI 2009) elicitaron 1.080 gestos de 20 participantes para 27 comandos. Mostraron el efecto deseado y pidieron a los participantes producir el gesto, en lugar de enseñar previamente una solución. El vocabulario resultante incluye arrastrar la mano para pan y separar manos para zoom. La familiaridad con interfaces anteriores influye en las propuestas; no todos los comandos alcanzaron acuerdo alto. Esto respalda empezar con pan/zoom reconocibles y después contrastar el vocabulario con usuarios municipales. No prueba que OK sea el mejor click ni que los gestos táctiles funcionen igual en una cámara cenital sin contacto. [Artículo original, Microsoft Research](https://www.microsoft.com/en-us/research/wp-content/uploads/2009/04/SurfaceGestures_CHI2009.pdf), DOI [10.1145/1518701.1518866](https://doi.org/10.1145/1518701.1518866).

### Navegación de mapas y fatiga

Satriadi et al. (IEEE VR 2019) estudiaron navegación libre de mapas horizontales, comparando una y dos manos y control por posición o velocidad. Sus técnicas híbridas DiveZoom y TerraceZoom redujeron fatiga percibida con impacto limitado en rendimiento dentro de su instalación AR. El prototipo actual usa primero control por posición y descansos; evaluar un modo por velocidad después si los grandes desplazamientos exigen demasiado esfuerzo. No trasladar cifras de rendimiento de AR a RGB cenital. [Laboratorio de los autores](https://ilab.ucalgary.ca/publications/vr-2019-satriadi/), DOI [10.1109/VR.2019.8798340](https://doi.org/10.1109/VR.2019.8798340).

Hincapié-Ramos et al. (CHI 2014) propusieron Consumed Endurance para cuantificar fatiga del hombro y estudiaron extensión de brazo, ubicación del plano y selección. La relación entre el esfuerzo y la geometría de la interacción justifica permitir codos cerca del cuerpo, manos bajas, superficie de apoyo y pausas. Su métrica requiere información del brazo y hombro; 21 landmarks de manos no bastan para calcularla honestamente. Para este prototipo recoger confort y esfuerzo percibido por bloques de tareas. [PDF alojado por el autor](https://blog.jhincapie.com/wp-content/uploads/2010/02/ga-final.pdf), DOI [10.1145/2556288.2557130](https://doi.org/10.1145/2556288.2557130).

### Suavizado del cursor

Casiez, Roussel y Vogel (CHI 2012) propusieron el filtro 1€: baja frecuencia de corte a baja velocidad para reducir temblor y aumento de corte al acelerar para limitar retraso. Los autores recomiendan ajustar primero `minCutoff` con `beta=0` en reposo y después aumentar `beta` durante movimientos rápidos. `beta` depende de las unidades. Usarlo en coordenadas de pantalla o calibradas, con timestamps reales; repetir la calibración si cambian las unidades. Este filtro suaviza la señal, pero no mejora por sí solo el reconocimiento de intención. [Página y código de los autores](https://gery.casiez.net/1euro/), DOI [10.1145/2207676.2208639](https://doi.org/10.1145/2207676.2208639).

## Máquina de estados que reduce acciones accidentales

Estados conceptuales mínimos: `PAUSED`, `IDLE`, `ACQUIRING`, `POINTING`, `CLICK_PENDING`, `CLICK_CONFIRMED`, `PAN_PENDING`, `PANNING`, `ZOOM_PENDING`, `ZOOMING`, `LOST`. Los nombres concretos en código pueden variar. Cada frame aporta evidencia; sólo una transición confirmada emite una acción.

1. Exigir adquisición estable antes de armar acciones. Propuesta inicial: 180–250 ms de detección válida. Si una mano entra ya en OK, no clickear hasta observar primero apertura y modo de apuntar/neutral. Esto evita el click al introducir una mano pinzada.
2. Asignar identidad de control por continuidad espacial, no por el orden de la lista devuelta por el modelo. Asociar centros de palma y escala entre frames. No intercambiar mano dominante al cruzarse las manos; ante ambigüedad, detener acciones y readquirir.
3. Validar ROI, escala mínima de palma, landmarks dentro del frame, geometría finita y movimiento plausible. Rechazar frames antiguos o repetidos. La clasificación de handedness no es una probabilidad de detección de mano y no debe usarse como tal.
4. Usar prioridad `PAUSED/LOST > ZOOM > CLICK > PAN > POINT`. Si hay dos manos en el área activa, dar una ventana al candidato de zoom y suprimir clicks individuales hasta que se resuelva. Un pinch transitorio de la segunda mano no debe enviar un click antes de adquirir zoom.
5. Para click, congelar el objetivo al entrar a `CLICK_PENDING`, usando la última posición estable del índice. El cierre del índice desplaza su propia punta y no debería mover el click a un objetivo vecino. Cancelar si la mano se mueve demasiado, aparece una segunda mano o disminuye la validez.
6. La implementación inicial **selecciona al soltar**: mantener OK estable al menos 220 ms confirma el candidato; conservar el objetivo congelado mientras sigue cerrado; emitir exactamente un click cuando una apertura válida termina ese OK. Si se pierde la mano, entra zoom, se excede el movimiento permitido o se pausa, cancelar sin click al recuperar. Mantener cerrado nunca repite. Después exigir apertura/neutral estable para rearmar y aplicar cooldown. Un cierre demasiado corto no ejecuta nada. El tiempo, no el número de frames, mantiene comportamiento similar a 15/30/60 FPS. Esta elección y los 220 ms son decisiones experimentales del prototipo; comparar click al cierre y al soltar en pruebas de usuarios antes de considerarlos definitivos.
7. Para pan, acumular evidencia de palma y un movimiento superior a una zona muerta inicial de 5–8 px de pantalla. Guardar el ancla al activar pan; no aplicar retroactivamente todo el movimiento del candidato. Tras soltar, permitir reposicionar la mano sin arrastrar: esta desconexión se denomina clutch.
8. Si falta un frame o cae la validez, suspender inmediatamente nuevas acciones. Una tolerancia corta, por ejemplo 80 ms, puede conservar identidad y cursor; no extrapolar clicks ni continuar arrastrando a ciegas. Una pérdida superior a 150–200 ms debe reiniciar filtros, anclas, candidatos y rearmado. Estos tiempos deben contrastarse con oclusiones reales.
9. Deshabilitar inercia al principio. El mapa debe parar al terminar el gesto. Añadirla después sólo si mejora tareas reales sin errores ni mareo.

### Geometría normalizada e histéresis

El motor define `s = max(distancia(muñeca, MCP medio), distancia(MCP índice, MCP meñique))` y `r = distancia(punta pulgar, punta índice) / s`. Medir en píxeles corrigiendo la relación ancho/alto de imagen: distancia euclídea en coordenadas x/y normalizadas sin corregir aspecto deforma los ángulos y ratios. Rechazar `s` demasiado pequeña.

Valores implementados iniciales, **no prescritos por literatura**: cerrar si `r ≤ 0,28`; abrir si `r > 0,40`; conservar estado entre ambos. Ajustar por percentiles de apertura/cierre de cada participante y comprobar que las distribuciones se separan. Añadir rectitud y flexión por ángulos de articulaciones, con tolerancia, en vez de comparar solamente posiciones verticales que cambian al rotar la mano. No exigir la misma orientación de muñeca a todos.

Filtrar cursor y centro de palma; evaluar también distancia intermanos para zoom. Evitar un filtro demasiado lento en la evidencia discreta de cierre: la intención temporal ya se estabiliza con histéresis y duración. Reiniciar el filtro cuando cambie la identidad o la calibración.

### Zoom en dos dimensiones

Guardar distancia inicial `d0`, zoom inicial `z0` y punto de interés al entrar al modo. Usar `z = z0 + g·log2(d/d0)`, con ganancia ajustable, zona muerta relativa inicial de 3–5 % y límites. Duplicar la separación aumenta aproximadamente un nivel para `g=1`. Comprobar separaciones mínima/máxima, manos dentro del ROI y continuidad; limitar incrementos para que una asociación equivocada no genere saltos.

No usar la coordenada `z` estimada por una cámara monocular como distancia física fiable para acercar o alejar: depende de escala, oclusión y modelo. Zoom por separación de manos en el plano calibrado resulta observable y repetible. El adaptador v1 mantiene el zoom alrededor del punto entre manos, transformando píxel–coordenada y reajustando el centro para mantener el ancla geográfica. Su recorrido Google real sigue pendiente de prueba con API key.

## Instalación y calibración cenital

- Fijar la cámara para cubrir una zona cómoda; bloquear autofocus/exposición si el hardware lo permite y comprobar que conserva detalle al mover manos. Luz difusa constante, sin reflejos ni contraluz. Mesa mate y contraste; no depender del color de piel.
- Mostrar un área activa y una zona de reposo durante calibración. Si sólo se marca un rectángulo, usar mapeo afín de esa región. Si la instalación requiere perspectiva real, capturar cuatro correspondencias y homografía. La homografía calibra un plano: no corrige manos que cambian mucho de altura.
- Verificar orientación y espejo con cuatro objetivos: izquierda, derecha, arriba y abajo. Preferir orientación de mapa coherente con la vista del participante; no inferir lateralidad de coordenadas de imagen.
- Calibrar con manos abiertas y OK: escala, separación de dedos y temblor. Elegir mano de control y permitir perfil izquierdo. Guardar configuración de cámara/ROI localmente; no guardar imágenes por defecto.
- Validar puntero antes de activar control. Si falla el detector, mostrar estado corto y conservar mouse/teclado para recalibrar.

## UX: Stanford, GitHub y la sombra azul

No existe una lista universal verificable de «todas las leyes UX/UI de Stanford» que permita certificar una interfaz. CS147 enseña diseño, prototipado y evaluación, incluida evaluación heurística. Sus materiales de 2025 trabajan con las heurísticas de Nielsen y añaden accesibilidad. Aplicar ese método y documentar problemas observados es más riguroso que prometer conformidad absoluta. [Curso CS147](https://hci.stanford.edu/courses/cs147/2023/au/) y [clase de evaluación heurística 2025](https://hci.stanford.edu/courses/cs147/2025/au/lectures/12-heuristic-evaluation.pdf).

Primer, sistema de diseño de GitHub, recomienda contenido enfocado, orden predecible y experiencias limpias. Sus guías de accesibilidad cubren foco, botones, color y movimiento. Adoptar su lenguaje de bordes finos, tipografía del sistema, espacios consistentes y controles sobrios. No copiar el logotipo de GitHub ni introducir paneles que el usuario no necesita. [Layout de Primer](https://primer.style/product/getting-started/foundations/layout/) y [guías de accesibilidad](https://primer.style/accessibility/design-guidance/).

### Propuesta visual mínima

- Mapa ocupa el área principal; barra compacta con cámara, pausa y configuración. Estado breve sólo cuando aporta información: «Calibrar», «Mano perdida», «Pausado».
- Configuración en panel desplegable: cámara, ROI, espejo, sensibilidad y modo de mapa. Diagnóstico técnico (FPS, landmarks, ratios y latencia) dentro de una opción de desarrollo, apagada en operación normal.
- Popup muestra nombre, dato pertinente y cierre. Sin lorem ipsum, eslóganes futuristas ni indicadores permanentes redundantes.
- Atribución cartográfica permanece visible. La petición de limpieza visual no autoriza quitar atribución obligatoria Google.
- Todos los controles con nombres accesibles y foco visible. Mouse y teclado siguen disponibles. Esc cierra panel/popup y pausa el control si es necesario; no construir una experiencia exclusivamente gestual.

Sombra azul propuesta: capa propia con `pointer-events:none`, gradiente radial `rgba(47,129,247,0.22)` en el centro a transparente en el borde, radio inicial 24–34 px y blur suave. Seguir el cursor filtrado; al confirmar click, expandir y desvanecer brevemente durante 180–260 ms. Mantener un centro/ring discreto que ayude a acertar objetivos; la sombra difusa sola puede ocultar el punto exacto. Adaptar al modo de movimiento reducido y evitar que cubra atribuciones. Diferenciar puntero preparado/click mediante forma o expansión, además de color.

### Evaluación de UX pendiente

Revisión por 3–5 evaluadores con heurísticas, seguida por usuarios representativos. Tareas: ubicar un servicio municipal, acercarse, abrir su ficha, cerrarla y volver a una vista amplia. Registrar éxito, tiempo, errores, solicitudes de ayuda, rearmados, fatiga y preferencia. Una evaluación heurística orienta correcciones; la usabilidad requiere observación de usuarios.

## Google Maps dentro de software propio

Electron puede empaquetar la aplicación y renderizar su interfaz con Chromium. Usar Maps JavaScript API en esa ventana cumple una arquitectura de software propio: el programa es dueño de la cámara, detector, estados, interfaz y comandos. No automatiza Chrome ni la página `maps.google.com`. No llamar a esta integración un SDK nativo de escritorio: la capa de mapa sigue siendo un renderer web embebido.

Arquitectura inicial acordada: app Electron y servidor de UI en `http://127.0.0.1:47831`, bridge mínimo de preload e IPC validado, click enviado exclusivamente al WebContents de la propia app. Equipo objetivo principal: macOS arm64 y cámara USB cenital. Se prepara también distribución Windows `.exe`; compilarla desde otro sistema no demuestra compatibilidad, cámara ni latencia en Windows. Registrar por separado build, ejecución básica y ensayo con cámara por plataforma.

### Qué expone la API

`panBy(x,y)`, `setCenter`, `setZoom` y `moveCamera` controlan la vista. `panBy` anima desplazamientos pequeños; limitar/coalescer actualizaciones y comprobar que no se acumulan transiciones. `isFractionalZoomEnabled` habilita zoom fraccional, con valores por defecto distintos en vector/raster; un mapa vectorial puede caer a raster por capacidad del dispositivo. `Map.click` entrega `latLng` o `placeId` cuando el usuario selecciona un icono POI. Marcadores e InfoWindows no envían ese click al mapa. La documentación desaconseja depender de su DOM interno. [Referencia oficial Map](https://developers.google.com/maps/documentation/javascript/reference/map).

### Click de gestos y popups

Para capas municipales propias, conservar geometría de objetivos y hit-testing explícito: el click del motor invoca una acción propia, abre una ficha propia o selecciona un marcador. Botones de los popups pertenecen a la aplicación y pueden ejecutar handlers normales tras validar coordenadas.

**No confundir disparar un evento con resolver un POI:** `google.maps.event.trigger(map, 'click', {latLng})` notifica listeners con un evento artificial; no obtiene automáticamente el `placeId` del icono visual bajo esas coordenadas. La API no documenta un método público «pixel → POI del basemap». Si el prototipo debe seleccionar POIs Google nativos, enviar `mouseMove`, `mouseDown` y `mouseUp` al **WebContents de la propia ventana** y dejar que Maps genere su `IconMouseEvent`; comprobar escala, foco y recorrido completo de input. `webContents.sendInputEvent()` requiere que la ventana esté enfocada. [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents/).

Un listener oficial puede usar `event.placeId`, `event.stop()` y `Place.fetchFields()` para mostrar una ficha de campos limitados. No realizar Places Nearby Search en cada click para fingir exactitud: devuelve cercanía geográfica, no el icono seleccionado, y añade solicitudes. [Ejemplo oficial POI](https://developers.google.com/maps/documentation/javascript/examples/event-poi).

### Keys, facturación y distribución

Google documenta API key y facturación para uso estándar de producción. También existe una Maps Demo Key para probar características seleccionadas sin facturación, con alcance de prototipo. No prometer gratuidad ni disponibilidad completa para el municipio. [Configuración oficial](https://developers.google.com/maps/documentation/javascript/get-api-key).

Las keys cliente son visibles y se protegen restringiendo APIs y origen; guardarlas fuera de Git evita filtración accidental, pero no las vuelve secretas en un ejecutable distribuido. Google admite referrers `http/https` y advierte fallos con `file://` o esquemas locales opacos. Para la demo, usar loopback `http://127.0.0.1:47831` y restringir ese origen; verificar requests reales antes de declarar integración lista. Para despliegue municipal, valorar alojar sólo la capa del mapa en un origen HTTPS administrado y cargarla dentro de la app; la visión puede seguir local. Si se requiere acceso a web services, revisar separación de keys y una capa servidor. [Guía de seguridad oficial](https://developers.google.com/maps/api-security-best-practices).

Google exige atribución visible y sin modificaciones; los resultados y contenidos tienen requisitos de uso y almacenamiento, además de términos y privacidad accesibles. Si el mapa ya muestra la atribución incluida, conservarla sin duplicarla. Mostrar sólo campos necesarios en fichas reduce complejidad. [Políticas y atribuciones oficiales](https://developers.google.com/maps/documentation/javascript/policies).

### Modo OpenStreetMap cuando falta key

La aplicación puede iniciar con mapa real de OpenStreetMap y fichas propias para probar cámara y motor sin credenciales Google. Identificarlo claramente en configuración: no presentar OSM como Google Maps ni mezclar contenidos Places con esa capa. Google queda como proveedor configurable cuando exista key autorizada. No prometer equivalencia de POIs, estilos o popups entre proveedores.

El servicio estándar `tile.openstreetmap.org` permite visualización interactiva moderada, pero no ofrece SLA. Exige atribución visible, identificación válida del cliente y respeto de caché; prohíbe descarga masiva, precarga de regiones y funcionalidades de mapas offline. Configurar User-Agent identificando esta app, enviar referrer desde loopback y conservar caché HTTP del renderer. Los datos OSM requieren atribución y enlace de licencia. Para una instalación municipal permanente, contratar o autoalojar un servicio apropiado; no asumir que los servidores comunitarios son infraestructura garantizada. [Política oficial de tiles](https://operations.osmfoundation.org/policies/tiles/) y [licencia OSM](https://www.openstreetmap.org/copyright).

### Seguridad técnica pertinente

Para Electron con scripts remotos de mapas: `nodeIntegration:false`, `contextIsolation:true`, sandbox de renderer, preload con API mínima, IPC validado, navegación limitada y permisos de cámara restringidos al origen de la app. No publicar acceso genérico a shell, filesystem o `ipcRenderer` al renderer. Son recomendaciones oficiales de Electron. [Seguridad de Electron](https://github.com/electron/electron/blob/main/docs/tutorial/security.md).

## Plan de validación para falsos positivos

El objetivo principal es tasa de **acciones accidentales por hora**, además de precisión por frame. Preparar sesiones negativas con conversar, escribir, señalar sin seleccionar, descansar, recoger objetos, mangas, guantes si forman parte del uso, entrada/salida de manos, cruces, gente al lado y luz variable. No evaluar sólo clips de OK perfectos.

Guardar logs de timestamps, identidad, estado, ratios, validez y acciones, sin video por defecto. Si se capturan clips para investigar fallos, hacerlo con consentimiento y datos de sesión anonimizados. Separar entrenamiento/calibración, validación y test por persona/sesión/instalación: frames del mismo video a ambos lados de una división dan estimaciones optimistas.

Medir:

| Métrica | Cómo interpretarla |
| --- | --- |
| Clicks accidentales/hora | Principal medida de reposo y acciones cotidianas; informar duración observada |
| Precisión de eventos | Clicks intencionales / clicks emitidos; emparejar eventos con anotación temporal |
| Recall de comandos | Intenciones que completan acción dentro de ventana tolerada |
| Latencia p50/p95 | Separar captura, inferencia, máquina de estados, renderer y extremo a extremo |
| Jitter de cursor | Dispersión en píxeles durante mano quieta y mapeo fijado |
| Pérdidas y recuperación | Duración, acciones posteriores y saltos de cursor/anclas |
| Confusión click/zoom/pan | Matriz de intención vs acción, particularmente al entrar la segunda mano |
| Éxito de selección | Botones de varios tamaños, distancias, popup y POI real |
| Confort | Esfuerzo por bloques y observaciones de codo/hombro |

Propuestas de aceptación para decidir un piloto, no rendimientos obtenidos: ausencia de repetición por OK sostenido; cero acciones durante pausa/oclusiones; ≥95 % de éxito de tareas ensayadas; p95 de cursor por debajo de 100 ms en equipo objetivo; p95 de selección por debajo de 350 ms contando confirmación. Ajustar objetivos con usuarios y capacidad de cámara.

Para un objetivo de menos de 1 click accidental/hora, una hora sin errores no basta. Bajo un modelo Poisson simple, cero eventos durante `T` horas implica un límite superior unilateral aproximado de 95 % `−ln(0,05)/T ≈ 3/T` eventos/hora. Hacen falta más de 3 horas sin errores para que ese límite sea menor que 1/hora. Reportar que el supuesto Poisson y las condiciones representativas pueden fallar si hay errores agrupados; ampliar situaciones y usuarios. Para <0,1/hora se requieren >30 horas sin eventos bajo ese supuesto. Esta cuenta es una propuesta de análisis, no evidencia de fiabilidad del prototipo.

## Alcance de esta recomendación

El vocabulario y los umbrales son una hipótesis inicial consistente con la instalación y los referentes, pendiente de usuarios y pruebas de hardware. La prioridad es conseguir tracking cenital, estados reproducibles y acciones auditables. La estética final y gestos adicionales deben evolucionar con resultados; no añadir reconocimiento complejo hasta identificar fallos que el detector, geometría y estados actuales no resuelven.
