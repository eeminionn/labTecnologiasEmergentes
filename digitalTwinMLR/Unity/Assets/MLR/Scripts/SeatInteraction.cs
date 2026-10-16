using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>
    /// A chair fixes the virtual walking origin. In XR, the native headset pose
    /// remains 1:1: only the initial tracking offset is removed when sitting.
    /// This avoids moving the world against a person's physical head movement.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class SeatInteraction : MonoBehaviour
    {
        [System.Serializable]
        public sealed class SeatSpot
        {
            public Transform chair;
            public Transform eyeAnchor;
            public Transform standAnchor;
        }
        public Camera eye;
        public SeatSpot[] Seats = new SeatSpot[0];
        public Vector3 tableFocus;
        public bool xrMode;
        [Min(.5f)] public float seatedEyeHeight = 1.18f;
        [Min(.5f)] public float interactionRange = 1.5f;
        public LayerMask floorMask = 1 << 8;
        public LayerMask obstructionMask = ~0;

        public bool IsSeated { get; private set; }
        public event System.Action SeatChanged;
        public Transform CurrentChair { get; private set; }
        public Transform AvailableChair { get; private set; }
        public float CurrentEyeHeight => currentSeat != null && currentSeat.eyeAnchor != null ?
            currentSeat.eyeAnchor.position.y - currentSeat.chair.position.y : seatedEyeHeight;
        public string Prompt
        {
            get
            {
                if (Time.unscaledTime < blockedUntil) return "No hay espacio libre para levantarse";
                string button = xrMode ? "A" : "E";
                return IsSeated ? button + " · levantarse" : AvailableChair ? button + " · sentarse" : "";
            }
        }

        readonly Collider[] overlaps = new Collider[64];
        readonly RaycastHit[] hits = new RaycastHit[64];
        CharacterController body;
        Vector3 savedStandingFloor;
        Vector3 seatedTrackingOrigin;
        float standingHeight = 1.78f;
        float blockedUntil;
        TextMesh xrPrompt;
        SeatSpot currentSeat;
        SeatSpot availableSeat;

        public void Initialize(Camera camera, SeatSpot[] seatDefinitions, Vector3 focus, bool useXr)
        {
            eye = camera;
            Seats = seatDefinitions;
            tableFocus = focus;
            xrMode = useXr;
            body = GetComponent<CharacterController>();
        }

        void Awake() { body = GetComponent<CharacterController>(); }

        public void RefreshCandidate()
        {
            AvailableChair = null;
            availableSeat = null;
            if (eye != null && !IsSeated)
            {
                Vector3 floor = eye.transform.position;
                float bestScore = float.PositiveInfinity;
                foreach (var spot in Seats)
                {
                    if (spot == null) continue;
                    var chair = spot.chair;
                    if (!chair || !chair.gameObject.activeInHierarchy) continue;
                    Vector3 offset = chair.position - floor;
                    float distance = Vector3.ProjectOnPlane(offset, Vector3.up).magnitude;
                    if (distance > interactionRange || !ChairVisible(chair)) continue;
                    // Nearby chairs remain usable without pixel-accurate aiming.
                    Vector3 direction = (chair.position + Vector3.up * .72f - eye.transform.position).normalized;
                    float score = distance + (1f - Vector3.Dot(eye.transform.forward, direction)) * .3f;
                    if (score < bestScore) { bestScore = score; AvailableChair = chair; availableSeat = spot; }
                }
            }
            UpdateXrPrompt();
        }

        bool ChairVisible(Transform chair)
        {
            Vector3 target = chair.position + Vector3.up * .78f;
            Vector3 difference = target - eye.transform.position;
            int count = Physics.RaycastNonAlloc(eye.transform.position, difference.normalized, hits,
                difference.magnitude, obstructionMask, QueryTriggerInteraction.Ignore);
            if (count == hits.Length) return false;
            float distance = float.PositiveInfinity;
            Collider nearest = null;
            for (int i = 0; i < count; i++)
            {
                if (hits[i].transform.IsChildOf(transform)) continue;
                if (hits[i].distance < distance) { nearest = hits[i].collider; distance = hits[i].distance; }
            }
            return nearest == null || nearest.transform == chair || nearest.transform.IsChildOf(chair);
        }

        public bool TryToggleSeat(Vector3 trackedPosition, Quaternion trackedRotation)
        {
            if (!body || !eye) return false;
            if (IsSeated) return TryStand(trackedPosition);
            RefreshCandidate();
            if (AvailableChair == null) return false;

            CurrentChair = AvailableChair;
            currentSeat = availableSeat;
            savedStandingFloor = eye.transform.position;
            RaycastHit support;
            if (Physics.Raycast(savedStandingFloor, Vector3.down, out support, 3f, floorMask, QueryTriggerInteraction.Ignore))
                savedStandingFloor = support.point;
            else savedStandingFloor.y = transform.position.y;
            standingHeight = Mathf.Max(1.78f, body.height);
            if (xrMode) standingHeight = Mathf.Max(standingHeight, trackedPosition.y + .12f);
            seatedTrackingOrigin = trackedPosition;

            Vector3 facing = Vector3.ProjectOnPlane(tableFocus - CurrentChair.position, Vector3.up);
            if (facing.sqrMagnitude < .001f) facing = transform.forward;
            float yaw = Quaternion.LookRotation(facing).eulerAngles.y;
            if (xrMode) yaw -= trackedRotation.eulerAngles.y;
            body.enabled = false;
            Vector3 seatedFloor = currentSeat != null && currentSeat.eyeAnchor != null ?
                currentSeat.eyeAnchor.position - Vector3.up * CurrentEyeHeight : CurrentChair.position;
            transform.SetPositionAndRotation(seatedFloor, Quaternion.Euler(0f, yaw, 0f));
            IsSeated = true;
            SeatChanged?.Invoke();
            blockedUntil = 0f;
            UpdateXrPrompt();
            return true;
        }

        public bool TryToggleSeat() { return TryToggleSeat(Vector3.zero, Quaternion.identity); }

        public Vector3 SeatedTrackedPosition(Vector3 nativePosition)
        {
            return Vector3.up * CurrentEyeHeight + nativePosition - seatedTrackingOrigin;
        }

        bool TryStand(Vector3 nativePosition)
        {
            Vector3 destination;
            if (!TryFindStandingPosition(out destination))
            {
                blockedUntil = Time.unscaledTime + 2f;
                UpdateXrPrompt();
                return false;
            }
            Vector3 trackingOffset = xrMode ? Vector3.ProjectOnPlane(transform.rotation * nativePosition, Vector3.up) : Vector3.zero;
            body.enabled = false;
            transform.position = destination - trackingOffset + Vector3.up * .025f;
            body.height = standingHeight;
            body.center = new Vector3(xrMode ? nativePosition.x : 0f, standingHeight * .5f, xrMode ? nativePosition.z : 0f);
            IsSeated = false;
            CurrentChair = null;
            currentSeat = null;
            body.enabled = true;
            SeatChanged?.Invoke();
            blockedUntil = 0f;
            RefreshCandidate();
            return true;
        }

        bool TryFindStandingPosition(out Vector3 destination)
        {
            if (currentSeat != null && currentSeat.standAnchor != null && CanStandAt(currentSeat.standAnchor.position))
            { destination = currentSeat.standAnchor.position; return true; }
            if (CanStandAt(savedStandingFloor)) { destination = savedStandingFloor; return true; }
            Vector3 chairFloor = CurrentChair ? CurrentChair.position : transform.position;
            // The entry position is preferred. Additional positions are all
            // close to this chair and must have a fully supported clear capsule.
            foreach (float radius in new[] { .85f, 1.1f, 1.35f })
                for (int i = 0; i < 12; i++)
                {
                    float angle = i * 30f * Mathf.Deg2Rad;
                    Vector3 candidate = chairFloor + new Vector3(Mathf.Sin(angle), 0f, Mathf.Cos(angle)) * radius;
                    RaycastHit hit;
                    if (!Physics.Raycast(candidate + Vector3.up * .3f, Vector3.down, out hit, .6f, floorMask, QueryTriggerInteraction.Ignore)) continue;
                    if (CanStandAt(hit.point)) { destination = hit.point; return true; }
                }
            destination = Vector3.zero;
            return false;
        }

        public bool CanStandAt(Vector3 floor)
        {
            if (body == null || floorMask.value == 0) return false;
            float radius = body.radius + .035f;
            Vector3 bottom = floor + Vector3.up * (radius + .065f);
            Vector3 top = floor + Vector3.up * (standingHeight - radius + .065f);
            int count = Physics.OverlapCapsuleNonAlloc(bottom, top, radius, overlaps, obstructionMask, QueryTriggerInteraction.Ignore);
            if (count == overlaps.Length) return false;
            for (int i = 0; i < count; i++)
                if (!overlaps[i].transform.IsChildOf(transform)) return false;
            return Supported(floor, Vector3.zero) && Supported(floor, Vector3.right * radius) &&
                Supported(floor, Vector3.left * radius) && Supported(floor, Vector3.forward * radius) && Supported(floor, Vector3.back * radius);
        }

        bool Supported(Vector3 point, Vector3 offset)
        {
            RaycastHit hit;
            return Physics.Raycast(point + offset + Vector3.up * .2f, Vector3.down, out hit, .3f, floorMask, QueryTriggerInteraction.Ignore) &&
                Mathf.Abs(hit.point.y - point.y) < .07f && Vector3.Angle(hit.normal, Vector3.up) <= 10f;
        }

        public void CancelSeat()
        {
            IsSeated = false;
            CurrentChair = null;
            currentSeat = null;
            AvailableChair = null;
            availableSeat = null;
            blockedUntil = 0f;
            if (body != null) body.enabled = true;
            SeatChanged?.Invoke();
            UpdateXrPrompt();
        }

        void UpdateXrPrompt()
        {
            if (!xrMode || eye == null) return;
            string text = Prompt;
            if (xrPrompt == null && text.Length != 0)
            {
                xrPrompt = new GameObject("Acción de silla — A").AddComponent<TextMesh>();
                xrPrompt.transform.SetParent(eye.transform, false);
                xrPrompt.transform.localPosition = new Vector3(0f, -.32f, 1.15f);
                xrPrompt.characterSize = .012f;
                xrPrompt.fontSize = 40;
                xrPrompt.anchor = TextAnchor.MiddleCenter;
                xrPrompt.alignment = TextAlignment.Center;
                xrPrompt.color = Color.white;
                xrPrompt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                xrPrompt.GetComponent<MeshRenderer>().sharedMaterial = xrPrompt.font.material;
            }
            if (xrPrompt != null)
            {
                xrPrompt.text = text;
                xrPrompt.gameObject.SetActive(text.Length != 0 && eye.enabled);
            }
        }
    }
}
