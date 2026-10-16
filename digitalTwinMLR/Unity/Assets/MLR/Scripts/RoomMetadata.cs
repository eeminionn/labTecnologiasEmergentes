using UnityEngine;

namespace LaReina.DigitalTwin
{
    public sealed class RoomMetadata : MonoBehaviour
    {
        public string source = "sala opcion 2 .fbx";
        public Vector3 externalDimensions = new Vector3(8f,2.7f,9f);
        public int chairCount = 11;
        [TextArea] public string scaleNote = "1 unidad Unity = 1 metro. Formas del FBX; planta como referencia. Mesa FBX 2 × 3,1 m; planta previa 2 × 2,8 m. Se conserva la versión final del FBX.";
    }
}
