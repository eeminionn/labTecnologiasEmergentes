using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;

namespace LaReina.DigitalTwin
{
    /// <summary>
    /// Optional headset rig, driven once through the native XR Feature API.
    /// OpenXR must be configured for Android; this does not initialize a provider.
    /// Left trigger: hold to aim, release to teleport. Left stick: optional walk.
    /// Right stick: snap turn. Teleport requires a collider on the Floor layer.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class XrWalkthrough : MonoBehaviour
    {
        public Camera headsetCamera;
        public GameObject desktopRig;
        public bool smoothLocomotion = true;
        [Min(0.1f)] public float movementSpeed = 1.35f;
        [Range(0.05f, 0.5f)] public float stickDeadzone = 0.2f;
        [Range(15f, 90f)] public float snapTurnDegrees = 30f;
        public float deviceOriginEyeHeight = 1.65f;
        public LayerMask teleportFloorMask;
        public LayerMask teleportCollisionMask = ~0;
        [Min(1f)] public float teleportRange = 12f;
        [Range(0f, 30f)] public float maximumLandingSlope = 10f;

        readonly List<XRInputSubsystem> inputSubsystems = new List<XRInputSubsystem>();
        readonly RaycastHit[] rayHits = new RaycastHit[64];
        readonly Collider[] landingOverlaps = new Collider[64];
        CharacterController body;
        AudioListener listener;
        LineRenderer teleportRay;
        Material rayMaterial;
        bool wasActive;
        bool turnReady = true;
        bool usesFloorOrigin;
        bool teleportAiming;
        bool headPoseValid;
        float verticalVelocity;
        float nextOriginRetry;

        public void Configure(Camera camera, GameObject desktop)
        {
            headsetCamera = camera;
            desktopRig = desktop;
            if (teleportFloorMask.value == 0) teleportFloorMask = LayerMask.GetMask("Floor");
            if (Application.isPlaying) Initialize();
        }

        void Awake()
        {
            Initialize();
            SetRigActive(false);
        }

        void Initialize()
        {
            body = GetComponent<CharacterController>();
            body.radius = 0.2f;
            body.stepOffset = 0.12f;
            body.slopeLimit = 45f;
            body.skinWidth = 0.025f;
            if (teleportFloorMask.value == 0) teleportFloorMask = LayerMask.GetMask("Floor");
            if (headsetCamera != null)
            {
                headsetCamera.nearClipPlane = 0.05f;
                headsetCamera.stereoTargetEye = StereoTargetEyeMask.Both;
                listener = headsetCamera.GetComponent<AudioListener>();
                // Modern OpenXR cameras use an explicit pose driver. This component
                // is that driver, so a second TrackedPoseDriver must not also run.
                var otherDriver = headsetCamera.GetComponent<UnityEngine.InputSystem.XR.TrackedPoseDriver>();
                if (otherDriver != null) otherDriver.enabled = false;
            }
        }

        void OnEnable()
        {
            Application.onBeforeRender += ApplyHeadPose;
        }

        void OnDisable()
        {
            Application.onBeforeRender -= ApplyHeadPose;
            CancelTeleport();
            SetRigActive(false);
            wasActive = false;
            verticalVelocity = 0f;
            headPoseValid = false;
        }

        void Update()
        {
            bool active = XRSettings.isDeviceActive && headsetCamera != null;
            if (active != wasActive)
            {
                if (active)
                {
                    ConfigureTrackingOrigin();
                }
                else CancelTeleport();
                SetRigActive(active);
                wasActive = active;
            }
            if (!active) return;
            if (!usesFloorOrigin && Time.unscaledTime >= nextOriginRetry) ConfigureTrackingOrigin();

            ApplyHeadPose();
            if (!headPoseValid) { CancelTeleport(); return; }
            var head = headsetCamera.transform;
            body.height = Mathf.Max(body.radius * 2f, Mathf.Clamp(head.localPosition.y, 0.55f, 2.3f) + 0.12f);
            body.center = new Vector3(head.localPosition.x, body.height * 0.5f, head.localPosition.z);

            var left = InputDevices.GetDeviceAtXRNode(XRNode.LeftHand);
            UpdateTeleport(left);

            Vector2 move = Vector2.zero;
            if (smoothLocomotion && !teleportAiming)
            {
                left.TryGetFeatureValue(CommonUsages.primary2DAxis, out move);
                move = ApplyDeadzone(move);
            }
            Vector3 forward = Vector3.ProjectOnPlane(head.forward, Vector3.up).normalized;
            Vector3 right = Vector3.Cross(Vector3.up, forward).normalized;
            if (body.isGrounded && verticalVelocity < 0f) verticalVelocity = -1f;
            verticalVelocity += Physics.gravity.y * Time.deltaTime;
            Vector3 velocity = (forward * move.y + right * move.x) * movementSpeed;
            velocity.y = verticalVelocity;
            body.Move(velocity * Time.deltaTime);

            Vector2 turn;
            var rightHand = InputDevices.GetDeviceAtXRNode(XRNode.RightHand);
            if (!rightHand.TryGetFeatureValue(CommonUsages.primary2DAxis, out turn)) turn = Vector2.zero;
            if (Mathf.Abs(turn.x) < 0.25f) turnReady = true;
            if (!teleportAiming && turnReady && Mathf.Abs(turn.x) > 0.7f)
            {
                transform.RotateAround(head.position, Vector3.up, Mathf.Sign(turn.x) * snapTurnDegrees);
                turnReady = false;
            }
        }

        Vector2 ApplyDeadzone(Vector2 axis)
        {
            float magnitude = axis.magnitude;
            if (magnitude <= stickDeadzone) return Vector2.zero;
            return axis.normalized * Mathf.Clamp01((magnitude - stickDeadzone) / (1f - stickDeadzone));
        }

        void UpdateTeleport(InputDevice left)
        {
            float trigger;
            Vector3 localPosition;
            Quaternion localRotation;
            bool tracked;
            bool poseAvailable = left.isValid &&
                (!left.TryGetFeatureValue(CommonUsages.isTracked, out tracked) || tracked) &&
                left.TryGetFeatureValue(CommonUsages.trigger, out trigger) &&
                left.TryGetFeatureValue(CommonUsages.devicePosition, out localPosition) &&
                left.TryGetFeatureValue(CommonUsages.deviceRotation, out localRotation);
            // Lost controller tracking cancels the gesture; it must never count as release.
            if (!poseAvailable) { CancelTeleport(); return; }
            left.TryGetFeatureValue(CommonUsages.trigger, out trigger);
            left.TryGetFeatureValue(CommonUsages.devicePosition, out localPosition);
            left.TryGetFeatureValue(CommonUsages.deviceRotation, out localRotation);
            if (!usesFloorOrigin) localPosition.y += deviceOriginEyeHeight;
            var aim = new Ray(transform.TransformPoint(localPosition), transform.rotation * localRotation * Vector3.forward);

            if (!teleportAiming && trigger >= 0.65f) teleportAiming = true;
            if (!teleportAiming) return;

            Vector3 destination;
            Vector3 endPoint;
            bool valid = TryFindTeleportDestination(aim, out destination, out endPoint);
            DrawTeleportRay(aim.origin, endPoint, valid);
            if (trigger <= 0.2f)
            {
                // Recheck the current aim and standing volume on the release frame.
                if (valid && CanStandAt(destination)) TeleportTo(destination);
                CancelTeleport();
            }
        }

        bool TryFindTeleportDestination(Ray aim, out Vector3 destination, out Vector3 endPoint)
        {
            destination = Vector3.zero;
            endPoint = aim.GetPoint(teleportRange);
            int count = Physics.RaycastNonAlloc(aim, rayHits, teleportRange, teleportCollisionMask, QueryTriggerInteraction.Ignore);
            if (count == rayHits.Length) return false; // A full buffer cannot establish the nearest safe blocker.
            int closest = -1;
            float distance = float.PositiveInfinity;
            for (int i = 0; i < count; i++)
            {
                if (rayHits[i].collider.transform.IsChildOf(transform)) continue;
                if (rayHits[i].distance < distance) { closest = i; distance = rayHits[i].distance; }
            }
            if (closest < 0) return false;
            var hit = rayHits[closest];
            endPoint = hit.point;
            if ((teleportFloorMask.value & (1 << hit.collider.gameObject.layer)) == 0) return false;
            if (Vector3.Angle(hit.normal, Vector3.up) > maximumLandingSlope) return false;
            destination = hit.point;
            return CanStandAt(destination);
        }

        bool CanStandAt(Vector3 floorPoint)
        {
            if (teleportFloorMask.value == 0 || body == null) return false;
            float safeRadius = body.radius + 0.035f;
            const float footClearance = 0.065f;
            Vector3 bottom = floorPoint + Vector3.up * (body.radius + footClearance);
            Vector3 top = floorPoint + Vector3.up * (body.height - body.radius + footClearance);
            int count = Physics.OverlapCapsuleNonAlloc(bottom, top, safeRadius, landingOverlaps,
                teleportCollisionMask, QueryTriggerInteraction.Ignore);
            if (count == landingOverlaps.Length) return false;
            for (int i = 0; i < count; i++)
                if (!landingOverlaps[i].transform.IsChildOf(transform)) return false;

            // The complete footprint needs floor support, not only the ray's center pixel.
            return HasFloorSupport(floorPoint, Vector3.zero) &&
                HasFloorSupport(floorPoint, Vector3.right * safeRadius) &&
                HasFloorSupport(floorPoint, Vector3.left * safeRadius) &&
                HasFloorSupport(floorPoint, Vector3.forward * safeRadius) &&
                HasFloorSupport(floorPoint, Vector3.back * safeRadius);
        }

        bool HasFloorSupport(Vector3 center, Vector3 offset)
        {
            RaycastHit hit;
            if (!Physics.Raycast(center + offset + Vector3.up * 0.2f, Vector3.down, out hit, 0.3f,
                teleportFloorMask, QueryTriggerInteraction.Ignore)) return false;
            return Mathf.Abs(hit.point.y - center.y) <= 0.07f &&
                Vector3.Angle(hit.normal, Vector3.up) <= maximumLandingSlope;
        }

        void TeleportTo(Vector3 destination)
        {
            // Put the user's head above the target even after physical room-scale movement.
            Vector3 headOffset = Vector3.ProjectOnPlane(headsetCamera.transform.position - transform.position, Vector3.up);
            body.enabled = false;
            transform.position = destination - headOffset + Vector3.up * 0.025f;
            verticalVelocity = 0f;
            body.enabled = true;
        }

        void DrawTeleportRay(Vector3 origin, Vector3 end, bool valid)
        {
            if (teleportRay == null)
            {
                teleportRay = new GameObject("TeleportRay").AddComponent<LineRenderer>();
                teleportRay.transform.SetParent(transform, false);
                teleportRay.useWorldSpace = true;
                teleportRay.positionCount = 2;
                teleportRay.startWidth = 0.008f;
                teleportRay.endWidth = 0.006f;
                teleportRay.numCapVertices = 4;
                teleportRay.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                teleportRay.receiveShadows = false;
                var shader = Shader.Find("LaReina/Projection");
                if (shader == null) shader = Shader.Find("Unlit/Color");
                if (shader != null)
                {
                    rayMaterial = new Material(shader) { name = "TeleportRay_Runtime" };
                    teleportRay.sharedMaterial = rayMaterial;
                }
            }
            Color color = valid ? new Color(0.15f, 0.75f, 1f) : new Color(0.95f, 0.25f, 0.25f);
            if (rayMaterial != null)
            {
                if (rayMaterial.HasProperty("_BaseColor")) rayMaterial.SetColor("_BaseColor", color);
                if (rayMaterial.HasProperty("_Color")) rayMaterial.SetColor("_Color", color);
            }
            teleportRay.startColor = teleportRay.endColor = color;
            teleportRay.SetPosition(0, origin);
            teleportRay.SetPosition(1, end);
            teleportRay.enabled = true;
        }

        void CancelTeleport()
        {
            teleportAiming = false;
            if (teleportRay != null) teleportRay.enabled = false;
        }

        void ConfigureTrackingOrigin()
        {
            inputSubsystems.Clear();
            SubsystemManager.GetSubsystems(inputSubsystems);
            usesFloorOrigin = false;
            foreach (var subsystem in inputSubsystems)
            {
                if (!subsystem.running) continue;
                subsystem.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor);
                usesFloorOrigin |= subsystem.GetTrackingOriginMode() == TrackingOriginModeFlags.Floor;
            }
            nextOriginRetry = Time.unscaledTime + 0.5f;
        }

        void ApplyHeadPose()
        {
            headPoseValid = false;
            if (!XRSettings.isDeviceActive || headsetCamera == null || !headsetCamera.enabled) return;
            var device = InputDevices.GetDeviceAtXRNode(XRNode.CenterEye);
            if (!device.isValid) device = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            bool tracked;
            if (device.TryGetFeatureValue(CommonUsages.isTracked, out tracked) && !tracked) return;
            Vector3 position;
            Quaternion rotation;
            if (!device.TryGetFeatureValue(CommonUsages.devicePosition, out position) ||
                !device.TryGetFeatureValue(CommonUsages.deviceRotation, out rotation)) return;
            if (!usesFloorOrigin) position.y += deviceOriginEyeHeight;
            headsetCamera.transform.localPosition = position;
            headsetCamera.transform.localRotation = rotation;
            headPoseValid = true;
        }

        void SetRigActive(bool active)
        {
            if (body != null) body.enabled = active;
            if (headsetCamera != null) headsetCamera.enabled = active;
            if (listener != null) listener.enabled = active;
            if (desktopRig != null && desktopRig != gameObject) desktopRig.SetActive(!active);
        }

        void OnDestroy()
        {
            if (rayMaterial != null) Destroy(rayMaterial);
        }
    }
}
