/**
 * Local image diagnostics, not detector confidence or a focus measurement.
 * Feed an opaque RGBA8 analysis canvas with fixed width and preserved aspect
 * ratio (160 x 120 for 4:3, 160 x 90 for 16:9). Compare Laplacian energy only
 * at the same analysis width, aspect ratio and processing settings.
 * The original RGB frame must still reach MediaPipe without these transforms.
 */
export const DEFAULT_FRAME_QUALITY_OPTIONS = Object.freeze({
  darkPixel: 5,
  brightPixel: 250,
  severeDarkMean: 12,
  severeBrightMean: 248,
  severeClipFraction: 0.98,
  darkWarningMean: 35,
  brightWarningMean: 230,
  lowContrast: 12,
  lowDetailVariance: 2,
});

const invalidFrame = () => ({ valid: false, metrics: null, severeReasons: ['invalid-frame'], warnings: [] });
const finite = Number.isFinite;
function settingsFor(options) {
  const settings = { ...DEFAULT_FRAME_QUALITY_OPTIONS, ...options };
  delete settings.roi;
  for (const [key,value] of Object.entries(settings)) {
    if (!(key in DEFAULT_FRAME_QUALITY_OPTIONS) || !finite(value) || value < 0) throw new TypeError(`Invalid quality option: ${key}`);
    if (key !== 'lowDetailVariance' && key !== 'severeClipFraction' && value > 255) throw new RangeError(`Invalid quality range: ${key}`);
  }
  if (settings.severeClipFraction > 1 || settings.severeClipFraction < 0.5
    || settings.darkPixel >= settings.brightPixel || settings.severeDarkMean >= settings.severeBrightMean) {
    throw new RangeError('Invalid clipping thresholds');
  }
  return settings;
}
function percentile(histogram,count,fraction) {
  const rank = Math.max(1,Math.ceil(count*fraction));
  let sum=0;
  for(let value=0;value<256;value++){sum+=histogram[value];if(sum>=rank)return value;}
  return 255;
}

/** Optional roi is normalized {x,y,width,height}; invalid ROI fails closed. */
export function analyzeFrameQuality(image, options = {}) {
  const settings=settingsFor(options);
  const width=image?.width,height=image?.height,data=image?.data;
  if(!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width<3 || height<3
    || width*height>4194304 || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray)
    || data.length!==width*height*4)return invalidFrame();
  let left=0,top=0,right=width,bottom=height;
  if(options.roi !== undefined){
    const roi=options.roi;
    if(!roi || ![roi.x,roi.y,roi.width,roi.height].every(finite) || roi.x<0 || roi.y<0
      || roi.width<=0 || roi.height<=0 || roi.x+roi.width>1 || roi.y+roi.height>1)return invalidFrame();
    left=Math.floor(roi.x*width);top=Math.floor(roi.y*height);
    right=Math.ceil((roi.x+roi.width)*width);bottom=Math.ceil((roi.y+roi.height)*height);
  }
  const columns=right-left,rows=bottom-top,count=columns*rows;
  if(columns<3 || rows<3)return invalidFrame();
  const luma=new Float64Array(count),histogram=new Uint32Array(256);
  let sum=0,squareSum=0,dark=0,bright=0;
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const offset=((top+y)*width+left+x)*4;
    if(data[offset+3]!==255)return invalidFrame();
    // Rec.709 weights on gamma-encoded byte values: Y' proxy, not lux.
    const value=Math.round(0.2126*data[offset]+0.7152*data[offset+1]+0.0722*data[offset+2]);
    luma[y*columns+x]=value;histogram[value]++;
    sum+=value;squareSum+=value*value;
    if(value<=settings.darkPixel)dark++;
    if(value>=settings.brightPixel)bright++;
  }
  let lapSum=0,lapSquareSum=0,gradientSum=0,interior=0;
  for(let y=1;y<rows-1;y++)for(let x=1;x<columns-1;x++){
    const i=y*columns+x,value=luma[i];
    const lap=luma[i-1]+luma[i+1]+luma[i-columns]+luma[i+columns]-4*value;
    lapSum+=lap;lapSquareSum+=lap*lap;
    gradientSum+=(Math.abs(luma[i+1]-luma[i-1])+Math.abs(luma[i+columns]-luma[i-columns]))/2;
    interior++;
  }
  const meanLuma=sum/count,p05=percentile(histogram,count,.05),p95=percentile(histogram,count,.95);
  const metrics={ width:columns,height:rows,samples:count,meanLuma,p05,p95,contrast:p95-p05,
    stdLuma:Math.sqrt(Math.max(0,squareSum/count-meanLuma*meanLuma)),darkFraction:dark/count,brightFraction:bright/count,
    laplacianVariance:Math.max(0,lapSquareSum/interior-(lapSum/interior)**2),meanGradient:gradientSum/interior };
  const severeReasons=[],warnings=[];
  if(meanLuma<=settings.severeDarkMean && metrics.darkFraction>=settings.severeClipFraction)severeReasons.push('too-dark');
  if(meanLuma>=settings.severeBrightMean && metrics.brightFraction>=settings.severeClipFraction)severeReasons.push('too-bright');
  if(meanLuma<settings.darkWarningMean)warnings.push('dark');
  if(meanLuma>settings.brightWarningMean)warnings.push('bright');
  if(metrics.contrast<settings.lowContrast)warnings.push('low-contrast');
  // A flat, sharply focused matte background can have zero Laplacian energy.
  // Noise can have high energy while the actual hand is blurred: advisory only.
  if(metrics.laplacianVariance<settings.lowDetailVariance)warnings.push('low-detail');
  return {valid:true,metrics,severeReasons,warnings};
}

export const DEFAULT_QUALITY_GATE_OPTIONS=Object.freeze({badHoldMs:200,recoveryHoldMs:600,maxGapMs:250});
/** Never allow gesture dwell time to bridge a severe frame, recovery or gap. */
export class FrameQualityGate {
  constructor(options={}) {
    this.options={...DEFAULT_QUALITY_GATE_OPTIONS,...options};
    for(const [key,value] of Object.entries(this.options))if(!(key in DEFAULT_QUALITY_GATE_OPTIONS) || !finite(value) || value<0)throw new TypeError(`Invalid quality gate option: ${key}`);
    if(this.options.maxGapMs===0)throw new RangeError('maxGapMs must be positive');
    this.reset();
  }
  reset(){this.state='unknown';this.lastTimestamp=null;this.badSince=null;this.goodSince=null;this.reasons=[];this.announced=false;}
  update(analysis,timestampMs) {
    const previous=this.state;
    const goodAnalysis=analysis?.valid===true && analysis.metrics
      && ['meanLuma','contrast','darkFraction','brightFraction','laplacianVariance'].every(key=>finite(analysis.metrics[key]))
      && Array.isArray(analysis.severeReasons) && analysis.severeReasons.every(reason=>typeof reason==='string');
    const severe=goodAnalysis?analysis.severeReasons:['invalid-frame'];
    const timingInvalid=!finite(timestampMs) || (this.lastTimestamp!==null && timestampMs<=this.lastTimestamp);
    const gap=!timingInvalid && this.lastTimestamp!==null && timestampMs-this.lastTimestamp>this.options.maxGapMs;
    if(timingInvalid || gap){this.state='blocked';this.badSince=null;this.goodSince=null;this.reasons=[timingInvalid?'invalid-time':'frame-gap'];}
    this.lastTimestamp=finite(timestampMs)?timestampMs:null;
    if(!timingInvalid){
      if(severe.length){
        if(this.badSince===null)this.badSince=timestampMs;
        this.goodSince=null;this.reasons=[...severe];
        if(timestampMs-this.badSince>=this.options.badHoldMs){this.state='blocked';this.announced=true;}
        else if(this.state!=='blocked')this.state='suspect';
      }else if(this.state==='unknown' || this.state==='good'){
        this.state='good';this.reasons=[];this.badSince=null;this.goodSince=null;this.announced=false;
      }else{
        this.badSince=null;
        if(this.goodSince===null)this.goodSince=timestampMs;
        this.state='recovering';
        if(timestampMs-this.goodSince>=this.options.recoveryHoldMs){this.state='good';this.reasons=[];this.goodSince=null;this.announced=false;}
      }
    }
    const allowActions=this.state==='good';
    return {allowActions,state:this.state,cancelInteraction:!allowActions,changed:this.state!==previous,
      showWarning:this.announced && !allowActions,reasons:[...this.reasons],warnings:Array.isArray(analysis?.warnings)?[...analysis.warnings]:[]};
  }
}
