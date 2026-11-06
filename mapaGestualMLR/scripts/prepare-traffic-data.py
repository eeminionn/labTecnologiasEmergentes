#!/usr/bin/env python3
"""Prepare one small, reproducible traffic scene from an OSM Overpass export.

Only geometry and source tags are factual. Vehicle routes, lane offsets, road
widths without width tags, model typologies, and model heights are illustrative.
No network requests are made by this script.
"""
import argparse
import hashlib
import heapq
import html
import json
import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from collections import Counter, defaultdict
from pathlib import Path


CENTER = {'lat': -33.4488839, 'lng': -70.5489312}
BOUNDS = {'minX': -95., 'maxX': 95., 'minZ': -85., 'maxZ': 85.}
# Houses beyond the vehicle boundary preserve the surrounding urban fabric.
CONTEXT_BOUNDS = {'minX': -130., 'maxX': 130., 'minZ': -120., 'maxZ': 120.}
PUBLIC_DEMONSTRATION_WAYS = {24337693, 36821264}  # José Zapiola / José Caracci
SOURCE_BBOX = {'south': -33.4500, 'west': -70.55035, 'north': -33.4476, 'east': -70.5475}
# Explicit art direction for three representative garden plantings in the
# delivered scene. Keys are existing OSM building-way IDs, not invented tree
# inventory IDs. These choices preserve the reviewed composition; they are not
# a general species-selection algorithm or a factual observation of vegetation.
CURATED_GARDEN_TREE_CHOICES = {
    1466819698: {'modelId': 'arbol-copa-ancha-b', 'footprintRadiusM': 1.76,
                 'reason': 'Narrower representative crown clears the pavement: the rotated wide-model envelope extends approximately 0.025 m into the estimated carriageway.'},
    617282428: {'modelId': 'arbol-copa-ancha-b', 'footprintRadiusM': 1.76,
                'reason': 'Narrower representative crown preserves the reviewed road clearance: rounding the final position to millimetres leaves the wide-model radius just below the declared 0.5 m allowance.'},
    1466819670: {'modelId': 'arbol-copa-ancha-b', 'footprintRadiusM': 1.76,
                 'reason': 'Narrower representative crown clears the pavement: the rotated wide-model envelope extends approximately 0.006 m into the estimated carriageway.'},
}
DRIVING = {'secondary', 'tertiary', 'secondary_link', 'tertiary_link', 'residential', 'living_street', 'service', 'unclassified'}
WALKING = {'footway', 'path', 'pedestrian', 'cycleway', 'steps'}
ROOT = Path(__file__).resolve().parents[1]


def ecef(lat, lon):
    a, e2 = 6378137., 6.6943799901413165e-3
    p, l = math.radians(lat), math.radians(lon)
    n = a / math.sqrt(1-e2*math.sin(p)**2)
    return n*math.cos(p)*math.cos(l), n*math.cos(p)*math.sin(l), n*(1-e2)*math.sin(p)


ORIGIN = ecef(CENTER['lat'], CENTER['lng'])
PHI, LAM = map(math.radians, (CENTER['lat'], CENTER['lng']))


def project(g):
    q = [a-b for a,b in zip(ecef(g['lat'],g['lon']),ORIGIN)]
    east = -math.sin(LAM)*q[0]+math.cos(LAM)*q[1]
    north = -math.sin(PHI)*math.cos(LAM)*q[0]-math.sin(PHI)*math.sin(LAM)*q[1]+math.cos(PHI)*q[2]
    return east, -north


def inside(p, margin=0):
    return BOUNDS['minX']+margin <= p[0] <= BOUNDS['maxX']-margin and BOUNDS['minZ']+margin <= p[1] <= BOUNDS['maxZ']-margin


def inside_context(p, margin=0):
    return CONTEXT_BOUNDS['minX']+margin <= p[0] <= CONTEXT_BOUNDS['maxX']-margin and CONTEXT_BOUNDS['minZ']+margin <= p[1] <= CONTEXT_BOUNDS['maxZ']-margin


def load_osm(source):
    """Read an unmodified OSM map-API XML file or Overpass JSON export."""
    raw=source.read_bytes()
    if source.suffix != '.osm':return raw,json.loads(raw)
    root=ET.fromstring(raw)
    nodes={int(n.attrib['id']):n for n in root.findall('node')}
    elements=[]
    for node in nodes.values():
        tags={t.attrib['k']:t.attrib['v'] for t in node.findall('tag')}
        if tags:elements.append({'type':'node','id':int(node.attrib['id']),'lat':float(node.attrib['lat']),'lon':float(node.attrib['lon']),'tags':tags})
    for way in root.findall('way'):
        ids=[int(n.attrib['ref']) for n in way.findall('nd')]
        elements.append({'type':'way','id':int(way.attrib['id']),'nodes':ids,'tags':{t.attrib['k']:t.attrib['v'] for t in way.findall('tag')},
                         'geometry':[{'lat':float(nodes[n].attrib['lat']),'lon':float(nodes[n].attrib['lon'])} for n in ids],
                         'version':int(way.attrib['version']),'timestamp':way.attrib['timestamp']})
    retrieved=datetime.fromtimestamp(source.stat().st_mtime,tz=timezone.utc).isoformat(timespec='seconds')
    return raw,{'elements':elements,'osm3s':{'timestamp_osm_base':retrieved},'snapshotType':'OSM map API retrieval time; no planet snapshot timestamp supplied',
                'generator':root.attrib.get('generator'),'endpoint':'https://api.openstreetmap.org/api/0.6/map'}


def clip_segment(a,b):
    dx,dz=b[0]-a[0],b[1]-a[1]
    lo,hi=0.,1.
    for p,q in [(-dx,a[0]-BOUNDS['minX']),(dx,BOUNDS['maxX']-a[0]),(-dz,a[1]-BOUNDS['minZ']),(dz,BOUNDS['maxZ']-a[1])]:
        if abs(p)<1e-12:
            if q<0:return None
        else:
            t=q/p
            if p<0:lo=max(lo,t)
            else:hi=min(hi,t)
            if lo>hi:return None
    return (a[0]+lo*dx,a[1]+lo*dz),(a[0]+hi*dx,a[1]+hi*dz),lo,hi


def distance(a,b):return math.hypot(b[0]-a[0],b[1]-a[1])
def rounded(p):return [round(float(v),3) for v in p]


def clip_polyline(points):
    parts=[];part=[]
    for a,b in zip(points,points[1:]):
        clipped=clip_segment(a,b)
        if clipped is None:
            if len(part)>1:parts.append(part)
            part=[];continue
        c,d,*_=clipped
        if distance(c,d)<.01:continue
        if part and distance(part[-1],c)>.02:
            if len(part)>1:parts.append(part)
            part=[]
        if not part:part=[c]
        part.append(d)
    if len(part)>1:parts.append(part)
    return parts


def numeric(value):
    if value is None:return None
    try:return float(str(value).lower().replace('meters','').replace('metres','').replace('m','').split(';')[0].strip())
    except ValueError:return None


def width_for(tags):
    exact=numeric(tags.get('width'))
    if exact and 1<exact<35:return exact,'OSM width'
    lanes=numeric(tags.get('lanes'))
    if lanes and 0<lanes<8:return round(lanes*3.15+.3,2),'Estimated: OSM lanes × 3.15 m + 0.30 m'
    widths={'secondary':12.6,'secondary_link':4.,'tertiary':6.6,'tertiary_link':4.,'residential':6.,'living_street':4.8,'service':4.2,'unclassified':6.,'footway':1.8,'path':1.8,'pedestrian':3.,'cycleway':2.4,'steps':1.8}
    return widths[tags['highway']],'Estimated by highway type'


def oneway(tags):
    value=tags.get('oneway','').lower()
    if value=='-1':return -1
    if value in ('yes','true','1') or tags.get('junction')=='roundabout':return 1
    return 0


def road_records(elements):
    records=[];ways={}
    for e in elements:
        t=e.get('tags',{});kind=t.get('highway')
        if e.get('type')!='way' or kind not in DRIVING|WALKING or t.get('covered')=='yes' or t.get('tunnel')=='yes':continue
        pts=list(map(project,e['geometry']));parts=clip_polyline(pts)
        if not parts:continue
        width,method=width_for(t)
        ways[e['id']]={'element':e,'points':pts,'width':width,'oneway':oneway(t),'allowed':e['id'] in PUBLIC_DEMONSTRATION_WAYS and kind in DRIVING and t.get('access') not in ('private','no') and t.get('motor_vehicle')!='no'}
        for j,part in enumerate(parts):
            if sum(distance(a,b) for a,b in zip(part,part[1:]))<3:continue
            records.append({'id':f"osm-way-{e['id']}-{j}",'osmWayId':e['id'],'name':t.get('name','Pasaje de servicio' if kind=='service' else 'Sendero' if kind in WALKING else 'Conexión vial'),
                            'highway':kind,'width':width,'widthSource':method,'widthEstimated':method!='OSM width','oneway':oneway(t),'lanes':numeric(t.get('lanes')),
                            'motorVehicles':kind in DRIVING,'access':t.get('access','public'),'points':list(map(rounded,part))})
    return records,ways


def hull(points):
    p=sorted(set(points))
    if len(p)<3:return p
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    low=[];up=[]
    for q in p:
        while len(low)>1 and cross(low[-2],low[-1],q)<=0:low.pop()
        low.append(q)
    for q in reversed(p):
        while len(up)>1 and cross(up[-2],up[-1],q)<=0:up.pop()
        up.append(q)
    return low[:-1]+up[:-1]


def min_rectangle(points):
    shell=hull(points);best=None
    for a,b in zip(shell,shell[1:]+shell[:1]):
        theta=math.atan2(b[1]-a[1],b[0]-a[0]);c,s=math.cos(theta),math.sin(theta)
        u=[x*c+z*s for x,z in shell];v=[-x*s+z*c for x,z in shell]
        u0,u1,v0,v1=min(u),max(u),min(v),max(v)
        area=(u1-u0)*(v1-v0)
        if best is None or area<best[0]:best=(area,theta,u0,u1,v0,v1)
    _,theta,u0,u1,v0,v1=best;c,s=math.cos(theta),math.sin(theta)
    corners=[(u*c-v*s,u*s+v*c) for u,v in [(u0,v0),(u1,v0),(u1,v1),(u0,v1)]]
    center=((u0+u1)/2*c-(v0+v1)/2*s,(u0+u1)/2*s+(v0+v1)/2*c)
    return center,u1-u0,v1-v0,theta,corners


def area(p):return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1])))/2


def point_in_polygon(p,poly):
    hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit


def point_segment(p,a,b):
    vx,vz=b[0]-a[0],b[1]-a[1];den=vx*vx+vz*vz
    t=0 if den==0 else max(0,min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vz)/den))
    return distance(p,(a[0]+vx*t,a[1]+vz*t))


def nearest_on_segment(p,a,b):
    dx,dz=b[0]-a[0],b[1]-a[1];den=dx*dx+dz*dz
    t=0 if den==0 else max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/den))
    return a[0]+t*dx,a[1]+t*dz


def intersects(a,b,c,d):
    def cross(p,q,r):return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
    return cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0


def polygon_road_clearance(poly,road):
    result=math.inf
    for a,b in zip(road['points'],road['points'][1:]):
        if point_in_polygon(a,poly) or point_in_polygon(b,poly):return -road['width']/2
        for c,d in zip(poly,poly[1:]+poly[:1]):
            if intersects(a,b,c,d):return -road['width']/2
            result=min(result,point_segment(a,c,d),point_segment(b,c,d),point_segment(c,a,b),point_segment(d,a,b))
    return result-road['width']/2


def model_polygon(mid,rotation,width,depth):
    theta=-rotation;c,s=math.cos(theta),math.sin(theta);x,z=mid
    return [(x+u*c-v*s,z+u*s+v*c) for u,v in [(-width/2,-depth/2),(width/2,-depth/2),(width/2,depth/2),(-width/2,depth/2)]]


def polygon_contains_shape(outer,inner):
    return all(point_in_polygon(p,outer) for p in inner) and not any(intersects(a,b,c,d) for a,b in zip(inner,inner[1:]+inner[:1]) for c,d in zip(outer,outer[1:]+outer[:1]))


def context_roads(elements):
    roads=[]
    for e in elements:
        t=e.get('tags',{});kind=t.get('highway')
        if e.get('type')!='way' or kind not in DRIVING or t.get('covered')=='yes' or t.get('tunnel')=='yes':continue
        width,method=width_for(t)
        roads.append({'osmWayId':e['id'],'points':list(map(project,e['geometry'])),'width':width,'motorVehicles':True})
    return roads


def polygons_overlap(p,q):
    return any(point_in_polygon(v,p) for v in q) or any(point_in_polygon(v,q) for v in p) or any(intersects(a,b,c,d) for a,b in zip(p,p[1:]+p[:1]) for c,d in zip(q,q[1:]+q[:1]))


def fitted_house(rect,footprint_area,tags,models,osm_id,nearest):
    mid,width,depth,theta,_=rect
    # Orient the model's front (+Z) toward the nearest mapped street. The two
    # orthogonal options share the same observed OSM rectangle orientation.
    toward=(nearest[0][0]-mid[0],nearest[0][1]-mid[1])
    options=[]
    for turn in [0,1]:
        th=theta+turn*math.pi/2;rot=-th
        dot=math.sin(rot)*toward[0]+math.cos(rot)*toward[1]
        options.append((abs(dot),turn,rot+(math.pi if dot<0 else 0)))
    _,turn,rotation=max(options)
    if turn:width,depth=depth,width
    target_w,target_d=width*.91,depth*.91
    levels=numeric(tags.get('building:levels'));observed_height=numeric(tags.get('height'))
    # The height is representative, while plan dimensions follow the mapped
    # roof envelope. Avoid the former height-limited uniform fit that reduced
    # ordinary 11×15 m houses to tiny cabins.
    desired_height=max(4.,min(7.,observed_height or (6.5 if levels and levels>=2 else 5.2+(osm_id%4)*.35)))
    choices=[]
    for model in models:
        if not model['id'].startswith('casa-'):continue
        native=model['bounds'];scale=desired_height/native['height']
        sx=target_w/(native['width']*scale);sz=target_d/(native['depth']*scale)
        distortion=abs(math.log(sx))+abs(math.log(sz))
        if .52<=sx<=1.65 and .52<=sz<=1.65:
            # Stable, slight typological variety among similarly suitable meshes.
            score=distortion+.18*((osm_id+sum(map(ord,model['id'])))%3)
            choices.append((score,model,scale,sx,sz))
    if not choices:
        # Small surveyed houses remain small, rather than being enlarged into
        # adjacent gardens. The flattest house is the least distorted fallback.
        model=min((m for m in models if m['id'].startswith('casa-')),key=lambda m:abs(math.log((target_w/target_d)/(m['bounds']['width']/m['bounds']['depth']))))
        native=model['bounds']
        desired_height=max(desired_height,min(7.,max(target_w/native['width'],target_d/native['depth'])*native['height']/1.65))
        scale=desired_height/native['height']
        sx=target_w/(native['width']*scale);sz=target_d/(native['depth']*scale)
    else:_,model,scale,sx,sz=min(choices,key=lambda q:q[0])
    rendered={'width':round(target_w,3),'depth':round(target_d,3),'height':round(desired_height,3)}
    return model['id'],width,depth,(rotation+math.pi)%(2*math.pi)-math.pi,scale,[sx,sz],rendered,observed_height,levels


def building_records(elements,roads,models,max_count=100):
    candidates=[];skipped=Counter();driving=context_roads(elements)
    for e in elements:
        tags=e.get('tags',{})
        if e.get('type')!='way' or not tags.get('building'):continue
        footprint=list(map(project,e['geometry']))
        if footprint[0]==footprint[-1]:footprint.pop()
        if len(footprint)<3:continue
        footprint_area=area(footprint);rect=min_rectangle(footprint);mid=rect[0]
        if not inside_context(mid,1):skipped['outside_context']+=1;continue
        if footprint_area<32 or min(rect[1:3])<4.8:skipped['small_annex']+=1;continue
        if footprint_area>500 or max(rect[1:3])>30:skipped['large_complex_footprint']+=1;continue
        nearest=min(((nearest_on_segment(mid,a,b),r['osmWayId']) for r in driving for a,b in zip(r['points'],r['points'][1:])),key=lambda q:distance(mid,q[0]))
        model_id,w,d,rot,scale,scale_xz,rendered,observed_height,levels=fitted_house(rect,footprint_area,tags,models,e['id'],nearest)
        poly=model_polygon(mid,rot,rendered['width'],rendered['depth'])
        clearance=min(polygon_road_clearance(poly,r) for r in driving)
        if clearance<.35:skipped['model_overlaps_road']+=1;continue
        if not all(inside_context(p) for p in poly):skipped['outside_context_envelope']+=1;continue
        # L-shaped roof envelopes can include small recesses. Preserve the
        # overall roof-sized house without the old severe uniform contraction.
        candidates.append({'id':f"osm-building-{e['id']}",'osmWayId':e['id'],'sourceBuildingId':e['id'],'modelId':model_id,'position':rounded(mid),
                           'rotation':round(rot,8),'width':round(w,3),'depth':round(d,3),'height':rendered['height'],'uniformScale':round(scale,8),
                           'scaleXZ':[round(v,8) for v in scale_xz],'renderedBounds':rendered,
                           'footprint':list(map(rounded,footprint)),'footprintArea':round(footprint_area,2),'minimumRoadClearance':round(clearance,3),
                           'building':tags.get('building'),'sourceLevels':levels,'sourceHeight':observed_height,
                           'representativeFrontFacesRoad':nearest[1],'heightSource':'Representative 4–7 m low-rise house; OSM height/levels when available',
                           'footprintSource':'OSM community-mapped roof polygon; detailed house mesh approximates its oriented envelope, not each concave recess'})
    candidates.sort(key=lambda b:math.hypot(*b['position']))
    picked=[];polys=[]
    for b in candidates:
        poly=model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth'])
        if any(polygons_overlap(poly,q) for q in polys):skipped['model_pair_overlap']+=1;continue
        picked.append(b);polys.append(poly)
        if len(picked)>=max_count:break
    return picked,{'eligible':len(candidates),'selected':len(picked),'insideVehicleSector':sum(inside(b['position']) for b in picked),'excluded':dict(skipped)}


def props_for(elements,buildings,models):
    """Use real mapped trees; modest inferred garden planting is marked separately."""
    props=[];roads=context_roads(elements)
    building_polys=[model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth']) for b in buildings]
    def clear(p,radius):
        return inside_context(p,4) and min(point_segment(p,a,b)-r['width']/2 for r in roads for a,b in zip(r['points'],r['points'][1:]))>radius+.5 and all(not point_in_polygon(p,q) and min(point_segment(p,a,b) for a,b in zip(q,q[1:]+q[:1]))>radius+.4 for q in building_polys) and all(distance(p,q['position'])>radius+q['footprintRadiusM']+.6 for q in props)
    for e in elements:
        if e.get('type')!='node' or e.get('tags',{}).get('natural')!='tree':continue
        pos=project(e);height=7.6;model_id='arbol-copa-ancha-a';radius=2.35
        if not clear(pos,radius):
            model_id='arbol-copa-ancha-b';height=7.2;radius=1.66
            if not clear(pos,radius):continue
        props.append({'id':f"osm-tree-{e['id']}",'osmNodeId':e['id'],'modelId':model_id,'position':rounded(pos),'rotation':round((e['id']%23)*.27,4),'height':height,'footprintRadiusM':radius,'placementSource':'OSM natural=tree; species and 7.2–7.6 m height are representative estimates'})
    # Satellite review confirms front gardens and street trees, but is not a
    # tree inventory. Add only a few clearly declared illustrative specimens in
    # the free garden gap between a mapped house and its mapped access street.
    for b in buildings:
        if b['osmWayId']%2:continue
        p=b['position'];r=next(r for r in roads if r['osmWayId']==b['representativeFrontFacesRoad'])
        q=min((nearest_on_segment(p,a,c) for a,c in zip(r['points'],r['points'][1:])),key=lambda q:distance(p,q))
        dx,dz=q[0]-p[0],q[1]-p[1];dist=math.hypot(dx,dz)
        if dist<10:continue
        # A generous front-yard gap must exist; never place trees over homes or
        # on the carriageway to achieve a visual quota.
        pos=(q[0]-dx/dist*(r['width']/2+3),q[1]-dz/dist*(r['width']/2+3))
        height=7.6+(b['osmWayId']%2)*.4;model_id='arbol-copa-ancha-a';radius=2.5
        if not clear(pos,radius):
            model_id='arbol-copa-ancha-b';height=7.6;radius=1.76
            if not clear(pos,radius):continue
        curated=CURATED_GARDEN_TREE_CHOICES.get(b['osmWayId'])
        if curated:
            model_id=curated['modelId'];radius=curated['footprintRadiusM']
        props.append({'id':f"garden-tree-{b['osmWayId']}",'modelId':model_id,'position':rounded(pos),'rotation':round((b['osmWayId']%29)*.23,4),'height':height,'footprintRadiusM':radius,'placementSource':'Representative garden planting inferred from satellite-reviewed residential character; not an observed tree position'})
    for i,pos in enumerate([(-5.8,-5.8),(5.8,-5.8),(-5.8,5.8),(5.8,5.8)],start=1):
        radius=1.05
        if not clear(pos,radius):continue
        props.append({'id':f"representative-light-{i}",'modelId':'farola','position':rounded(pos),'rotation':0 if pos[1]<0 else round(math.pi,8),'height':6.,'footprintRadiusM':radius,
                      'placementSource':'Representative lighting for the demonstration; not a surveyed or OSM-confirmed streetlight position'})
    return props


def clip_halfplane(poly,nx,nz,limit):
    """Clip a convex polygon to dot(p,n) <= limit, preserving metre units."""
    result=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=a[0]*nx+a[1]*nz-limit;db=b[0]*nx+b[1]*nz-limit
        if da<=1e-8:result.append(a)
        if (da<0)!=(db<0):
            t=da/(da-db);result.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    return result


def separating_halfplane(own,other):
    options=[]
    for poly in [own,other]:
        for a,b in zip(poly,poly[1:]+poly[:1]):
            dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
            nx,nz=-dz/length,dx/length
            lo,hi=min(x*nx+z*nz for x,z in own),max(x*nx+z*nz for x,z in own)
            qlo,qhi=min(x*nx+z*nz for x,z in other),max(x*nx+z*nz for x,z in other)
            if hi<qlo-1e-6:options.append((qlo-hi,nx,nz,(hi+qlo)/2))
            elif qhi<lo-1e-6:options.append((lo-qhi,-nx,-nz,-(lo+qhi)/2))
    if not options:return None
    _,nx,nz,limit=min(options)
    return nx,nz,limit


def gardens_for(elements,buildings):
    roads=context_roads(elements);gardens=[]
    shapes={b['id']:model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth']) for b in buildings}
    expanded={b['id']:model_polygon(b['position'],b['rotation'],b['renderedBounds']['width']+6,b['renderedBounds']['depth']+6) for b in buildings}
    for b in buildings:
        own=shapes[b['id']];outer=expanded[b['id']];mid=b['position']
        # The extra lawn starts as a 3 m envelope, not a property boundary.
        # Keep it behind every nearby road's pavement edge plus 0.2 m.
        for road in roads:
            for a,c in zip(road['points'],road['points'][1:]):
                if point_segment(mid,a,c)>30:continue
                dx,dz=c[0]-a[0],c[1]-a[1];length=math.hypot(dx,dz)
                if length<.01:continue
                along=((mid[0]-a[0])*dx+(mid[1]-a[1])*dz)/length
                reach=math.hypot(b['renderedBounds']['width']/2+3,b['renderedBounds']['depth']/2+3)
                if along < -reach or along > length+reach:continue
                nx,nz=-dz/length,dx/length
                signed=(mid[0]-a[0])*nx+(mid[1]-a[1])*nz
                sign=1 if signed>=0 else -1
                outer=clip_halfplane(outer,-sign*nx,-sign*nz,-sign*(a[0]*nx+a[1]*nz)-road['width']/2-.2)
                if len(outer)<3:break
            if len(outer)<3:break
        if len(outer)<3:continue
        # Divide only competing free gaps between house envelopes. This avoids
        # painting neighboring homes or overlapping semi-transparent lawns.
        for other in buildings:
            if other['id']==b['id'] or not polygons_overlap(expanded[b['id']],expanded[other['id']]):continue
            plane=separating_halfplane(own,shapes[other['id']])
            if plane:outer=clip_halfplane(outer,*plane)
            if len(outer)<3:break
        for nx,nz,limit in [(1,0,CONTEXT_BOUNDS['maxX']),(-1,0,-CONTEXT_BOUNDS['minX']),(0,1,CONTEXT_BOUNDS['maxZ']),(0,-1,-CONTEXT_BOUNDS['minZ'])]:
            if len(outer)<3:break
            outer=clip_halfplane(outer,nx,nz,limit)
        if len(outer)<3 or area(outer)-area(own)<10:continue
        if not polygon_contains_shape(outer,own):continue
        if min(polygon_road_clearance(outer,r) for r in roads)<.17:continue
        if any(polygons_overlap(outer,q) for name,q in shapes.items() if name!=b['id']):continue
        gardens.append({'id':f"garden-{b['osmWayId']}",'sourceBuildingId':b['osmWayId'],'polygon':list(map(rounded,outer)),
                        'holes':[list(map(rounded,reversed(own)))],'areaM2':round(area(outer)-area(own),2),
                        'note':'Paisajismo representativo de muestra; no corresponde a límites de propiedad ni a un levantamiento de áreas verdes.'})
    return gardens


def route_graph(ways):
    points={};edges=defaultdict(list);boundary=set()
    for wid,item in ways.items():
        if not item['allowed']:continue
        source=item['element'];pts=item['points'];direction=item['oneway']
        for i,(a,b) in enumerate(zip(pts,pts[1:])):
            clipped=clip_segment(a,b)
            if clipped is None:continue
            c,d,lo,hi=clipped
            if distance(c,d)<.01:continue
            ka=str(source['nodes'][i]) if lo<1e-10 else f'boundary-{wid}-{i}-a'
            kb=str(source['nodes'][i+1]) if hi>1-1e-10 else f'boundary-{wid}-{i}-b'
            points[ka]=c;points[kb]=d
            if lo>1e-10:boundary.add(ka)
            if hi<1-1e-10:boundary.add(kb)
            data={'way':wid,'width':item['width'],'oneway':direction,'kind':source['tags']['highway'],'name':source['tags'].get('name','Conexión vial')}
            if direction!=-1:edges[ka].append((kb,distance(c,d),data))
            if direction!=1:edges[kb].append((ka,distance(c,d),data))
    return points,edges,boundary


def shortest_path(start,end,edges):
    queue=[(0,start)];dist={start:0};prev={}
    while queue:
        cost,node=heapq.heappop(queue)
        if cost!=dist[node]:continue
        if node==end:
            nodes=[node];metadata=[]
            while node!=start:
                parent,meta=prev[node];metadata.append(meta);nodes.append(parent);node=parent
            return cost,list(reversed(nodes)),list(reversed(metadata))
        for other,length,meta in edges.get(node,[]):
            candidate=cost+length
            if candidate<dist.get(other,math.inf):dist[other]=candidate;prev[other]=(node,meta);heapq.heappush(queue,(candidate,other))
    return None


def boundary_side(p):
    distances={'oeste':abs(p[0]-BOUNDS['minX']),'este':abs(p[0]-BOUNDS['maxX']),'norte':abs(p[1]-BOUNDS['minZ']),'sur':abs(p[1]-BOUNDS['maxZ'])}
    return min(distances,key=distances.get)


def lane_offset(meta):
    if meta['width']<4.5:return 0.
    return min(1.5,max(0,(meta['width']-3.2)/2))


def offset_path(points,meta):
    normals=[]
    for a,b in zip(points,points[1:]):
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz);normals.append((-dz/length,dx/length))
    result=[]
    for i,p in enumerate(points):
        if i==0:norm,offset=normals[0],lane_offset(meta[0])
        elif i==len(points)-1:norm,offset=normals[-1],lane_offset(meta[-1])
        else:
            a,b=normals[i-1],normals[i];nx,nz=a[0]+b[0],a[1]+b[1];l=math.hypot(nx,nz)
            norm=(nx/l,nz/l) if l>.1 else b
            offset=(lane_offset(meta[i-1])+lane_offset(meta[i]))/2
            denom=max(.6,norm[0]*b[0]+norm[1]*b[1]);offset=min(2.4,offset/denom)
        result.append((p[0]+norm[0]*offset,p[1]+norm[1]*offset))
    # A low-speed car follows a rounded turn through the real intersection;
    # it cannot rotate its full 4.2 m envelope instantaneously at a graph node.
    curved=[result[0]]
    for a,p,b in zip(result,result[1:],result[2:]):
        before,after=distance(a,p),distance(p,b)
        ua=((p[0]-a[0])/before,(p[1]-a[1])/before)
        ub=((b[0]-p[0])/after,(b[1]-p[1])/after)
        if ua[0]*ub[0]+ua[1]*ub[1]>.95:
            curved.append(p);continue
        # Right turns hug the inside lane; left turns cross the junction with
        # a broader arc. Both are validated against the complete car envelope.
        turn_cross=ua[0]*ub[1]-ua[1]*ub[0]
        trim=min(1.5 if turn_cross>0 else 3.5,before*.4,after*.4)
        start=(p[0]-ua[0]*trim,p[1]-ua[1]*trim)
        end=(p[0]+ub[0]*trim,p[1]+ub[1]*trim)
        curved.append(start)
        for j in range(1,13):
            t=j/12
            curved.append(((1-t)**2*start[0]+2*(1-t)*t*p[0]+t*t*end[0],(1-t)**2*start[1]+2*(1-t)*t*p[1]+t*t*end[1]))
    curved.append(result[-1]);result=curved
    # Uniformly sample small segments so browser motion can interpolate without
    # spline overshoot across sidewalks or buildings.
    sampled=[result[0]]
    for a,b in zip(result,result[1:]):
        count=max(1,math.ceil(distance(a,b)/2))
        for j in range(1,count+1):sampled.append((a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count))
    return sampled


def routes_for(ways,roads):
    points,edges,boundary=route_graph(ways);incoming=Counter(v for es in edges.values() for v,*_ in es)
    candidates=[]
    for start in sorted(boundary):
        if not edges.get(start):continue
        for end in sorted(boundary):
            if start==end or not incoming[end] or boundary_side(points[start])==boundary_side(points[end]):continue
            path=shortest_path(start,end,edges)
            if path and 115<path[0]<350:
                cost,nodes,meta=path
                # Use the main public network, not car-park circulation, for the demonstration.
                if any(m['kind'] in ('service','living_street') for m in meta):continue
                candidates.append({'length':cost,'nodes':nodes,'meta':meta,'start':start,'end':end,'sides':(boundary_side(points[start]),boundary_side(points[end]))})
    chosen=[]
    # Spread the five cars across different approaches and maneuvers.
    desired=[('este','oeste'),('norte','este'),('sur','norte'),('oeste','este'),('este','norte'),('sur','oeste'),('norte','oeste')]
    used=set()
    for sides in desired:
        options=[p for p in candidates if p['sides']==sides and (p['start'],p['end']) not in used]
        if options:
            path=min(options,key=lambda p:p['length']);chosen.append(path);used.add((path['start'],path['end']))
        if len(chosen)==5:break
    for path in sorted(candidates,key=lambda p:p['length']):
        if len(chosen)==5:break
        if (path['start'],path['end']) not in used:chosen.append(path);used.add((path['start'],path['end']))
    if len(chosen)!=5:raise ValueError(f'Expected five directed routes, found {len(chosen)}; candidates={len(candidates)}')
    routes=[]
    for i,p in enumerate(chosen):
        original=[points[n] for n in p['nodes']];shifted=offset_path(original,p['meta'])
        routes.append({'id':f"recorrido-{i+1}-{p['sides'][0]}-{p['sides'][1]}",'name':f"Recorrido {i+1}: {p['sides'][0]} a {p['sides'][1]}",
                       'points':list(map(rounded,shifted)),'closed':False,'length':round(sum(distance(a,b) for a,b in zip(shifted,shifted[1:])),3),
                       'sourceWayIds':list(dict.fromkeys(m['way'] for m in p['meta'])),'sourceNodeIds':[n for n in p['nodes'] if not n.startswith('boundary-')],
                       'fromBoundary':p['sides'][0],'toBoundary':p['sides'][1],'laneOffset':'Illustrative right-side lane offset, 0–1.5 m; node miters limited to 2.4 m',
                       'onewayRespected':True,'motion':'Simulated; restart at boundary entrance after leaving the visible sector',
                       'streets':list(dict.fromkeys(m['name'] for m in p['meta']))})
    return routes,{'boundaryNodes':len(boundary),'directedCandidateRoutes':len(candidates),'directedGraphNodes':len(points),'directedGraphEdges':sum(map(len,edges.values()))}


def validate_geometry(scene,models,elements):
    roads=context_roads(elements)
    def coverage(point):
        return max(r['width']/2-min(point_segment(point,a,b) for a,b in zip(r['points'],r['points'][1:])) for r in roads)
    model_polygons=[]
    for b in scene['buildings']:
        poly=model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth'])
        assert all(inside_context(p) for p in poly),b['id']
        assert min(polygon_road_clearance(poly,r) for r in roads)>.25,b['id']
        model_polygons.append((b['id'],poly))
    for i,(name,p) in enumerate(model_polygons):
        for other,q in model_polygons[i+1:]:
            overlap=any(point_in_polygon(v,p) for v in q) or any(point_in_polygon(v,q) for v in p) or any(intersects(a,b,c,d) for a,b in zip(p,p[1:]+p[:1]) for c,d in zip(q,q[1:]+q[:1]))
            assert not overlap,(name,other)
    garden_polygons=[]
    for g in scene['gardens']:
        outer=g['polygon'];assert min(polygon_road_clearance(outer,r) for r in roads)>.15,g['id']
        for b in scene['buildings']:
            if b['osmWayId']==g['sourceBuildingId']:continue
            poly=model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth'])
            assert not polygons_overlap(outer,poly),(g['id'],b['id'])
        garden_polygons.append(outer)
    for prop in scene['props']:
        p=prop['position'];radius=prop['footprintRadiusM']
        assert min(point_segment(p,a,b)-r['width']/2 for r in roads for a,b in zip(r['points'],r['points'][1:]))>radius+.45,prop['id']
        assert all(not point_in_polygon(p,q) and min(point_segment(p,a,b) for a,b in zip(q,q[1:]+q[:1]))>radius+.35 for _,q in model_polygons),prop['id']
    half_width=max(m['demonstrationBoundsM']['width'] for m in models if m.get('type')=='car')/2
    half_length=max(m['demonstrationBoundsM']['depth'] for m in models if m.get('type')=='car')/2
    checks=[]
    for route in scene['routes']:
        pts=route['points'];margin=min(coverage(p) for p in pts)
        assert margin>half_width,route['id']
        corners=math.inf
        for i,p in enumerate(pts[2:-2],start=2):
            a,b=pts[i-1],pts[i+1];dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
            fx,fz=dx/length,dz/length;rx,rz=-fz,fx
            corners=min(corners,min(coverage((p[0]+fx*l+rx*w,p[1]+fz*l+rz*w)) for l in [-half_length,half_length] for w in [-half_width,half_width]))
        assert corners>-.05,route['id']
        assert route['closed'] is False and route['length']>115
        checks.append({'id':route['id'],'pointCount':len(pts),'minimumCenterToRoadEdgeM':round(margin,3),'minimumVehicleCornerRoadMarginM':round(corners,3),'onewayGraphRespected':True})
    return {'passed':True,'modelBoundsInsideContext':True,'modelBoundsApproximateMappedRoofEnvelopes':True,'modelsOverlapRoads':False,'modelPairsOverlap':False,
            'gardensClearPavementAndNeighboringBuildings':True,'gardenCount':len(garden_polygons),'propsClearPavementAndBuildings':True,
            'vehicleEnvelope':{'width':round(half_width*2,3),'length':round(half_length*2,3)},
            'endpointNote':'The first/last two samples are omitted from corner-envelope checks where vehicles enter/leave the map boundary.',
            'routes':checks}


def preview(scene,out):
    out.mkdir(parents=True,exist_ok=True);width,height=1280,1080
    def svgpoint(p):return ((p[0]-CONTEXT_BOUNDS['minX'])/(CONTEXT_BOUNDS['maxX']-CONTEXT_BOUNDS['minX'])*width,(p[1]-CONTEXT_BOUNDS['minZ'])/(CONTEXT_BOUNDS['maxZ']-CONTEXT_BOUNDS['minZ'])*height)
    lines=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">','<rect width="1280" height="1080" fill="#e8eeea"/>']
    for g in scene['gardens']:
        rings=[g['polygon']]+g['holes'];parts=[]
        for ring in rings:
            coords=list(map(svgpoint,ring));parts.append('M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in coords)+' Z')
        lines.append('<path d="'+' '.join(parts)+'" fill="#bdcbb2" fill-rule="evenodd" stroke="#9dad94" stroke-width=".8"/>')
    for r in scene['roads']:
        coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in map(svgpoint,r['points']))
        lines.append(f'<polyline points="{coords}" fill="none" stroke="'+('#a9b2b1' if r['motorVehicles'] else '#cbbfa8')+f'" stroke-width="{r["width"]*4:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    for b in scene['buildings']:
        coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in map(svgpoint,b['footprint']))
        lines.append(f'<polygon points="{coords}" fill="#ffffff" stroke="#a6b4b6" stroke-width="1.5"/>')
        coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in map(svgpoint,model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth'])))
        lines.append(f'<polygon points="{coords}" fill="#a37d68" fill-opacity=".8" stroke="#65564f" stroke-width="1.2"/>')
    palette=['#e82d81','#00adb2','#6e2663','#008d36','#72821d']
    for i,r in enumerate(scene['routes']):
        coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in map(svgpoint,r['points']))
        lines.append(f'<polyline points="{coords}" fill="none" stroke="{palette[i]}" stroke-width="2.5" stroke-linejoin="round"/>')
        x,y=svgpoint(r['points'][0]);lines.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="6" fill="{palette[i]}"/>')
    for p in scene['props']:
        x,y=svgpoint(p['position']);lines.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="7" fill="#618561"/>')
    lines.append('<text x="16" y="30" font-size="20" font-family="sans-serif" fill="#183a43">N ↑ · José Caracci / José Zapiola · tránsito 190 × 170 m + contexto residencial</text></svg>')
    (out/'plano-sector.svg').write_text('\n'.join(lines)+'\n')
    try:
        from PIL import Image,ImageDraw,ImageFont
        im=Image.new('RGB',(width,height),'#e8eeea');draw=ImageDraw.Draw(im)
        for g in scene['gardens']:
            draw.polygon(list(map(svgpoint,g['polygon'])),fill='#bdcbb2',outline='#9dad94',width=1)
            for hole in g['holes']:draw.polygon(list(map(svgpoint,hole)),fill='#e8eeea')
        for r in scene['roads']:
            draw.line(list(map(svgpoint,r['points'])),fill='#a9b2b1' if r['motorVehicles'] else '#cbbfa8',width=max(1,round(r['width']*4)),joint='curve')
        for b in scene['buildings']:
            draw.polygon(list(map(svgpoint,b['footprint'])),fill='white',outline='#a6b4b6',width=1)
            draw.polygon(list(map(svgpoint,model_polygon(b['position'],b['rotation'],b['renderedBounds']['width'],b['renderedBounds']['depth']))),fill='#a37d68',outline='#65564f',width=1)
        for i,r in enumerate(scene['routes']):
            draw.line(list(map(svgpoint,r['points'])),fill=palette[i],width=3,joint='curve');x,y=svgpoint(r['points'][0]);draw.ellipse((x-6,y-6,x+6,y+6),fill=palette[i])
        for p in scene['props']:
            x,y=svgpoint(p['position']);radius=p['footprintRadiusM']*width/(CONTEXT_BOUNDS['maxX']-CONTEXT_BOUNDS['minX'])
            draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill='#618561' if p['modelId']!='farola' else '#59626c')
        draw.text((16,16),'José Caracci / José Zapiola · tránsito 190 × 170 m + contexto residencial',fill='#183a43')
        im.save(out/'plano-sector.png')
    except ImportError:pass


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True);parser.add_argument('--query',type=Path,required=True)
    parser.add_argument('--out-dir',type=Path,default=ROOT/'public/traffic');parser.add_argument('--preview-dir',type=Path)
    args=parser.parse_args();raw,export=load_osm(args.source);elements=export['elements']
    models=json.loads((args.out_dir/'models/assets-manifest.json').read_text())['models']
    roads,ways=road_records(elements)
    buildings,bqa=building_records(elements,roads,models)
    routes,rqa=routes_for(ways,roads)
    props=props_for(elements,buildings,models)
    gardens=gardens_for(elements,buildings)
    source={'provider':'OpenStreetMap','attribution':'© OpenStreetMap contributors','copyrightUrl':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/',
            'snapshot':export['osm3s']['timestamp_osm_base'],'snapshotType':export.get('snapshotType','OSM Overpass base timestamp'),'geometry':'Real mapped road centerlines and building footprints; community map, not a topographic survey',
            'simulation':'Vehicle movement, scenario schedules and priorities are illustrative, not real-time or historical observations',
            'note':'Los jardines y las farolas son paisajismo representativo de muestra; no son límites de propiedad, un catastro de áreas verdes ni posiciones de luminarias levantadas en terreno. Los árboles sin altura medida utilizan una estimación visual de 7.2–8 m.',
            'projection':'WGS84 ellipsoid ECEF to local east/north tangent plane at center; x=east, z=-north, y=up; metres'}
    scene={'schemaVersion':1,'name':'José Caracci / José Zapiola','center':CENTER,'bounds':BOUNDS,'contextBounds':CONTEXT_BOUNDS,
           'mapView':{'center':[CENTER['lng'],CENTER['lat']],'zoom':18.6,'pitch':52,'bearing':0},
           'roads':roads,'buildings':buildings,'routes':routes,'props':props,'gardens':gardens,'source':source,'assetsManifest':'/traffic/models/assets-manifest.json'}
    geometry_qa=validate_geometry(scene,models,elements)
    provenance={'schemaVersion':1,'source':source,'query':args.query.read_text(),'queryBoundingBox':SOURCE_BBOX,
                'downloadFile':args.source.name,'downloadSha256':hashlib.sha256(raw).hexdigest(),'originalWayCount':sum(e['type']=='way' for e in elements),
                'transform':{'origin':CENTER,'earthModel':'WGS84, a=6378137 m, e²=0.0066943799901413165','coordinates':'x east, z south, y up; all lengths in metres',
                             'buildingRotation':'Three.js rotation.y = -atan2(world-z edge, world-x edge), adjusted 90° if model footprint fits better rotated',
                             'buildingFit':'Minimum-area rotated OSM roof rectangle; detailed house mesh fills 91% of each plan dimension. uniformScale gives a representative 4–7 m height; scaleXZ adjusts horizontal axes moderately. Concave recesses are approximated instead of shrinking the whole house into a tiny inscribed rectangle. Road and neighboring-model intersections are rejected.',
                             'facadeOrientation':'Choose the 180-degree variant facing the nearest mapped driving road. This is illustrative, not observed facade orientation.',
                             'modelReconstruction':'Detailed downloaded meshes represent typologies. They do not replicate individual local facades or surveyed elevations.',
                             'roadWidths':'OSM width where present; otherwise lane count ×3.15 m +0.30 m or a declared highway-type estimate',
                             'routing':'Directed graph from shared original OSM nodes, limited to the public José Caracci and José Zapiola ways. Oneway=-1 reverses edges; one-way direction honored. Private/no-access ways and the southern condominium access excluded.',
                             'vehicleLane':'Right-side offset in travel direction; representative lanes, not surveyed lane markings. No spline across adjacent parcels.'},
                'selection':{'buildings':bqa,'routing':rqa,'roadCount':len(roads),'vehicleRoutes':5,'props':len(props),'gardens':len(gardens),
                             'curatedGardenTreeChoices':{str(osm_id):choice for osm_id,choice in CURATED_GARDEN_TREE_CHOICES.items()}},
                'geometryValidation':geometry_qa,
                'processedElementIds':{'roads':sorted(set(r['osmWayId'] for r in roads)),'buildings':[b['osmWayId'] for b in buildings],'trees':[p['osmNodeId'] for p in props if 'osmNodeId' in p]},
                'visualReference':{'provider':'Google Maps satellite, manually reviewed by the parent agent','url':'https://www.google.com/maps/@-33.4488839,-70.5489312,19z/data=!3m1!1e3','reviewedOn':'2026-11-03',
                                   'observations':'T junction: José Caracci extends north from José Zapiola. Low-rise 1–2 storey houses, grey/beige/terracotta roofs and front gardens. Southern access belongs to private Condominio Los Cipreses; no invented continuation. No traffic signal observed from overhead imagery.',
                                   'use':'Visual corroboration only; no Google imagery copied, packaged, or used as a texture.'},
                'limitations':['No turn-restriction relations were requested in this small export; routes honor way direction and shared nodes, not every traffic regulation.',
                               'No live data or historical speed observations are used.','Widths and untagged building heights are estimates for demonstration.',
                               'Imported low-poly house meshes are representative typologies; roof envelopes and positions come from OSM, but facades are not surveyed reconstructions.',
                               'Garden trees marked as representative are decorative inferred planting, not a tree inventory. Mapped tree nodes retain their OSM IDs. No traffic signal is placed because none was verified.',
                               'Lawn rings extend an illustrative 3 m beyond house envelopes, clipped to pavement clearances and free gaps between neighbors. They do not denote real property boundaries. Four streetlights are a representative lighting sample, not verified locations.']}
    args.out_dir.mkdir(parents=True,exist_ok=True)
    (args.out_dir/'scene.json').write_text(json.dumps(scene,ensure_ascii=False,indent=2)+'\n')
    (args.out_dir/'sources.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
    if args.preview_dir:preview(scene,args.preview_dir)
    print(json.dumps({'roads':len(roads),'buildings':len(buildings),'routes':len(routes),'buildingSelection':bqa,'graph':rqa,'routesSummary':[{k:r[k] for k in ('id','length','streets')} for r in routes]},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
