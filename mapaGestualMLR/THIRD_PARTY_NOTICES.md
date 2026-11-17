# Componentes de terceros

La identidad de la pantalla complementaria utiliza el logotipo blanco de la Municipalidad de La Reina, obtenido de su [sitio oficial](https://lareina.cl/) el 17 de noviembre de 2026. [Imagen original](https://lareina.cl/wp-content/uploads/elementor/thumbs/lareina-monotono-przxay3628ls6foz0ys9nw0b7h7za372ifpndaom3k.png). Los derechos de esta identidad corresponden a la Municipalidad.

Mapa Gestual MLR 0.3.1, prototipo académico del proyecto territorial de La Reina. Actualización del 3 de noviembre de 2026 para la aplicación independiente.

- **MediaPipe Tasks Vision 1.0.1 y Hand Landmarker float16 v1:** Google, Apache License 2.0. [Código y licencia](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE), [modelo y ficha](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#models). SHA-256 del paquete de modelo: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- **Electron 44.5.1:** Electron contributors, MIT. [Licencia](https://github.com/electron/electron/blob/main/LICENSE). El ejecutable incluye también las licencias Chromium/Electron distribuidas con el runtime.
- **Leaflet 1.9.4:** Vladimir Agafonkin y colaboradores, BSD 2-Clause. [Licencia](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE).
- **MapLibre GL JS 6.16.0:** MapLibre contributors, BSD 3-Clause. [Código y licencia](https://github.com/maplibre/maplibre-gl-js/blob/v6.16.0/LICENSE.txt). Mantiene el mapa cartográfico durante la vista tridimensional. El texto de licencia distribuido con el paquete, incluidas sus atribuciones incorporadas, se reproduce al final de este documento.
- **Three.js 0.187.0:** three.js authors, licencia MIT. [Código y licencia de la versión utilizada](https://github.com/mrdoob/three.js/blob/r187/LICENSE). Se utiliza para representar la escena tridimensional, cargar los modelos GLB y controlar su vista. El texto de la licencia se reproduce al final de este documento.
- **Modelos de Kenney:** [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban), [City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial), [Car Kit](https://kenney.nl/assets/car-kit), [City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) y [Nature Kit](https://kenney.nl/assets/nature-kit), Creative Commons Zero (CC0). El catálogo contiene cinco modelos de edificios, tres de vehículos y ocho elementos de vegetación y mobiliario, con sus texturas y los cinco archivos de licencia originales. Los autores, enlaces de procedencia, dimensiones y SHA-256 están en [el manifiesto de modelos](./public/traffic/models/assets-manifest.json). Las instancias se escalan uniformemente y representan tipologías de muestra. La disponibilidad de una señal o semáforo en el catálogo no acredita su instalación en una calle: su colocación requiere una ubicación cartográfica u observada.
- **Poppins:** The Poppins Project Authors, SIL Open Font License 1.1. Se incluyen los archivos TTF originales de los pesos 400, 500, 600 y 700 desde el [repositorio oficial de Google Fonts](https://github.com/google/fonts/tree/main/ofl/poppins), sin modificaciones. La licencia acompaña las fuentes en [OFL.txt](./public/fonts/poppins/OFL.txt), con procedencia y SHA-256 en [sources-manifest.json](./public/fonts/poppins/sources-manifest.json). No se distribuyen archivos de Adobe ni de Neulis Sans; esta última se utiliza solo si está instalada en el equipo.
- **OpenStreetMap:** datos © OpenStreetMap contributors, Open Database License (ODbL) 1.0. El mapa independiente conserva la atribución visible. En la entrega anterior del gemelo digital se muestra también en el menú inicial y en los ajustes, siguiendo la [guía para juegos y simulaciones](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Computer_games_and_simulations). El modo Experiencias conserva una atribución propia e incluye un extracto vectorial del sector: las calles, las huellas y sus datos derivados se comparten bajo ODbL en [scene.json](./public/traffic/scene.json) y [sources.json](./public/traffic/sources.json). Se respetan las condiciones del [servicio de teselas](https://operations.osmfoundation.org/policies/tiles/): el mapa solicita las vistas consultadas y no distribuye una caché de teselas ni precarga regiones. La geometría de la experiencia es independiente de ese servicio.
- **Google Maps JavaScript API:** servicio propietario, no se redistribuye. Se carga por Internet solo cuando el usuario configura una API key. [Políticas](https://developers.google.com/maps/documentation/javascript/policies). Se conservan los logos y las atribuciones exigidos por el proveedor. Para la revisión residencial de la versión 0.3.1 se consultó Google Maps solo como referencia visual; no se incorporan sus capturas, imágenes ni teselas al paquete.
- **Imagen de prueba thumbs-up.png:** Google, fixture del repositorio MediaPipe Samples, Apache 2.0. [Archivo original](https://github.com/google-ai-edge/mediapipe-samples/blob/c2518ec444c3a3a99689e5d31eddadc240c83a0c/examples/hand_landmarker/ios/HandLandmarkerTests/thumbs-up.png), [licencia](https://github.com/google-ai-edge/mediapipe-samples/blob/c2518ec444c3a3a99689e5d31eddadc240c83a0c/LICENSE). SHA-256 `b373f1dd029cd339e11cb7921c30085e7604b3a051b1f7bfc47494d639f325c3`. Se incluye para comprobar inferencia positiva; no valida precisión cenital.

MediaPipe 1.0.1 incluye un logger de métricas de uso. Este prototipo restringe la red del worker a su origen local mediante una política CSP propia y bloquea adicionalmente `odml.pa.googleapis.com` en Electron. Los frames se entregan al worker en memoria. El mapa conserva su acceso de red y no recibe los frames de la cámara desde el código del prototipo.

Las licencias originales de dependencias instaladas acompañan sus paquetes. La investigación distingue la licencia de código de las restricciones de datasets/modelos alternativos que no se distribuyen aquí.

## Licencia MIT de Three.js

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Licencia de MapLibre GL JS 6.16.0

El siguiente texto se conserva íntegro del archivo `LICENSE.txt` de la dependencia:

```text
Copyright (c) 2023, MapLibre contributors

All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of MapLibre GL JS nor the names of its contributors
      may be used to endorse or promote products derived from this software
      without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


-------------------------------------------------------------------------------

Contains code from mapbox-gl-js v1.13 and earlier

Version v1.13 of mapbox-gl-js and earlier are licensed under a BSD-3-Clause license

Copyright (c) 2020, Mapbox
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
* Neither the name of Mapbox GL JS nor the names of its contributors
  may be used to endorse or promote products derived from this software
  without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


-------------------------------------------------------------------------------

Contains code from glfx.js

Copyright (C) 2011 by Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

--------------------------------------------------------------------------------

Contains a portion of d3-color https://github.com/d3/d3-color

Copyright 2010-2016 Mike Bostock
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
