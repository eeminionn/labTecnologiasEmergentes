# Fuente cartográfica del análisis simulado

`calles-la-reina.json` conserva el extracto de vías públicas nombradas obtenido de diez descargas de la API pública de OpenStreetMap el 6 de noviembre de 2026. Incluye identificadores de vías, etiquetas y geometría. `fuentes-calles.json` registra las peticiones originales, tamaños y huellas SHA-256 de las respuestas completas, conservadas durante la preparación en `test-results/analisis-fuentes`.

La cartografía se distribuye con atribución a [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), bajo ODbL 1.0. El límite de la comuna proviene del archivo ya incluido en `assets/la-reina.geojson` (SUBDERE / IDE Chile, DPA 2023).

Estas fuentes aportan calles y cruces. **No aportan incidentes delictuales.** Todos los incidentes, fechas, horas, estados de resolución y números de calle del CSV son simulados. Los nombres de calles y los cruces proceden de la cartografía. Las coordenadas representan ubicaciones sobre la red vial, recortadas al límite comunal. No se incorporan noticias ni denuncias reales.

El generador reproducible es `scripts/prepare-analysis-data.py`, con semilla 20261106. Produce un intermedio CSV que se importa, verifica y serializa mediante Artifact Tool en la preparación de la entrega. Para regenerar el mismo contenido de datos sin acceso de red:

```sh
python3 scripts/prepare-analysis-data.py --intermediate public/analysis/seguridad-simulada.csv
```

La base tiene 60.000 filas para explorar filtros y densidades en la interfaz. Su tamaño no supone representatividad estadística de los delitos de La Reina. La distribución espacial, temporal y de resolución es una decisión de demostración, no un resultado de investigación.
