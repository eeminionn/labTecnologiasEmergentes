#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features.Interactions;
using UnityEngine.XR.OpenXR.Features.MetaQuestSupport;

namespace LaReina.DigitalTwin.Editor
{
    /// <summary>
    /// Configures an Android Quest target without switching the active build target
    /// or enabling XR on the Mac. Verified against Unity 6000.5.8f1,
    /// OpenXR 1.17.1 and XR Management 4.5.4 package source.
    /// Run from an Editor folder after package resolution, before any Player build.
    /// </summary>
    public static class XrProjectSetup
    {
        const string GeneralAssetPath = "Assets/XR/Settings/XR General Settings.asset";

        [MenuItem("La Reina/Preparar realidad virtual para Quest")]
        public static void ConfigureQuest()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || BuildPipeline.isBuildingPlayer)
                throw new InvalidOperationException("Configure XR before entering Play mode or building a Player.");

            EnsureFolder("Assets/XR");
            EnsureFolder("Assets/XR/Settings");

            XRGeneralSettingsPerBuildTarget general;
            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out general) || general == null)
            {
                general = AssetDatabase.LoadAssetAtPath<XRGeneralSettingsPerBuildTarget>(GeneralAssetPath);
                if (general == null)
                {
                    general = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                    AssetDatabase.CreateAsset(general, GeneralAssetPath);
                }
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, general, true);
            }

            if (!general.HasSettingsForBuildTarget(BuildTargetGroup.Android))
                general.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.Android);
            if (!general.HasManagerSettingsForBuildTarget(BuildTargetGroup.Android))
                general.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Android);
            var android = general.SettingsForBuildTarget(BuildTargetGroup.Android);
            android.InitManagerOnStart = true;
            android.Manager.automaticLoading = true;
            android.Manager.automaticRunning = true;
            if (!XRPackageMetadataStore.AssignLoader(android.Manager,
                    "UnityEngine.XR.OpenXR.OpenXRLoader", BuildTargetGroup.Android))
                throw new InvalidOperationException("Could not assign the Android OpenXR loader.");

            if (!general.HasSettingsForBuildTarget(BuildTargetGroup.Standalone))
                general.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.Standalone);
            if (!general.HasManagerSettingsForBuildTarget(BuildTargetGroup.Standalone))
                general.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Standalone);
            var desktop = general.SettingsForBuildTarget(BuildTargetGroup.Standalone);
            desktop.InitManagerOnStart = false;
            desktop.Manager.automaticLoading = false;
            desktop.Manager.automaticRunning = false;

            // Public API also creates the OpenXR settings container and feature subassets.
            FeatureHelpers.RefreshFeatures(BuildTargetGroup.Android);
            var openxr = OpenXRSettings.GetSettingsForBuildTargetGroup(BuildTargetGroup.Android);
            if (openxr == null)
                throw new InvalidOperationException("Android OpenXR settings were not created; confirm Android Build Support is installed.");
            var quest = openxr.GetFeature<MetaQuestFeature>();
            var touch = openxr.GetFeature<OculusTouchControllerProfile>();
            if (quest == null || touch == null)
                throw new InvalidOperationException("The Meta Quest or Oculus Touch feature could not be discovered.");
            quest.enabled = true;
            touch.enabled = true;
            openxr.renderMode = OpenXRSettings.RenderMode.SinglePassInstanced;
            openxr.depthSubmissionMode = OpenXRSettings.DepthSubmissionMode.None;
            openxr.latencyOptimization = OpenXRSettings.LatencyOptimization.PrioritizeInputPolling;

            // No passthrough, AR Foundation or vendor SDK needed for this virtual room.
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel29;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.applicationEntry = AndroidApplicationEntry.GameActivity;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });
            PlayerSettings.colorSpace = ColorSpace.Linear;

            EditorUtility.SetDirty(general);
            EditorUtility.SetDirty(android);
            EditorUtility.SetDirty(android.Manager);
            EditorUtility.SetDirty(desktop);
            EditorUtility.SetDirty(desktop.Manager);
            EditorUtility.SetDirty(openxr);
            EditorUtility.SetDirty(quest);
            EditorUtility.SetDirty(touch);
            AssetDatabase.SaveAssets();

#if !ENABLE_INPUT_SYSTEM
            Debug.LogWarning("OpenXR is configured, but the Input System is not enabled. Enable Input System (or Both while keeping the desktop legacy input), then restart the Editor before an XR build.");
#endif
            Debug.Log("Quest target prepared: Android ARM64 / IL2CPP / Vulkan / OpenXR, Meta Quest + Oculus Touch, single-pass stereo. Mac desktop XR auto-start stays off. Headset validation is still required.");
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            int slash = path.LastIndexOf('/');
            string parent = path.Substring(0, slash);
            string leaf = path.Substring(slash + 1);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }
    }
}
#endif
