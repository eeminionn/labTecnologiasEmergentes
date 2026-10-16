using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace LaReina.DigitalTwin.Editor
{
    public static class TwinProject
    {
        const string Root = "Assets/MLR/";
        public const string ScenePath = Root + "Scenes/Sala_La_Reina.unity";
        static readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();

        [MenuItem("La Reina/Regenerar sala desde el FBX preparado")]
        public static void CreateScene()
        {
            AssetDatabase.Refresh();
            ConfigureProject();
            materials.Clear();
            ConfigureTextures();
            string modelPath = Root + "Models/Sala_MLR.fbx";
            var importer = (ModelImporter)AssetImporter.GetAtPath(modelPath);
            importer.globalScale = 1f;
            importer.useFileScale = true;
            importer.importCameras = false;
            importer.importLights = false;
            importer.importAnimation = false;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.importNormals = ModelImporterNormals.Import;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.SaveAndReimport();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var source = AssetDatabase.LoadAssetAtPath<GameObject>(modelPath);
            if (!source) throw new InvalidDataException("No se encuentra el FBX preparado.");
            var model = (GameObject)PrefabUtility.InstantiatePrefab(source);
            model.name = "Sala_MLR — FBX a escala 1:1";
            var metadata = model.AddComponent<RoomMetadata>();
            var surfaces = new List<ProjectionSurface>();
            foreach (var renderer in model.GetComponentsInChildren<MeshRenderer>())
            {
                var original = renderer.sharedMaterials;
                var replacement = new Material[original.Length];
                for (int i = 0; i < original.Length; i++)
                {
                    string id = original[i] ? original[i].name.Replace(" (Instance)", "") : "Steel";
                    replacement[i] = GetMaterial(id);
                    if (id.StartsWith("Projection_"))
                    {
                        var surface = renderer.gameObject.AddComponent<ProjectionSurface>();
                        surface.targetRenderer = renderer;
                        surface.materialSlot = i;
                        surface.channelId = id == "Projection_Table" ? "mesa" : "panorama";
                        surface.surfaceAspect = surface.channelId == "mesa" ? 1.870456f/2.401718f : 8.987891565f;
                        surface.fitMode = surface.channelId == "panorama" ? 1 : 0;
                        surface.ovalMask = surface.channelId == "mesa";
                        if(surface.ovalMask)
                        {
                            // Inspect the source mesh before Unity combines static geometry in the player.
                            var mesh=renderer.GetComponent<MeshFilter>().sharedMesh;
                            var uv=mesh.uv;var indices=mesh.triangles;
                            for(int n=0;n<indices.Length;n+=3)
                            {
                                Vector2 a=uv[indices[n+1]]-uv[indices[n]],b=uv[indices[n+2]]-uv[indices[n]];
                                surface.sourceUvArea+=Mathf.Abs(a.x*b.y-a.y*b.x)*.5f;
                            }
                            surface.sourceUvsWithinOval=uv.All(p=>(p*2-Vector2.one).sqrMagnitude<1.002f);
                        }
                        surface.fallback = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "Textures/" +
                            (surface.channelId == "mesa" ? "mesa_demo_Poster.png" : "panorama_Poster.png"));
                        replacement[i].SetTexture("_BaseMap", surface.fallback);
                        replacement[i].SetFloat("_SurfaceAspect", surface.surfaceAspect);
                        replacement[i].SetFloat("_FitMode", surface.fitMode);
                        replacement[i].SetFloat("_OvalMask", surface.ovalMask ? 1f : 0f);
                        replacement[i].SetFloat("_VideoAspect", surface.fallback ? (float)surface.fallback.width/surface.fallback.height : surface.surfaceAspect);
                        surfaces.Add(surface);
                    }
                }
                renderer.sharedMaterials = replacement;
                renderer.shadowCastingMode = renderer.name.StartsWith("Projection_") ? ShadowCastingMode.Off : ShadowCastingMode.On;
                renderer.receiveShadows = !renderer.name.StartsWith("Projection_");
                bool adjustableTable=renderer.name.StartsWith("Table_") || renderer.name=="Projection_Table";
                GameObjectUtility.SetStaticEditorFlags(renderer.gameObject, adjustableTable ? 0 : StaticEditorFlags.BatchingStatic | StaticEditorFlags.ReflectionProbeStatic);
                bool chair = renderer.name.StartsWith("Chair_");
                bool decorative = renderer.name.Contains("DecorativeRings") || renderer.name.Contains("Guide") ||
                    renderer.name.Contains("Ceiling_") || renderer.name.Contains("Projector_") || renderer.name.Contains("OvalSupport_");
                if (!chair && !decorative)
                {
                    var collider = renderer.gameObject.AddComponent<MeshCollider>();
                    collider.sharedMesh = renderer.GetComponent<MeshFilter>().sharedMesh;
                    collider.convex = false;
                }
                if (renderer.name.StartsWith("Floor_Slab")) renderer.gameObject.layer = 8;
            }
            foreach (var t in model.GetComponentsInChildren<Transform>().Where(t =>
                System.Text.RegularExpressions.Regex.IsMatch(t.name, "^Chair_[0-9]{2}$")))
            {
                var renderers = t.GetComponentsInChildren<Renderer>();
                var localBounds = new Bounds(Vector3.zero, Vector3.zero);
                bool first = true;
                foreach (var r in renderers)
                {
                    var b = r.GetComponent<MeshFilter>().sharedMesh.bounds;
                    for (int n = 0; n < 8; n++)
                    {
                        var corner = b.center + Vector3.Scale(b.extents, new Vector3((n&1)==0?-1:1,(n&2)==0?-1:1,(n&4)==0?-1:1));
                        var point = t.InverseTransformPoint(r.transform.TransformPoint(corner));
                        if (first) { localBounds = new Bounds(point,Vector3.zero); first = false; } else localBounds.Encapsulate(point);
                    }
                }
                var c = t.gameObject.AddComponent<BoxCollider>();
                c.center = localBounds.center;
                c.size = localBounds.size;
            }

            var director = new GameObject("Proyecciones — cambiar MP4 por canal").AddComponent<ProjectionDirector>();
            director.surfaces = surfaces.ToArray();
            var lightRig = CreateLighting();
            var target = Find(model,"Target_Table").position;
            var entrance = Find(model,"Spawn_Entrance").position + Vector3.up * .04f;
            // Keep navigation inside the modeled floor without changing the FBX's open doorway.
            var entryLimit = new GameObject("Límite del recorrido en el acceso").AddComponent<BoxCollider>();
            entryLimit.transform.position = new Vector3(entrance.x,1.35f,Mathf.Sign(entrance.z)*4.36f);
            entryLimit.size = new Vector3(.92f,2.7f,.04f);
            var desktop = new GameObject("Recorrido Mac — WASD y mouse");
            desktop.transform.position = entrance;
            desktop.transform.rotation = Quaternion.LookRotation(Vector3.ProjectOnPlane(target - entrance,Vector3.up));
            desktop.AddComponent<CharacterController>();
            var controller = desktop.AddComponent<DesktopWalkthrough>();
            var camera = MakeCamera(desktop.transform, "Camera_Mac");
            camera.transform.localPosition = Vector3.up * 1.65f;
            camera.tag = "MainCamera";
            controller.eye = camera;
            controller.projections = director;
            controller.lighting = lightRig;
            controller.startPosition = entrance;
            controller.startYaw = desktop.transform.eulerAngles.y;
            var xrRoot = new GameObject("Recorrido Meta Quest — OpenXR");
            xrRoot.transform.SetPositionAndRotation(entrance,desktop.transform.rotation);
            xrRoot.AddComponent<CharacterController>();
            var xrCamera = MakeCamera(xrRoot.transform,"Camera_Quest");
            xrCamera.enabled = false;
            xrCamera.GetComponent<AudioListener>().enabled = false;
            var xr = xrRoot.AddComponent<XrWalkthrough>();
            var so = new SerializedObject(xr);
            so.FindProperty("headsetCamera").objectReferenceValue = xrCamera;
            so.FindProperty("desktopRig").objectReferenceValue = desktop;
            so.ApplyModifiedPropertiesWithoutUndo();
            var seatSpots = model.GetComponentsInChildren<Transform>(true)
                .Where(t=>System.Text.RegularExpressions.Regex.IsMatch(t.name,"^Chair_[0-9]{2}$"))
                .Select(t=>new SeatInteraction.SeatSpot {chair=t,eyeAnchor=Find(model,"Seat_"+t.name.Substring(6)),
                    standAnchor=Find(model,"Stand_"+t.name.Substring(6))}).ToArray();
            var desktopSeats=desktop.AddComponent<SeatInteraction>();desktopSeats.Initialize(camera,seatSpots,target,false);controller.seating=desktopSeats;
            var xrSeats=xrRoot.AddComponent<SeatInteraction>();xrSeats.Initialize(xrCamera,seatSpots,target,true);xr.seating=xrSeats;
            var gestureBridge=new GameObject("Mapa gestual — solo silla principal").AddComponent<GestureTableBridge>();
            gestureBridge.desktopSeat=desktopSeats;gestureBridge.principalChair=Find(model,"Chair_10");gestureBridge.projections=director;
            controller.gestureBridge=gestureBridge;
            var tableAdjustment=new GameObject("Altura temporal de mesa y mapa").AddComponent<RuntimeTableAdjustment>();
            tableAdjustment.tableTop=Find(model,"Table_Top_Original");tableAdjustment.pedestal=Find(model,"Table_Base_Original");
            tableAdjustment.inset=Find(model,"Table_Inset_Original");tableAdjustment.projection=Find(model,"Projection_Table");
            controller.tableAdjustment=tableAdjustment;
            var footprintGuide=CreateFootprints(entrance,camera.transform,xrCamera.transform,desktopSeats,xrSeats);
            var ceilingDisplay=CreateCeilingDisplay();
            controller.ceilingDisplay=ceilingDisplay;
            var qa = new GameObject("Verificacion — solo con argumento de captura").AddComponent<TwinRuntimeCheck>();
            qa.desktop = controller;
            qa.modelRoot = model;
            qa.projections = director;
            qa.lighting = lightRig;
            qa.footprints = footprintGuide;
            qa.ceilingDisplay = ceilingDisplay;
            qa.gestureBridge = gestureBridge;
            new GameObject("Calidad por plataforma").AddComponent<RoomPlatformSettings>();

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.19f,.22f,.27f);
            RenderSettings.ambientEquatorColor = new Color(.11f,.13f,.16f);
            RenderSettings.ambientGroundColor = new Color(.055f,.063f,.08f);
            RenderSettings.ambientIntensity = 1f;
            RenderSettings.reflectionIntensity = .8f;
            RenderSettings.fog = false;
            CreateVolume();
            var probe = new GameObject("Reflejos del interior").AddComponent<ReflectionProbe>();
            probe.transform.position = new Vector3(0,1.4f,0);
            probe.size = new Vector3(7.8f,2.65f,8.8f);
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.IndividualFaces;
            probe.resolution = 128;
            probe.clearFlags = ReflectionProbeClearFlags.SolidColor;
            probe.backgroundColor = new Color(.09f,.11f,.14f);
            probe.boxProjection = true;
            EditorSceneManager.SaveScene(scene,ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath,true) };
            AssetDatabase.SaveAssets();
            ValidateScene();
            Debug.Log("TWIN_SCENE_READY " + ScenePath);
        }

        static Camera MakeCamera(Transform parent,string name)
        {
            var o = new GameObject(name);
            o.transform.SetParent(parent,false);
            var camera = o.AddComponent<Camera>();
            camera.nearClipPlane = .05f;
            camera.farClipPlane = 40f;
            camera.fieldOfView = 60f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.025f,.035f,.05f);
            camera.allowHDR = true;
            o.AddComponent<AudioListener>();
            var data = camera.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.None;
            return camera;
        }

        static WalkingFootprintGuide CreateFootprints(Vector3 entrance,Transform desktopEye,Transform xrEye,SeatInteraction desktopSeat,SeatInteraction xrSeat)
        {
            var o=new GameObject("Huellas reactivas — izquierda a derecha");
            var guide=o.AddComponent<WalkingFootprintGuide>();
            guide.desktopEye=desktopEye;guide.xrEye=xrEye;guide.desktopSeat=desktopSeat;guide.xrSeat=xrSeat;
            var mesh=guide.CreateMesh(entrance);
            string meshPath=Root+"Models/FootprintPath.asset";
            if(AssetDatabase.LoadAssetAtPath<Mesh>(meshPath))AssetDatabase.DeleteAsset(meshPath);
            AssetDatabase.CreateAsset(mesh,meshPath);
            o.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=o.AddComponent<MeshRenderer>();renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            var material=new Material(Shader.Find("LaReina/Footprint"));material.name="Huellas";
            material.SetColor("_BaseColor",ProjectPalette.Teal.linear);material.SetColor("_Accent",ProjectPalette.Lime.linear);
            material.SetFloat("_Count",guide.StepCount);
            string path=Root+"Materials/Huellas.mat";
            if(AssetDatabase.LoadAssetAtPath<Material>(path))AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material,path);renderer.sharedMaterial=material;guide.trailRenderer=renderer;
            guide.stepLights=new[]{PointLight(o.transform,"Luz de huella",Vector3.zero,ProjectPalette.Teal,.20f,.45f,false)};
            return guide;
        }

        static CeilingEventDisplay CreateCeilingDisplay()
        {
            string path=Root+"Models/Ceiling_Event_Display.fbx";
            var importer=(ModelImporter)AssetImporter.GetAtPath(path);
            importer.globalScale=1;importer.useFileScale=true;importer.importNormals=ModelImporterNormals.Import;
            importer.importCameras=false;importer.importLights=false;importer.importAnimation=false;
            importer.meshCompression=ModelImporterMeshCompression.Off;importer.SaveAndReimport();
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);
            var ring=(GameObject)PrefabUtility.InstantiatePrefab(source);
            ring.name="Pantalla circular — información de la sesión";
            var renderer=ring.GetComponentInChildren<MeshRenderer>();
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            var panel=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/EventDisplay/ceiling_panel_base.png");
            var material=new Material(Shader.Find("LaReina/CeilingEvent")){name="Pantalla de sesión municipal"};
            material.SetTexture("_BaseMap",panel);material.SetFloat("_Repeats",2);
            string materialPath=Root+"Materials/CeilingEvent.mat";
            if(AssetDatabase.LoadAssetAtPath<Material>(materialPath))AssetDatabase.DeleteAsset(materialPath);
            AssetDatabase.CreateAsset(material,materialPath);renderer.sharedMaterial=material;
            var display=ring.AddComponent<CeilingEventDisplay>();
            display.targetRenderer=renderer;display.basePanel=panel;
            display.digitAtlas=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/EventDisplay/ceiling_digits.png");
            display.durationSeconds=900;display.repetitions=2;
            return display;
        }

        static RoomLighting CreateLighting()
        {
            var rig = new GameObject("Iluminación regulable — revisión y proyección").AddComponent<RoomLighting>();
            var white = new List<Light>();
            var accent = new List<Light>();
            foreach (float x in new[] {-2.2f,2.2f}) foreach(float z in new[] {-2.8f,2.8f})
                white.Add(PointLight(rig.transform,"Luz neutra",new Vector3(x,2.48f,z),new Color(.84f,.9f,1),8f,6.5f,true));
            foreach(float z in new[] {-2.7f,0,2.7f})
            {
                accent.Add(PointLight(rig.transform,"Acento turquesa",new Vector3(-1.6f,2.3f,z*.6f),ProjectPalette.Teal,.5f,2.8f,false));
                accent.Add(PointLight(rig.transform,"Acento fucsia",new Vector3(1.6f,2.30f,z*.6f),ProjectPalette.Pink,.5f,2.8f,false));
            }
            rig.whiteLights = white.ToArray();
            rig.accentLights = accent.ToArray();
            var fill = new GameObject("Luz suave de base").AddComponent<Light>();
            fill.transform.SetParent(rig.transform);fill.transform.rotation=Quaternion.Euler(50,-30,0);
            fill.type=LightType.Directional;fill.color=new Color(.82f,.87f,1);fill.intensity=.45f;fill.shadows=LightShadows.None;
            rig.fillLight=fill;
            var ambient = new SphericalHarmonicsL2();ambient.AddAmbientLight(new Color(.30f,.34f,.40f));RenderSettings.ambientProbe=ambient;
            return rig;
        }
        static Light PointLight(Transform parent,string name,Vector3 pos,Color color,float intensity,float range,bool shadows)
        {
            var o = new GameObject(name);o.transform.SetParent(parent);o.transform.position=pos;
            var l=o.AddComponent<Light>();l.type=LightType.Point;l.color=color;l.intensity=intensity;l.range=range;
            l.shadows=shadows?LightShadows.Soft:LightShadows.None;l.shadowBias=.025f;l.shadowNormalBias=.1f;
            return l;
        }
        static void CreateVolume()
        {
            string path=Root+"Settings/SalaVolume.asset";
            var profile=ScriptableObject.CreateInstance<VolumeProfile>();
            var bloom=profile.Add<Bloom>(true);bloom.intensity.Override(.22f);bloom.threshold.Override(1.2f);bloom.scatter.Override(.55f);
            var tone=profile.Add<Tonemapping>(true);tone.mode.Override(TonemappingMode.ACES);
            var color=profile.Add<ColorAdjustments>(true);color.postExposure.Override(.15f);color.saturation.Override(0f);
            if(AssetDatabase.LoadAssetAtPath<VolumeProfile>(path))AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(profile,path);
            foreach(var component in profile.components)AssetDatabase.AddObjectToAsset(component,profile);
            var volume=new GameObject("Ambiente — brillo contenido").AddComponent<Volume>();volume.isGlobal=true;volume.sharedProfile=profile;
        }

        static Material GetMaterial(string id)
        {
            if(materials.TryGetValue(id,out var found))return found;
            bool projection=id.StartsWith("Projection_");
            var mat=new Material(Shader.Find(projection?"LaReina/Projection":"Universal Render Pipeline/Lit"));mat.name=id;
            mat.enableInstancing=true;
            if(!projection)
            {
                mat.SetColor("_BaseColor",Color.white);mat.SetFloat("_Smoothness",.35f);
                string texture=null;Vector2 tile=Vector2.one;
                switch(id)
                {
                    case "Floor": texture="Floor_DarkTile";tile=new Vector2(1f/1.6f,1f/.8f);break;
                    case "Steel": case "TableBase": texture="Steel_DarkBrushed";tile=Vector2.one*2;break;
                    case "Cladding":mat.SetColor("_BaseColor",ProjectPalette.Petrol*.5f);mat.SetFloat("_Smoothness",.22f);mat.SetFloat("_Metallic",.2f);break;
                    case "Fabric": texture="Fabric_Charcoal";tile=Vector2.one*25;break;
                    case "TableWhite":mat.SetColor("_BaseColor",new Color(.73f,.77f,.80f));mat.SetFloat("_Smoothness",.48f);break;
                    case "Wall":mat.SetColor("_BaseColor",new Color(.84f,.85f,.85f));mat.SetFloat("_Smoothness",.04f);break;
                    case "Rubber":mat.SetColor("_BaseColor",new Color(.025f,.03f,.038f));mat.SetFloat("_Smoothness",.15f);break;
                    case "Glass":
                        mat.SetColor("_BaseColor",new Color(.25f,.4f,.46f,.20f));mat.SetFloat("_Surface",1);
                        mat.SetFloat("_SrcBlend",(float)BlendMode.SrcAlpha);mat.SetFloat("_DstBlend",(float)BlendMode.OneMinusSrcAlpha);
                        mat.SetFloat("_ZWrite",0);mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");mat.renderQueue=3000;mat.SetFloat("_Smoothness",.85f);break;
                    case "LED_Cyan": case "LED_Magenta":
                        Color c=id=="LED_Cyan"?ProjectPalette.Teal:ProjectPalette.Pink;
                        mat.SetColor("_BaseColor",c*.7f);mat.EnableKeyword("_EMISSION");mat.SetColor("_EmissionColor",c*1.2f);break;
                }
                if(texture!=null)
                {
                    mat.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/"+texture+"_Albedo.png"));
                    mat.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/"+texture+"_Normal.png"));
                    mat.SetTexture("_MetallicGlossMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/"+texture+"_MetallicSmoothness.png"));
                    mat.EnableKeyword("_NORMALMAP");mat.EnableKeyword("_METALLICSPECGLOSSMAP");
                    mat.SetTextureScale("_BaseMap",tile);mat.SetTextureScale("_BumpMap",tile);mat.SetTextureScale("_MetallicGlossMap",tile);
                    mat.SetFloat("_Smoothness",1);mat.SetFloat("_BumpScale",.5f);
                    if(id=="TableBase")mat.SetColor("_BaseColor",ProjectPalette.Petrol);
                }
            }
            string asset=Root+"Materials/"+id+".mat";
            if(AssetDatabase.LoadAssetAtPath<Material>(asset))AssetDatabase.DeleteAsset(asset);
            AssetDatabase.CreateAsset(mat,asset);materials[id]=mat;return mat;
        }

        static void ConfigureTextures()
        {
            foreach(string file in Directory.GetFiles(Root+"Textures","*.png",SearchOption.AllDirectories))
            {
                var texture=(TextureImporter)AssetImporter.GetAtPath(file.Replace('\\','/'));
                texture.textureType=file.Contains("_Normal")?TextureImporterType.NormalMap:TextureImporterType.Default;
                texture.sRGBTexture=!file.Contains("_MetallicSmoothness") && !file.Contains("_Normal");
                bool eventDisplay=file.Contains("EventDisplay");
                texture.isReadable=eventDisplay;
                texture.textureCompression=eventDisplay?TextureImporterCompression.Uncompressed:TextureImporterCompression.Compressed;
                texture.alphaIsTransparency=false;texture.maxTextureSize=file.Contains("panorama")?4096:eventDisplay?2048:1024;
                texture.wrapMode=file.Contains("Poster") || eventDisplay?TextureWrapMode.Clamp:TextureWrapMode.Repeat;
                texture.mipmapEnabled=true;texture.anisoLevel=4;texture.SaveAndReimport();
            }
        }

        static void ConfigureProject()
        {
            PlayerSettings.companyName="MLR";PlayerSettings.productName="Sala La Reina";
            PlayerSettings.bundleVersion="0.6.0";PlayerSettings.Android.bundleVersionCode=6;
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Standalone,"cl.mlr.sala.lareina");
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android,"cl.mlr.sala.lareina");
            PlayerSettings.defaultScreenWidth=1600;PlayerSettings.defaultScreenHeight=900;
            PlayerSettings.fullScreenMode=FullScreenMode.Windowed;PlayerSettings.resizableWindow=true;
            PlayerSettings.runInBackground=true;PlayerSettings.colorSpace=ColorSpace.Linear;
            var rp=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(Root+"Settings/PC_RPAsset.asset");
            rp.msaaSampleCount=4;rp.supportsHDR=true;rp.shadowDistance=12;rp.mainLightShadowmapResolution=2048;
            rp.maxAdditionalLightsCount=8;
            rp.supportsCameraDepthTexture=false;rp.supportsCameraOpaqueTexture=false;
            GraphicsSettings.defaultRenderPipeline=rp;
            for(int i=0;i<QualitySettings.names.Length;i++){QualitySettings.SetQualityLevel(i,false);QualitySettings.renderPipeline=rp;}
            QualitySettings.vSyncCount=1;
            var tags=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            tags.FindProperty("layers").GetArrayElementAtIndex(8).stringValue="Floor";tags.ApplyModifiedPropertiesWithoutUndo();
            XrProjectSetup.ConfigureQuest();
            EditorUtility.SetDirty(rp);
        }

        public static Transform Find(GameObject root,string name)=>root.GetComponentsInChildren<Transform>(true).First(t=>t.name==name);

        [MenuItem("La Reina/Verificar escala y componentes")]
        public static void ValidateScene()
        {
            var surfaces=UnityEngine.Object.FindObjectsByType<ProjectionSurface>();
            var metadata=UnityEngine.Object.FindAnyObjectByType<RoomMetadata>();
            if(!metadata || surfaces.Length!=2)throw new InvalidDataException("Se requieren una pared panorámica y la mesa.");
            var tabletop=Find(metadata.gameObject,"Table_Top_Original").GetComponent<MeshRenderer>().bounds;
            if(Mathf.Abs(tabletop.size.x-2.270456f)>.003f || Mathf.Abs(tabletop.size.z-2.801718f)>.003f ||
                Mathf.Abs(tabletop.max.y-.762753f)>.002f || !surfaces.First(s=>s.channelId=="mesa").ovalMask ||
                surfaces.First(s=>s.channelId=="mesa").sourceUvArea<.775f || surfaces.First(s=>s.channelId=="mesa").sourceUvArea>.795f ||
                !surfaces.First(s=>s.channelId=="mesa").sourceUvsWithinOval)
                throw new InvalidDataException("La mesa o su máscara ovalada no coinciden con sala 002.fbx.");
            var ceiling=UnityEngine.Object.FindAnyObjectByType<CeilingEventDisplay>();
            if(!ceiling || !ceiling.basePanel || !ceiling.digitAtlas || !ceiling.basePanel.isReadable || !ceiling.digitAtlas.isReadable)
                throw new InvalidDataException("Faltan los recursos legibles para la pantalla circular.");
            var renderers=metadata.GetComponentsInChildren<Renderer>();
            var bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
            if(Mathf.Abs(bounds.size.x-8)>.03f || Mathf.Abs(bounds.size.z-9)>.03f)throw new InvalidDataException("Escala incorrecta: "+bounds.size);
            int chairs=metadata.GetComponentsInChildren<Transform>().Count(t=>System.Text.RegularExpressions.Regex.IsMatch(t.name,"^Chair_[0-9]{2}$"));
            if(chairs!=11)throw new InvalidDataException("Se requieren11sillas; encontradas"+chairs);
            var bridge=UnityEngine.Object.FindAnyObjectByType<GestureTableBridge>();
            if(!bridge || bridge.principalChair!=Find(metadata.gameObject,"Chair_10") || !bridge.desktopSeat || !bridge.projections)
                throw new InvalidDataException("Falta la autorización del mapa en la silla central.");
            var adjustment=UnityEngine.Object.FindAnyObjectByType<RuntimeTableAdjustment>();
            if(!adjustment || !adjustment.tableTop || !adjustment.pedestal || !adjustment.inset || !adjustment.projection)
                throw new InvalidDataException("Faltan las piezas ajustables de la mesa.");
            foreach(var seats in UnityEngine.Object.FindObjectsByType<SeatInteraction>())
                if(seats.Seats.Length!=11 || seats.Seats.Any(s=>!s.eyeAnchor || !s.standAnchor || Mathf.Abs(s.eyeAnchor.position.y-1.18f)>.02f))
                    throw new InvalidDataException("Faltan anclas para sentarse o su altura no es correcta.");
            if(renderers.Any(r=>r.sharedMaterials.Any(m=>!m || !m.shader || m.shader.name=="Hidden/InternalErrorShader")))throw new InvalidDataException("Material inválido.");
            Debug.Log("TWIN_VALIDATED dimensions="+bounds.size+" chairs="+chairs+" projections="+surfaces.Length+" meshes="+renderers.Length);
        }

        public static void BuildMac()
        {
            XrProjectSetup.ConfigureQuest();
            EditorSceneManager.OpenScene(ScenePath);ValidateScene();
            string path=Argument("-twinBuildPath")??Path.GetFullPath("../Builds/Mac/Sala La Reina.app");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,ScriptingImplementation.Mono2x);
            PlayerSettings.SetArchitecture(NamedBuildTarget.Standalone,1);
            Build(path,BuildTarget.StandaloneOSX);
        }
        public static void RebuildMac() { CreateScene(); BuildMac(); }
        public static void VerifySavedProject()
        {
            EditorSceneManager.OpenScene(ScenePath);
            ValidateScene();
            new ProjectionConfigBuildSync().OnPreprocessBuild(null);
        }
        public static void BuildQuest()
        {
            EditorSceneManager.OpenScene(ScenePath);ValidateScene();
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android,ScriptingImplementation.IL2CPP);
            using(QuestQualitySetup.ApplyMobile())
                Build(Argument("-twinBuildPath")??Path.GetFullPath("../Builds/Quest/Sala_La_Reina.apk"),BuildTarget.Android);
        }
        static void Build(string path,BuildTarget target)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=path,target=target,options=BuildOptions.None});
            if(report.summary.result!=BuildResult.Succeeded)throw new InvalidOperationException("Falló build: "+report.summary.result);
            Debug.Log("TWIN_BUILD_SUCCESS "+path+" bytes="+report.summary.totalSize);
        }
        static string Argument(string key){var args=Environment.GetCommandLineArgs();int n=Array.IndexOf(args,key);return n>=0 && n+1<args.Length?args[n+1]:null;}
    }
}
