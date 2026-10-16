#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace LaReina.DigitalTwin.Editor
{
    /// <summary>Temporary build quality override; Dispose restores every desktop pipeline reference.</summary>
    public static class QuestQualitySetup
    {
        const string PipelinePath = "Assets/MLR/Settings/Mobile_RPAsset.asset";
        const string RendererPath = "Assets/MLR/Settings/Mobile_Renderer.asset";

        public static IDisposable ApplyMobile()
        {
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (pipeline == null || renderer == null)
                throw new InvalidOperationException("Missing dedicated Mobile_RPAsset or Mobile_Renderer asset.");

            ConfigureMobileAsset(pipeline, renderer);
            var restore = new PipelineRestoreScope();
            try
            {
                GraphicsSettings.defaultRenderPipeline = pipeline;
                for (int i = 0; i < QualitySettings.names.Length; i++)
                {
                    QualitySettings.SetQualityLevel(i, false);
                    QualitySettings.renderPipeline = pipeline;
                }
                QualitySettings.SetQualityLevel(restore.OriginalQualityLevel, false);
                AssetDatabase.SaveAssets();
                return restore;
            }
            catch
            {
                restore.Dispose();
                throw;
            }
        }

        static void ConfigureMobileAsset(UniversalRenderPipelineAsset pipeline, UniversalRendererData renderer)
        {
            pipeline.supportsHDR = false;
            pipeline.msaaSampleCount = 4;
            pipeline.maxAdditionalLightsCount = 4;
            pipeline.supportsCameraDepthTexture = false;
            pipeline.supportsCameraOpaqueTexture = false;
            pipeline.shadowDistance = 8f;

            // These public URP 17.5 properties have internal setters; edit their verified serialized fields.
            var serialized = new SerializedObject(pipeline);
            serialized.FindProperty("m_AdditionalLightsRenderingMode").intValue = (int)LightRenderingMode.PerPixel;
            serialized.FindProperty("m_AdditionalLightShadowsSupported").boolValue = false;
            serialized.FindProperty("m_SoftShadowsSupported").boolValue = false;
            serialized.FindProperty("m_AnyShadowsSupported").boolValue = pipeline.supportsMainLightShadows;
            var rendererList = serialized.FindProperty("m_RendererDataList");
            rendererList.arraySize = 1;
            rendererList.GetArrayElementAtIndex(0).objectReferenceValue = renderer;
            serialized.FindProperty("m_DefaultRendererIndex").intValue = 0;
            serialized.ApplyModifiedPropertiesWithoutUndo();

            renderer.renderingMode = RenderingMode.Forward;
            foreach (var feature in renderer.rendererFeatures)
                if (feature != null && feature.GetType().Name == "ScreenSpaceAmbientOcclusion")
                {
                    feature.SetActive(false);
                    EditorUtility.SetDirty(feature);
                }
            renderer.SetDirty();
            EditorUtility.SetDirty(renderer);
            EditorUtility.SetDirty(pipeline);
        }

        sealed class PipelineRestoreScope : IDisposable
        {
            readonly RenderPipelineAsset originalDefault = GraphicsSettings.defaultRenderPipeline;
            readonly RenderPipelineAsset[] originalQualityPipelines;
            public int OriginalQualityLevel { get; } = QualitySettings.GetQualityLevel();
            bool disposed;

            public PipelineRestoreScope()
            {
                originalQualityPipelines = new RenderPipelineAsset[QualitySettings.names.Length];
                for (int i = 0; i < originalQualityPipelines.Length; i++)
                    originalQualityPipelines[i] = QualitySettings.GetRenderPipelineAssetAt(i);
            }

            public void Dispose()
            {
                if (disposed) return;
                disposed = true;
                GraphicsSettings.defaultRenderPipeline = originalDefault;
                for (int i = 0; i < originalQualityPipelines.Length; i++)
                {
                    QualitySettings.SetQualityLevel(i, false);
                    QualitySettings.renderPipeline = originalQualityPipelines[i];
                }
                QualitySettings.SetQualityLevel(OriginalQualityLevel, false);
                AssetDatabase.SaveAssets();
            }
        }
    }
}
#endif
