// Camera hardware controls are conditional on this live track's capabilities.
const RANGE_KEYS=['exposureCompensation','brightness','contrast'];
const MODE_KEYS=['exposureMode','focusMode','whiteBalanceMode'];
const finite=Number.isFinite;
const safeSettings=track=>{try{return {...track.getSettings?.()};}catch{return {};}};
export function getCameraControls(track) {
  const ranges={},modes={};
  if(!track || track.kind==='audio' || track.readyState==='ended' || typeof track.getCapabilities!=='function')return {supported:false,ranges,modes,reason:'unavailable'};
  let caps;try{caps=track.getCapabilities();}catch{return {supported:false,ranges,modes,reason:'capabilities-failed'};}
  for(const key of RANGE_KEYS){
    const range=caps?.[key];
    if(range && finite(range.min) && finite(range.max) && range.min<=range.max
      && (range.step===undefined || (finite(range.step) && range.step>=0))){
      ranges[key]={min:range.min,max:range.max,step:range.step||0};
    }
  }
  for(const key of MODE_KEYS)if(Array.isArray(caps?.[key]))modes[key]=[...new Set(caps[key].filter(value=>['none','manual','single-shot','continuous'].includes(value)))];
  return {supported:Object.keys(ranges).length>0 || Object.values(modes).some(values=>values.length>0),ranges,modes,reason:null};
}

/**
 * Configure only supported controls, preserving resolution/device constraints.
 * ok means applyConstraints resolved; verification separately reports whether
 * getSettings actually reflects each request (advanced sets may be ignored).
 */
export async function applyCameraControls(track,values={}, {continuous=false}={}) {
  const controls=getCameraControls(track),requested={};
  if(!controls.supported || typeof track?.applyConstraints!=='function')return {ok:false,status:'unsupported',requested,settings:safeSettings(track),verification:{}};
  if(!values || typeof values!=='object' || Array.isArray(values))return {ok:false,status:'invalid',requested,settings:safeSettings(track),verification:{},error:'Invalid control values'};
  for(const [key,value] of Object.entries(values)){
    const range=controls.ranges[key];
    if(!RANGE_KEYS.includes(key) || !range || !finite(value) || value<range.min || value>range.max)return {ok:false,status:'invalid',requested:{},settings:safeSettings(track),verification:{},error:`Unsupported or out-of-range control: ${key}`};
    const snapped=range.step>0?range.min+Math.round((value-range.min)/range.step)*range.step:value;
    requested[key]=Math.min(range.max,Math.max(range.min,Number(snapped.toPrecision(12))));
  }
  if(continuous)for(const key of MODE_KEYS)if(controls.modes[key]?.includes('continuous'))requested[key]='continuous';
  if(!Object.keys(requested).length)return {ok:true,status:'unchanged',requested,settings:safeSettings(track),verification:{}};
  // Exposure compensation is meaningful only for continuous/single-shot AE.
  const before=safeSettings(track);
  if('exposureCompensation' in requested && !['continuous','single-shot'].includes(requested.exposureMode||before.exposureMode))return {ok:false,status:'invalid',requested,settings:before,verification:{},error:'Exposure compensation needs automatic exposure mode'};
  if(typeof track.getConstraints!=='function')return {ok:false,status:'failed',requested,settings:before,verification:{},error:'Cannot preserve existing camera constraints'};
  let previous;
  try{previous=track.getConstraints?.()||{};}catch{return {ok:false,status:'failed',requested,settings:before,verification:{},error:'Cannot read existing camera constraints'};}
  const currentAdvanced=Array.isArray(previous.advanced)?previous.advanced:[];
  // Remove stale values for controls being changed: an earlier advanced set
  // requesting continuous/brightness N must not override a later slider value.
  const advanced=currentAdvanced.map(set=>Object.fromEntries(Object.entries(set).filter(([key])=>!(key in requested))))
    .filter(set=>Object.keys(set).length>0);
  const basic=Object.fromEntries(Object.entries(previous).filter(([key])=>key!=='advanced' && !(key in requested)));
  try{
    await track.applyConstraints({...basic,advanced:[...advanced,{...requested}]});
  }catch(error){return {ok:false,status:'failed',requested,settings:safeSettings(track),verification:{},error:error?.message||String(error),errorName:error?.name||'Error'};}
  const settings=safeSettings(track),verification={};
  for(const [key,value] of Object.entries(requested)){
    const actual=settings[key],epsilon=Math.max(1e-7,(controls.ranges[key]?.step||0)*.01);
    verification[key]=actual===undefined?'unreported':typeof value==='number'
      ?(finite(actual) && Math.abs(actual-value)<=epsilon?'confirmed':'different'):(actual===value?'confirmed':'different');
  }
  const states=Object.values(verification);
  return {ok:true,status:states.includes('different')?'mismatch':states.includes('unreported')?'unverified':'applied',requested,settings,verification};
}
