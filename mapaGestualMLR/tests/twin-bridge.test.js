import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const { createTwinBridge } = createRequire(import.meta.url)('../electron/twin-bridge.cjs');
const token='a'.repeat(64);

async function harness(t,options={}) {
  const events=[];let clock=1000;
  const bridge=createTwinBridge({token,now:()=>clock,onState:state=>events.push(state),...options});
  const server=http.createServer(async(req,res)=>{
    if(!await bridge.route(req,res,new URL(req.url,'http://127.0.0.1').pathname)){res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  let sequence=0;
  const call=(endpoint,method='GET',body,authorized=true)=> {
    if(method==='POST' && ['lease','stop'].includes(endpoint))body={sequence:++sequence,...body};
    return fetch(`http://127.0.0.1:${server.address().port}/bridge/${endpoint}`,{
      method,headers:authorized?{Authorization:`Bearer ${token}`}:{},body:body===undefined?undefined:JSON.stringify(body)
    });
  };
  return {bridge,events,call,advance:amount=>{clock+=amount;bridge.expire();}};
}

test('the principal chair alone can lease the bridge; wrong chairs stop frames and input immediately',async t=>{
  const {bridge,events,call}=await harness(t);
  assert.equal((await call('lease','POST',{chair:'Chair_09',seated:true})).status,200);
  assert.equal(bridge.isActive(),false);
  await call('lease','POST',{chair:'Chair_10',seated:true});
  const epoch=bridge.status().epoch;
  assert.equal(bridge.isActive(epoch),true);
  bridge.rendererState({epoch,cameraActive:true,hands:2});
  bridge.pushFrame(Buffer.from('JPEG'));
  assert.equal((await call('frame')).status,200);
  assert.equal(bridge.status().cameraActive,true);
  await call('lease','POST',{chair:'Chair_11',seated:true});
  assert.equal(bridge.isActive(epoch),false);
  assert.equal((await call('frame')).status,204);
  assert.equal(bridge.status().cameraActive,false);
  assert.equal(events.at(-1).active,false);
});

test('renewal preserves interaction but expiration invalidates renderer, cached frames and old epochs',async t=>{
  const {bridge,call,advance,events}=await harness(t);
  bridge.rendererReady();
  await call('lease','POST',{chair:'Chair_10',seated:true});
  const epoch=bridge.status().epoch;
  advance(2000);
  await call('lease','POST',{chair:'Chair_10',seated:true});
  assert.equal(bridge.status().epoch,epoch);
  advance(2999);assert.equal(bridge.isActive(),true);
  advance(1);assert.equal(bridge.isActive(),false);
  bridge.rendererState({epoch,cameraActive:true,hands:2});
  bridge.pushFrame(Buffer.from('stale'));
  assert.equal(bridge.status().hands,0);
  assert.equal((await call('frame')).status,204);
  await call('lease','POST',{chair:'Chair_10',seated:true});
  assert.equal(bridge.isActive(epoch),false);
  assert.equal(bridge.status().cameraActive,false);
  assert.equal(events.filter(event=>event.active).length,2);
});

test('unauthenticated requests cannot activate, retrieve images, stop a session or open camera settings',async t=>{
  let settings=0;
  const {bridge,call}=await harness(t,{onSettings:()=>settings++});
  for(const endpoint of ['status','frame','lease','stop','settings'])
    assert.equal((await call(endpoint,endpoint==='status'||endpoint==='frame'?'GET':'POST',undefined,false)).status,401);
  assert.equal(bridge.isActive(),false);
  assert.equal((await call('settings','POST')).status,409);
  await call('lease','POST',{chair:'Chair_10',seated:true});
  assert.equal((await call('settings','POST')).status,200);
  assert.equal(settings,1);
  await call('stop','POST');assert.equal(bridge.isActive(),false);
});

test('oversized or malformed lease bodies close the existing lease',async t=>{
  const {bridge,call}=await harness(t);
  await call('lease','POST',{chair:'Chair_10',seated:true});
  assert.equal((await call('lease','POST',{chair:'Chair_10',seated:true,extra:'x'.repeat(600)})).status,400);
  assert.equal(bridge.isActive(),false);
});

test('a delayed heartbeat cannot reactivate the camera after a newer stop or overwrite a newer chair state',async t=>{
  const {bridge,call}=await harness(t);
  await call('lease','POST',{chair:'Chair_10',seated:true,sequence:10});
  await call('stop','POST',{sequence:12});
  assert.equal((await call('lease','POST',{chair:'Chair_10',seated:true,sequence:11})).status,409);
  assert.equal(bridge.isActive(),false);
  await call('lease','POST',{chair:'Chair_10',seated:true,sequence:13});
  assert.equal((await call('stop','POST',{sequence:12})).status,409);
  assert.equal(bridge.isActive(),true);
});

test('preview telemetry is visible only during the active chair lease and renewal preserves session preferences',async t=>{
  const presentation={mirror:true,previewVisible:true,previewFrames:4};
  const {bridge,call}=await harness(t,{getPresentationState:()=>presentation});
  assert.equal(bridge.status().previewVisible,false);assert.equal(bridge.status().previewFrames,0);
  await call('lease','POST',{chair:'Chair_10',seated:true});
  assert.equal(bridge.status().mirror,true);assert.equal(bridge.status().previewVisible,true);assert.equal(bridge.status().previewFrames,4);
  presentation.mirror=false;
  await call('lease','POST',{chair:'Chair_10',seated:true});
  assert.equal(bridge.status().mirror,false);
  await call('stop','POST');
  assert.equal(bridge.status().previewVisible,false);assert.equal(bridge.status().previewFrames,0);
});
