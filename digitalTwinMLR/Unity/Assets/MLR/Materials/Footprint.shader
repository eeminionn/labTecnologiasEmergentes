Shader "LaReina/Footprint"
{
    Properties
    {
        _BaseColor("Turquesa",Color)=(0,.678,.698,1)
        _Accent("Lima",Color)=(.686,.769,.224,1)
        _Current("Paso actual",Float)=0
        _Illuminated("Huella iluminada",Float)=1
        _Pulse("Intensidad del paso",Float)=0
        _Count("Cantidad",Float)=48
    }
    SubShader
    {
        Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent"}
        Pass
        {
            Cull Off ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes {float4 positionOS:POSITION;float2 uv:TEXCOORD0;UNITY_VERTEX_INPUT_INSTANCE_ID};
            struct Varyings {float4 positionCS:SV_POSITION;float step:TEXCOORD0;UNITY_VERTEX_OUTPUT_STEREO};
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half4 _Accent;
                float _Current;
                float _Illuminated;
                float _Pulse;
                float _Count;
            CBUFFER_END
            Varyings Vert(Attributes v)
            {
                Varyings o;UNITY_SETUP_INSTANCE_ID(v);UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.positionCS=TransformObjectToHClip(v.positionOS.xyz);o.step=v.uv.x;return o;
            }
            half4 Frag(Varyings v):SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(v);
                float ahead=fmod(v.step-_Current+_Count*2,_Count);
                float dimGuide=(1-smoothstep(4,9.5,ahead))*.12;
                float selected=1-step(.25,abs(v.step-_Illuminated));
                float pulse=selected*saturate(_Pulse);
                float alpha=max(dimGuide,pulse*.95);
                half3 color=lerp(_BaseColor.rgb,_Accent.rgb,pulse);
                return half4(color*(.7+pulse*1.25),alpha);
            }
            ENDHLSL
        }
    }
}
