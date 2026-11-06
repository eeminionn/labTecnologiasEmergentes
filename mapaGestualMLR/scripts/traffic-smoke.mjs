import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';

const directory=path.resolve('test-results/transito');
await mkdir(directory,{recursive:true});
const report=path.join(directory,'verificacion-runtime.json');
await rm(report,{force:true});
const child=spawn(electron,['.','--traffic-check',`--smoke-report=${report}`,`--traffic-captures=${directory}`],{stdio:'inherit'});
const code=await new Promise(resolve=>child.on('exit',resolve));
if(code!==0)process.exit(code||1);
const result=JSON.parse(await readFile(report,'utf8'));
const {version}=JSON.parse(await readFile('package.json','utf8'));
if(result.version!==version)throw new Error('La comprobación se ejecutó sobre otra versión de la aplicación.');
if(!result.ok)throw new Error(JSON.stringify(result));
console.log(`Tránsito: ${Object.keys(result.checks).length} verificaciones aprobadas; control de 0–100 autos, tres escenarios y controles gestuales de 1,5 segundos.`);
