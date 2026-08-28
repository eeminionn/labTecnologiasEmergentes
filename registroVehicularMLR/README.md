# Registro Vehicular MLR

Aplicación móvil para contar autos por ciclo de semáforo en cruces de La Reina. Nació como una herramienta de terreno para la [investigación territorial del proyecto](../Etapa-1/Bitacora/README.md).

**Sitio:** https://eeminionn.github.io/labTecnologiasEmergentes/registroVehicularMLR/

## Qué hace

- Mide el verde y el rojo con un cronómetro de play y pausa.
- Cuenta autos con un botón grande mientras se mide el verde.
- Guarda cruce, dirección, día, horario, duraciones y total en Firestore.
- Ordena los registros por día, permite filtrarlos y borrarlos con confirmación.
- Permite entrar a cualquier persona que inicie sesión con Google.

## Abrir en local

```bash
npm ci
npm run dev
```

## Revisar antes de subir

```bash
npm test
npm run build
```

## Firebase

- Proyecto: `registro-vehicular-mlr`
- Base: Cloud Firestore Standard
- Región: `southamerica-west1` (Santiago)
- Colección: `registros`
- Acceso: Google Authentication; todos los usuarios autenticados pueden leer y crear, pero solo el dueño puede borrar su registro

La regla real está desplegada en Firebase y se mantiene fuera del repositorio público. `firestore.rules.example` muestra la misma estructura. Para volver a desplegarla, copia el ejemplo como `firestore.rules` y ejecuta:

```bash
npx -y firebase-tools@latest deploy --only firestore
```

## Publicación

Cada cambio en `main` que toque esta carpeta activa el flujo de GitHub Pages. La publicación construye el proyecto, corre las pruebas y deja la app en la ruta `/registroVehicularMLR/`.
