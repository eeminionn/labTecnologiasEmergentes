using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>A named, replaceable video surface. Geometry and UVs stay editable.</summary>
    public sealed class ProjectionSurface : MonoBehaviour
    {
        public string channelId = "mesa";
        public Renderer targetRenderer;
        public int materialSlot;
        public Texture fallback;
        public float surfaceAspect = .6f;
        public int fitMode;
        public bool ovalMask;
        [HideInInspector] public float sourceUvArea;
        [HideInInspector] public bool sourceUvsWithinOval;
        [Range(0.1f, 3f)] public float brightness = 1f;

        Material instance;
        public void Bind(Texture texture)
        {
            if (!targetRenderer) return;
            if (!instance)
            {
                var materials = targetRenderer.sharedMaterials;
                if (materialSlot < 0 || materialSlot >= materials.Length) return;
                instance = new Material(materials[materialSlot]);
                materials[materialSlot] = instance;
                targetRenderer.sharedMaterials = materials;
            }
            instance.SetTexture("_BaseMap", texture ? texture : fallback);
            instance.SetColor("_BaseColor", Color.white * brightness);
            instance.SetFloat("_SurfaceAspect", surfaceAspect);
            instance.SetFloat("_FitMode", fitMode);
            instance.SetFloat("_OvalMask", ovalMask ? 1f : 0f);
            RefreshTextureDimensions();
        }
        public void RefreshTextureDimensions()
        {
            if (!instance) return;
            var texture = instance.GetTexture("_BaseMap");
            if (texture) instance.SetFloat("_VideoAspect", (float)texture.width / Mathf.Max(1,texture.height));
        }
        void OnDestroy() { if (instance) Destroy(instance); }
    }
}
