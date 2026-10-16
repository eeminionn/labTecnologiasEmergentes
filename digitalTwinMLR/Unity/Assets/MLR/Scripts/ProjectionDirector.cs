using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Video;

namespace LaReina.DigitalTwin
{
    public sealed class ProjectionDirector : MonoBehaviour
    {
        [Serializable] public sealed class Channel
        {
            public string id;
            public string file;
            public bool loop = true;
            public float brightness = 1f;
            public string fit = "contain";
            public int maxResolution = 1920;
        }
        [Serializable] public sealed class Configuration { public Channel[] channels; }
        public ProjectionSurface[] surfaces;
        public string configurationFile = "proyecciones.json";
        public bool Paused { get; private set; }
        public int ReadyPlayers { get; private set; }
        public int PlayerCount => players.Count;
        public readonly List<string> Errors = new List<string>();
        public string MediaFolder { get; private set; }
        readonly List<VideoPlayer> players = new List<VideoPlayer>();
        readonly List<RenderTexture> textures = new List<RenderTexture>();
        readonly Dictionary<string, Texture> outputs = new Dictionary<string, Texture>();
        readonly Dictionary<string, Texture> channelOutputs = new Dictionary<string, Texture>();
        readonly Dictionary<string, Texture> liveOverrides = new Dictionary<string, Texture>();

        public void SetLiveOverride(string channelId, Texture texture)
        {
            if (!texture) { ClearLiveOverride(channelId); return; }
            liveOverrides[channelId] = texture;
            foreach (var surface in surfaces) if (surface.channelId == channelId) surface.Bind(texture);
        }
        public void ClearLiveOverride(string channelId)
        {
            if (!liveOverrides.Remove(channelId)) return;
            channelOutputs.TryGetValue(channelId, out var texture);
            foreach (var surface in surfaces) if (surface.channelId == channelId) surface.Bind(texture ? texture : surface.fallback);
        }
        void BindOutput(ProjectionSurface surface, Texture texture)
        {
            channelOutputs[surface.channelId] = texture;
            surface.Bind(liveOverrides.TryGetValue(surface.channelId, out var live) && live ? live : texture);
        }

        void Start() { LoadConfiguration(); }

        public void LoadConfiguration()
        {
            ReleasePlayers();
            Errors.Clear();
            ReadyPlayers = 0;
            Paused = false;
            string bundledFolder = Path.Combine(Application.streamingAssetsPath, "Proyecciones");
            // On macOS this folder is next to the .app, so content remains replaceable after building.
            string executableFolder = Application.isEditor ? Application.dataPath + "/../.." :
                Application.platform == RuntimePlatform.OSXPlayer ? Application.dataPath + "/../.." :
                Application.dataPath + "/..";
            string externalFolder = Path.GetFullPath(Path.Combine(executableFolder, "Proyecciones"));
            string deviceFolder = Path.Combine(Application.persistentDataPath, "Proyecciones");
            MediaFolder = File.Exists(Path.Combine(deviceFolder, configurationFile)) ? deviceFolder :
                File.Exists(Path.Combine(externalFolder, configurationFile)) ? externalFolder : bundledFolder;
            string json;
            try
            {
                // StreamingAssets is a jar URL in Android; the build embeds this same small config as a TextAsset.
                json = MediaFolder.Contains("://") ? Resources.Load<TextAsset>("proyecciones").text :
                    File.ReadAllText(Path.Combine(MediaFolder, configurationFile));
                var config = JsonUtility.FromJson<Configuration>(json);
                if (config?.channels == null) throw new InvalidDataException("Faltan canales de proyección.");
                var channelIds = new HashSet<string>();
                foreach (var channel in config.channels)
                {
                    if (string.IsNullOrWhiteSpace(channel.id) || !channelIds.Add(channel.id))
                        throw new InvalidDataException("Canal vacío o duplicado.");
                    Connect(channel);
                }
                foreach (var surface in surfaces)
                    if (!channelIds.Contains(surface.channelId)) BindOutput(surface,surface.fallback);
            }
            catch (Exception e)
            {
                ReleasePlayers();
                ReadyPlayers = 0;
                Report("Configuración: " + e.Message);
                foreach (var surface in surfaces) BindOutput(surface,surface.fallback);
            }
        }

        void Connect(Channel channel)
        {
            if (string.IsNullOrWhiteSpace(channel.file))
            {
                foreach (var surface in surfaces) if (surface.channelId == channel.id) BindOutput(surface,surface.fallback);
                return;
            }
            // Only local MP4 files below the media folder are accepted; no web/network dependency.
            if (Path.IsPathRooted(channel.file) || channel.file.Replace('\\','/').Split('/').Length != 1 ||
                !string.Equals(Path.GetExtension(channel.file), ".mp4", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Usa un nombre de archivo MP4 local para " + channel.id);
            string path = MediaFolder.TrimEnd('/') + "/" + channel.file;
            if (!path.Contains("://") && !File.Exists(path))
            {
                Report(channel.id + ": no se encontró " + channel.file);
                foreach (var surface in surfaces) if (surface.channelId == channel.id) BindOutput(surface,surface.fallback);
                return;
            }
            string key = path + (channel.loop ? "|loop" : "|once");
            if (!outputs.TryGetValue(key, out Texture texture))
            {
                // Reuse a decoder when several walls share one file.
                var rt = new RenderTexture(1280, 720, 0, RenderTextureFormat.ARGB32);
                rt.name = "Video_" + channel.id;
                rt.wrapMode = TextureWrapMode.Clamp;
                rt.useMipMap = false;
                rt.autoGenerateMips = false;
                rt.anisoLevel = 0;
                rt.antiAliasing = 1;
                rt.Create();
                var previous = RenderTexture.active;
                RenderTexture.active = rt;
                GL.Clear(true, true, new Color(.025f,.045f,.06f));
                RenderTexture.active = previous;
                var player = new GameObject("MP4_" + channel.id).AddComponent<VideoPlayer>();
                player.transform.SetParent(transform);
                player.playOnAwake = false;
                player.source = VideoSource.Url;
                player.url = path.Contains("://") ? path : new Uri(path).AbsoluteUri;
                player.renderMode = VideoRenderMode.RenderTexture;
                player.targetTexture = rt;
                player.aspectRatio = VideoAspectRatio.Stretch;
                player.audioOutputMode = VideoAudioOutputMode.None;
                player.isLooping = channel.loop;
                player.skipOnDrop = true;
                player.waitForFirstFrame = true;
                player.errorReceived += (p, message) => Report(channel.id + ": " + message);
                player.prepareCompleted += p =>
                {
                    // Use the movie's native aspect ratio, including portrait wall/table content.
                    rt.Release();
                    float scale = Mathf.Min(1f, Mathf.Clamp(channel.maxResolution,720,4096) / (float)Mathf.Max(p.width, p.height));
                    rt.width = Mathf.Max(16, Mathf.RoundToInt(p.width * scale));
                    rt.height = Mathf.Max(16, Mathf.RoundToInt(p.height * scale));
                    rt.Create();
                    p.targetTexture = rt;
                    foreach (var surface in surfaces) surface.RefreshTextureDimensions();
                    ReadyPlayers++;
                    if (!Paused) p.Play();
                };
                players.Add(player);
                textures.Add(rt);
                texture = rt;
                outputs.Add(key, texture);
                player.Prepare();
            }
            foreach (var surface in surfaces)
                if (surface.channelId == channel.id)
                {
                    surface.brightness = Mathf.Clamp(channel.brightness, .1f, 3f);
                    surface.fitMode = channel.fit == "cover" ? 1 : channel.fit == "stretch" ? 2 : 0;
                    BindOutput(surface,texture);
                }
        }

        public void TogglePause()
        {
            Paused = !Paused;
            foreach (var p in players) if (Paused) p.Pause(); else if (p.isPrepared) p.Play();
        }
        void Report(string message) { Errors.Add(message); Debug.LogWarning("Proyección: " + message); }
        void ReleasePlayers()
        {
            foreach (var player in players) if (player) { player.Stop(); Destroy(player.gameObject); }
            foreach (var rt in textures) if (rt) { rt.Release(); Destroy(rt); }
            players.Clear(); textures.Clear(); outputs.Clear(); channelOutputs.Clear();
        }
        void OnDestroy() { ReleasePlayers(); }
    }
}
