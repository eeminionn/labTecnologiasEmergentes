using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace LaReina.DigitalTwin.Editor
{
    /// <summary>Keep one editable config; Android embeds an identical TextAsset for its APK URL.</summary>
    public sealed class ProjectionConfigBuildSync : IPreprocessBuildWithReport
    {
        public int callbackOrder => -1000;
        public void OnPreprocessBuild(BuildReport report)
        {
            const string source="Assets/StreamingAssets/Proyecciones/proyecciones.json";
            const string destination="Assets/Resources/proyecciones.json";
            string json=File.ReadAllText(source);
            var config=JsonUtility.FromJson<ProjectionDirector.Configuration>(json);
            if(config?.channels==null)throw new BuildFailedException("Falta la lista channels en proyecciones.json.");
            var ids=new HashSet<string>();
            foreach(var channel in config.channels)
            {
                if(string.IsNullOrWhiteSpace(channel.id) || !ids.Add(channel.id))
                    throw new BuildFailedException("Canal de proyección vacío o repetido.");
                if(string.IsNullOrWhiteSpace(channel.file))continue;
                if(Path.IsPathRooted(channel.file) || channel.file.Replace('\\','/').Split('/').Length!=1 ||
                    !string.Equals(Path.GetExtension(channel.file),".mp4",StringComparison.OrdinalIgnoreCase))
                    throw new BuildFailedException("Nombre de MP4 local inválido: "+channel.file);
                if(!File.Exists(Path.Combine(Path.GetDirectoryName(source),channel.file)))
                    throw new BuildFailedException("Falta el MP4 de respaldo: "+channel.file);
            }
            if(!File.Exists(destination) || File.ReadAllText(destination)!=json)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(destination));
                File.WriteAllText(destination,json);
                AssetDatabase.ImportAsset(destination,ImportAssetOptions.ForceUpdate);
            }
        }
    }
}
