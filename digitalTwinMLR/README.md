# Recorrido virtual de la sala

**Avance:** 16 de octubre de 2026<br>
**Equipo:** Emilio Abarca · Emilia Armstrong · Victoria Aracena

[Volver al proyecto](https://github.com/eeminionn/labTecnologiasEmergentes)

Pasamos la propuesta espacial a Unity para poder recorrerla y revisar cómo se sienten la mesa, los puestos y las proyecciones desde adentro. También nos permite preparar una futura experiencia en realidad virtual usando el mismo modelo.

## Del modelo al recorrido

Usamos el FBX como referencia final, conservando sus formas y su escala en metros. La sala mide **8 × 9 m**, con **2,70 m de altura**; la mesa mide aproximadamente **2 × 3,10 m** y tiene **76 cm de alto**. Mantuvimos esta mesa porque corresponde al modelo más reciente, aunque el plano anterior mostraba 2 × 2,80 m.

Agregamos once sillas siguiendo la distribución de la planta. Los materiales oscuros, las superficies metálicas y la iluminación azul y fucsia retoman la propuesta. Las carcasas de proyectores representan un montaje provisional que todavía debemos revisar.

## Proyecciones y siguientes pruebas

La mesa y ocho superficies de pared reproducen MP4 locales. Así podemos cambiar el contenido sin rehacer la sala. El modelo editable y los elementos separados también permiten seguir sumando cosas.

Por ahora es una **representación conceptual**, sin conexión con datos municipales en tiempo real. Queda pendiente probar la experiencia con un visor.

<table>
  <tr>
    <td><img src="./Imagenes/sala-general.png" alt="Vista general del recorrido virtual" width="380" /></td>
    <td><img src="./Imagenes/mesa-proyeccion.png" alt="Mesa y superficies de proyección" width="380" /></td>
  </tr>
  <tr>
    <td>Distribución y ambiente de la sala.</td>
    <td>Contenido de demostración reemplazable.</td>
  </tr>
</table>

**Fuentes:** [propuesta espacial](https://github.com/eeminionn/labTecnologiasEmergentes/tree/main/propuestaEspacialMLR), [presentación del equipo, pp. 33–39](./Documentacion/propuesta-espacial-extracto.pdf), [Unity OpenXR](https://docs.unity3d.com/Packages/com.unity.xr.openxr@1.17/manual/index.html) y [Unity Video Player](https://docs.unity3d.com/6000.5/Documentation/Manual/VideoPlayer-rendertexture.html).
