# Registro Vehicular MLR

Aplicación móvil para contar autos por ciclo de semáforo en cruces de La Reina.

**Sitio:** https://eeminionn.github.io/labTecnologiasEmergentes/registroVehicularMLR/

## Qué hace

- Define segundos de verde y rojo.
- Cuenta autos con un botón grande durante el verde.
- Cambia el ciclo automáticamente con un temporizador.
- Guarda cruce, dirección, día, horario, duraciones y total en Firestore.
- Ordena los registros por día y permite filtrarlos.
- Restringe los datos a una sola cuenta de Google autorizada.

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
- Acceso: Google Authentication y reglas de mínimo privilegio

La regla real con la cuenta autorizada está desplegada en Firebase y se mantiene fuera del repositorio público. `firestore.rules.example` muestra la misma estructura con el correo redactado. Para volver a desplegarla, copia el ejemplo como `firestore.rules`, reemplaza el correo de ejemplo localmente y ejecuta:

```bash
npx -y firebase-tools@latest deploy --only firestore
```

## Publicación

Cada cambio en `main` que toque esta carpeta activa el flujo de GitHub Pages. La publicación construye el proyecto, corre las pruebas y deja la app en la ruta `/registroVehicularMLR/`.
