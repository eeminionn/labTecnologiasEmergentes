using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>The principal seat owns a short lease for the separate, local gesture application.</summary>
    [DefaultExecutionOrder(100)]
    public sealed class GestureTableBridge : MonoBehaviour
    {
        public SeatInteraction desktopSeat;
        public Transform principalChair;
        public ProjectionDirector projections;
        [HideInInspector] public bool suppressAutomatic;
        public bool PrincipalSeatOccupied => desktopSeat && desktopSeat.isActiveAndEnabled && desktopSeat.gameObject.activeInHierarchy &&
            desktopSeat.IsSeated && desktopSeat.CurrentChair == principalChair && principalChair;
        public bool Supported => Application.platform == RuntimePlatform.OSXPlayer || Application.platform == RuntimePlatform.OSXEditor;
        public bool Authorized => PrincipalSeatOccupied && Supported && !suppressAutomatic && !paused && !quitting && isActiveAndEnabled;
        public bool SessionRequested { get; private set; }
        public bool LiveTextureActive { get; private set; }
        public bool LastMapVisible => liveTexture && FramesReceived>0;
        public int LaunchCount { get; private set; }
        public int FramesReceived { get; private set; }
        public string Message { get; private set; } = "";
        public BridgeStatus Status { get; private set; } = new BridgeStatus();
        [Serializable] public sealed class BridgeStatus
        {
            public bool ready, active, cameraActive, detectorReady, mirror, previewVisible;
            public int hands, frameSequence, inferenceFrames, previewFrames;
            public string error;
        }
        sealed class Reply { public int code; public byte[] bytes; }
        HttpClient client;
        Process helper;
        string endpoint, token;
        long controlSequence;
        int generation;
        bool paused, quitting;
        float nextAttempt;
        CancellationTokenSource cancellation;
        Texture2D liveTexture;

        void Awake()
        {
            client = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false })
                { Timeout = TimeSpan.FromSeconds(1.2) };
        }
        void OnEnable() { if (desktopSeat) desktopSeat.SeatChanged += OnSeatChanged; }
        void OnSeatChanged() { if (!Authorized) StopSession(); }
        void Update()
        {
            if (!Authorized)
            {
                if (SessionRequested || LiveTextureActive) StopSession();
                return;
            }
            if (!SessionRequested && Time.unscaledTime >= nextAttempt) BeginSession();
        }

        void BeginSession()
        {
            if (!Authorized) return;
            try { EnsureHelper(); }
            catch (Exception e) { Message = "Control gestual: " + e.Message; nextAttempt = Time.unscaledTime + 5; return; }
            cancellation = new CancellationTokenSource();
            SessionRequested = true;
            Message = "Iniciando el control gestual…";
            StartCoroutine(Pump(++generation, cancellation.Token));
        }

        void EnsureHelper()
        {
            if (helper != null && !helper.HasExited) return;
            helper?.Dispose(); helper = null;
            string app = Path.Combine(Application.dataPath,"Helpers/Mapa Gestual MLR.app/Contents/MacOS/Mapa Gestual MLR");
            if (Application.isEditor) app = Path.GetFullPath(Path.Combine(Application.dataPath,
                "../../../mapaGestualMLR/release/mac-arm64/Mapa Gestual MLR.app/Contents/MacOS/Mapa Gestual MLR"));
            string[] args = Environment.GetCommandLineArgs();
            int overrideIndex = Array.IndexOf(args,"-twinHelperPath");
            if (overrideIndex >= 0 && overrideIndex + 1 < args.Length) app = Path.GetFullPath(args[overrideIndex+1]);
            if (!File.Exists(app)) throw new FileNotFoundException("Falta la aplicación de manos incluida en la entrega.");
            var listener = new TcpListener(IPAddress.Loopback,0);listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;listener.Stop();
            endpoint = "http://127.0.0.1:" + port;
            token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
            controlSequence = 0;
            helper = Process.Start(new ProcessStartInfo(app,
                "--twin-bridge --twin-port="+port+" --twin-token="+token+" --twin-parent="+Process.GetCurrentProcess().Id)
                { UseShellExecute = false, CreateNoWindow = true });
            if (helper == null) throw new InvalidOperationException("No se pudo abrir el detector.");
            LaunchCount++;
        }

        bool Current(int epoch) => Authorized && SessionRequested && epoch == generation;
        IEnumerator Pump(int epoch, CancellationToken ct)
        {
            float startupDeadline = Time.unscaledTime + 15;
            bool connected = false;
            while (Current(epoch) && !connected && Time.unscaledTime < startupDeadline)
            {
                var ready = Send("GET","/bridge/status",null,ct);
                while (!ready.IsCompleted && Current(epoch)) yield return null;
                if (!Current(epoch)) yield break;
                connected = Succeeded(ready);
                if (!connected) yield return new WaitForSecondsRealtime(.2f);
            }
            if (!connected) { Fail(epoch,"No se pudo conectar con el detector."); yield break; }
            float nextLease = 0, nextStatus = 0, lastFrame = Time.unscaledTime;
            while (Current(epoch))
            {
                if (Time.unscaledTime >= nextLease)
                {
                    var lease = Send("POST","/bridge/lease","{\"chair\":\"Chair_10\",\"seated\":true,\"sequence\":"+(++controlSequence)+"}",ct);
                    while (!lease.IsCompleted && Current(epoch)) yield return null;
                    if (!Current(epoch)) yield break;
                    if (!Succeeded(lease)) { Fail(epoch,"Se perdió la autorización de la silla."); yield break; }
                    nextLease = Time.unscaledTime + .7f;
                }
                if (Time.unscaledTime >= nextStatus)
                {
                    var status = Send("GET","/bridge/status",null,ct);
                    while (!status.IsCompleted && Current(epoch)) yield return null;
                    if (!Current(epoch)) yield break;
                    if (!Succeeded(status)) { Fail(epoch,"Se perdió la conexión con las manos."); yield break; }
                    try { Status = JsonUtility.FromJson<BridgeStatus>(Encoding.UTF8.GetString(status.Result.bytes)); }
                    catch { Status=null; }
                    if(Status==null){ Fail(epoch,"El detector entregó un estado inválido."); yield break; }
                    Message = !string.IsNullOrWhiteSpace(Status.error) ? Status.error :
                        Status.cameraActive ? "Control gestual activo · " + Status.hands + (Status.hands==1 ? " mano" : " manos") : "Iniciando cámara…";
                    nextStatus = Time.unscaledTime + .5f;
                }
                var frame = Send("GET","/bridge/frame",null,ct);
                while (!frame.IsCompleted && Current(epoch)) yield return null;
                if (!Current(epoch)) yield break;
                if (Succeeded(frame) && frame.Result.code == 200 && ApplyFrame(frame.Result.bytes,epoch)) lastFrame=Time.unscaledTime;
                else if (frame.IsFaulted || Time.unscaledTime-lastFrame>8)
                { Fail(epoch,"No llega la imagen del mapa. Revisa la cámara en Tab."); yield break; }
                yield return new WaitForSecondsRealtime(1f/15f);
            }
        }

        bool ApplyFrame(byte[] bytes, int epoch)
        {
            if (!Current(epoch) || bytes.Length < 4 || bytes.Length > 2*1024*1024) return false;
            if (!liveTexture) liveTexture = new Texture2D(2,2,TextureFormat.RGB24,false)
                { name="Mapa gestual en vivo",wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Bilinear };
            if (!liveTexture.LoadImage(bytes,false) || liveTexture.width>2048 || liveTexture.height>2048 || !Current(epoch)) return false;
            projections.SetLiveOverride("mesa",liveTexture);
            LiveTextureActive = true; FramesReceived++;
            return true;
        }
        static bool Succeeded(Task<Reply> task) => task.Status == TaskStatus.RanToCompletion && task.Result.code >= 200 && task.Result.code < 300;
        async Task<Reply> Send(string method,string route,string json,CancellationToken ct)
        {
            // The fixed loopback endpoint never uses proxies or redirects. Tokens are per child process.
            using (var request = new HttpRequestMessage(new HttpMethod(method),endpoint+route))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",token);
                if (json != null) request.Content = new StringContent(json,Encoding.UTF8,"application/json");
                using (var reply = await client.SendAsync(request,ct).ConfigureAwait(false))
                    return new Reply {code=(int)reply.StatusCode,bytes=await reply.Content.ReadAsByteArrayAsync().ConfigureAwait(false)};
            }
        }
        void Fail(int epoch,string message)
        {
            if (epoch != generation) return;
            StopSession(); Message = message; nextAttempt = Time.unscaledTime + 5;
        }
        public void StopSession()
        {
            bool wasRunning = SessionRequested;
            generation++; SessionRequested = false;
            cancellation?.Cancel();cancellation?.Dispose();cancellation=null;
            // Retain the last displayed map on the table; the lease alone owns camera/input.
            LiveTextureActive=false;
            if (wasRunning && !string.IsNullOrEmpty(endpoint) && client != null)
                Observe(Send("POST","/bridge/stop","{\"sequence\":"+(++controlSequence)+"}",CancellationToken.None));
            Status = new BridgeStatus();
            if (!PrincipalSeatOccupied) Message="";
        }
        public void OpenCameraSettings()
        {
            if (!Authorized || !SessionRequested) return;
            Observe(Send("POST","/bridge/settings","{}",CancellationToken.None));
        }
        public async Task<bool> CameraStoppedForValidation()
        {
            if(string.IsNullOrEmpty(endpoint))return true;
            try
            {
                var reply=await Send("GET","/bridge/status",null,CancellationToken.None);
                return reply.code==200 && Encoding.UTF8.GetString(reply.bytes).Contains("\"active\":false") &&
                    Encoding.UTF8.GetString(reply.bytes).Contains("\"cameraActive\":false") &&
                    Encoding.UTF8.GetString(reply.bytes).Contains("\"previewVisible\":false");
            }
            catch{return false;}
        }
        static void Observe(Task task) { task.ContinueWith(t=>{var ignored=t.Exception;},TaskContinuationOptions.OnlyOnFaulted); }
        void OnApplicationPause(bool value) { paused=value;if(value)StopSession(); }
        void OnApplicationQuit() { quitting=true;StopSession();KillHelper(); }
        void OnDisable() { if(desktopSeat)desktopSeat.SeatChanged-=OnSeatChanged;StopSession();KillHelper(); }
        void KillHelper()
        {
            try { if(helper!=null && !helper.HasExited)helper.Kill(); } catch { }
            helper?.Dispose();helper=null;
        }
        void OnDestroy() { client?.Dispose();if(liveTexture)Destroy(liveTexture); }
    }
}
