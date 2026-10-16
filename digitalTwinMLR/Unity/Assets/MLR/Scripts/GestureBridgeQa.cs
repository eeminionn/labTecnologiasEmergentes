using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Opt-in, real-player checks of the seated camera lease and map texture.</summary>
    public static class GestureBridgeQa
    {
        [Serializable] public sealed class Result
        {
            public bool supported, principalSeat, liveMap, cameraActive, detectorReady, inferenceProcessed;
            public bool mirrorDefaultActive, previewActive, previewClosed;
            public bool mapReloadPreserved, standingGateClosed, lastMapFrozen, cameraStopped, otherChairBlocked, resumedWithoutRelaunch, passed;
            public int framesReceived, inferenceFrames, launchCount, resumedFrames;
            public string error;
        }

        public static IEnumerator Run(DesktopWalkthrough desktop, GestureTableBridge bridge, string folder, Action<Result> done)
        {
            var result = new Result();
            if (!desktop || !bridge || !desktop.seating || !bridge.projections)
            { result.error="Falta la configuración del control gestual."; done?.Invoke(result); yield break; }
            result.supported=bridge.Supported;
            if (!result.supported)
            { result.error="Esta integración de cámara requiere la aplicación de Mac."; done?.Invoke(result); yield break; }
            var seats=desktop.seating;
            var principal=Array.Find(seats.Seats,s=>s!=null && s.chair==bridge.principalChair);
            var other=Array.Find(seats.Seats,s=>s!=null && s.chair && s.chair.name=="Chair_09");
            if (principal==null || other==null)
            { result.error="Falta la silla principal o la silla de contraste."; done?.Invoke(result); yield break; }
            bool previousAutomation=desktop.automation;
            desktop.automation=true; bridge.suppressAutomatic=true; bridge.StopSession(); desktop.ResetPosition();
            result.principalSeat=Sit(desktop,principal) && bridge.PrincipalSeatOccupied;
            bridge.suppressAutomatic=false;
            float deadline=Time.realtimeSinceStartup+35f;
            while (result.principalSeat && !Ready(bridge,2) && Time.realtimeSinceStartup<deadline) yield return null;
            result.liveMap=bridge.LiveTextureActive && bridge.FramesReceived>=2;
            result.cameraActive=bridge.Status!=null && bridge.Status.cameraActive;
            result.detectorReady=bridge.Status!=null && bridge.Status.detectorReady;
            result.inferenceFrames=bridge.Status!=null ? bridge.Status.inferenceFrames : 0;
            result.inferenceProcessed=result.inferenceFrames>0;
            result.mirrorDefaultActive=bridge.Status!=null && bridge.Status.mirror;
            result.previewActive=bridge.Status!=null && bridge.Status.previewVisible && bridge.Status.previewFrames>0;
            result.framesReceived=bridge.FramesReceived; result.launchCount=bridge.LaunchCount;
            if (!Ready(bridge,2)) result.error=bridge.Message;
            desktop.eye.transform.LookAt(seats.tableFocus);
            yield return new WaitForSecondsRealtime(.3f);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"15_mapa_gestual.png"));
            if(desktop.tableAdjustment)
            {
                desktop.tableAdjustment.MoveTable(-.12f);desktop.tableAdjustment.MoveMap(-.04f);
                desktop.eye.transform.LookAt(desktop.tableAdjustment.ProjectionBounds.center);
                yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(Path.Combine(folder,"16_mesa_ajustada.png"));
                desktop.tableAdjustment.ResetAdjustments();desktop.eye.transform.LookAt(seats.tableFocus);
            }
            var surface=Array.Find(bridge.projections.surfaces,s=>s && s.channelId=="mesa");
            Texture live=SurfaceTexture(surface);
            bridge.projections.LoadConfiguration();
            yield return new WaitForSecondsRealtime(1f);
            result.mapReloadPreserved=bridge.LiveTextureActive && live && SurfaceTexture(surface)==live;
            bool stood=desktop.ToggleSeat();
            result.standingGateClosed=stood && !seats.IsSeated && !bridge.PrincipalSeatOccupied && !bridge.SessionRequested && !bridge.LiveTextureActive;
            Texture frozen=SurfaceTexture(surface);
            deadline=Time.realtimeSinceStartup+4f;
            do
            {
                var stopped=bridge.CameraStoppedForValidation();
                while (!stopped.IsCompleted && Time.realtimeSinceStartup<deadline) yield return null;
                if (stopped.Status==System.Threading.Tasks.TaskStatus.RanToCompletion && stopped.Result) { result.cameraStopped=true; break; }
                yield return new WaitForSecondsRealtime(.15f);
            } while(Time.realtimeSinceStartup<deadline);
            result.previewClosed=result.cameraStopped;
            int launches=bridge.LaunchCount, frames=bridge.FramesReceived;
            bool satOther=Sit(desktop,other);
            yield return new WaitForSecondsRealtime(2f);
            result.lastMapFrozen=bridge.LastMapVisible && frozen && SurfaceTexture(surface)==frozen && bridge.FramesReceived==frames;
            result.otherChairBlocked=satOther && !bridge.PrincipalSeatOccupied && !bridge.Authorized && !bridge.SessionRequested &&
                !bridge.LiveTextureActive && bridge.LaunchCount==launches && bridge.FramesReceived==frames;
            desktop.ToggleSeat();
            bool satAgain=Sit(desktop,principal);
            deadline=Time.realtimeSinceStartup+20f;
            while (satAgain && !Ready(bridge,frames+2) && Time.realtimeSinceStartup<deadline) yield return null;
            result.resumedFrames=bridge.FramesReceived-frames;
            result.resumedWithoutRelaunch=satAgain && Ready(bridge,frames+2) && bridge.LaunchCount==launches;
            result.passed=result.principalSeat && result.liveMap && result.cameraActive && result.detectorReady && result.inferenceProcessed &&
                result.mirrorDefaultActive && result.previewActive && result.previewClosed &&
                result.mapReloadPreserved && result.standingGateClosed && result.lastMapFrozen && result.cameraStopped && result.otherChairBlocked && result.resumedWithoutRelaunch;
            if(!result.passed && string.IsNullOrEmpty(result.error)) result.error="Revisar los campos del control gestual en la validación.";
            bridge.suppressAutomatic=true; bridge.StopSession(); desktop.ResetPosition(); desktop.automation=previousAutomation;
            done?.Invoke(result);
        }

        static bool Ready(GestureTableBridge bridge,int minimumFrames) => bridge.LiveTextureActive && bridge.FramesReceived>=minimumFrames &&
            bridge.Status!=null && bridge.Status.cameraActive && bridge.Status.detectorReady && bridge.Status.inferenceFrames>0 &&
            bridge.Status.previewVisible && bridge.Status.previewFrames>0;
        static Texture SurfaceTexture(ProjectionSurface surface)
        {
            if(!surface || !surface.targetRenderer)return null;
            var materials=surface.targetRenderer.sharedMaterials;
            return surface.materialSlot>=0 && surface.materialSlot<materials.Length ? materials[surface.materialSlot].GetTexture("_BaseMap") : null;
        }
        static bool Sit(DesktopWalkthrough desktop,SeatInteraction.SeatSpot spot)
        {
            if(!spot.chair || !spot.standAnchor || (desktop.seating.IsSeated && !desktop.ToggleSeat()))return false;
            var body=desktop.GetComponent<CharacterController>();
            body.enabled=false;
            var approach=spot.standAnchor.position+Vector3.up*.025f;
            var forward=Vector3.ProjectOnPlane(spot.chair.position-approach,Vector3.up);
            desktop.transform.SetPositionAndRotation(approach,Quaternion.LookRotation(forward.sqrMagnitude>.001f?forward:Vector3.forward));
            desktop.eye.transform.localPosition=Vector3.up*desktop.eyeHeight;
            desktop.eye.transform.LookAt(spot.chair.position+Vector3.up*.78f);
            body.enabled=true; Physics.SyncTransforms(); desktop.seating.RefreshCandidate();
            return desktop.seating.AvailableChair==spot.chair && desktop.ToggleSeat() && desktop.seating.CurrentChair==spot.chair;
        }
    }
}
