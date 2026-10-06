import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import electron from 'electron';

await mkdir('test-results', { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'mlr-smoke-'));
const report = path.join(temporary, 'report.json');
const child = spawn(electron, ['.', '--smoke', `--smoke-report=${report}`, `--screenshot=${path.resolve('test-results/interfaz.png')}`,`--progress-screenshot=${path.resolve('test-results/progreso.png')}`,`--navigation-screenshot=${path.resolve('test-results/navegacion.png')}`], { stdio: 'inherit' });
const code = await new Promise(resolve => child.on('exit', resolve));
if (code !== 0) process.exit(code || 1);
const result = JSON.parse(await readFile(report, 'utf8'));
if (!result.ok) throw new Error(JSON.stringify(result));
console.log('Smoke: modelo WASM y world 3D, índice/nudillos sin saltos, puños cenital/frontal, dos sombras/colores, modos exclusivos, preview permanente, bordes, calidad y recorrido 1 → 2 → 3 con cierre gradual de la pinza y clic nativo de 1,5 s: OK');
