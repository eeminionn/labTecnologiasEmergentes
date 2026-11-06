#!/usr/bin/env python3
"""Prepare a reproducible camera demonstration intermediate, with explicit provenance.

The final CSV is authored and checked by test-results/camaras/finalize-camera-csv.mjs.
Published road intersections locate representative sites, not surveyed camera positions.
"""
from pathlib import Path
from collections import Counter, defaultdict
from datetime import date, timedelta
import csv
import hashlib
import json
import math
import random

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/camaras'
SOURCES = ROOT / 'Documentos/fuentes-camaras'
PUBLIC = ROOT / 'public/analysis'
COUNT = 320
SEED = 20261108
CHECKED = '2026-11-06'
PDF_URL = 'https://www.lareina.cl/wp-content/uploads/2020/06/Cuenta_Publica_2018_-_Consolidado.pdf#page=113'
CANADA_URL = 'https://lareina.cl/barrio-comercial-la-canada/'
FIELDS = ['id', 'categoria', 'tipo_camara', 'direccion', 'latitud', 'longitud',
          'fecha_instalacion', 'estado', 'origen_ubicacion', 'precision_ubicacion',
          'fuente_url', 'fuente_fecha', 'datos_operativos', 'observacion']


def distance(a, b):
    return math.hypot((a['lon'] - b['lon']) * 92900, (a['lat'] - b['lat']) * 111200)


def inside_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i, (x, y, *_) in enumerate(ring):
        xj, yj = ring[j][:2]
        if (y > lat) != (yj > lat) and lon < (xj - x) * (lat - y) / (yj - y) + x:
            inside = not inside
        j = i
    return inside


def haversine(lon1, lat1, lon2, lat2):
    radians = math.pi / 180
    a, b = lat1 * radians, lat2 * radians
    h = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin((lon2 - lon1) * radians / 2) ** 2
    return 2 * 6371008.8 * math.asin(min(1, math.sqrt(h)))


def apply_2024_scenario(rows, locations):
    """Keep only two inventory sites at each of three dense 2024 incident areas.

    All coordinates, sources, types and states are preserved. The demonstration
    changes installation dates only, delaying selected sites until 2025.
    """
    preserved_fields = [field for field in FIELDS if field != 'fecha_instalacion']
    preserved_values = [[float(row[field]) if field in ['latitud', 'longitud'] else row[field]
                         for field in preserved_fields] for row in rows]
    preserved_hash = hashlib.sha256(json.dumps(preserved_values, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    with (PUBLIC / 'seguridad-simulada.csv').open(encoding='utf-8') as source:
        incidents = [row for row in csv.DictReader(source) if row['fecha'].startswith('2024-')]
    radius = 650
    xscale = 6371008.8 * math.pi / 180 * math.cos(-33.447 * math.pi / 180)
    yscale = 6371008.8 * math.pi / 180
    def xy(lon, lat):
        return lon * xscale, lat * yscale
    buckets = defaultdict(list)
    for row in incidents:
        point = xy(float(row['longitud']), float(row['latitud']))
        buckets[(math.floor(point[0] / radius), math.floor(point[1] / radius))].append(point)
    ranked = []
    for index, point in enumerate(locations[::8]):
        x, y = xy(point['lon'], point['lat'])
        column, line = math.floor(x / radius), math.floor(y / radius)
        count = sum((px - x) ** 2 + (py - y) ** 2 <= radius ** 2
                    for dx in [-1, 0, 1] for dy in [-1, 0, 1]
                    for px, py in buckets[(column + dx, line + dy)])
        ranked.append((count, index, point))
    centers = []
    for count, index, point in sorted(ranked, key=lambda item: (-item[0], item[1])):
        if all(haversine(point['lon'], point['lat'], other['lon'], other['lat']) >= 1400 for other in centers):
            centers.append(point)
            if len(centers) == 3:
                break
    original_dates = {row['id']: row['fecha_instalacion'] for row in rows}
    zones = []
    for center in centers:
        def nearby(row):
            return haversine(center['lon'], center['lat'], float(row['longitud']), float(row['latitud'])) <= radius
        local = [row for row in rows if nearby(row)]
        earlier = [row for row in local if row['fecha_instalacion'] <= '2024-12-31']
        published = [row for row in earlier if row['origen_ubicacion'] == 'publicada']
        assert len(published) <= 2
        remaining = sorted((row for row in earlier if row not in published),
                           key=lambda row: (haversine(center['lon'], center['lat'], float(row['longitud']), float(row['latitud'])), int(row['id'])))
        keep = {row['id'] for row in published + remaining[:2 - len(published)]}
        for row in earlier:
            if row['id'] not in keep:
                offset = int(hashlib.sha256(f"{SEED}:escenario2024:{row['id']}".encode()).hexdigest()[:8], 16) % 365
                row['fecha_instalacion'] = (date(2025, 1, 1) + timedelta(days=offset)).isoformat()
        zones.append({
            'referencia': center['direction'], 'latitud': center['lat'], 'longitud': center['lon'],
            'radio_metros': radius,
            'incidentes_2024': sum(nearby(row) for row in incidents),
            'camaras_2024_antes': len(earlier),
            'camaras_2024_despues': sum(row['fecha_instalacion'] <= '2024-12-31' for row in local),
            'camaras_2025': len(local),
            'ids_camaras_conservadas_2024': sorted(keep, key=int),
        })
    changed = [{'id': row['id'], 'antes': original_dates[row['id']], 'despues': row['fecha_instalacion']}
               for row in rows if row['fecha_instalacion'] != original_dates[row['id']]]
    return {
        'version': 1, 'solicitud': 'Ejemplo de sectores con más robos y pocas cámaras instaladas al cierre de 2024.',
        'metodo': 'Tres focos de mayor conteo de incidentes de 2024 en una muestra regular de ubicaciones viales, separados al menos 1.400 metros. Se conserva un máximo de dos cámaras al cierre de 2024 por radio de 650 metros; las demás instalaciones del escenario se retrasan a 2025.',
        'campos_modificados': ['fecha_instalacion'],
        'campos_conservados': preserved_fields, 'sha256_campos_conservados': preserved_hash,
        'cantidad_fechas_retrasadas': len(changed), 'fechas_retrasadas': changed, 'zonas': zones,
        'alcance': 'Relación construida para mostrar la utilidad del cruce. No describe robos, cobertura ni fechas de instalación reales. La proximidad no acredita cobertura visual.',
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)
    locations = json.loads((PUBLIC / 'ubicaciones.json').read_text())
    boundary = json.loads((ROOT / 'assets/la-reina.geojson').read_text())
    geometry = boundary['features'][0]['geometry'] if boundary['type'] == 'FeatureCollection' else boundary['geometry'] if boundary['type'] == 'Feature' else boundary
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    def in_commune(p):
        return any(inside_ring(p['lon'], p['lat'], rings[0]) and
                   not any(inside_ring(p['lon'], p['lat'], hole) for hole in rings[1:]) for rings in polygons)
    roads = defaultdict(list)
    for p in locations:
        if in_commune(p):
            roads[p['street']].append(p)
    published = [
        ('Carlos Nazarit', 'Avenida Blest Gana', 'Carlos Nazarit / Blest Gana'),
        ('Avenida Larraín', 'Avenida Tobalaba', 'Larraín / Tobalaba'),
        ('Avenida Carlos Ossandón', 'Avenida Simón Bolívar', 'Carlos Ossandón / Simón Bolívar'),
        ('María Monvel', 'Avenida Las Perdices', 'María Monvel / Las Perdices'),
        ('Álvaro Casanova', 'Carpay', 'Álvaro Casanova / Carpay'),
        ('23 de Febrero', 'Avenida Padre Hurtado', '23 de Febrero / Padre Hurtado'),
        ('Valenzuela Puelma', 'Avenida Carlos Ossandón', 'Valenzuela Puelma / Carlos Ossandón'),
        ('Doctor Axel Munthe', 'Florencio Barrios', 'Axel Munthe / Florencio Barrios'),
        ('Avenida Echeñique', 'Vicente Pérez Rosales', 'Echeñique / Vicente Pérez Rosales'),
        ('Calle Diputada Laura Rodríguez Riccomini', 'Avenida Alcalde Fernando Castillo Velasco', 'Laura Rodríguez / Fernando Castillo Velasco'),
        ('La Cañada', 'Monseñor Edwards', 'Barrio Comercial La Cañada / Monseñor Edwards'),
    ]
    rng = random.Random(SEED)
    selected = []
    evidence = []
    for a, b, label in published:
        assert roads[a] and roads[b], f'Falta vía: {a} / {b}'
        p, q = min(((p, q) for p in roads[a] for q in roads[b]), key=lambda pair: distance(*pair))
        assert distance(p, q) < 15, f'Cruce ambiguo: {label}'
        source = CANADA_URL if label.startswith('Barrio') else PDF_URL
        detail = (
            'La nota municipal informa siete cámaras en el barrio, sin posiciones individuales. '
            'Se representa un emplazamiento del barrio en su cruce de referencia, no una cámara verificada en este poste.'
            if label.startswith('Barrio') else
            'Cruce citado en proyecto Torres Unidas de Cuenta Pública 2018, página PDF 113, en proceso de instalación. '
            'No confirma instalación final ni operación actual.'
        )
        note = detail + ' Coordenada aproximada sobre la red vial. Fecha de instalación, tipo y estado simulados. Fecha exacta de publicación no identificada.'
        selected.append(dict(p, direction=label, source=source, note=note, origin='publicada'))
        evidence.append({'direccion_publicada': label, 'vias_usadas': [a, b],
                         'latitud_aproximada': p['lat'], 'longitud_aproximada': p['lon'],
                         'distancia_entre_muestras_viales_metros': round(distance(p, q), 2),
                         'fuente_url': source, 'fuente_fecha': '', 'consulta': CHECKED,
                         'alcance': detail, 'precision_ubicacion': 'aproximada'})
    # Spread the synthetic sites over real road samples. A few clusters make the
    # density display useful, while spacing avoids repeating the same camera.
    candidates = [p for p in locations if in_commune(p)]
    rng.shuffle(candidates)
    for p in candidates:
        if all(distance(p, other) >= 65 for other in selected):
            selected.append(dict(p, source='', origin='simulada', note=
                'Emplazamiento ficticio sobre calle real de OpenStreetMap. Numeración, fecha de instalación, tipo y estado simulados.'))
            if len(selected) == COUNT:
                break
    assert len(selected) == COUNT
    assert len({(p['lat'], p['lon']) for p in selected}) == COUNT
    rows = []
    start = date(2023, 1, 1)
    span = (date(2025, 12, 31) - start).days
    for index, p in enumerate(selected):
        installed = start + timedelta(days=rng.randrange(span + 1))
        # Published sites are available in every annual demonstration. The
        # chosen installation dates remain scenario inputs, not historical facts.
        if p['origin'] == 'publicada':
            installed = start + timedelta(days=rng.randrange(180))
        rows.append({
            'id': str(index + 1), 'categoria': 'Cámaras',
            'tipo_camara': rng.choices(['Domo', 'Fija', 'Lectora de patentes'], [45, 40, 15])[0],
            'direccion': p['direction'], 'latitud': f"{p['lat']:.6f}", 'longitud': f"{p['lon']:.6f}",
            'fecha_instalacion': installed.isoformat(),
            'estado': rng.choices(['Operativa', 'Mantención', 'Inactiva'], [78, 13, 9])[0],
            'origen_ubicacion': p['origin'],
            'precision_ubicacion': 'aproximada' if p['origin'] == 'publicada' else 'simulada',
            'fuente_url': p['source'], 'fuente_fecha': '', 'datos_operativos': 'simulados',
            'observacion': p['note'],
        })
    scenario = apply_2024_scenario(rows, locations)
    with (OUT / 'camaras-intermedio.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    metadata = {
        'titulo': 'Cámaras de seguridad en La Reina: base de demostración',
        'descripcion': '320 emplazamientos representativos. Once ubicaciones proceden de dos publicaciones municipales, geocodificadas aproximadamente. El resto y todos los datos operativos son simulados.',
        'categoria': 'Cámaras', 'cantidad': len(rows), 'archivo': 'camaras-seguridad.csv',
        'etiqueta': 'Base mixta · Datos operativos simulados', 'semilla': SEED,
        'consulta_fuentes': CHECKED, 'delimitador': ',', 'codificacion': 'UTF-8',
        'columnas': FIELDS,
        'periodo': {'desde': '2023-01-01', 'hasta': '2025-12-31'},
        'por_origen_ubicacion': dict(Counter(row['origen_ubicacion'] for row in rows)),
        'por_estado': dict(Counter(row['estado'] for row in rows)),
        'por_tipo': dict(Counter(row['tipo_camara'] for row in rows)),
        'por_ano_instalacion': dict(sorted(Counter(row['fecha_instalacion'][:4] for row in rows).items())),
        'por_mes_instalacion': dict(sorted(Counter(row['fecha_instalacion'][:7] for row in rows).items())),
        'campos_simulados_en_todas_las_filas': ['fecha_instalacion', 'tipo_camara', 'estado'],
        'campos_publicados': 'Solo la referencia de ubicación de once emplazamientos. Las coordenadas no fueron publicadas: se aproximan al cruce de las vías citadas.',
        'precision': 'Un punto representa un emplazamiento de demostración, no un poste o dispositivo levantado en terreno. La Cañada representa un sector con siete cámaras publicadas, sin inferir siete posiciones.',
        'filtro_temporal': 'Inventario al cierre del período elegido: incluye fecha_instalacion menor o igual al último día del año o mes. No cuenta solo altas ocurridas durante ese período.',
        'estado': 'Estado estático de demostración. No es disponibilidad en tiempo real ni historial de mantenciones.',
        'geografia': {'sistema_coordenadas': 'WGS84', 'limite': 'SUBDERE / IDE Chile, DPA 2023',
                      'calles': 'OpenStreetMap contributors', 'separacion_minima_simulada_metros': 65},
        'escenario_2024': scenario,
        'fuentes': [
            {'nombre': 'Municipalidad de La Reina. Cuenta Pública 2018', 'url': PDF_URL,
             'localizador': 'Página PDF 113, Iluminación y cámaras de seguridad Torres Unidas',
             'uso': 'Diez cruces explícitos de un proyecto informado en proceso de instalación. No acredita vigencia actual.',
             'fecha_publicacion': '', 'periodo_documento': '2018'},
            {'nombre': 'Municipalidad de La Reina. La nueva cara del Barrio Comercial La Cañada', 'url': CANADA_URL,
             'uso': 'Un emplazamiento representativo en La Cañada con Monseñor Edwards. La nota informa siete cámaras sin posiciones individuales.',
             'fecha_publicacion': ''},
            {'nombre': 'OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright',
             'uso': 'Geometría y nombres de calles, no inventario de cámaras.', 'licencia': 'ODbL 1.0'},
        ],
        'alcance': 'No es un catastro completo ni vigente del sistema municipal. No permite inferir zonas sin vigilancia, cobertura efectiva ni disponibilidad real de dispositivos.',
    }
    (PUBLIC / 'camaras-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    (SOURCES / 'ubicaciones-publicadas.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'registros': len(rows), 'publicadas': len(evidence), 'simuladas': COUNT - len(evidence),
                      'por_ano': metadata['por_ano_instalacion'], 'por_estado': metadata['por_estado']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
