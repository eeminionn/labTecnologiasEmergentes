using System.Collections.Generic;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>One shoe lights at a time; a short walking sequence stays ahead of the visitor.</summary>
    public sealed class WalkingFootprintGuide : MonoBehaviour
    {
        public Transform desktopEye, xrEye;
        public SeatInteraction desktopSeat, xrSeat;
        public Renderer trailRenderer;
        public Vector3[] stepPositions = new Vector3[0];
        public Vector3[] stepDirections = new Vector3[0];
        public Light[] stepLights;
        public int CurrentStep { get; private set; }
        public int StepCount => stepPositions.Length;
        public int IlluminatedStep { get; private set; }
        public float PulseIntensity { get; private set; }
        public bool HasNearbyRoute { get; private set; }
        public bool HasTrackedPosition { get; private set; }
        public int ActiveLightCount
        {
            get
            {
                int count=0;
                if(stepLights!=null)foreach(var light in stepLights)
                    if(light && light.enabled && light.intensity>.001f)count++;
                return count;
            }
        }
        public float ActivationDistance = 1.5f;
        [Min(0f)] public float PositionTieTolerance = .025f;
        public const float StepDuration = .62f;
        const int LookAheadSteps = 4;
        Material material;
        float pulseTime, lightIntensity = .20f;
        bool gaitInitialized;

        void Start()
        {
            if(trailRenderer)material = trailRenderer.material;
            if(material)material.SetFloat("_Count", StepCount);
            if(stepLights!=null && stepLights.Length>0 && stepLights[0])
                lightIntensity=Mathf.Max(.01f,stepLights[0].intensity);
            RefreshProgress(true);
            AdvanceAnimation(0);
        }
        void Update()
        {
            RefreshProgress(false);
            AdvanceAnimation(Time.deltaTime);
        }
        Transform ActiveVisitor()
        {
            var camera=xrEye ? xrEye.GetComponent<Camera>() : null;
            return camera && camera.enabled && xrEye.gameObject.activeInHierarchy ? xrEye : desktopEye;
        }
        bool VisitorIsSeated()
        {
            var visitor=ActiveVisitor();
            return (visitor==desktopEye && desktopSeat && desktopSeat.IsSeated)
                || (visitor==xrEye && xrSeat && xrSeat.IsSeated);
        }
        int Wrap(int step) => (step%StepCount+StepCount)%StepCount;

        /// <summary>Deterministic gait clock, also used by the scene's runtime verification.</summary>
        public void AdvanceAnimation(float deltaTime)
        {
            if(StepCount<2)return;
            if(!gaitInitialized)
            {
                IlluminatedStep=Wrap(CurrentStep+1);
                gaitInitialized=true;
            }
            bool paused=VisitorIsSeated();
            if(!paused)
            {
                pulseTime+=Mathf.Max(0,deltaTime);
                while(pulseTime>=StepDuration)
                {
                    pulseTime-=StepDuration;
                    if(!HasNearbyRoute)continue;
                    int next=Wrap(IlluminatedStep+1);
                    int ahead=Wrap(next-CurrentStep);
                    if(ahead<1 || ahead>LookAheadSteps)
                    {
                        // Restart only the nearby cue, on the opposite foot. Four steps form an even cycle.
                        next=Wrap(CurrentStep+1);
                        if((next&1)==(IlluminatedStep&1))next=Wrap(next+1);
                    }
                    IlluminatedStep=next;
                }
            }
            // Each pulse reaches zero before the following shoe starts: never a glowing pair.
            PulseIntensity=paused || !HasTrackedPosition?0:Mathf.Sin(Mathf.Clamp01(pulseTime/StepDuration)*Mathf.PI);
            ApplyVisuals();
        }
        void ApplyVisuals()
        {
            if(material)
            {
                material.SetFloat("_Current",CurrentStep);
                material.SetFloat("_Illuminated",IlluminatedStep);
                material.SetFloat("_Pulse",PulseIntensity);
            }
            if(stepLights==null)return;
            for(int i=0;i<stepLights.Length;i++)
            {
                if(!stepLights[i])continue;
                stepLights[i].enabled=i==0 && PulseIntensity>.001f;
                if(i!=0)continue;
                stepLights[i].intensity=lightIntensity*PulseIntensity;
                stepLights[i].transform.position=stepPositions[IlluminatedStep]+Vector3.up*.045f;
            }
        }
        public void RefreshProgress(bool allowJump=false)
        {
            if(StepCount==0)return;
            Transform visitor=ActiveVisitor();
            if(!visitor)return;
            if((visitor==desktopEye && desktopSeat && desktopSeat.IsSeated) || (visitor==xrEye && xrSeat && xrSeat.IsSeated))return;
            Vector3 point=visitor.position;point.y=0;
            int best=CurrentStep;float distance=float.PositiveInfinity;
            for(int i=0;i<StepCount;i++)
            {
                Vector3 candidate=stepPositions[i];candidate.y=0;
                float d=Vector3.SqrMagnitude(point-candidate);
                if(d<distance){best=i;distance=d;}
            }
            bool wasNearby=HasNearbyRoute;
            HasNearbyRoute=distance<=ActivationDistance*ActivationDistance;
            if(!HasNearbyRoute)return;
            if(HasTrackedPosition && !allowJump && PositionTieTolerance>0)
            {
                float limit=Mathf.Min(ActivationDistance,Mathf.Sqrt(distance)+PositionTieTolerance);
                int continuity=StepDelta(best);
                for(int i=0;i<StepCount;i++)
                {
                    Vector3 candidate=stepPositions[i];candidate.y=0;
                    if(Vector3.SqrMagnitude(point-candidate)>limit*limit)continue;
                    int delta=StepDelta(i);
                    if(delta>=continuity)continue;
                    best=i;continuity=delta;
                }
            }
            if(!HasTrackedPosition || !wasNearby || best!=CurrentStep)
            {
                CurrentStep=best;
                int next=Wrap(CurrentStep+1);
                // A relocated cue changes foot immediately and remains close
                // to the new position, rather than waiting for the gait clock.
                if(gaitInitialized && (next&1)==(IlluminatedStep&1))next=Wrap(next+1);
                IlluminatedStep=next;gaitInitialized=true;
            }
            HasTrackedPosition=true;
            ApplyVisuals();
        }
        int StepDelta(int step){int forward=Wrap(step-CurrentStep);return Mathf.Min(forward,StepCount-forward);}

        public Mesh CreateMesh(Vector3 entrance)
        {
            Vector3 front=Vector3.forward*Mathf.Sign(entrance.z);
            Vector3 right=Vector3.Cross(Vector3.up,-front);
            float start=Mathf.Clamp(Vector3.Dot(entrance,right),-1.6f,1.6f);
            var control=new[]{right*start+front*3.58f,-right*1.95f+front*3.58f,-right*2.65f+front*2.88f,
                -right*2.65f-front*2.65f,-right*1.95f-front*3.35f,right*1.95f-front*3.35f,
                right*2.65f-front*2.65f,right*2.65f+front*2.88f,right*1.95f+front*3.58f};
            var dense=new List<Vector3>();
            for(int i=0;i<control.Length;i++)for(int j=0;j<40;j++)
            {
                float t=j/40f;Vector3 a=control[(i-1+control.Length)%control.Length],b=control[i],c=control[(i+1)%control.Length],d=control[(i+2)%control.Length];
                dense.Add(.5f*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t));
            }
            dense.Add(dense[0]);
            // An even number also preserves right/left alternation across the circuit's closing seam.
            float perimeter=0;
            for(int i=0;i<dense.Count-1;i++)perimeter+=Vector3.Distance(dense[i],dense[i+1]);
            int stepCount=Mathf.Max(2,Mathf.RoundToInt(perimeter/.52f));
            if((stepCount&1)!=0)stepCount++;
            float spacing=perimeter/stepCount;
            var points=new List<Vector3>();var forwards=new List<Vector3>();
            float carry=0;
            for(int i=0;i<dense.Count-1;i++)
            {
                Vector3 edge=dense[i+1]-dense[i];float length=edge.magnitude;
                while(carry<=length && points.Count<stepCount)
                {
                    var forward=edge.normalized;
                    var side=Vector3.Cross(Vector3.up,forward);
                    points.Add(dense[i]+forward*carry+side*((points.Count%2==0)?-.10f:.10f)+Vector3.up*.005f);
                    forwards.Add(forward);carry+=spacing;
                }
                carry-=length;
            }
            stepPositions=points.ToArray();stepDirections=forwards.ToArray();
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
            for(int i=0;i<StepCount;i++)
            {
                // Rounded forefoot and separate heel read as a shoe print, rather than a dot or arrow.
                Vector2[] toe={new Vector2(-.032f,-.035f),new Vector2(-.045f,.005f),new Vector2(-.052f,.075f),
                    new Vector2(-.042f,.118f),new Vector2(-.020f,.143f),new Vector2(.015f,.145f),
                    new Vector2(.043f,.126f),new Vector2(.052f,.092f),new Vector2(.045f,.025f),new Vector2(.023f,-.035f)};
                Vector2[] heel={new Vector2(-.030f,-.135f),new Vector2(-.041f,-.12f),new Vector2(-.039f,-.064f),
                    new Vector2(.025f,-.064f),new Vector2(.034f,-.12f),new Vector2(.020f,-.137f)};
                AddSole(toe,i,vertices,uv,triangles);AddSole(heel,i,vertices,uv,triangles);
            }
            var mesh=new Mesh{name="Huellas — recorrido izquierdo a derecho"};
            mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);mesh.RecalculateBounds();mesh.RecalculateNormals();
            return mesh;
        }
        void AddSole(Vector2[] outline,int step,List<Vector3> vertices,List<Vector2> uv,List<int> triangles)
        {
            int start=vertices.Count;Vector3 side=Vector3.Cross(Vector3.up,stepDirections[step]);
            float mirror=step%2==0?1:-1;
            Vector2 center=Vector2.zero;foreach(var p in outline)center+=p;center/=outline.Length;
            vertices.Add(stepPositions[step]+side*(center.x*mirror)+stepDirections[step]*center.y);uv.Add(new Vector2(step,0));
            foreach(var p in outline){vertices.Add(stepPositions[step]+side*(p.x*mirror)+stepDirections[step]*p.y);uv.Add(new Vector2(step,0));}
            for(int i=0;i<outline.Length;i++){triangles.Add(start);triangles.Add(start+1+i);triangles.Add(start+1+(i+1)%outline.Length);}
        }
        void OnDestroy(){if(material)Destroy(material);}
    }
}
