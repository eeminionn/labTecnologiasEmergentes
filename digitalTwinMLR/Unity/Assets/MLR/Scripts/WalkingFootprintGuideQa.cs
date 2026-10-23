using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Checks position reacquisition on the actual floor route in capture mode.</summary>
    public static class WalkingFootprintGuideQa
    {
        [Serializable] public sealed class Result
        {
            public bool configured, passed;
            public CeilingLedGuideQa.CaseResult[] cases;
            public string error;
        }

        public static Result Run(WalkingFootprintGuide guide, DesktopWalkthrough desktop)
        {
            var result=new Result();
            var cases=new List<CeilingLedGuideQa.CaseResult>();
            result.cases=new CeilingLedGuideQa.CaseResult[0];
            result.configured=guide && desktop && desktop.eye && guide.StepCount>=24 && guide.StepCount%2==0;
            if(!result.configured){result.error="Falta el recorrido de huellas o el visitante.";return result;}
            var body=desktop.GetComponent<CharacterController>();
            Vector3 position=desktop.transform.position,eyePosition=desktop.eye.transform.localPosition;
            Quaternion rotation=desktop.transform.rotation,eyeRotation=desktop.eye.transform.localRotation;
            bool enabled=guide.enabled,bodyEnabled=body.enabled,automation=desktop.automation;
            Action<string,bool> record=(name,passed)=>cases.Add(new CeilingLedGuideQa.CaseResult
                {name=name,passed=passed,measuredDistance=guide.CurrentStep});
            Action<Vector3> move=point=>
            {
                Vector3 desired=new Vector3(point.x,desktop.eyeHeight+.04f,point.z);
                desktop.transform.position+=desired-desktop.eye.transform.position;
                guide.RefreshProgress();
            };
            Func<bool> cueIsNear=()=>
            {
                int ahead=(guide.IlluminatedStep-guide.CurrentStep+guide.StepCount)%guide.StepCount;
                if(ahead<1 || ahead>2)return false;
                return guide.stepLights==null || guide.stepLights.Length==0 || !guide.stepLights[0] ||
                    Vector3.Distance(guide.stepLights[0].transform.position,
                        guide.stepPositions[guide.IlluminatedStep]+Vector3.up*.045f)<.003f;
            };
            try
            {
                guide.enabled=false;desktop.automation=true;desktop.seating?.CancelSeat();body.enabled=false;
                int first=6,forward=11,back=7,other=guide.StepCount/2;
                move(guide.stepPositions[first]);guide.AdvanceAnimation(WalkingFootprintGuide.StepDuration*.5f);
                move(guide.stepPositions[forward]);
                record("Piso: avance y foco actualizados inmediatamente",guide.CurrentStep==forward && cueIsNear());
                move(guide.stepPositions[back]);
                record("Piso: retroceso sin ventana de avance",guide.CurrentStep==back && cueIsNear());
                int previousFoot=guide.IlluminatedStep&1;
                move(guide.stepPositions[other]);
                record("Piso: otro tramo sin allowJump y cambio de pie",guide.CurrentStep==other && cueIsNear() &&
                    (guide.IlluminatedStep&1)!=previousFoot);

                int heldStep=guide.CurrentStep,heldCue=guide.IlluminatedStep;
                Vector3 heldLight=guide.stepLights!=null && guide.stepLights.Length>0 && guide.stepLights[0] ?
                    guide.stepLights[0].transform.position:Vector3.zero;
                move(new Vector3(20f,0f,20f));
                guide.AdvanceAnimation(WalkingFootprintGuide.StepDuration*3f);
                record("Piso: fuera de alcance conserva posición y huella iluminada",!guide.HasNearbyRoute &&
                    guide.HasTrackedPosition && guide.CurrentStep==heldStep && guide.IlluminatedStep==heldCue &&
                    (guide.stepLights==null || guide.stepLights.Length==0 || !guide.stepLights[0] ||
                        Vector3.Distance(guide.stepLights[0].transform.position,heldLight)<.001f));

                int target=guide.StepCount-7;
                Vector3 start=new Vector3(20f,0f,20f),destination=guide.stepPositions[target];destination.y=0;
                int count=Mathf.CeilToInt(Vector3.Distance(start,destination)/.10f);
                for(int i=1;i<=count;i++)move(Vector3.Lerp(start,destination,i/(float)count));
                record("Piso: reentrada lenta desde fuera a otro tramo",guide.HasNearbyRoute && guide.CurrentStep==target && cueIsNear());
                bool backwards=true;
                for(int i=target-1;i>=target-10;i--){move(guide.stepPositions[i]);backwards &= guide.CurrentStep==i && cueIsNear();}
                record("Piso: diez pasos de retroceso consecutivos",backwards);
                bool alternating=true,singleLight=true;
                for(int i=0;i<100 && guide.PulseIntensity<.99f;i++)guide.AdvanceAnimation(.01f);
                for(int i=0;i<8;i++)
                {
                    int old=guide.IlluminatedStep;
                    guide.AdvanceAnimation(WalkingFootprintGuide.StepDuration);
                    alternating &= (old&1)!=(guide.IlluminatedStep&1);
                    singleLight &= guide.ActiveLightCount==1;
                }
                record("Piso: reanuda alternancia con una sola luz",alternating && singleLight);
                result.cases=cases.ToArray();
                result.passed=cases.Count>=7 && cases.All(c=>c.passed);
                if(!result.passed)result.error="Revisar reenganche, retroceso o foco retenido de las huellas.";
            }
            catch(Exception exception){result.error=exception.ToString();result.cases=cases.ToArray();}
            finally
            {
                body.enabled=false;desktop.transform.SetPositionAndRotation(position,rotation);
                desktop.eye.transform.SetLocalPositionAndRotation(eyePosition,eyeRotation);
                body.enabled=bodyEnabled;desktop.automation=automation;
                guide.RefreshProgress(true);guide.AdvanceAnimation(0f);guide.enabled=enabled;
                Physics.SyncTransforms();
            }
            return result;
        }
    }
}
