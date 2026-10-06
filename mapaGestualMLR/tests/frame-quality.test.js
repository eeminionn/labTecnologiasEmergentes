import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFrameQuality,FrameQualityGate} from '../src/frame-quality.js';
import {getCameraControls,applyCameraControls} from '../src/camera-quality.js';

function image(pixel,width=160,height=120){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const rgb=pixel(x,y),value=typeof rgb==='number'?[rgb,rgb,rgb]:rgb;
    data.set([...value,255],(y*width+x)*4);
  }
  return {data,width,height};
}
const flat=value=>image(()=>value);
const quality=value=>analyzeFrameQuality(flat(value));
const good=quality(128),black=quality(0),white=quality(255);
function gaussianBlur(source,sigma=3){
  const radius=Math.ceil(sigma*3),kernel=[];
  for(let i=-radius;i<=radius;i++)kernel.push(Math.exp(-i*i/(2*sigma*sigma)));
  const sum=kernel.reduce((a,b)=>a+b,0);kernel.forEach((v,i)=>kernel[i]=v/sum);
  const {width,height}=source,temp=new Float64Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=-radius;k<=radius;k++)temp[y*width+x]+=source.data[(y*width+Math.min(width-1,Math.max(0,x+k)))*4]*kernel[k+radius];
  return image((x,y)=>{let value=0;for(let k=-radius;k<=radius;k++)value+=temp[Math.min(height-1,Math.max(0,y+k))*width+x]*kernel[k+radius];return value;},width,height);
}

test('opaque black/white frames are severe; an in-focus flat gray table only warns',()=>{
  assert.deepEqual(black.severeReasons,['too-dark']);
  assert.deepEqual(white.severeReasons,['too-bright']);
  assert.equal(black.metrics.darkFraction,1);assert.equal(white.metrics.brightFraction,1);
  assert.equal(good.metrics.meanLuma,128);assert.equal(good.metrics.contrast,0);assert.equal(good.metrics.laplacianVariance,0);
  assert.deepEqual(good.severeReasons,[]);assert.ok(good.warnings.includes('low-detail'));
  assert.equal(new FrameQualityGate().update(good,0).allowActions,true);
});
test('global severe clipping needs 98 percent; specular highlights and a dark backdrop with visible detail are not blocked',()=>{
  const highlight=analyzeFrameQuality(image((x,y)=>y<6?255:128));
  assert.equal(highlight.metrics.brightFraction,.05);assert.deepEqual(highlight.severeReasons,[]);
  const backdrop=analyzeFrameQuality(image((x,y)=>x<16?100:0));
  assert.equal(backdrop.metrics.darkFraction,.9);assert.deepEqual(backdrop.severeReasons,[]);
  const occluded=analyzeFrameQuality(image((x,y)=>y===0?128:0));
  assert.ok(occluded.metrics.darkFraction>.98);assert.deepEqual(occluded.severeReasons,['too-dark']);
});
test('luma diagnostics do not confuse a saturated red channel with white overexposure',()=>{
  const red=analyzeFrameQuality(image(()=>[255,0,0]));
  assert.equal(red.metrics.meanLuma,54);assert.equal(red.metrics.brightFraction,0);
  assert.deepEqual(red.severeReasons,[]);
});
test('Gaussian blur reduces edge energy on a known pattern; detail remains advisory without a camera baseline',()=>{
  const sharp=image((x,y)=>(Math.floor(x/16)+Math.floor(y/16))%2?210:40);
  const a=analyzeFrameQuality(sharp),b=analyzeFrameQuality(gaussianBlur(sharp));
  assert.ok(a.metrics.contrast>=150);assert.ok(b.metrics.contrast>100);
  assert.ok(b.metrics.laplacianVariance<a.metrics.laplacianVariance*.1);
  assert.deepEqual(b.severeReasons,[]);
  const ramp=analyzeFrameQuality(image(x=>Math.round(40+170*x/159)));
  assert.ok(ramp.metrics.contrast>150);assert.ok(ramp.warnings.includes('low-detail'));
  assert.deepEqual(ramp.severeReasons,[]);
});
test('known dark ROI is evaluated independently of a bright surrounding frame',()=>{
  const source=image((x,y)=>x>=40 && x<120 && y>=30 && y<90?0:160);
  assert.deepEqual(analyzeFrameQuality(source).severeReasons,[]);
  const cropped=analyzeFrameQuality(source,{roi:{x:.25,y:.25,width:.5,height:.5}});
  assert.equal(cropped.metrics.samples,80*60);assert.deepEqual(cropped.severeReasons,['too-dark']);
});
test('invalid buffer, transparency, tiny/outside ROI and invalid options cannot silently enable actions',()=>{
  const transparent=flat(128);transparent.data[3]=0;
  for(const frame of [null,{width:160,height:120,data:new Uint8Array(5)},transparent,{width:160,height:120,data:new Float32Array(160*120*4)}]){
    const result=analyzeFrameQuality(frame);assert.equal(result.valid,false);assert.equal(new FrameQualityGate().update(result,0).allowActions,false);
  }
  for(const roi of [{x:0,y:0,width:.001,height:.001},{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:NaN,height:1}])assert.equal(analyzeFrameQuality(flat(128),{roi}).valid,false);
  assert.throws(()=>analyzeFrameQuality(flat(128),{severeClipFraction:2}),RangeError);
  assert.throws(()=>analyzeFrameQuality(flat(128),{lowContrast:NaN}),TypeError);
});
test('a single severe frame immediately cancels dwell without a flickering stable warning',()=>{
  const gate=new FrameQualityGate();gate.update(good,0);
  const bad=gate.update(black,40);assert.equal(bad.allowActions,false);assert.equal(bad.cancelInteraction,true);assert.equal(bad.state,'suspect');assert.equal(bad.showWarning,false);
  assert.equal(gate.update(good,80).state,'recovering');
  for(const time of [160,240,320,400,480,560,640])assert.equal(gate.update(good,time).allowActions,false);
  const recovered=gate.update(good,680);assert.equal(recovered.allowActions,true);assert.equal(recovered.showWarning,false);
});
test('sustained clipped frames announce after 200 ms, and recovery needs 600 continuous good ms',()=>{
  const gate=new FrameQualityGate();
  for(const time of [0,40,80,120,160,199])assert.equal(gate.update(white,time).showWarning,false);
  const blocked=gate.update(white,200);assert.equal(blocked.state,'blocked');assert.equal(blocked.showWarning,true);
  assert.equal(gate.update(good,240).state,'recovering');
  for(const time of [320,400,480,560,640,720,800,839])assert.equal(gate.update(good,time).allowActions,false);
  assert.equal(gate.update(good,840).allowActions,true);
});
test('recovery never accumulates across another bad frame, a frame gap or backwards clock',()=>{
  const gate=new FrameQualityGate();gate.update(black,0);gate.update(good,40);gate.update(good,200);
  gate.update(white,240);assert.equal(gate.update(good,280).allowActions,false);
  assert.equal(gate.update(good,600).state,'recovering'); // A 320 ms gap resets recovery.
  for(const time of [680,760,840,920,1000,1080,1160])assert.equal(gate.update(good,time).allowActions,false);
  assert.equal(gate.update(good,1200).allowActions,true);
  assert.equal(gate.update(good,1190).state,'blocked');assert.equal(gate.update(good,NaN).allowActions,false);
  assert.equal(gate.update(good,1300).state,'recovering');
  gate.reset();assert.equal(gate.update(good,0).allowActions,true);
});
test('malformed quality messages fail closed and quality gate timing configuration is validated',()=>{
  assert.equal(new FrameQualityGate().update({valid:true,severeReasons:[]},0).allowActions,false);
  assert.throws(()=>new FrameQualityGate({maxGapMs:0}),RangeError);
  assert.throws(()=>new FrameQualityGate({recoveryHoldMs:-1}),TypeError);
});

const caps={brightness:{min:0,max:100,step:1},contrast:{min:0,max:10,step:.5},exposureCompensation:{min:-2,max:2,step:.25},exposureMode:['manual','continuous'],focusMode:['continuous'],whiteBalanceMode:['manual']};
function track({capabilities=caps,settings={exposureMode:'continuous'},constraints={width:{ideal:640},frameRate:{max:30}},reject=null,reflect=true}={}){
  const calls=[];let current={...settings};
  return {kind:'video',readyState:'live',calls,getCapabilities:()=>capabilities,getSettings:()=>({...current}),getConstraints:()=>constraints,
    applyConstraints:async request=>{calls.push(request);if(reject)throw reject;if(reflect)current={...current,...request.advanced.at(-1)};}};
}
test('camera controls enumerate only finite supported driver ranges and known modes',()=>{
  const camera=track({capabilities:{brightness:{min:0,max:1,step:NaN},contrast:{min:2,max:1},focusMode:['continuous','invented'],whiteBalanceMode:['none']}});
  const controls=getCameraControls(camera);assert.deepEqual(controls.ranges,{});assert.deepEqual(controls.modes.focusMode,['continuous']);
  assert.equal(getCameraControls({kind:'video'}).supported,false);assert.equal(getCameraControls({...camera,readyState:'ended'}).supported,false);
});
test('camera slider snaps to supported steps while preserving device/resolution constraints and replacing stale values',async()=>{
  const constraints={width:{ideal:640},deviceId:{exact:'usb'},advanced:[{brightness:10,frameRate:30},{contrast:1}]};
  const camera=track({constraints});
  const result=await applyCameraControls(camera,{brightness:42.4,contrast:3.3,exposureCompensation:.4});
  assert.equal(result.status,'applied');assert.deepEqual(result.requested,{brightness:42,contrast:3.5,exposureCompensation:.5});
  assert.deepEqual(camera.calls[0].width,constraints.width);assert.deepEqual(camera.calls[0].deviceId,constraints.deviceId);
  assert.deepEqual(camera.calls[0].advanced,[{frameRate:30},result.requested]);
  assert.deepEqual(constraints.advanced,[{brightness:10,frameRate:30},{contrast:1}]);
});
test('automatic camera modes request continuous only where the camera advertises it',async()=>{
  const camera=track();const result=await applyCameraControls(camera,{}, {continuous:true});
  assert.deepEqual(result.requested,{exposureMode:'continuous',focusMode:'continuous'});assert.equal(result.status,'applied');
  const unsupported=track({capabilities:{}});assert.equal((await applyCameraControls(unsupported,{}, {continuous:true})).status,'unsupported');assert.equal(unsupported.calls.length,0);
});
test('invalid/out-of-range/unsupported camera requests never reach the hardware',async()=>{
  for(const values of [{brightness:NaN},{contrast:99},{sharpness:2},{brightness:'30'},null]){
    const camera=track();assert.equal((await applyCameraControls(camera,values)).status,'invalid');assert.equal(camera.calls.length,0);
  }
  const manual=track({settings:{exposureMode:'manual'}});assert.equal((await applyCameraControls(manual,{exposureCompensation:1})).status,'invalid');assert.equal(manual.calls.length,0);
  assert.equal((await applyCameraControls(manual,{exposureCompensation:1},{continuous:true})).status,'applied');
});
test('ignored/unreported settings and driver failures are distinct from confirmed camera changes',async()=>{
  const ignored=track({settings:{brightness:10},reflect:false});const mismatch=await applyCameraControls(ignored,{brightness:20});
  assert.equal(mismatch.ok,true);assert.equal(mismatch.status,'mismatch');assert.equal(mismatch.verification.brightness,'different');
  const hidden=await applyCameraControls(track({reflect:false}),{brightness:20});assert.equal(hidden.status,'unverified');
  const error=new Error('Driver rejected control');error.name='OverconstrainedError';
  const failed=await applyCameraControls(track({reject:error}),{contrast:2});assert.equal(failed.ok,false);assert.equal(failed.errorName,'OverconstrainedError');
  const noConstraints=track();delete noConstraints.getConstraints;
  assert.equal((await applyCameraControls(noConstraints,{contrast:2})).status,'failed');assert.equal(noConstraints.calls.length,0);
});
