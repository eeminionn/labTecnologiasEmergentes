using UnityEngine;

namespace LaReina.DigitalTwin
{
    // Sampled from the six municipal swatches in "la reina grafica (1).pdf", page 1.
    public static class ProjectPalette
    {
        public static Color Petrol => Hex("006A85");
        public static Color Teal => Hex("00ADB2");
        public static Color Purple => Hex("6E2663");
        public static Color Green => Hex("008D36");
        public static Color Lime => Hex("AFC439");
        public static Color Pink => Hex("E82D81");
        static Color Hex(string value) { ColorUtility.TryParseHtmlString("#"+value,out var color);return color; }
    }
}
