using System;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Preserves the supplied ceiling artwork while both copies share one elapsed timer.</summary>
    public sealed class CeilingEventDisplay : MonoBehaviour
    {
        [Serializable] public sealed class PanelLayout { public int width, height; }
        [Serializable] public sealed class GlyphLayout
        {
            public string character;
            public int x, y, width, height;
            public float advance;
        }
        [Serializable] public sealed class AtlasLayout { public GlyphLayout[] glyphs; }
        [Serializable] public sealed class TimerLayout { public float x, y; }
        [Serializable] public sealed class DisplayLayout
        {
            public PanelLayout panel;
            public AtlasLayout atlas;
            public TimerLayout[] timers;
        }

        public Renderer targetRenderer;
        public Texture2D basePanel;
        public Texture2D digitAtlas;
        public TextAsset layoutAsset;
        [Range(1, 4)] public int repetitions = 2;
        public int ElapsedSeconds => CalculateElapsed(Time.unscaledTimeAsDouble - sessionStart);
        public string DisplayedElapsed { get; private set; }
        public int RenderCount { get; private set; }
        public int TimerInstances => layout?.timers?.Length ?? 0;
        public bool LayoutValid { get; private set; }
        public Texture2D OutputTexture => output;

        Texture2D output;
        Material material;
        Color32[] background, pixels, glyphPixels;
        DisplayLayout layout;
        readonly GlyphLayout[] digitGlyphs = new GlyphLayout[11];
        double sessionStart;
        int lastSecond = -1;

        void Start()
        {
            if (!targetRenderer || !basePanel || !digitAtlas || !layoutAsset)
            {
                Debug.LogError("Faltan los recursos de la pantalla de seguridad y riesgos.", this);
                enabled = false;
                return;
            }
            try
            {
                layout = JsonUtility.FromJson<DisplayLayout>(layoutAsset.text);
                ValidateLayout();
                LayoutValid = true;
                background = basePanel.GetPixels32();
                pixels = new Color32[background.Length];
                glyphPixels = digitAtlas.GetPixels32();
                output = new Texture2D(basePanel.width, basePanel.height, TextureFormat.RGBA32, true, false)
                { name = "Seguridad y riesgos — tiempo transcurrido", wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, anisoLevel = 4 };
                material = targetRenderer.material;
                material.SetTexture("_BaseMap", output);
                material.SetFloat("_Repeats", repetitions);
                RestartElapsed();
            }
            catch (Exception error)
            {
                Debug.LogError("No se pudo preparar la pantalla de seguridad y riesgos: " + error.Message, this);
                enabled = false;
            }
        }

        void ValidateLayout()
        {
            if (layout?.panel == null || layout.panel.width != basePanel.width || layout.panel.height != basePanel.height ||
                layout.atlas?.glyphs == null || layout.timers == null || layout.timers.Length == 0 ||
                !basePanel.isReadable || !digitAtlas.isReadable)
                throw new InvalidOperationException("La plantilla y las dimensiones de sus recursos no coinciden.");
            foreach (var glyph in layout.atlas.glyphs)
            {
                int index = GlyphIndex(glyph?.character);
                if (index < 0 || digitGlyphs[index] != null || glyph.width <= 0 || glyph.height <= 0 ||
                    glyph.x < 0 || glyph.y < 0 || glyph.x + glyph.width > digitAtlas.width ||
                    glyph.y + glyph.height > digitAtlas.height || !Finite(glyph.advance) || glyph.advance <= 0)
                    throw new InvalidOperationException("El atlas contiene un glifo o un avance inválido.");
                digitGlyphs[index] = glyph;
            }
            if (Array.Exists(digitGlyphs, glyph => glyph == null))
                throw new InvalidOperationException("El atlas debe incluir los diez dígitos y los dos puntos.");
            foreach (var timer in layout.timers)
                if (timer == null || !Finite(timer.x) || !Finite(timer.y) || timer.x < 0 || timer.y < 0 ||
                    timer.x >= basePanel.width || timer.y >= basePanel.height)
                    throw new InvalidOperationException("La posición del tiempo queda fuera de la plantilla.");
        }

        static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        static int GlyphIndex(string value) => value?.Length == 1 ? value[0] == ':' ? 10 : value[0] >= '0' && value[0] <= '9' ? value[0] - '0' : -1 : -1;

        void Update()
        {
            int seconds = ElapsedSeconds;
            if (output && seconds != lastSecond) RenderPanel(seconds);
        }

        public void RestartElapsed()
        {
            sessionStart = Time.unscaledTimeAsDouble;
            if (output) RenderPanel(0);
        }

        // Retain existing references to the old reset action when loading an earlier scene.
        public void RestartCountdown() => RestartElapsed();

        public static int CalculateElapsed(double elapsed) =>
            double.IsNaN(elapsed) || elapsed <= 0 ? 0 : elapsed >= int.MaxValue ? int.MaxValue : (int)Math.Floor(elapsed);

        public static string FormatElapsed(int seconds)
        {
            seconds = Math.Max(0, seconds);
            return $"{seconds / 60:00}:{seconds % 60:00}";
        }

        void RenderPanel(int seconds)
        {
            Array.Copy(background, pixels, background.Length);
            DisplayedElapsed = FormatElapsed(seconds);
            foreach (var timer in layout.timers) StampText(DisplayedElapsed, timer);
            output.SetPixels32(pixels);
            output.Apply(true, false);
            lastSecond = seconds;
            RenderCount++;
        }

        void StampText(string value, TimerLayout position)
        {
            float cursor = position.x;
            foreach (char character in value)
            {
                var glyph = digitGlyphs[character == ':' ? 10 : character - '0'];
                int left = Mathf.RoundToInt(cursor), top = Mathf.RoundToInt(position.y);
                for (int y = 0; y < glyph.height; y++)
                    for (int x = 0; x < glyph.width; x++)
                    {
                        int sx = glyph.x + x, sy = digitAtlas.height - 1 - (glyph.y + y);
                        Color32 ink = glyphPixels[sy * digitAtlas.width + sx];
                        if (ink.a == 0) continue;
                        int dx = left + x, dy = basePanel.height - 1 - (top + y);
                        if (dx < 0 || dx >= basePanel.width || dy < 0 || dy >= basePanel.height) continue;
                        int index = dy * basePanel.width + dx;
                        Color32 paper = pixels[index];
                        int a = ink.a, b = 255 - a;
                        pixels[index] = new Color32((byte)((ink.r * a + paper.r * b) / 255),
                            (byte)((ink.g * a + paper.g * b) / 255), (byte)((ink.b * a + paper.b * b) / 255), 255);
                    }
                cursor += glyph.advance;
            }
        }

        public RectInt TimerBounds(int timerIndex, string value)
        {
            var timer = layout.timers[timerIndex];
            float cursor = timer.x;
            int left = Mathf.RoundToInt(cursor), top = Mathf.RoundToInt(timer.y), right = left, bottom = top;
            foreach (char character in value)
            {
                var glyph = digitGlyphs[character == ':' ? 10 : character - '0'];
                right = Math.Max(right, Mathf.RoundToInt(cursor) + glyph.width);
                bottom = Math.Max(bottom, top + glyph.height);
                cursor += glyph.advance;
            }
            return new RectInt(left, top, right - left, bottom - top);
        }

        void OnDestroy()
        {
            if (output) Destroy(output);
            if (material) Destroy(material);
        }
    }
}
