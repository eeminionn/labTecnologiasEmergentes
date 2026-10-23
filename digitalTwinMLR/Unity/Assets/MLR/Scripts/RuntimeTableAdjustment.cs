using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Temporary vertical adjustments. Authored dimensions and all horizontal coordinates remain unchanged.</summary>
    public sealed class RuntimeTableAdjustment : MonoBehaviour
    {
        public Transform tableTop, pedestal, inset, projection;
        public const float MinimumTableOffset = -.20f, MaximumTableOffset = .10f;
        public const float RequestedMinimumMapOffset = -.20f, MaximumMapOffset = .05f;
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
        Bounds initialPedestalBounds, initialInsetBounds;
        Transform pedestalPivot;
        Vector3 pivotScale;

        void Awake() { Initialize(); }
        void Start() { Initialize(); }

        public void Initialize()
        {
            if (Initialized || !tableTop || !pedestal || !inset || !projection) return;
            initialTop=tableTop.position; initialInset=inset.position; initialProjection=projection.position;
            initialPedestalBounds=PedestalBounds;
            initialInsetBounds=InsetBounds;
            InitialProjectionHeight=ProjectionHeight;
            // The pedestal contracts only when the lowered inset needs space;
            // it no longer limits the available map travel.
            MinimumMapOffset=RequestedMinimumMapOffset;
            TableOffset=0f; MapOffset=0f; Initialized=true;
        }

        public void MoveTable(float deltaMeters)
        {
            Initialize();
            if (!Initialized || deltaMeters==0f || float.IsNaN(deltaMeters) || float.IsInfinity(deltaMeters)) return;
            SetOffsets(TableOffset+deltaMeters,MapOffset);
        }
        public void MoveMap(float deltaMeters)
        {
            Initialize();
            if (!Initialized || deltaMeters==0f || float.IsNaN(deltaMeters) || float.IsInfinity(deltaMeters)) return;
            SetOffsets(TableOffset,MapOffset+deltaMeters);
        }
        public void SetOffsets(float tableOffset,float mapOffset)
        {
            Initialize();
            if (!Initialized || float.IsNaN(tableOffset) || float.IsInfinity(tableOffset) ||
                float.IsNaN(mapOffset) || float.IsInfinity(mapOffset)) return;
            TableOffset=Mathf.Clamp(tableOffset,MinimumTableOffset,MaximumTableOffset);
            MapOffset=Mathf.Clamp(mapOffset,MinimumMapOffset,MaximumMapOffset);
            Apply();
        }
        public void ResetAdjustments()
        {
            Initialize(); if(!Initialized)return;
            SetOffsets(0f,0f);
        }
        void Apply()
        {
            float initialHeight=Mathf.Max(.001f,initialPedestalBounds.size.y);
            float insetClearanceHeight=initialInsetBounds.min.y+TableOffset+MapOffset-.008f-initialPedestalBounds.min.y;
            float pedestalHeight=Mathf.Max(.001f,Mathf.Min(initialHeight+TableOffset,insetClearanceHeight));
            if (!pedestalPivot && Mathf.Abs(pedestalHeight-initialHeight)>.000001f)
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
                pedestalPivot.localScale=Vector3.Scale(pivotScale,new Vector3(1f,pedestalHeight/initialHeight,1f));
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
