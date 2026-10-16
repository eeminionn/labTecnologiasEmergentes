using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Temporary vertical adjustments. Authored dimensions and all horizontal coordinates remain unchanged.</summary>
    public sealed class RuntimeTableAdjustment : MonoBehaviour
    {
        public Transform tableTop, pedestal, inset, projection;
        public const float MinimumTableOffset = -.20f, MaximumTableOffset = .10f;
        public const float RequestedMinimumMapOffset = -.08f, MaximumMapOffset = .05f;
        public float TableOffset { get; private set; }
        public float MapOffset { get; private set; }
        public float MinimumMapOffset { get; private set; } = RequestedMinimumMapOffset;
        public float InitialProjectionHeight { get; private set; }
        public float ProjectionHeight => ProjectionBounds.max.y;
        public bool Initialized { get; private set; }
        public Bounds TableTopBounds => BoundsOf(tableTop);
        public Bounds PedestalBounds => BoundsOf(pedestal);
        public Bounds InsetBounds => BoundsOf(inset);
        public Bounds ProjectionBounds => BoundsOf(projection);

        Vector3 initialTop, initialInset, initialProjection;
        Bounds initialPedestalBounds;
        Transform pedestalPivot;
        Vector3 pivotScale;

        void Awake() { Initialize(); }
        void Start() { Initialize(); }

        public void Initialize()
        {
            if (Initialized || !tableTop || !pedestal || !inset || !projection) return;
            initialTop=tableTop.position; initialInset=inset.position; initialProjection=projection.position;
            initialPedestalBounds=PedestalBounds;
            InitialProjectionHeight=ProjectionHeight;
            // The physical inset may descend only while clearing the pedestal.
            // Both its floor and the pedestal top share TableOffset, so it cancels here.
            MinimumMapOffset=Mathf.Clamp(initialPedestalBounds.max.y+.008f-InsetBounds.min.y,
                RequestedMinimumMapOffset,0f);
            TableOffset=0f; MapOffset=0f; Initialized=true;
        }

        public void MoveTable(float deltaMeters)
        {
            Initialize();
            if (!Initialized || deltaMeters==0f || float.IsNaN(deltaMeters) || float.IsInfinity(deltaMeters)) return;
            TableOffset=Mathf.Clamp(TableOffset+deltaMeters,MinimumTableOffset,MaximumTableOffset);
            Apply();
        }
        public void MoveMap(float deltaMeters)
        {
            Initialize();
            if (!Initialized || deltaMeters==0f || float.IsNaN(deltaMeters) || float.IsInfinity(deltaMeters)) return;
            MapOffset=Mathf.Clamp(MapOffset+deltaMeters,MinimumMapOffset,MaximumMapOffset);
            Apply();
        }
        public void ResetAdjustments()
        {
            Initialize(); if(!Initialized)return;
            TableOffset=0f; MapOffset=0f; Apply();
        }
        void Apply()
        {
            if (!pedestalPivot && Mathf.Abs(TableOffset)>.000001f)
            {
                // A world-aligned pivot also handles FBX meshes whose local up axis differs.
                pedestalPivot=new GameObject("Pedestal — ajuste vertical desde el piso").transform;
                pedestalPivot.SetPositionAndRotation(new Vector3(initialPedestalBounds.center.x,
                    initialPedestalBounds.min.y,initialPedestalBounds.center.z),Quaternion.identity);
                pedestalPivot.SetParent(pedestal.parent,true);
                pivotScale=pedestalPivot.localScale;
                pedestal.SetParent(pedestalPivot,true);
            }
            if (pedestalPivot)
            {
                float height=Mathf.Max(.001f,initialPedestalBounds.size.y);
                pedestalPivot.localScale=Vector3.Scale(pivotScale,new Vector3(1f,(height+TableOffset)/height,1f));
            }
            tableTop.position=initialTop+Vector3.up*TableOffset;
            inset.position=initialInset+Vector3.up*(TableOffset+MapOffset);
            projection.position=initialProjection+Vector3.up*(TableOffset+MapOffset);
            Physics.SyncTransforms();
        }
        static Bounds BoundsOf(Transform part)
        {
            if(!part)return new Bounds();
            var renderers=part.GetComponentsInChildren<Renderer>();
            if(renderers.Length==0)return new Bounds(part.position,Vector3.zero);
            var bounds=renderers[0].bounds;
            for(int i=1;i<renderers.Length;i++)bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }
    }
}
