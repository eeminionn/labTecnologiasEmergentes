const image=document.getElementById('camera'),waiting=document.getElementById('waiting'),state=document.getElementById('state');
window.cameraPreview.onFrame(frame=>{
  image.src=frame.jpeg;waiting.hidden=true;
  state.textContent=`${frame.hands} ${frame.hands===1?'mano':'manos'} · seguimiento local`;
});
window.cameraPreview.onStatus(status=>{
  if(status.error){waiting.hidden=false;waiting.textContent=status.error;state.textContent='Revisa la cámara en los ajustes del mapa';}
  else if(status.cameraActive){state.textContent=`${status.hands} ${status.hands===1?'mano':'manos'} · seguimiento local`;}
});
