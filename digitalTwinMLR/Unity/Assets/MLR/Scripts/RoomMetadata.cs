using UnityEngine;

namespace LaReina.DigitalTwin
{
    public sealed class RoomMetadata : MonoBehaviour
    {
        public string source = "Sala: sala opcion 2 .fbx; mesa: sala 002.fbx";
        public Vector3 externalDimensions = new Vector3(8f,2.7f,9f);
        public int chairCount = 11;
        [TextArea] public string scaleNote = "1 unidad Unity = 1 metro. Sala 8 × 9 m; mesa oval 2,27046 × 2,80172 m, tablero a 0,76275 m y superficie de proyección a 0,77382 m. Asientos a 0,47 m; ojos a 1,18 m sentado. Mesa tomada de sala 002.fbx y apoyada en el piso mediante traslación, sin reescalar; once sillas redistribuidas. Resto de la sala conservado.";
    }
}
