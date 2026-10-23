#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const twinRoot = path.resolve(__dirname, '..');
const repository = path.resolve(twinRoot, '..');
const helperSource = path.join(repository, 'mapaGestualMLR/release/mac-arm64/Mapa Gestual MLR.app');
const arguments = process.argv.slice(2);
const verifyOnly = arguments.includes('--verify-only');
const paths = arguments.filter(argument => !argument.startsWith('--'));
const invalidArguments = arguments.some(argument => argument.startsWith('--') && argument !== '--verify-only');
if (paths.length > 1 || invalidArguments || arguments.filter(argument => argument === '--verify-only').length > 1 || arguments.includes('--help')) {
  console.log('Uso: node digitalTwinMLR/Tools/package-mac.cjs [--verify-only] [ruta/Sala La Reina.app]');
  process.exit(arguments.includes('--help') ? 0 : 1);
}
const appPath = path.resolve(paths[0] || path.join(twinRoot, 'Builds/Mac/Sala La Reina.app'));
const plistBuddy = '/usr/libexec/PlistBuddy';
const codesign = '/usr/bin/codesign';
const ditto = '/usr/bin/ditto';
const cameraDescription = 'La cámara frontal detecta las manos para controlar el mapa desde la silla principal.';

function requireDirectory(target, label) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`${label} no existe: ${target}`);
}
function requireFile(target, label) {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`${label} no existe: ${target}`);
}
function readPlist(file, key) {
  return execFileSync(plistBuddy, ['-c', `Print :${key}`, file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function validateBundle(bundle, identifier) {
  if (!bundle.endsWith('.app')) throw new Error(`La ruta debe terminar en .app: ${bundle}`);
  requireDirectory(bundle, 'Aplicación');
  const plist = path.join(bundle, 'Contents/Info.plist');
  requireFile(plist, 'Info.plist');
  if (readPlist(plist, 'CFBundleIdentifier') !== identifier) throw new Error(`Identificador inesperado en ${bundle}`);
  const executable = readPlist(plist, 'CFBundleExecutable');
  if (!executable || path.basename(executable) !== executable) throw new Error('Nombre de ejecutable inválido');
  const binary = path.join(bundle, 'Contents/MacOS', executable);
  requireFile(binary, 'Ejecutable');
  fs.accessSync(binary, fs.constants.X_OK);
  return plist;
}
function run(file, args) { execFileSync(file, args, { stdio: 'inherit' }); }
function validateCameraDescription(plist) {
  let description = '';
  try { description = readPlist(plist, 'NSCameraUsageDescription'); } catch {}
  if (!description) throw new Error(`NSCameraUsageDescription debe existir y no estar vacía: ${plist}`);
}
function verifyPackagedApp() {
  const appPlist = validateBundle(appPath, 'cl.mlr.sala.lareina');
  const helperTarget = path.join(appPath, 'Contents/Helpers/Mapa Gestual MLR.app');
  const helperPlist = validateBundle(helperTarget, 'cl.mlr.mapagestual');
  requireFile(path.join(helperTarget, 'Contents/Resources/app.asar'), 'Aplicación gestual empaquetada');
  validateCameraDescription(appPlist);
  validateCameraDescription(helperPlist);
  run(codesign, ['--verify', '--deep', '--strict', appPath]);
}

try {
  if (process.platform !== 'darwin') throw new Error('Este empaque se ejecuta en macOS.');
  for (const tool of verifyOnly ? [plistBuddy, codesign] : [plistBuddy, codesign, ditto]) requireFile(tool, 'Herramienta de macOS');
  if (verifyOnly) {
    verifyPackagedApp();
    console.log(`Empaque Mac verificado sin modificaciones: ${appPath}`);
    process.exit(0);
  }
  const appPlist = validateBundle(appPath, 'cl.mlr.sala.lareina');
  validateCameraDescription(validateBundle(helperSource, 'cl.mlr.mapagestual'));
  requireFile(path.join(helperSource, 'Contents/Resources/app.asar'), 'Aplicación gestual empaquetada');
  const helpers = path.join(appPath, 'Contents/Helpers');
  if (fs.existsSync(helpers) && (fs.lstatSync(helpers).isSymbolicLink() || !fs.statSync(helpers).isDirectory()))
    throw new Error('Contents/Helpers debe ser una carpeta propia de la aplicación.');
  fs.mkdirSync(helpers, { recursive: true });
  const helperTarget = path.join(helpers, 'Mapa Gestual MLR.app');
  if (fs.realpathSync(appPath) === fs.realpathSync(helperSource)) throw new Error('El destino no puede ser la aplicación auxiliar.');
  fs.rmSync(helperTarget, { recursive: true, force: true });
  run(ditto, [helperSource, helperTarget]);
  let hasCameraDescription = false;
  try { hasCameraDescription = readPlist(appPlist, 'NSCameraUsageDescription').length > 0; } catch {}
  if (!hasCameraDescription) {
    let cameraKeyExists = false;
    try { readPlist(appPlist, 'NSCameraUsageDescription'); cameraKeyExists = true; } catch {}
    run(plistBuddy, ['-c', `${cameraKeyExists ? 'Set' : 'Add'} :NSCameraUsageDescription${cameraKeyExists ? '' : ' string'} ${cameraDescription}`, appPlist]);
  }
  // electron-builder's unsigned directory keeps a template signature. Replace
  // it on the copied helper before sealing the containing Unity application.
  run(codesign, ['--force', '--deep', '--sign', '-', '--timestamp=none', helperTarget]);
  run(codesign, ['--force', '--sign', '-', '--timestamp=none', appPath]);
  verifyPackagedApp();
  console.log(`Empaque Mac verificado: ${appPath}`);
} catch (error) {
  console.error(`No se pudo ${verifyOnly ? 'verificar' : 'empaquetar'}: ${error.message}`);
  process.exitCode = 1;
}
