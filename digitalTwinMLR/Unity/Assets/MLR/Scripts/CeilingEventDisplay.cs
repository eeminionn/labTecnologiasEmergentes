using System;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>A shared live panel, repeated around the ceiling fascia. Raster glyphs retain the agreed typography without bundling font software.</summary>
    public sealed class CeilingEventDisplay : MonoBehaviour
    {
        public Renderer targetRenderer;
        public Texture2D basePanel;
        public Texture2D digitAtlas;
        public int cellWidth = 64, cellHeight = 96, digitAdvance = 54;
        public Vector2Int clockPosition = new Vector2Int(1550, 90);
        public Vector2Int countdownPosition = new Vector2Int(780, 135);
        public RectInt progressBar = new RectInt(710, 238, 650, 10);
        [Min(1)] public int durationSeconds = 15 * 60;
        [Range(1, 4)] public int repetitions = 2;
        public int RemainingSeconds => CalculateRemaining(Time.unscaledTimeAsDouble - sessionStart, durationSeconds);
        public float RemainingFraction => Mathf.Clamp01((float)((durationSeconds - (Time.unscaledTimeAsDouble - sessionStart)) / durationSeconds));
        public string DisplayedCountdown { get; private set; }
        public string DisplayedClock { get; private set; }
        public int RenderCount { get; private set; }
        public Texture2D OutputTexture => output;

        Texture2D output;
        Material material;
        Color32[] background, pixels, glyphs;
        double sessionStart;
        int lastSecond = -1;
        string lastClock;

        void Start()
        {
            if (!targetRenderer || !basePanel || !digitAtlas) { enabled = false; return; }
            background = basePanel.GetPixels32();
            pixels = new Color32[background.Length];
            glyphs = digitAtlas.GetPixels32();
            output = new Texture2D(basePanel.width, basePanel.height, TextureFormat.RGBA32, true, false)
            { name = "Sesión municipal — reloj y cuenta regresiva", wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, anisoLevel = 4 };
            material = targetRenderer.material;
            material.SetTexture("_BaseMap", output);
            material.SetFloat("_Repeats", repetitions);
            RestartCountdown();
        }

        void Update()
        {
            int seconds = RemainingSeconds;
            string clock = DateTime.Now.ToString("HH:mm");
            if (seconds != lastSecond || clock != lastClock) RenderPanel(seconds, clock);
        }

        public void RestartCountdown()
        {
            sessionStart = Time.unscaledTimeAsDouble;
            if (output) RenderPanel(durationSeconds, DateTime.Now.ToString("HH:mm"));
        }

        public static int CalculateRemaining(double elapsed, int duration = 900) =>
            Math.Max(0, Math.Min(duration, (int)Math.Ceiling(duration - elapsed)));

        public static string FormatCountdown(int seconds) => $"{seconds / 60:00}:{seconds % 60:00}";

        void RenderPanel(int seconds, string clock)
        {
            Array.Copy(background, pixels, background.Length);
            DisplayedCountdown = FormatCountdown(seconds);
            DisplayedClock = clock;
            StampText(clock, clockPosition);
            StampText(DisplayedCountdown, countdownPosition);
            int fill = Mathf.RoundToInt(progressBar.width * Mathf.Clamp01(seconds / (float)durationSeconds));
            Color32 track = ProjectPalette.Petrol * .55f;
            Color32 active = seconds > 60 ? ProjectPalette.Teal : ProjectPalette.Pink;
            Color32 tip = ProjectPalette.Lime;
            for (int y = 0; y < progressBar.height; y++)
                for (int x = 0; x < progressBar.width; x++)
                    PutPixel(progressBar.x + x, progressBar.y + y, x < fill ? x >= fill - 8 ? tip : active : track);
            output.SetPixels32(pixels);
            output.Apply(true, false);
            lastSecond = seconds;
            lastClock = clock;
            RenderCount++;
        }

        void StampText(string value, Vector2Int position)
        {
            for (int n = 0; n < value.Length; n++)
            {
                int glyph = value[n] == ':' ? 10 : value[n] - '0';
                if (glyph < 0 || glyph > 10) continue;
                for (int y = 0; y < cellHeight; y++)
                    for (int x = 0; x < cellWidth; x++)
                    {
                        int sx = glyph * cellWidth + x;
                        int sy = digitAtlas.height - 1 - y;
                        Color32 ink = glyphs[sy * digitAtlas.width + sx];
                        if (ink.a == 0) continue;
                        int dx = position.x + n * digitAdvance + x;
                        int dy = basePanel.height - 1 - (position.y + y);
                        if (dx < 0 || dx >= basePanel.width || dy < 0 || dy >= basePanel.height) continue;
                        int index = dy * basePanel.width + dx;
                        Color32 paper = pixels[index];
                        int a = ink.a, b = 255 - a;
                        pixels[index] = new Color32((byte)((ink.r * a + paper.r * b) / 255),
                            (byte)((ink.g * a + paper.g * b) / 255), (byte)((ink.b * a + paper.b * b) / 255), 255);
                    }
            }
        }

        void PutPixel(int x, int topY, Color32 color)
        {
            if (x >= 0 && x < basePanel.width && topY >= 0 && topY < basePanel.height)
                pixels[(basePanel.height - 1 - topY) * basePanel.width + x] = color;
        }

        void OnDestroy()
        {
            if (output) Destroy(output);
            if (material) Destroy(material);
        }
    }
}
