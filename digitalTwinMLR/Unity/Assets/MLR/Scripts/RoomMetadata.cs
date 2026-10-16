using UnityEngine;

namespace LaReina.DigitalTwin
{
    public sealed class RoomMetadata : MonoBehaviour
    {
        public string source = "sala opcion 2 .fbx";
        public Vector3 externalDimensions = new Vector3(8f,2.7f,9f);
        public int chairCount = 11;
        [TextArea] public string scaleNote = "1 unidad Unity = 1 metro. Sala 8 × 9 m; mesa 2 × 3,1 m a 0,76 m; asiento a 0,47 m. Pared panorámica continua con dos radios de 0,90 m. POV de pie 1,65 m y sentado 1,18 m. Geometría de mobiliario conservada del FBX; paredes revisadas en versión 0.2.";
    }
}
