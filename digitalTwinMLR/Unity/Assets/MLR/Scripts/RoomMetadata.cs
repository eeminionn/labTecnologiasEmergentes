using UnityEngine;

namespace LaReina.DigitalTwin
{
    public sealed class RoomMetadata : MonoBehaviour
    {
        public string source = "Sala: sala opcion 2 .fbx; mesa: sala 002.fbx";
        public Vector3 externalDimensions = new Vector3(8f,2.7f,9f);
        public int chairCount = 11;
        [TextArea] public string scaleNote = "1 unidad Unity = 1 metro. Sala 8 × 9 m; mesa oval 2,27046 × 2,80172 m, tablero inicial a 0,76275 m y proyección a 0,77382 m. Área interior ampliada a 1,87046 × 2,40172 m y borde blanco de 20 cm. U/J ajustan mesa; I/K ajustan mapa; 0 restablece. Alturas temporales, sin guardar entre ejecuciones. Asientos a 0,47 m; ojos a 1,18 m sentado. Once sillas en U; resto de la sala conservado.";
    }
}
