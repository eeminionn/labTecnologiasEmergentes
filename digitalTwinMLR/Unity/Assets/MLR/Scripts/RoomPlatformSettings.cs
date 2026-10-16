using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace LaReina.DigitalTwin
{
    /// <summary>Quest rendering budget. Desktop presentation remains as authored.</summary>
    [DefaultExecutionOrder(-200)]
    public sealed class RoomPlatformSettings : MonoBehaviour
    {
        void Awake() { Apply(); }

        public void Apply()
        {
            if (Application.platform != RuntimePlatform.Android) return;

            // Includes the inactive headset camera, which becomes active after OpenXR starts.
            foreach (var camera in Resources.FindObjectsOfTypeAll<Camera>())
            {
                if (!camera.gameObject.scene.IsValid()) continue;
                camera.allowHDR = false;
                camera.allowMSAA = true;
                UniversalAdditionalCameraData data;
                if (camera.TryGetComponent(out data))
                {
                    data.renderPostProcessing = false;
                    data.antialiasing = AntialiasingMode.None;
                }
            }
            foreach (var light in Resources.FindObjectsOfTypeAll<Light>())
            {
                if (!light.gameObject.scene.IsValid()) continue;
                if (light.type == LightType.Point || light.type == LightType.Spot)
                    light.shadows = LightShadows.None;
            }
        }
    }
}
