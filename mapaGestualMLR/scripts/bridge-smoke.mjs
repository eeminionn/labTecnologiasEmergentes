import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';

// No physical camera or operating-system click is used in this integration
// check. Chromium's synthetic camera goes through the production worker.
const probe=net.createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const token=randomBytes(32).toString('hex');
const helper=process.env.TWIN_HELPER || path.resolve('node_modules/.bin/electron');
const argv=process.env.TWIN_HELPER?[]:[process.env.TWIN_TEST_ENTRY || '.'];
argv.push('--twin-bridge',`--twin-port=${port}`,`--twin-token=${token}`,
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream');
const child=spawn(helper,argv,{stdio:['ignore','ignore','pipe']});
let errors='';child.stderr.on('data',data=>{errors+=data;});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let sequence=0;
const request=(endpoint,method='GET',body,auth=true)=>{
  if(method==='POST' && ['lease','stop'].includes(endpoint))body={sequence:++sequence,...body};
  return fetch(`http://127.0.0.1:${port}/bridge/${endpoint}`,{
    method,headers:auth?{Authorization:`Bearer ${token}`}:{},body:body===undefined?undefined:JSON.stringify(body)
  });
};
async function waitFor(test,label,timeout=25000) {
  const start=Date.now();let value;
  while(Date.now()-start<timeout){
    if(child.exitCode!==null)throw new Error(`Helper exited: ${child.exitCode}\n${errors}`);
    try{value=await(await request('status')).json();if(await test(value))return value;}catch{}
    await sleep(150);
  }
  throw new Error(`${label}: ${JSON.stringify(value)}\n${errors}`);
}
try {
  const initial=await waitFor(state=>state.ready,'Renderer ready');
  assert.equal(initial.active,false);assert.equal(initial.cameraActive,false);
  assert.equal((await request('status','GET',undefined,false)).status,401);
  await request('lease','POST',{chair:'Chair_09',seated:true});
  assert.equal((await(await request('status')).json()).active,false);
  let heartbeat=setInterval(()=>request('lease','POST',{chair:'Chair_10',seated:true}).catch(()=>{}),750);
  try {
    await request('lease','POST',{chair:'Chair_10',seated:true});
    const live=await waitFor(state=>state.cameraActive && state.detectorReady && state.inferenceFrames>2 && state.frameSequence>2,'Synthetic camera and production MediaPipe worker');
    const image=await request('frame');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');
    const bytes=Buffer.from(await image.arrayBuffer());assert.ok(bytes.length>2000);
    if(process.env.TWIN_CAPTURE)await fs.writeFile(process.env.TWIN_CAPTURE,bytes);
    let nativeInput;
    if(process.env.TWIN_CLICK_PROBE) {
      await waitFor(async()=>{
        try { nativeInput=JSON.parse(await fs.readFile(process.env.TWIN_CLICK_PROBE,'utf8'));return nativeInput.active.accepted===true; }
        catch{return false;}
      },'Background native local click');
      assert.equal(nativeInput.active.trusted,true);
      assert.equal(nativeInput.active.documentFocused,false);
    }
    clearInterval(heartbeat);heartbeat=null;
    const expired=await waitFor(state=>!state.active && !state.cameraActive,'Lease expiration',6000);
    assert.equal((await request('frame')).status,204);
    if(process.env.TWIN_CLICK_PROBE) {
      await waitFor(async()=>{
        try{nativeInput=JSON.parse(await fs.readFile(process.env.TWIN_CLICK_PROBE,'utf8'));return nativeInput.inactive?.accepted===false;}catch{return false;}
      },'Expired local click rejected');
    }
    heartbeat=setInterval(()=>request('lease','POST',{chair:'Chair_10',seated:true}).catch(()=>{}),750);
    await request('lease','POST',{chair:'Chair_10',seated:true});
    const resumed=await waitFor(state=>state.cameraActive && state.detectorReady,'A new seated session restarts camera and detector');
    clearInterval(heartbeat);heartbeat=null;
    await request('stop','POST');
    assert.equal((await(await request('status')).json()).active,false);
    console.log(JSON.stringify({passed:true,syntheticCamera:true,physicalCameraTested:false,ready:initial.ready,
      live,expired,resumed,nativeInput,frameBytes:bytes.length,unauthorizedRejected:true,wrongChairRejected:true,leaseExpiryStops:true,stopStops:true},null,2));
  } finally {clearInterval(heartbeat);}
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
}
