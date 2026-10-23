using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Opt-in player integration checks. Invoke only from TwinRuntimeCheck.</summary>
    public static class SeatingQa
    {
        [Serializable]
        public sealed class SeatTestResult
        {
            public string chair;
            public string candidate;
            public bool candidateCorrect;
            public bool sat;
            public bool correctChair;
            public bool seatedControllerDisabled;
            public bool seatedEyeHeight;
            public bool seatedViewLiftCorrect;
            public float configuredSeatedViewLift;
            public float expectedSeatedEyeHeight;
            public float measuredSeatedEyeHeight;
            public float seatAnchorErrorMeters;
            public bool fixedWhileLooking;
            public float maximumEyeDriftMeters;
            public bool stood;
            public bool standingControllerEnabled;
            public bool standingEyeHeight;
            public float measuredStandingEyeHeight;
            public bool standingFloorSupport;
            public bool standingClearance;
            public bool gestureGateCorrect;
            public string error;
            public bool passed;
        }

        public static IEnumerator Run(DesktopWalkthrough desktop, Action<SeatTestResult[]> completed)
        {
            var results = new List<SeatTestResult>();
            if (desktop == null || desktop.eye == null || desktop.seating == null)
            {
                results.Add(new SeatTestResult { chair = "configuration", error = "Falta desktop, cámara o SeatInteraction." });
                completed?.Invoke(results.ToArray());
                yield break;
            }
            var seats = desktop.seating;
            var body = desktop.GetComponent<CharacterController>();
            if (body == null || seats.Seats == null || seats.Seats.Length != 11)
            {
                results.Add(new SeatTestResult { chair = "configuration", error = "Se requieren CharacterController y11sillas." });
                completed?.Invoke(results.ToArray());
                yield break;
            }

            bool wasAutomation = desktop.automation;
            desktop.automation = true;
            foreach (var spot in seats.Seats)
            {
                var result = new SeatTestResult { chair = spot?.chair ? spot.chair.name : "missing" };
                results.Add(result);
                if (spot == null || !spot.chair || !spot.eyeAnchor || !spot.standAnchor)
                {
                    result.error = "Falta silla o anchor de ojos/salida.";
                    continue;
                }

                // Use the authored walking location, rather than moving directly
                // into the seat or bypassing the normal candidate selection.
                seats.CancelSeat();
                body.enabled = false;
                Vector3 approach = spot.standAnchor.position + Vector3.up * .025f;
                Vector3 forward = Vector3.ProjectOnPlane(spot.chair.position - approach, Vector3.up);
                if (forward.sqrMagnitude < .001f) forward = Vector3.forward;
                desktop.transform.SetPositionAndRotation(approach, Quaternion.LookRotation(forward));
                desktop.eye.transform.localPosition = Vector3.up * desktop.eyeHeight;
                desktop.eye.transform.LookAt(spot.chair.position + Vector3.up * .78f);
                body.enabled = true;
                Physics.SyncTransforms();
                yield return null;
                seats.RefreshCandidate();
                result.candidate = seats.AvailableChair ? seats.AvailableChair.name : "none";
                result.candidateCorrect = seats.AvailableChair == spot.chair;

                // This is the same public action invoked by the keyboard E branch.
                result.sat = desktop.ToggleSeat() && seats.IsSeated;
                Physics.SyncTransforms();
                yield return null;
                result.correctChair = seats.CurrentChair == spot.chair;
                result.gestureGateCorrect = desktop.gestureBridge != null &&
                    desktop.gestureBridge.PrincipalSeatOccupied == (spot.chair == desktop.gestureBridge.principalChair);
                result.seatedControllerDisabled = !body.enabled;
                result.configuredSeatedViewLift = desktop.seatedViewLift;
                result.seatedViewLiftCorrect = Mathf.Abs(desktop.seatedViewLift - .35f) < .001f;
                result.expectedSeatedEyeHeight = seats.CurrentEyeHeight + desktop.seatedViewLift;
                result.measuredSeatedEyeHeight = desktop.eye.transform.position.y - spot.chair.position.y;
                result.seatAnchorErrorMeters = Vector3.Distance(desktop.eye.transform.position,
                    spot.eyeAnchor.position + Vector3.up * desktop.seatedViewLift);
                result.seatedEyeHeight = Mathf.Abs(result.measuredSeatedEyeHeight - result.expectedSeatedEyeHeight) <= .03f &&
                    Mathf.Abs(result.measuredSeatedEyeHeight - 1.53f) <= .03f && result.seatAnchorErrorMeters <= .03f;

                if (result.sat)
                {
                    Vector3 fixedEye = desktop.eye.transform.position;
                    Quaternion startingYaw = desktop.transform.rotation;
                    foreach (float yaw in new[] { 0f, 90f, 180f, 270f, 360f })
                    {
                        desktop.transform.rotation = startingYaw * Quaternion.Euler(0f, yaw, 0f);
                        desktop.eye.transform.localRotation = Quaternion.Euler(yaw == 90f ? -55f : yaw == 270f ? 55f : 0f, 0f, 0f);
                        Physics.SyncTransforms();
                        yield return null;
                        result.maximumEyeDriftMeters = Mathf.Max(result.maximumEyeDriftMeters,
                            Vector3.Distance(fixedEye, desktop.eye.transform.position));
                    }
                    result.fixedWhileLooking = result.maximumEyeDriftMeters < .002f && seats.IsSeated && !body.enabled;
                    result.stood = desktop.ToggleSeat() && !seats.IsSeated;
                    result.gestureGateCorrect &= desktop.gestureBridge != null && !desktop.gestureBridge.PrincipalSeatOccupied;
                    Physics.SyncTransforms();
                    yield return null;
                    result.standingControllerEnabled = body.enabled;
                    result.measuredStandingEyeHeight = desktop.eye.transform.localPosition.y;
                    result.standingEyeHeight = Mathf.Abs(result.measuredStandingEyeHeight - desktop.eyeHeight) < .005f &&
                        Mathf.Abs(result.measuredStandingEyeHeight - 1.65f) < .005f;
                    RaycastHit floor;
                    result.standingFloorSupport = Physics.Raycast(desktop.eye.transform.position, Vector3.down,
                        out floor, desktop.eyeHeight + .3f, seats.floorMask, QueryTriggerInteraction.Ignore);
                    result.standingClearance = result.standingFloorSupport && seats.CanStandAt(floor.point);
                }
                result.passed = result.candidateCorrect && result.sat && result.correctChair && result.seatedControllerDisabled &&
                    result.seatedEyeHeight && result.seatedViewLiftCorrect && result.fixedWhileLooking && result.stood && result.standingControllerEnabled &&
                    result.standingEyeHeight && result.standingFloorSupport && result.standingClearance && result.gestureGateCorrect;
                if (!result.passed && result.error == null) result.error = "Revisar campos de esta silla en la validación.";
                seats.CancelSeat();
            }
            desktop.ResetPosition();
            Physics.SyncTransforms();
            desktop.automation = wasAutomation;
            completed?.Invoke(results.ToArray());
        }
    }
}
