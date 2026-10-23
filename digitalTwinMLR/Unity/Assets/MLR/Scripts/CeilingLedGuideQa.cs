using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Opt-in route and interaction checks, executed by the Mac player's capture mode.</summary>
    public static class CeilingLedGuideQa
    {
        [Serializable] public sealed class CaseResult
        {
            public string name;
            public bool passed;
            public float measuredDistance;
        }
        [Serializable] public sealed class Result
        {
            public bool configured, importedRouteMatches, metreUvs, ceilingMounted, noGuideColliders;
            public bool entranceStartsAtBeginning, realCameraAdvances, realCameraReverses, lightLeadsVisitor, visibleBand, routeClear;
            public bool passed;
            public float routeLength, minimumCeilingHeight, maximumCeilingHeight, measuredLookAhead, entranceDistance;
            public float sourceUvLength, routeStartDistance;
            public int[] blockedRouteSamples;
            public float[] blockedRouteDistances;
            public string[] blockedRouteColliderNames;
            public CaseResult[] cases;
            public string error;
        }

        public static Result Run(CeilingLedGuide guide, DesktopWalkthrough desktop)
        {
            var result = new Result();
            var cases = new List<CaseResult>();
            result.cases = new CaseResult[0];
            result.blockedRouteSamples = new int[0];
            result.configured = guide && desktop && desktop.eye && guide.emissiveRenderer &&
                guide.routePoints != null && guide.routePoints.Length > 3 && !guide.closedLoop &&
                Mathf.Abs(guide.LookAhead - 1.35f) < .001f && Mathf.Abs(guide.LitLength - 1.25f) < .001f;
            if (!result.configured) { result.error = "Falta la guía importada o su configuración de anticipo."; return result; }

            var body = desktop.GetComponent<CharacterController>();
            Vector3 savedPosition = desktop.transform.position;
            Quaternion savedRotation = desktop.transform.rotation;
            Vector3 savedEyePosition = desktop.eye.transform.localPosition;
            Quaternion savedEyeRotation = desktop.eye.transform.localRotation;
            bool savedBodyEnabled = body.enabled;
            bool savedAutomation = desktop.automation;
            bool savedGuideEnabled = guide.enabled;
            try
            {
                desktop.automation = true;
                guide.enabled = false;
                guide.RebuildRouteCache();
                result.routeLength = guide.RouteLength;
                float importedLength = 0f;
                for (int i = 1; i < guide.routePoints.Length; i++)
                    importedLength += Vector3.Distance(guide.routePoints[i - 1], guide.routePoints[i]);
                result.importedRouteMatches = importedLength > 10f && Mathf.Abs(importedLength - guide.RouteLength) < .002f;
                result.minimumCeilingHeight = guide.routePoints.Min(p => p.y);
                result.maximumCeilingHeight = guide.routePoints.Max(p => p.y);
                result.ceilingMounted = result.minimumCeilingHeight > 2.25f && result.maximumCeilingHeight < 2.75f;
                result.noGuideColliders = guide.emissiveRenderer.GetComponentsInChildren<Collider>(true).Length == 0;
                // The editor validates imported mesh UVs before build-time
                // read access is removed. Keep the player mesh GPU-only.
                result.sourceUvLength = guide.sourceUvLength;
                result.metreUvs = guide.sourceUvMetres &&
                    Mathf.Abs(guide.sourceUvLength - importedLength) < .03f &&
                    guide.emissiveRenderer.sharedMaterial &&
                    guide.emissiveRenderer.sharedMaterial.shader.name == "LaReina/CeilingLedGuide";

                // Use the real visitor camera and imported route, without asking
                // the character controller to walk into furniture during QA.
                body.enabled = false;
                desktop.seating?.CancelSeat();
                body.enabled = false;
                desktop.ResetPosition();body.enabled = false;
                guide.RefreshProgress(true);guide.AdvanceVisuals(.3f);
                result.entranceDistance = guide.CurrentDistance;
                result.entranceStartsAtBeginning = guide.CurrentDistance < 1f && guide.IsGuiding;
                float sample = Mathf.Min(3f, guide.RouteLength * .2f);
                MoveEyeTo(guide.PointAtDistance(sample), desktop);
                guide.RefreshProgress(true);
                float first = guide.CurrentDistance;
                MoveEyeTo(guide.PointAtDistance(sample + .35f), desktop);
                guide.RefreshProgress();
                result.realCameraAdvances = guide.CurrentDistance > first + .20f &&
                    Mathf.Abs(guide.CurrentDistance - (sample + .35f)) < .07f;
                result.measuredLookAhead = guide.IlluminatedStart - guide.CurrentDistance;
                result.lightLeadsVisitor = Mathf.Abs(result.measuredLookAhead - 1.35f) < .002f &&
                    Vector3.ProjectOnPlane(guide.PointAtDistance(guide.IlluminatedStart) - desktop.eye.transform.position, Vector3.up).magnitude > .7f;
                guide.AdvanceVisuals(.3f);
                var properties = new MaterialPropertyBlock();
                guide.emissiveRenderer.GetPropertyBlock(properties);
                result.visibleBand = guide.VisibleIntensity > .99f && guide.IsGuiding &&
                    Mathf.Abs(properties.GetFloat("_HeadDistance") - guide.CurrentDistance) < .001f &&
                    Mathf.Abs(properties.GetFloat("_LookAhead") - 1.35f) < .001f &&
                    Mathf.Abs(properties.GetFloat("_LitLength") - 1.25f) < .001f;
                float advanced = guide.CurrentDistance;
                MoveEyeTo(guide.PointAtDistance(sample + .15f), desktop);
                guide.RefreshProgress();
                result.realCameraReverses = guide.CurrentDistance < advanced - .10f &&
                    Mathf.Abs(guide.CurrentDistance - (sample + .15f)) < .07f;

                var blocked = new List<int>();
                var blockedDistances = new List<float>();
                var blockedColliders = new HashSet<string>();
                // The authored strip extends behind the entrance wall. The
                // walkable path begins at the entrance camera's projection.
                result.routeStartDistance = result.entranceDistance;
                int sampleCount = Mathf.CeilToInt((guide.RouteLength - result.routeStartDistance) / .25f);
                for (int i = 0; i <= sampleCount; i++)
                {
                    float distance = Mathf.Min(result.routeStartDistance + i * .25f, guide.RouteLength);
                    Vector3 floor = guide.PointAtDistance(distance);
                    floor.y = 0f;
                    Collider[] contacts = Physics.OverlapCapsule(floor + Vector3.up * .32f,
                        floor + Vector3.up * 1.59f, .255f, ~0, QueryTriggerInteraction.Ignore);
                    Collider[] obstacles = contacts.Where(c => !c.transform.IsChildOf(desktop.transform)).ToArray();
                    if (obstacles.Length == 0) continue;
                    blocked.Add(i);blockedDistances.Add(distance);
                    foreach (var obstacle in obstacles) blockedColliders.Add(obstacle.name);
                }
                result.blockedRouteSamples = blocked.ToArray();
                result.blockedRouteDistances = blockedDistances.ToArray();
                result.blockedRouteColliderNames = blockedColliders.OrderBy(n => n).ToArray();
                result.routeClear = blocked.Count == 0;
                RunInteractionCases(cases);
                result.cases = cases.ToArray();
                result.passed = result.configured && result.importedRouteMatches && result.metreUvs &&
                    result.ceilingMounted && result.noGuideColliders && result.entranceStartsAtBeginning && result.realCameraAdvances &&
                    result.realCameraReverses && result.lightLeadsVisitor && result.visibleBand &&
                    result.routeClear && cases.Count >= 12 && cases.All(c => c.passed);
                if (!result.passed) result.error = "Revisar los campos de recorrido, anticipación o pausa de la guía LED.";
            }
            catch (Exception exception) { result.error = exception.ToString(); }
            finally
            {
                body.enabled = false;
                desktop.transform.SetPositionAndRotation(savedPosition, savedRotation);
                desktop.eye.transform.SetLocalPositionAndRotation(savedEyePosition, savedEyeRotation);
                body.enabled = savedBodyEnabled;
                desktop.automation = savedAutomation;
                guide.RefreshProgress(true);
                guide.AdvanceVisuals(.3f);
                guide.enabled = savedGuideEnabled;
                Physics.SyncTransforms();
            }
            return result;
        }

        static void MoveEyeTo(Vector3 routePoint, DesktopWalkthrough desktop)
        {
            Vector3 desiredEye = new Vector3(routePoint.x, desktop.eyeHeight + .04f, routePoint.z);
            desktop.transform.position += desiredEye - desktop.eye.transform.position;
            Physics.SyncTransforms();
        }

        static void RunInteractionCases(List<CaseResult> results)
        {
            // This unrendered rig is outside the room. It uses the production
            // component and public seating action, without changing scene assets.
            var root = new GameObject("QA temporal — guía LED");
            var visitor = new GameObject("Visitante QA").transform;
            visitor.SetParent(root.transform);
            var body = visitor.gameObject.AddComponent<CharacterController>();
            var eye = new GameObject("Ojos QA").AddComponent<Camera>();
            eye.enabled = false; eye.transform.SetParent(visitor, false); eye.transform.localPosition = Vector3.up * 1.65f;
            var test = root.AddComponent<CeilingLedGuide>();
            test.enabled = false; test.desktopEye = eye.transform; test.pauseWhenMouseReleased = false;
            Vector3 origin = new Vector3(1000f, 2.6f, 1000f);
            Action<Vector3[]> route = points =>
            {
                test.routePoints = points.Select(p => p + origin).ToArray();
                test.closedLoop = false; test.RebuildRouteCache();
            };
            Action<float, float, bool> move = (x, z, relocate) =>
            {
                visitor.position = new Vector3(origin.x + x, 0f, origin.z + z);
                test.RefreshProgress(relocate); test.AdvanceVisuals(.3f);
            };
            Action<string, bool> record = (name, passed) => results.Add(new CaseResult
                { name = name, passed = passed, measuredDistance = test.CurrentDistance });
            try
            {
                route(new[] { Vector3.zero, Vector3.right * 10f });
                move(3f, 0f, true); move(3.6f, 0f, false);
                record("Avance: luz 1,35 m por delante del visitante", Mathf.Abs(test.CurrentDistance - 3.6f) < .002f &&
                    Mathf.Abs(test.IlluminatedStart - 4.95f) < .002f && test.VisibleIntensity > .99f);
                move(3.4f, 0f, false);
                record("Retroceso corto sin saltar de tramo", Mathf.Abs(test.CurrentDistance - 3.4f) < .002f);

                route(new[] { Vector3.zero, Vector3.right * 4f, new Vector3(4f, 0f, 4f) });
                move(3.8f, 0f, true); move(4f, 0f, false); move(4f, .2f, false);
                record("Curva: continúa la distancia sobre el recorrido", Mathf.Abs(test.CurrentDistance - 4.2f) < .003f &&
                    Vector3.Distance(test.PointAtDistance(test.IlluminatedStart), origin + new Vector3(4f, 0f, 1.55f)) < .003f);

                route(new[] { Vector3.zero, Vector3.right * 6f, new Vector3(6f, 0f, .12f), new Vector3(0f, 0f, .12f) });
                move(2f, 0f, true); move(2.1f, .06f, false);
                record("Empate entre ramas: conserva continuidad con distancias casi iguales", Mathf.Abs(test.CurrentDistance - 2.1f) < .003f);
                move(2.2f, .11f, false);
                record("Rama más cercana: cambia de tramo sin exigir un salto", Mathf.Abs(test.CurrentDistance - 9.92f) < .003f);

                route(new[] { Vector3.zero, Vector3.right * 10f });
                move(2f, 0f, true); move(8f, 0f, false);
                record("Reubicación: recupera posición después de un salto real", Mathf.Abs(test.CurrentDistance - 8f) < .002f);
                move(10f, 0f, true);
                record("Fin abierto: apaga sin envolver hacia la entrada", test.IlluminatedStart == test.RouteLength && !test.IsGuiding);
                move(3f, 0f, false);
                float lastValid = test.CurrentDistance;
                move(3f, 5f, false);
                record("Fuera del recorrido: conserva la última posición iluminada", !test.HasNearbyRoute && test.IsGuiding &&
                    Mathf.Abs(test.CurrentDistance - lastValid) < .001f && Mathf.Abs(test.IlluminatedStart - 4.35f) < .002f);
                for(int i=1;i<=60;i++)move(3f+5f*i/60f,5f-5f*i/60f,false);
                record("Reentrada lenta: recupera otro tramo con pasos menores a 12 cm", test.HasNearbyRoute && test.IsGuiding &&
                    Mathf.Abs(test.CurrentDistance - 8f) < .002f);
                for(int i=1;i<=45;i++)move(8f-5f*i/45f,0f,false);
                record("Retroceso largo: acompaña toda la vuelta sin bloqueo de avance", Mathf.Abs(test.CurrentDistance - 3f) < .002f);

                route(new[] { Vector3.zero, Vector3.right*8f, new Vector3(8f,0f,6f), new Vector3(0f,0f,6f) });
                move(2f,0f,true);move(2f,6f,false);
                record("Otro tramo: reubica inmediatamente sin allowJump", Mathf.Abs(test.CurrentDistance-20f)<.002f && test.IsGuiding);
                move(3f,6f,false);move(3f,10f,false);
                float retained=test.CurrentDistance;
                for(int i=0;i<10;i++)move(3f+i*.1f,10f,false);
                record("Pérdida sostenida de alcance: no desplaza el foco retenido", !test.HasNearbyRoute && test.IsGuiding &&
                    Mathf.Abs(test.CurrentDistance-retained)<.001f);

                route(new[] { Vector3.zero, Vector3.right*10f });
                move(3f, 0f, true);
                var seat = visitor.gameObject.AddComponent<SeatInteraction>();
                var chair = new GameObject("Silla QA").transform; chair.SetParent(root.transform);
                chair.position = new Vector3(origin.x + 3.5f, 0f, origin.z);
                var anchor = new GameObject("Ojos sentado QA").transform; anchor.SetParent(chair, false); anchor.localPosition = Vector3.up * 1.18f;
                var stand = new GameObject("Salida QA").transform; stand.SetParent(root.transform); stand.position = visitor.position;
                seat.Initialize(eye, new[] { new SeatInteraction.SeatSpot { chair = chair, eyeAnchor = anchor, standAnchor = stand } }, chair.position + Vector3.right, false);
                test.desktopSeat = seat;
                eye.transform.LookAt(chair.position + Vector3.up * .78f);
                float beforeSitting = test.CurrentDistance;
                bool sat = seat.TryToggleSeat();
                test.RefreshProgress(); test.AdvanceVisuals(.3f);
                record("Sentado: apaga la guía y conserva el progreso", sat && seat.IsSeated && !test.IsGuiding &&
                    Mathf.Abs(test.CurrentDistance - beforeSitting) < .001f);
                seat.CancelSeat();
            }
            finally
            {
                body.enabled = false;
                root.SetActive(false);
                UnityEngine.Object.Destroy(root);
            }
        }
    }
}
