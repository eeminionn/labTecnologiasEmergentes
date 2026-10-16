using UnityEngine;
using UnityEngine.InputSystem;

namespace LaReina.DigitalTwin
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class DesktopWalkthrough : MonoBehaviour
    {
        public Camera eye;
        public ProjectionDirector projections;
        public RoomLighting lighting;
        [Min(.1f)] public float walkingSpeed = 1.35f;
        public float eyeHeight = 1.65f;
        public Vector3 startPosition;
        public float startYaw;
        CharacterController body;
        float pitch, verticalSpeed;
        bool help = true;
        bool settings;
        bool Captured => Cursor.lockState == CursorLockMode.Locked;
        public bool automation;

        void Start()
        {
            body = GetComponent<CharacterController>();
            body.height = 1.78f; body.radius = .22f;
            body.center = Vector3.up * .89f;
            body.stepOffset = .12f; body.skinWidth = .02f;
            eye.transform.localPosition = Vector3.up * eyeHeight;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
        void Update()
        {
            if (Application.platform == RuntimePlatform.Android) return;
            if (automation) return;
            var keyboard = Keyboard.current;
            var mouse = Mouse.current;
            if (keyboard == null) return;
            if (keyboard.escapeKey.wasPressedThisFrame) Capture(false);
            if (!Captured && (keyboard.enterKey.wasPressedThisFrame || (!settings && mouse != null && mouse.leftButton.wasPressedThisFrame))) Capture(true);
            if (keyboard.hKey.wasPressedThisFrame) help = !help;
            if (keyboard.tabKey.wasPressedThisFrame) { settings = !settings; Capture(!settings); }
            if (keyboard.rKey.wasPressedThisFrame) ResetPosition();
            if (keyboard.spaceKey.wasPressedThisFrame && projections) projections.TogglePause();
            if (keyboard.lKey.wasPressedThisFrame && lighting) lighting.Toggle();
            if (!Captured) return;
            Vector2 look = mouse != null ? mouse.delta.ReadValue() : Vector2.zero;
            transform.Rotate(Vector3.up, look.x * .12f);
            pitch = Mathf.Clamp(pitch - look.y * .12f, -75f, 75f);
            eye.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
            Vector2 axis = new Vector2(
                ((keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) ? 1 : 0) - ((keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) ? 1 : 0),
                ((keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed) ? 1 : 0) - ((keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed) ? 1 : 0));
            axis = Vector2.ClampMagnitude(axis, 1f);
            float speed = walkingSpeed * (keyboard.leftShiftKey.isPressed ? 1.5f : 1f);
            if (body.isGrounded && verticalSpeed < 0) verticalSpeed = -1f;
            verticalSpeed += Physics.gravity.y * Time.deltaTime;
            var velocity = (transform.forward * axis.y + transform.right * axis.x) * speed;
            velocity.y = verticalSpeed;
            body.Move(velocity * Time.deltaTime);
            if (transform.position.y < -2) ResetPosition();
        }
        void Capture(bool value)
        {
            Cursor.lockState = value ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !value;
        }
        public void ResetPosition()
        {
            if (!body) body = GetComponent<CharacterController>();
            body.enabled = false;
            transform.SetPositionAndRotation(startPosition, Quaternion.Euler(0,startYaw,0));
            pitch = 0; verticalSpeed = 0;
            eye.transform.localRotation = Quaternion.identity;
            eye.transform.localPosition = Vector3.up * eyeHeight;
            body.enabled = true;
        }
        void OnDisable() { Capture(false); }
        void OnGUI()
        {
            if (Application.platform == RuntimePlatform.Android) return;
            if (automation) return;
            GUI.color = Color.white;
            var style = new GUIStyle(GUI.skin.label) { fontSize = 15, wordWrap = true };
            if (!Captured)
            {
                GUI.Box(new Rect(24,24,370, settings ? 290 : 200), "");
                GUI.Label(new Rect(44,39,330,30), "Sala La Reina", new GUIStyle(style) { fontSize = 23, fontStyle = FontStyle.Bold });
                GUI.Label(new Rect(44,80,325,80), "Enter para recorrer\nWASD / flechas · mover    Mouse · mirar\nEsc · liberar mouse    R · volver al acceso", style);
                if (settings)
                {
                    GUI.Label(new Rect(44,165,320,30), "Ambiente", style);
                    if (GUI.Button(new Rect(44,200,150,32), lighting && lighting.ambientMode ? "Ver proyecciones" : "Luz de revisión")) lighting?.Toggle();
                    if (GUI.Button(new Rect(205,200,150,32), projections && projections.Paused ? "Reproducir MP4" : "Pausar MP4")) projections?.TogglePause();
                    if (GUI.Button(new Rect(44,245,311,32), "Recargar archivos de proyección")) projections?.LoadConfiguration();
                }
                else GUI.Label(new Rect(44,165,320,25), "Tab · ajustes    L · luz    Espacio · video", style);
            }
            else if (help)
            {
                GUI.Box(new Rect(20,Screen.height-48,490,30), "WASD · mover   Mouse · mirar   Esc · pausa   Tab · ajustes   H · ocultar");
            }
        }
    }
}
