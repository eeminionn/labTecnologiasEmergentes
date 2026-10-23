using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>
    /// A short LED band leads the visitor along the modelled ceiling route.
    /// Route points are in world metres; the emitting mesh's UV.x uses the
    /// same cumulative distance, so curves keep an even LED spacing.
    /// </summary>
    public sealed class CeilingLedGuide : MonoBehaviour
    {
        public Transform desktopEye, xrEye;
        public SeatInteraction desktopSeat, xrSeat;
        public DesktopWalkthrough desktop;
        public Renderer emissiveRenderer;
        public Light guidanceLight;
        public Vector3[] routePoints = new Vector3[0];
        public bool closedLoop;
        [HideInInspector] public bool sourceUvMetres;
        [HideInInspector] public float sourceUvLength;
        public bool pauseWhenMouseReleased = true;
        [Min(.25f)] public float LookAhead = 1.35f;
        [Min(.1f)] public float LitLength = 1.25f;
        [Min(.5f)] public float ActivationDistance = 2.25f;
        [Min(0f)] public float PositionTieTolerance = .025f;
        [Min(0f)] public float FadeTime = .20f;

        public float CurrentDistance { get; private set; }
        public float RouteLength { get; private set; }
        public float IlluminatedStart => closedLoop ? Wrap(CurrentDistance + LookAhead) : Mathf.Min(RouteLength, CurrentDistance + LookAhead);
        public float VisibleIntensity { get; private set; }
        public bool IsGuiding => VisibleIntensity > .01f;
        public bool HasNearbyRoute { get; private set; }
        public bool HasTrackedPosition { get; private set; }

        static readonly int HeadId = Shader.PropertyToID("_HeadDistance");
        static readonly int LengthId = Shader.PropertyToID("_RouteLength");
        static readonly int LookAheadId = Shader.PropertyToID("_LookAhead");
        static readonly int LitLengthId = Shader.PropertyToID("_LitLength");
        static readonly int VisibilityId = Shader.PropertyToID("_Visibility");
        static readonly int ClosedId = Shader.PropertyToID("_ClosedLoop");
        float[] lengths = new float[0];
        int segmentCount;
        MaterialPropertyBlock properties;
        float lampIntensity = .32f;

        void Start()
        {
            RebuildRouteCache();
            if (guidanceLight) lampIntensity = guidanceLight.intensity;
            RefreshProgress(true);
            AdvanceVisuals(0f);
        }

        void Update()
        {
            RefreshProgress();
            AdvanceVisuals(Time.unscaledDeltaTime);
        }

        /// <summary>Call after importing an ordered route; no geometry is generated here.</summary>
        public void RebuildRouteCache()
        {
            segmentCount = routePoints == null || routePoints.Length < 2 ? 0 : routePoints.Length - (closedLoop ? 0 : 1);
            lengths = new float[segmentCount + 1];
            for (int i = 0; i < segmentCount; i++)
                lengths[i + 1] = lengths[i] + Vector3.Distance(routePoints[i], routePoints[(i + 1) % routePoints.Length]);
            RouteLength = lengths[segmentCount];
            CurrentDistance = Mathf.Clamp(CurrentDistance, 0f, RouteLength);
            HasTrackedPosition = false;
            HasNearbyRoute = false;
        }

        Transform ActiveVisitor()
        {
            var camera = xrEye ? xrEye.GetComponent<Camera>() : null;
            return camera && camera.enabled && xrEye.gameObject.activeInHierarchy ? xrEye : desktopEye;
        }

        bool VisitorIsSeated(Transform visitor)
        {
            return (visitor == desktopEye && desktopSeat && desktopSeat.IsSeated) ||
                (visitor == xrEye && xrSeat && xrSeat.IsSeated);
        }

        bool IsPaused(Transform visitor)
        {
            if (!visitor || VisitorIsSeated(visitor) || Time.timeScale <= 0f) return true;
            if (visitor == desktopEye && pauseWhenMouseReleased && Cursor.lockState != CursorLockMode.Locked && !(desktop && desktop.automation)) return true;
            return false;
        }

        float Wrap(float distance) => RouteLength > .001f ? Mathf.Repeat(distance, RouteLength) : 0f;

        float ArcDelta(float candidate)
        {
            float delta = candidate - CurrentDistance;
            if (closedLoop && RouteLength > .001f)
            {
                if (delta > RouteLength * .5f) delta -= RouteLength;
                if (delta < -RouteLength * .5f) delta += RouteLength;
            }
            return delta;
        }

        /// <summary>
        /// Find the globally nearest section in XZ on every reading. Continuity
        /// resolves only a small geometric tie; it never blocks a return or a
        /// slow approach to another section of the room.
        /// </summary>
        public void RefreshProgress(bool allowJump = false)
        {
            if (RouteLength <= .001f || segmentCount == 0) return;
            Transform visitor = ActiveVisitor();
            if (!visitor || VisitorIsSeated(visitor)) return;
            Vector3 point = visitor.position;
            point.y = 0f;
            float bestDistance = float.PositiveInfinity;
            float nearestArc = CurrentDistance;
            for (int i = 0; i < segmentCount; i++)
            {
                if (!ProjectSegment(point, i, out float arc, out float squaredDistance) || squaredDistance >= bestDistance) continue;
                bestDistance = squaredDistance;
                nearestArc = arc;
            }
            HasNearbyRoute = bestDistance <= ActivationDistance * ActivationDistance;
            if (!HasNearbyRoute) return;
            if (HasTrackedPosition && !allowJump && PositionTieTolerance > 0f)
            {
                float limit = Mathf.Min(ActivationDistance, Mathf.Sqrt(bestDistance) + PositionTieTolerance);
                float bestContinuity = Mathf.Abs(ArcDelta(nearestArc));
                for (int i = 0; i < segmentCount; i++)
                {
                    if (!ProjectSegment(point, i, out float arc, out float squaredDistance) || squaredDistance > limit * limit) continue;
                    float continuity = Mathf.Abs(ArcDelta(arc));
                    if (continuity >= bestContinuity) continue;
                    bestContinuity = continuity;
                    nearestArc = arc;
                }
            }
            CurrentDistance = nearestArc;
            HasTrackedPosition = true;
            ApplyVisuals();
        }

        bool ProjectSegment(Vector3 point, int index, out float arc, out float squaredDistance)
        {
            Vector3 a = routePoints[index], b = routePoints[(index + 1) % routePoints.Length];
            a.y = b.y = 0f;
            Vector3 edge = b - a;
            if (edge.sqrMagnitude < .000001f) { arc = 0f; squaredDistance = float.PositiveInfinity; return false; }
            float t = Mathf.Clamp01(Vector3.Dot(point - a, edge) / edge.sqrMagnitude);
            arc = Mathf.Lerp(lengths[index], lengths[index + 1], t);
            squaredDistance = (point - (a + edge * t)).sqrMagnitude;
            return true;
        }

        public Vector3 PointAtDistance(float distance)
        {
            if (segmentCount == 0) return transform.position;
            distance = closedLoop ? Wrap(distance) : Mathf.Clamp(distance, 0f, RouteLength);
            for (int i = 0; i < segmentCount; i++)
                if (distance <= lengths[i + 1] || i == segmentCount - 1)
                {
                    float span = lengths[i + 1] - lengths[i];
                    float t = span > .00001f ? (distance - lengths[i]) / span : 0f;
                    return Vector3.Lerp(routePoints[i], routePoints[(i + 1) % routePoints.Length], t);
                }
            return routePoints[0];
        }

        public void AdvanceVisuals(float deltaTime)
        {
            bool hasAhead = closedLoop || CurrentDistance + LookAhead < RouteLength;
            // Loss of range freezes the last valid cue; it does not erase it.
            float target = HasTrackedPosition && hasAhead && !IsPaused(ActiveVisitor()) ? 1f : 0f;
            VisibleIntensity = FadeTime <= 0f ? target : Mathf.MoveTowards(VisibleIntensity, target, Mathf.Max(0f, deltaTime) / FadeTime);
            ApplyVisuals();
        }

        void ApplyVisuals()
        {
            if (emissiveRenderer)
            {
                if (properties == null) properties = new MaterialPropertyBlock();
                emissiveRenderer.GetPropertyBlock(properties);
                properties.SetFloat(HeadId, CurrentDistance);
                properties.SetFloat(LengthId, RouteLength);
                properties.SetFloat(LookAheadId, LookAhead);
                properties.SetFloat(LitLengthId, LitLength);
                properties.SetFloat(VisibilityId, VisibleIntensity);
                properties.SetFloat(ClosedId, closedLoop ? 1f : 0f);
                emissiveRenderer.SetPropertyBlock(properties);
            }
            if (guidanceLight)
            {
                guidanceLight.enabled = VisibleIntensity > .001f;
                guidanceLight.intensity = lampIntensity * VisibleIntensity;
                guidanceLight.transform.position = PointAtDistance(CurrentDistance + LookAhead + LitLength * .5f) + Vector3.down * .06f;
            }
        }

        void OnDisable()
        {
            VisibleIntensity = 0f;
            if (guidanceLight) guidanceLight.enabled = false;
            if (!emissiveRenderer) return;
            if (properties == null) properties = new MaterialPropertyBlock();
            emissiveRenderer.GetPropertyBlock(properties);
            properties.SetFloat(VisibilityId, 0f);
            emissiveRenderer.SetPropertyBlock(properties);
        }
    }
}
