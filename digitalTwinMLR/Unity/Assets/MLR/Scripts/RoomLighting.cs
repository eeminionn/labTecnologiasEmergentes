using UnityEngine;
using UnityEngine.Rendering;

namespace LaReina.DigitalTwin
{
    public sealed class RoomLighting : MonoBehaviour
    {
        public Light[] whiteLights;
        public Light[] accentLights;
        public Light fillLight;
        public bool ambientMode;
        public void Toggle() { ambientMode = !ambientMode; Apply(); }
        void Start()
        {
            var ambient = new SphericalHarmonicsL2();
            ambient.AddAmbientLight(new Color(.30f,.34f,.40f));
            RenderSettings.ambientProbe = ambient;
            Apply();
        }
        void Apply()
        {
            foreach (var light in whiteLights) if (light) light.intensity = ambientMode ? 18f : 8f;
            foreach (var light in accentLights) if (light) light.intensity = ambientMode ? .5f : 1.3f;
            if (fillLight) fillLight.intensity = ambientMode ? .9f : .45f;
        }
    }
}
