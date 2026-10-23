using System;
using UnityEngine;

namespace LaReina.DigitalTwin
{
    /// <summary>Opt-in checks of the same adjustment operations exposed to the visitor.</summary>
    public static class TableAdjustmentQa
    {
        [Serializable] public sealed class Result
        {
            public bool initialized, initialStateUnchanged, tableLimits, mapLimits, pedestalOnFloor, insetClearsPedestal;
            public bool projectionGapPreserved, horizontalDimensionsPreserved, ovalTexturePreserved, resetRestoresInitial, passed;
            public bool recessedMapVisible;
            public bool fullMapTravel, combinedLowering, pedestalCompressionTracksInset, pedestalRestoresWithMap;
            public bool pedestalColliderAligned, surfaceCollidersAligned;
            public float initialProjectionHeight, minimumMapOffset, projectionGap, pedestalFloorError;
            public float mapOnlyProjectionHeight, lowestProjectionHeight, minimumPedestalHeight;
            public string error;
        }
        public static Result Run(RuntimeTableAdjustment adjustment)
        {
            var result=new Result();
            if(!adjustment){result.error="Falta el ajuste de mesa.";return result;}
            adjustment.Initialize(); result.initialized=adjustment.Initialized;
            if(!result.initialized){result.error="Faltan las cuatro partes de la mesa.";return result;}
            var initialTop=adjustment.TableTopBounds; var initialInset=adjustment.InsetBounds;
            var initialProjection=adjustment.ProjectionBounds; var initialBase=adjustment.PedestalBounds;
            var renderer=adjustment.projection.GetComponent<Renderer>();
            var filter=adjustment.projection.GetComponent<MeshFilter>();
            var material=renderer ? renderer.sharedMaterial : null;
            var mesh=filter ? filter.sharedMesh : null;
            result.initialProjectionHeight=adjustment.InitialProjectionHeight;
            result.minimumMapOffset=adjustment.MinimumMapOffset;
            result.projectionGap=initialProjection.max.y-initialInset.max.y;
            result.initialStateUnchanged=Mathf.Abs(adjustment.TableOffset)<.00001f && Mathf.Abs(adjustment.MapOffset)<.00001f &&
                Mathf.Abs(adjustment.ProjectionHeight-result.initialProjectionHeight)<.00001f;
            result.insetClearsPedestal=true;result.projectionGapPreserved=true;result.horizontalDimensionsPreserved=true;
            result.pedestalColliderAligned=true;result.surfaceCollidersAligned=true;
            result.minimumPedestalHeight=initialBase.size.y;
            void CheckPhysicalState()
            {
                Bounds baseBounds=adjustment.PedestalBounds;
                result.minimumPedestalHeight=Mathf.Min(result.minimumPedestalHeight,baseBounds.size.y);
                result.pedestalFloorError=Mathf.Max(result.pedestalFloorError,Mathf.Abs(baseBounds.min.y-initialBase.min.y));
                result.insetClearsPedestal &= adjustment.InsetBounds.min.y>=baseBounds.max.y+.008f-.0005f;
                result.projectionGapPreserved &= Mathf.Abs(adjustment.ProjectionBounds.max.y-adjustment.InsetBounds.max.y-result.projectionGap)<.0001f;
                result.horizontalDimensionsPreserved &= SameHorizontal(initialTop,adjustment.TableTopBounds) &&
                    SameHorizontal(initialInset,adjustment.InsetBounds) && SameHorizontal(initialProjection,adjustment.ProjectionBounds) &&
                    SameHorizontal(initialBase,baseBounds);
                result.pedestalColliderAligned &= MeshCollidersMatchRenderers(adjustment.pedestal);
                result.surfaceCollidersAligned &= MeshCollidersMatchRenderers(adjustment.tableTop) &&
                    MeshCollidersMatchRenderers(adjustment.inset) && MeshCollidersMatchRenderers(adjustment.projection);
            }

            // K alone must reach 20 cm without moving the white rim. The
            // physical support follows only far enough to clear the inset.
            adjustment.MoveMap(-100f);CheckPhysicalState();
            result.mapOnlyProjectionHeight=adjustment.ProjectionHeight;
            result.mapLimits=Mathf.Abs(adjustment.MapOffset+.20f)<.00001f && Mathf.Abs(adjustment.MinimumMapOffset+.20f)<.00001f;
            result.fullMapTravel=result.mapLimits && Mathf.Abs(adjustment.ProjectionHeight-result.initialProjectionHeight+.20f)<.0001f &&
                SameBounds(initialTop,adjustment.TableTopBounds);
            result.pedestalCompressionTracksInset=Mathf.Abs(adjustment.InsetBounds.min.y-adjustment.PedestalBounds.max.y-.008f)<.0005f;

            // Both independent controls may be fully lowered together. Check
            // the rendered surface and collision geometry at the deepest state.
            adjustment.SetOffsets(-100f,-100f);CheckPhysicalState();
            result.lowestProjectionHeight=adjustment.ProjectionHeight;
            result.tableLimits=Mathf.Abs(adjustment.TableOffset+.20f)<.00001f &&
                Mathf.Abs(adjustment.TableTopBounds.max.y-initialTop.max.y+.20f)<.0001f;
            result.combinedLowering=result.tableLimits && Mathf.Abs(adjustment.MapOffset+.20f)<.00001f &&
                Mathf.Abs(adjustment.ProjectionHeight-result.initialProjectionHeight+.40f)<.0001f;
            result.pedestalCompressionTracksInset &= Mathf.Abs(adjustment.InsetBounds.min.y-adjustment.PedestalBounds.max.y-.008f)<.0005f;
            RaycastHit centerHit;
            result.recessedMapVisible=Physics.Raycast(adjustment.ProjectionBounds.center+Vector3.up*2,Vector3.down,out centerHit,3f) &&
                centerHit.transform==adjustment.projection;

            adjustment.MoveTable(100f);CheckPhysicalState();
            result.tableLimits &= Mathf.Abs(adjustment.TableOffset-.10f)<.00001f;
            result.pedestalCompressionTracksInset &= Mathf.Abs(adjustment.InsetBounds.min.y-adjustment.PedestalBounds.max.y-.008f)<.0005f;
            adjustment.MoveMap(100f);CheckPhysicalState();
            result.mapLimits &= Mathf.Abs(adjustment.MapOffset-.05f)<.00001f;
            result.pedestalRestoresWithMap=Mathf.Abs(adjustment.PedestalBounds.max.y-initialBase.max.y-.10f)<.0005f;
            result.pedestalOnFloor=result.pedestalFloorError<.0005f;
            result.ovalTexturePreserved=renderer && filter && renderer.sharedMaterial==material && filter.sharedMesh==mesh &&
                material && material.HasProperty("_OvalMask") && material.GetFloat("_OvalMask")>.5f;
            adjustment.ResetAdjustments();CheckPhysicalState();
            result.pedestalOnFloor &= result.pedestalFloorError<.0005f;
            result.resetRestoresInitial=Mathf.Abs(adjustment.TableOffset)<.00001f && Mathf.Abs(adjustment.MapOffset)<.00001f &&
                SameBounds(initialTop,adjustment.TableTopBounds) && SameBounds(initialInset,adjustment.InsetBounds) &&
                SameBounds(initialProjection,adjustment.ProjectionBounds) && SameBounds(initialBase,adjustment.PedestalBounds);
            result.passed=result.initialized && result.initialStateUnchanged && result.tableLimits && result.mapLimits &&
                result.pedestalOnFloor && result.insetClearsPedestal && result.projectionGapPreserved &&
                result.horizontalDimensionsPreserved && result.ovalTexturePreserved && result.resetRestoresInitial && result.recessedMapVisible &&
                result.fullMapTravel && result.combinedLowering && result.pedestalCompressionTracksInset && result.pedestalRestoresWithMap &&
                result.pedestalColliderAligned && result.surfaceCollidersAligned;
            if(!result.passed)result.error="Revisar los campos del ajuste vertical de mesa.";
            return result;
        }
        static bool SameHorizontal(Bounds a,Bounds b) => Mathf.Abs(a.center.x-b.center.x)<.0001f &&
            Mathf.Abs(a.center.z-b.center.z)<.0001f && Mathf.Abs(a.size.x-b.size.x)<.0001f && Mathf.Abs(a.size.z-b.size.z)<.0001f;
        static bool SameBounds(Bounds a,Bounds b) => Vector3.Distance(a.center,b.center)<.0001f && Vector3.Distance(a.size,b.size)<.0001f;
        static bool MeshCollidersMatchRenderers(Transform part)
        {
            var renderers=part.GetComponentsInChildren<MeshRenderer>();
            if(renderers.Length==0)return false;
            foreach(var renderer in renderers)
            {
                var filter=renderer.GetComponent<MeshFilter>();var collider=renderer.GetComponent<MeshCollider>();
                if(!filter || !collider || !collider.enabled || collider.isTrigger || collider.sharedMesh!=filter.sharedMesh ||
                    Vector3.Distance(collider.bounds.center,renderer.bounds.center)>.001f ||
                    Vector3.Distance(collider.bounds.size,renderer.bounds.size)>.001f)return false;
            }
            return true;
        }
    }
}
