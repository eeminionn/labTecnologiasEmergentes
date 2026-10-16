let current;
const $ = id => document.getElementById(id);
function populate(data, values = true) {
  if (!data) return;
  current = data;
  const selected = values ? (data.devices.find(device=>device.deviceId===data.preferences.cameraId)?.deviceId
    || data.devices.find(device=>device.label && device.label===data.preferences.cameraLabel)?.deviceId || '') : $('camera').value;
  $('camera').replaceChildren(new Option('Cámara predeterminada', ''));
  data.devices.forEach((device,index) => $('camera').add(new Option(device.label || `Cámara ${index+1}`, device.deviceId)));
  $('camera').value = selected;
  if(values) {
    $('mirror').checked = data.preferences.mirror;
    $('rotation').value = data.preferences.rotation;
    $('confidence').value = data.preferences.confidence;
  }
  $('state').textContent = data.error || (data.cameraActive ? 'Cámara activa · procesamiento local de manos.' : 'Esperando la cámara.');
}
window.cameraSettings.onData(data => populate(data,false));
window.cameraSettings.get().then(data => populate(data));
$('close').onclick = () => window.cameraSettings.close();
$('save').onclick = async () => {
  if (!current) return;
  const cameraId = $('camera').value;
  const preferences = { ...current.preferences, cameraId,
    cameraLabel: current.devices.find(device => device.deviceId === cameraId)?.label || '',
    mirror: $('mirror').checked, rotation: +$('rotation').value, confidence: +$('confidence').value };
  $('save').disabled=true;
  const accepted = await window.cameraSettings.save(preferences);
  $('save').disabled=false;
  if(accepted)$('state').textContent='Cambios aplicados. La cámara se está reiniciando.';
};
