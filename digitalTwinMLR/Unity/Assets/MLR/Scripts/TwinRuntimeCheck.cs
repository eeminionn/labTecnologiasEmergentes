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
        [Serializable] public class VideoResult { public string name; public bool prepared; public long frame; public int width; public int height; }
        [Serializable] public class CheckReport
        {
            public string unityVersion;
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
        }
        IEnumerator Start()
        {
            var args=Environment.GetCommandLineArgs();
            int index=Array.IndexOf(args,"-twinCapture");
            if(index<0 || index+1>=args.Length){Destroy(gameObject);yield break;}
            string folder=Path.GetFullPath(args[index+1]);Directory.CreateDirectory(folder);
            desktop.automation=true;
            Cursor.visible=false;Cursor.lockState=CursorLockMode.None;
            yield return null;
            float timeout=Time.realtimeSinceStartup+15;
            while(projections.ReadyPlayers<2 && Time.realtimeSinceStartup<timeout)yield return null;
            yield return new WaitForSeconds(2);
            var report=new CheckReport{unityVersion=Application.unityVersion,platform=Application.platform.ToString(),gpu=SystemInfo.graphicsDeviceName,mediaFolder=projections.MediaFolder};
            var renderers=modelRoot.GetComponentsInChildren<MeshRenderer>();
            report.meshRenderers=renderers.Length;
            var bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
            report.dimensions=bounds.size;
            report.meterScale=Mathf.Abs(bounds.size.x-8)<.03f && Mathf.Abs(bounds.size.z-9)<.03f;
            report.chairCount=modelRoot.GetComponentsInChildren<Transform>().Count(t=>System.Text.RegularExpressions.Regex.IsMatch(t.name,"^Chair_[0-9]{2}$"));
            report.projectionSurfaces=projections.surfaces.Length;
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
            report.passed=report.meterScale && report.chairCount==11 && report.projectionSurfaces==9 &&
                report.spawnFloorSupport && report.collisionStopsBody && report.videosPlaying && report.errors.Length==0;
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
            File.WriteAllText(Path.Combine(folder,"validacion-runtime.json"),JsonUtility.ToJson(report,true));
            Debug.Log("TWIN_RUNTIME_CHECK "+JsonUtility.ToJson(report));
            yield return new WaitForSeconds(.5f);
            lighting.Toggle();desktop.ResetPosition();desktop.automation=false;
            if(Array.IndexOf(args,"-twinSelfTest")>=0)Application.Quit(report.passed?0:1);
        }
        Transform Find(string name)=>modelRoot.GetComponentsInChildren<Transform>().First(t=>t.name==name);
    }
}
