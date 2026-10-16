using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Video;

namespace LaReina.DigitalTwin
{
    /// <summary>Opt-in integration check, exercised in the actual Mac player. Inactive in normal use.</summary>
    public sealed class TwinRuntimeCheck : MonoBehaviour
    {
        public DesktopWalkthrough desktop;
        public GameObject modelRoot;
        public ProjectionDirector projections;
        public RoomLighting lighting;
        public WalkingFootprintGuide footprints;
        public CeilingEventDisplay ceilingDisplay;
        public GestureTableBridge gestureBridge;
        [Serializable] public class VideoResult { public string name; public bool prepared; public long frame; public int width; public int height; }
        [Serializable] public class CheckReport
        {
            public string unityVersion;
            public string buildVersion;
            public string platform;
            public string mediaFolder;
            public string gpu;
            public int meshRenderers, chairCount, projectionSurfaces, uniqueVideoPlayers;
            public Vector3 dimensions;
            public bool meterScale, spawnFloorSupport, collisionStopsBody, videosPlaying;
            public float collisionTravelMeters;
            public string[] errors;
            public VideoResult[] videos;
            public bool passed;
            public SeatingQa.SeatTestResult[] seats;
            public bool seatingPassed, footprintProgressPassed, continuousPanorama, oldDividersRemoved;
            public int footprintCount;
            public bool alternatingFootsteps, singleFootLight, ceilingDisplayPassed;
            public int[] illuminatedSteps;
            public string displayedClock, displayedCountdown;
            public int countdownStart, countdownAfterWait, displayRepetitions;
            public Vector3 tabletopDimensions;
            public float tabletopHeight, pedestalFloorHeight, ovalUvArea;
            public Vector3 projectionDimensions;
            public bool reducedWhiteRim;
            public bool ovalTablePassed, footprintRouteClear;
            public int[] blockedFootsteps;
            public bool gestureGatePassed;
            public GestureBridgeQa.Result gestureIntegration;
            public TableAdjustmentQa.Result heightAdjustment;
        }
        IEnumerator Start()
        {
            var args=Environment.GetCommandLineArgs();
            int index=Array.IndexOf(args,"-twinCapture");
            if(index<0 || index+1>=args.Length){Destroy(gameObject);yield break;}
            string folder=Path.GetFullPath(args[index+1]);Directory.CreateDirectory(folder);
            desktop.automation=true;
            gestureBridge.suppressAutomatic=true;gestureBridge.StopSession();
            Cursor.visible=false;Cursor.lockState=CursorLockMode.None;
            yield return null;
            float timeout=Time.realtimeSinceStartup+15;
            while(projections.ReadyPlayers<2 && Time.realtimeSinceStartup<timeout)yield return null;
            yield return new WaitForSeconds(2);
            var report=new CheckReport{unityVersion=Application.unityVersion,buildVersion=Application.version,platform=Application.platform.ToString(),gpu=SystemInfo.graphicsDeviceName,mediaFolder=projections.MediaFolder};
            var renderers=modelRoot.GetComponentsInChildren<MeshRenderer>();
            report.meshRenderers=renderers.Length;
            var bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
            report.dimensions=bounds.size;
            report.meterScale=Mathf.Abs(bounds.size.x-8)<.03f && Mathf.Abs(bounds.size.z-9)<.03f;
            report.chairCount=modelRoot.GetComponentsInChildren<Transform>().Count(t=>System.Text.RegularExpressions.Regex.IsMatch(t.name,"^Chair_[0-9]{2}$"));
            report.projectionSurfaces=projections.surfaces.Length;
            var top=Find("Table_Top_Original").GetComponent<MeshRenderer>();
            var pedestal=Find("Table_Base_Original").GetComponent<MeshRenderer>();
            var tableProjection=projections.surfaces.First(s=>s.channelId=="mesa");
            report.ovalUvArea=tableProjection.sourceUvArea;
            report.projectionDimensions=tableProjection.targetRenderer.bounds.size;
            report.reducedWhiteRim=Mathf.Abs(report.projectionDimensions.x-1.870456f)<.003f && Mathf.Abs(report.projectionDimensions.z-2.401718f)<.003f;
            report.tabletopDimensions=top.bounds.size;report.tabletopHeight=top.bounds.max.y;report.pedestalFloorHeight=pedestal.bounds.min.y;
            report.ovalTablePassed=Mathf.Abs(top.bounds.size.x-2.270456f)<.003f && Mathf.Abs(top.bounds.size.z-2.801718f)<.003f &&
                Mathf.Abs(report.tabletopHeight-.762753f)<.002f && Mathf.Abs(report.pedestalFloorHeight)<.001f &&
                tableProjection.ovalMask && tableProjection.sourceUvsWithinOval && report.ovalUvArea>.775f && report.ovalUvArea<.795f &&
                tableProjection.targetRenderer.sharedMaterials[tableProjection.materialSlot].GetFloat("_OvalMask")>.5f;
            report.spawnFloorSupport=true;
            foreach(string name in new[]{"Spawn_Entrance","Spawn_Left","Spawn_Right","Spawn_Far"})
            {
                var p=Find(name).position;
                report.spawnFloorSupport &= Physics.Raycast(p+Vector3.up*.2f,Vector3.down,.4f,1<<8,QueryTriggerInteraction.Ignore);
            }
            var body=desktop.GetComponent<CharacterController>();
            body.enabled=false;desktop.transform.position=Find("Spawn_Far").position+Vector3.up*.04f;body.enabled=true;
            var before=desktop.transform.position;
            var aim=Vector3.ProjectOnPlane(Find("Target_Table").position-before,Vector3.up).normalized;
            for(int i=0;i<120;i++){body.Move((aim*2+Vector3.down)*.025f);yield return null;}
            report.collisionTravelMeters=Vector3.ProjectOnPlane(desktop.transform.position-before,Vector3.up).magnitude;
            report.collisionStopsBody=report.collisionTravelMeters<4.7f && report.collisionTravelMeters>.15f && desktop.transform.position.y>-.1f;
            var players=projections.GetComponentsInChildren<VideoPlayer>();
            long[] framesBefore=players.Select(p=>p.frame).ToArray();
            yield return new WaitForSeconds(.3f);
            report.uniqueVideoPlayers=players.Length;
            report.videos=players.Select(p=>new VideoResult{name=p.name,prepared=p.isPrepared,frame=p.frame,width=(int)p.width,height=(int)p.height}).ToArray();
            report.videosPlaying=players.Length==2 && players.All(p=>p.isPrepared && p.isPlaying && p.frame>0) &&
                players.Where((p,i)=>p.frame!=framesBefore[i]).Count()==players.Length;
            report.errors=projections.Errors.ToArray();
            report.continuousPanorama=projections.surfaces.Count(s=>s.channelId=="panorama")==1 && report.projectionSurfaces==2;
            report.oldDividersRemoved=!modelRoot.GetComponentsInChildren<Transform>().Any(t=>t.name.Contains("DecorativeRings") || t.name.Contains("Cladding_East") || t.name.Contains("Floor_PerimeterGuide"));
            yield return SeatingQa.Run(desktop,r=>report.seats=r);
            report.seatingPassed=report.seats.Length==11 && report.seats.All(s=>s.passed);
            report.gestureGatePassed=report.seats.Length==11 && report.seats.All(s=>s.gestureGateCorrect);
            report.heightAdjustment=TableAdjustmentQa.Run(desktop.tableAdjustment);
            var blockedSteps=new List<int>();
            for(int i=0;i<footprints.StepCount;i++)
            {
                Vector3 side=Vector3.Cross(Vector3.up,footprints.stepDirections[i]);
                Vector3 p=footprints.stepPositions[i]-side*(i%2==0?-.10f:.10f);p.y=0;
                var contacts=Physics.OverlapCapsule(p+Vector3.up*.32f,p+Vector3.up*1.59f,.255f,~0,QueryTriggerInteraction.Ignore);
                if(contacts.Any(c=>!c.transform.IsChildOf(desktop.transform)))blockedSteps.Add(i);
            }
            report.blockedFootsteps=blockedSteps.ToArray();report.footprintRouteClear=blockedSteps.Count==0;
            report.footprintCount=footprints.StepCount;
            footprints.RefreshProgress(true);int firstStep=footprints.CurrentStep;
            int nextStep=Mathf.Min(10,footprints.StepCount-1);
            body.enabled=false;desktop.transform.position=footprints.stepPositions[nextStep]+Vector3.up*.04f;
            footprints.RefreshProgress(true);
            report.footprintProgressPassed=footprints.StepCount>30 && footprints.CurrentStep==nextStep && footprints.CurrentStep!=firstStep;
            desktop.ResetPosition();footprints.RefreshProgress(true);
            footprints.enabled=false;
            for(int i=0;i<100 && footprints.PulseIntensity<.99f;i++)footprints.AdvanceAnimation(.01f);
            var gaitSteps=new List<int>();
            report.alternatingFootsteps=footprints.StepCount%2==0;report.singleFootLight=true;
            for(int i=0;i<8;i++)
            {
                footprints.AdvanceAnimation(WalkingFootprintGuide.StepDuration);
                gaitSteps.Add(footprints.IlluminatedStep);
                report.singleFootLight &= footprints.ActiveLightCount==1;
                if(i>0)report.alternatingFootsteps &= (gaitSteps[i]&1)!=(gaitSteps[i-1]&1);
            }
            report.illuminatedSteps=gaitSteps.ToArray();
            footprints.enabled=true;
            ceilingDisplay.RestartCountdown();
            report.countdownStart=ceilingDisplay.RemainingSeconds;
            int renderBefore=ceilingDisplay.RenderCount;
            yield return new WaitForSecondsRealtime(1.2f);
            report.countdownAfterWait=ceilingDisplay.RemainingSeconds;
            report.displayedClock=ceilingDisplay.DisplayedClock;report.displayedCountdown=ceilingDisplay.DisplayedCountdown;
            report.displayRepetitions=ceilingDisplay.repetitions;
            report.ceilingDisplayPassed=report.countdownStart==900 && report.countdownAfterWait<900 && report.countdownAfterWait>=897 &&
                ceilingDisplay.RenderCount>renderBefore && ceilingDisplay.OutputTexture && ceilingDisplay.OutputTexture.width==2048 &&
                ceilingDisplay.repetitions==2 && CeilingEventDisplay.CalculateRemaining(450)==450 &&
                CeilingEventDisplay.CalculateRemaining(900)==0 && CeilingEventDisplay.CalculateRemaining(1000)==0 &&
                CeilingEventDisplay.FormatCountdown(900)=="15:00";
            report.passed=report.meterScale && report.chairCount==11 && report.continuousPanorama && report.oldDividersRemoved &&
                report.spawnFloorSupport && report.collisionStopsBody && report.videosPlaying && report.errors.Length==0 && report.seatingPassed &&
                report.footprintProgressPassed && report.alternatingFootsteps && report.singleFootLight && report.ceilingDisplayPassed &&
                report.ovalTablePassed && report.footprintRouteClear && report.gestureGatePassed && report.heightAdjustment.passed && report.reducedWhiteRim;
            body.enabled=false;
            string[] views={"Spawn_Entrance","Spawn_Left","Spawn_Far","View_Seated"};
            for(int i=0;i<views.Length;i++)
            {
                Vector3 pos=Find(views[i]).position;
                if(!views[i].StartsWith("View_"))pos.y+=1.65f;
                desktop.transform.SetPositionAndRotation(pos-Vector3.up*1.65f,Quaternion.identity);
                desktop.eye.transform.position=pos;
                Vector3 look=Find("Target_Table").position;
                look.y=i==3?1.8f:1.05f;
                desktop.eye.transform.rotation=Quaternion.LookRotation(look-pos);
                yield return new WaitForSeconds(.8f);
                yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(Path.Combine(folder,$"0{i+1}_{views[i]}.png"));
                yield return null;
            }
            lighting.Toggle();
            var entrance=Find("Spawn_Entrance").position+Vector3.up*1.65f;
            desktop.eye.transform.position=entrance;
            desktop.eye.transform.LookAt(Find("Target_Table").position+Vector3.up*.3f);
            yield return new WaitForSeconds(1);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"05_luz_revision.png"));
            lighting.Toggle();
            var spot=desktop.seating.Seats.First(s=>s.chair.name=="Chair_10");
            desktop.ResetPosition();body.enabled=false;desktop.transform.position=spot.standAnchor.position+Vector3.up*.025f;
            desktop.eye.transform.LookAt(spot.chair.position+Vector3.up*.78f);body.enabled=true;Physics.SyncTransforms();
            desktop.ToggleSeat();
            yield return new WaitForSeconds(.7f);yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"06_sentado.png"));
            desktop.transform.Rotate(Vector3.up,90);
            yield return new WaitForSeconds(.5f);yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"07_sentado_lateral.png"));
            desktop.ToggleSeat();
            yield return new WaitForSeconds(.5f);yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"08_de_pie.png"));
            desktop.ResetPosition();body.enabled=false;
            desktop.eye.transform.LookAt(footprints.stepPositions[3]);footprints.RefreshProgress(true);
            footprints.enabled=false;
            for(int i=0;i<5;i++)footprints.AdvanceAnimation(WalkingFootprintGuide.StepDuration);
            for(int i=0;i<100 && footprints.PulseIntensity<.99f;i++)footprints.AdvanceAnimation(.01f);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"09_huellas.png"));
            footprints.AdvanceAnimation(WalkingFootprintGuide.StepDuration);
            yield return null;yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"12_huellas_otro_pie.png"));
            desktop.transform.position=footprints.stepPositions[10]+Vector3.up*.04f;
            desktop.eye.transform.LookAt(footprints.stepPositions[14]);footprints.RefreshProgress(true);
            footprints.AdvanceAnimation(WalkingFootprintGuide.StepDuration);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"10_huellas_avance.png"));
            footprints.enabled=true;
            desktop.ResetPosition();body.enabled=false;
            desktop.eye.transform.LookAt(ceilingDisplay.targetRenderer.bounds.center);
            ceilingDisplay.RestartCountdown();
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"11_pantalla_circular.png"));
            File.WriteAllBytes(Path.Combine(folder,"13_panel_sesion.png"),ceilingDisplay.OutputTexture.EncodeToPNG());
            desktop.transform.position=Find("Spawn_Right").position+Vector3.up*.04f;
            desktop.eye.transform.LookAt(ceilingDisplay.targetRenderer.bounds.center);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(folder,"14_pantalla_lateral.png"));
            if(Array.IndexOf(args,"-twinBridgeValidation")>=0)
            {
                yield return GestureBridgeQa.Run(desktop,gestureBridge,folder,result=>report.gestureIntegration=result);
                report.passed &= report.gestureIntegration!=null && report.gestureIntegration.passed;
            }
            File.WriteAllText(Path.Combine(folder,"validacion-runtime.json"),JsonUtility.ToJson(report,true));
            Debug.Log("TWIN_RUNTIME_CHECK "+JsonUtility.ToJson(report));
            yield return new WaitForSeconds(.5f);
            desktop.ResetPosition();desktop.automation=false;
            gestureBridge.suppressAutomatic=false;
            if(Array.IndexOf(args,"-twinSelfTest")>=0)Application.Quit(report.passed?0:1);
        }
        Transform Find(string name)=>modelRoot.GetComponentsInChildren<Transform>().First(t=>t.name==name);
    }
}
