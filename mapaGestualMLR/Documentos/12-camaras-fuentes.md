# Cámaras de seguridad: fuentes

**Consulta:** 6 de noviembre de 2026

[Volver a la bitácora](../README.md#actualización-análisis-territorial)

El [CSV](../public/analysis/camaras-seguridad.csv) reúne **320 emplazamientos de demostración**. Once referencias de ubicación provienen de publicaciones municipales; las otras 309 se simularon sobre calles reales. Las coordenadas de estas referencias son aproximaciones al sector. **Fechas, tipos y estados son simulados en las 320 filas.**

## Referencias

| Fuente | Aporte a la base |
|:---|:---|
| Municipalidad de La Reina. (s. f.). [Cuenta Pública 2018, p. PDF 113](https://www.lareina.cl/wp-content/uploads/2020/06/Cuenta_Publica_2018_-_Consolidado.pdf#page=113). | Diez cruces del proyecto Torres Unidas, descrito en proceso de instalación. |
| Municipalidad de La Reina. (s. f.). [Barrio Comercial La Cañada](https://lareina.cl/barrio-comercial-la-canada/). | Un punto representativo del sector; la nota menciona siete cámaras, sin coordenadas individuales. |
| [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). | Nombres y trazados viales para aproximar los cruces y distribuir los demás puntos; licencia ODbL. |

Las [ubicaciones publicadas](./fuentes-camaras/ubicaciones-publicadas.json) conservan la referencia de cada lugar. El CSV y sus [metadatos](../public/analysis/camaras-metadata.json) distinguen procedencia, precisión y datos operativos. Estas fuentes no acreditan que una cámara siga instalada u operativa hoy.

## Ejemplo de 2024

Para ilustrar el cruce con seguridad, se retrasaron a 2025 las fechas de 49 emplazamientos de demostración. Tres focos de incidentes mantienen dos cámaras cada uno en un radio de 650 metros al cierre de 2024. El inventario general queda en 172 cámaras para ese año y 320 en 2025. Se conservaron ubicaciones, identificadores y referencias publicadas.

El detalle reproducible queda en `escenario_2024` de los metadatos y en el [preparador de la base](../scripts/prepare-camera-data.py). Es un ejemplo construido; la proximidad espacial no demuestra cobertura ni una relación histórica entre equipamiento y delitos.
