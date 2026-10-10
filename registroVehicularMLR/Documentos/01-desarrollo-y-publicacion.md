# Desarrollo y publicación - Registro Vehicular MLR

Instrucciones y configuración conservadas del README del proyecto. Ejecutar los comandos desde la carpeta `registroVehicularMLR`.

[Volver al proyecto](../README.md)

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

La regla real está desplegada en Firebase y se mantiene fuera del repositorio público. [firestore.rules.example](../firestore.rules.example) muestra la misma estructura. Para volver a desplegarla, copia el ejemplo como `firestore.rules` y ejecuta:

```bash
npx -y firebase-tools@latest deploy --only firestore
```

## Publicación

Cada cambio en `main` que toque esta carpeta activa el flujo de GitHub Pages. La publicación construye el proyecto, corre las pruebas y deja la app en la ruta `/registroVehicularMLR/`.
