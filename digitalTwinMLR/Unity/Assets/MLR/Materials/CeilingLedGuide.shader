Shader "LaReina/CeilingLedGuide"
{
    Properties
    {
        _BaseColor("Canal oscuro", Color) = (.012,.025,.032,1)
        [HDR] _EmissionColor("LED turquesa", Color) = (0,1.4,1.5,1)
        _HeadDistance("Posición en recorrido (m)", Float) = 0
        _RouteLength("Longitud del recorrido (m)", Float) = 20
        _LookAhead("Anticipación (m)", Float) = 1.35
        _LitLength("Tramo encendido (m)", Float) = 1.25
        _Visibility("Intensidad de guía", Range(0,1)) = 0
        _ClosedLoop("Recorrido cerrado", Float) = 0
        _LedPitch("Separación entre LED (m)", Float) = .035
    }
    SubShader
    {
        Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry"}
        Pass
        {
            Name "CeilingLedGuide"
            Tags {"LightMode"="SRPDefaultUnlit"}
            Cull Off ZWrite On
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS:POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS:SV_POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half4 _EmissionColor;
                float _HeadDistance;
                float _RouteLength;
                float _LookAhead;
                float _LitLength;
                float _Visibility;
                float _ClosedLoop;
                float _LedPitch;
            CBUFFER_END
            Varyings Vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.uv = v.uv;
                return o;
            }
            half4 Frag(Varyings v):SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(v);
                // UV.x is an arc length in metres, not a stretched 0–1 map.
                float ahead = v.uv.x - _HeadDistance;
                if (_ClosedLoop > .5 && _RouteLength > .001)
                    ahead = fmod(ahead + _RouteLength * 2, _RouteLength);
                float edge = min(.14, max(.02, _LitLength * .15));
                float band = smoothstep(_LookAhead, _LookAhead + edge, ahead) *
                    (1 - smoothstep(_LookAhead + _LitLength - edge, _LookAhead + _LitLength, ahead));
                // Individual warm-free diodes behind a continuous diffuser.
                // At a distance they merge into an ordinary narrow LED strip.
                float phase = abs(frac(v.uv.x / max(.008, _LedPitch)) - .5);
                float aa = max(.015, fwidth(phase));
                float diode = 1 - smoothstep(.28 - aa, .36 + aa, phase);
                float crossSection = 1 - smoothstep(.33, .49, abs(v.uv.y - .5));
                float emitter = (.35 + .65 * diode) * crossSection;
                half3 color = _BaseColor.rgb + _EmissionColor.rgb * (band * saturate(_Visibility) * emitter);
                return half4(color, 1);
            }
            ENDHLSL
        }
    }
}
