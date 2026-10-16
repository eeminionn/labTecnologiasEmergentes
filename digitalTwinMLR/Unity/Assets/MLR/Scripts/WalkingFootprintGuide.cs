using System.Collections.Generic;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>One mesh for the shoe trail. Light advances with the visitor, never with a timer.</summary>
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
        public float ActivationDistance = 1.5f;
        Material material;
        float displayedStep;
        Vector3 lastVisitor;
        bool hasVisitor;

        void Start()
        {
            material = trailRenderer.material;
            material.SetFloat("_Count", StepCount);
            RefreshProgress(true);
        }
        void Update()
        {
            RefreshProgress(false);
            float delta = Mathf.DeltaAngle(displayedStep/StepCount*360,CurrentStep/(float)StepCount*360)/360*StepCount;
            displayedStep += delta * Mathf.Min(1,Time.deltaTime*7);
            if (displayedStep < 0) displayedStep += StepCount;
            if (displayedStep >= StepCount) displayedStep -= StepCount;
            if(material)material.SetFloat("_Current",displayedStep);
            for(int i=0;i<stepLights.Length;i++)
            {
                int n=(CurrentStep+i*2+1)%StepCount;
                stepLights[i].transform.position=stepPositions[n]+Vector3.up*.045f;
            }
        }
        public void RefreshProgress(bool allowJump=false)
        {
            if(StepCount==0)return;
            Transform visitor=xrEye && xrEye.gameObject.activeInHierarchy && xrEye.GetComponent<Camera>().enabled ? xrEye : desktopEye;
            if(!visitor)return;
            if((visitor==desktopEye && desktopSeat && desktopSeat.IsSeated) || (visitor==xrEye && xrSeat && xrSeat.IsSeated))return;
            Vector3 point=visitor.position;point.y=0;
            bool jumped=allowJump || !hasVisitor || Vector3.Distance(point,lastVisitor)>1.5f;
            lastVisitor=point;hasVisitor=true;
            int best=CurrentStep;float distance=float.PositiveInfinity;
            for(int i=0;i<StepCount;i++)
            {
                int forward=(i-CurrentStep+StepCount)%StepCount;
                if(!jumped && forward>7 && forward<StepCount-3)continue;
                float d=Vector3.SqrMagnitude(point-stepPositions[i]);
                if(d<distance){best=i;distance=d;}
            }
            if(distance<ActivationDistance*ActivationDistance)
            {
                int forward=(best-CurrentStep+StepCount)%StepCount;
                if(jumped || forward<=7)CurrentStep=best;
            }
        }

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
            var points=new List<Vector3>();var forwards=new List<Vector3>();
            float carry=0;
            for(int i=0;i<dense.Count-1;i++)
            {
                Vector3 edge=dense[i+1]-dense[i];float length=edge.magnitude;
                while(carry<=length)
                {
                    var forward=edge.normalized;
                    var side=Vector3.Cross(Vector3.up,forward);
                    points.Add(dense[i]+forward*carry+side*((points.Count%2==0)?-.10f:.10f)+Vector3.up*.005f);
                    forwards.Add(forward);carry+=.52f;
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
