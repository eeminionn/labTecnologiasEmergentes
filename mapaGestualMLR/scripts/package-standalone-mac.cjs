#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { extractFile } = require('@electron/asar');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'release/mac-arm64/Mapa Gestual MLR.app');
const args = process.argv.slice(2);
const usage = 'Uso: node scripts/package-standalone-mac.cjs "ruta/destino/Mapa Gestual MLR.app"';
const plistBuddy = '/usr/libexec/PlistBuddy';
const codesign = '/usr/bin/codesign';
const ditto = '/usr/bin/ditto';

if (args.length !== 1 || args[0] === '--help') {
  console.log(usage);
  process.exit(args.includes('--help') ? 0 : 1);
}

const destination = path.resolve(args[0]);

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function requireFile(target, label) {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile())
    throw new Error(`${label} no existe: ${target}`);
}

function canonicalTarget(target) {
  const suffix = [];
  let ancestor = target;
  while (!exists(ancestor)) {
    suffix.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  return path.join(fs.realpathSync(ancestor), ...suffix);
}

function readPlist(file, key) {
  return execFileSync(plistBuddy, ['-c', `Print :${key}`, file], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function validateBundle(bundle, expectedVersion) {
  if (!fs.existsSync(bundle) || !fs.statSync(bundle).isDirectory())
    throw new Error(`La aplicación no existe: ${bundle}`);
  const plist = path.join(bundle, 'Contents/Info.plist');
  requireFile(plist, 'Info.plist');
  if (readPlist(plist, 'CFBundleIdentifier') !== 'cl.mlr.mapagestual')
    throw new Error(`Identificador de aplicación inesperado: ${bundle}`);
  if (!readPlist(plist, 'NSCameraUsageDescription'))
    throw new Error(`NSCameraUsageDescription debe existir y no estar vacía: ${plist}`);
  if (readPlist(plist, 'CFBundleShortVersionString') !== expectedVersion)
    throw new Error(`La versión de Info.plist no coincide con package.json (${expectedVersion}).`);

  const executable = readPlist(plist, 'CFBundleExecutable');
  if (!executable || path.basename(executable) !== executable)
    throw new Error('Nombre de ejecutable inválido.');
  const binary = path.join(bundle, 'Contents/MacOS', executable);
  requireFile(binary, 'Ejecutable');
  fs.accessSync(binary, fs.constants.X_OK);

  const archive = path.join(bundle, 'Contents/Resources/app.asar');
  requireFile(archive, 'app.asar');
  const packaged = JSON.parse(extractFile(archive, 'package.json').toString('utf8'));
  if (packaged.version !== expectedVersion)
    throw new Error(`app.asar contiene la versión ${packaged.version}; se esperaba ${expectedVersion}. Vuelve a compilar la aplicación.`);
}

function run(file, parameters) {
  execFileSync(file, parameters, { stdio: 'inherit' });
}

try {
  if (process.platform !== 'darwin') throw new Error('Este empaque se ejecuta en macOS.');
  if (!destination.toLowerCase().endsWith('.app')) throw new Error('El destino debe terminar en .app.');
  if (destination === source) throw new Error('El origen y el destino deben ser distintos.');
  if (exists(destination)) throw new Error(`El destino ya existe; no se reemplazó: ${destination}`);
  for (const tool of [plistBuddy, codesign, ditto]) requireFile(tool, 'Herramienta de macOS');

  const expectedVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
  if (typeof expectedVersion !== 'string' || !expectedVersion.trim())
    throw new Error('package.json debe declarar una versión.');
  validateBundle(source, expectedVersion);

  const sourceReal = fs.realpathSync(source);
  const plannedDestination = canonicalTarget(destination);
  if (plannedDestination === sourceReal || plannedDestination.startsWith(sourceReal + path.sep))
    throw new Error('El destino no puede ser el origen ni estar dentro de él.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const destinationReal = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
  if (destinationReal === sourceReal || destinationReal.startsWith(sourceReal + path.sep))
    throw new Error('El destino no puede ser el origen ni estar dentro de él.');

  // Reserve a fresh destination exclusively: never merge over a previous app,
  // even if another process creates the destination after the initial check.
  fs.mkdirSync(destination);
  run(ditto, [source, destination]);
  run(codesign, ['--force', '--deep', '--sign', '-', '--timestamp=none', destination]);
  validateBundle(destination, expectedVersion);
  run(codesign, ['--verify', '--deep', '--strict', destination]);
  console.log(`Aplicación independiente ${expectedVersion} empaquetada y verificada: ${destination}`);
} catch (error) {
  console.error(`No se pudo empaquetar: ${error.message}`);
  process.exitCode = 1;
}
