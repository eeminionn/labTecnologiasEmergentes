Shader "LaReina/Projection"
{
    Properties
    {
        _BaseMap("Video",2D)="white"{}
        _BaseColor("Intensidad",Color)=(1,1,1,1)
        _SurfaceAspect("Proporción de la superficie",Float)=1
        _VideoAspect("Proporción del video",Float)=1
        _FitMode("Ajuste: contener / cubrir / estirar",Float)=0
        _OvalMask("Máscara ovalada",Float)=0
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            Name "Projection"
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS:POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS:SV_POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };
            TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4 _BaseColor;
                float _SurfaceAspect;
                float _VideoAspect;
                float _FitMode;
                float _OvalMask;
            CBUFFER_END
            Varyings Vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                output.positionCS=TransformObjectToHClip(input.positionOS.xyz);
                output.uv=TRANSFORM_TEX(input.uv,_BaseMap);
                return output;
            }
            half4 Frag(Varyings input):SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                // The mask belongs to the tabletop, independently of the video's fit mode.
                float2 mask=input.uv*2-1;
                if (_OvalMask>.5) clip(1-dot(mask,mask));
                float aspect = max(.001,_VideoAspect);
                float2 uv = input.uv;
                if (_FitMode < .5)
                {
                    if (_SurfaceAspect >= aspect) uv.x = (uv.x-.5)*_SurfaceAspect/aspect+.5;
                    else uv.y = (uv.y-.5)*aspect/_SurfaceAspect+.5;
                }
                else if (_FitMode < 1.5)
                {
                    if (_SurfaceAspect >= aspect) uv.y = (uv.y-.5)*aspect/_SurfaceAspect+.5;
                    else uv.x = (uv.x-.5)*_SurfaceAspect/aspect+.5;
                }
                if (any(uv<0) || any(uv>1)) return half4(.008,.012,.018,1);
                return half4(SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,uv).rgb*_BaseColor.rgb,1);
            }
            ENDHLSL
        }
    }
}
