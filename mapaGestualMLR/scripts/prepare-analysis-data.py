#!/usr/bin/env python3
"""Prepare reproducible, explicitly synthetic security events on real OSM streets.

The intermediate CSV is authored/verified by the paired Artifact Tool builder.
No incident, resolution rate or street number is an observed municipal record.
"""
import argparse
import bisect
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import random
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261106
COUNT = 60000
FIELDS = ['id', 'categoria', 'tipo_incidente', 'direccion', 'latitud', 'longitud', 'fecha', 'hora', 'dia_semana', 'resuelto', 'origen']
WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
TYPES = ['Robo con intimidación', 'Robo por sorpresa', 'Robo de vehículo', 'Robo en lugar habitado', 'Robo en lugar no habitado']
ALLOWED_ROADS = {'residential', 'living_street', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'unclassified', 'service'}


def inside(lon, lat, ring):
    yes = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            yes = not yes
    return yes


def metres(a, b):
    return math.hypot((b[0] - a[0]) * 111320 * math.cos(math.radians(-33.447)), (b[1] - a[1]) * 111320)


def load_ways(sources):
    ways = {}
    for source in sources:
        if source.suffix == '.json':
            raw = json.loads(source.read_text())
            for element in raw.get('elements', []):
                if element.get('type') == 'way' and element.get('geometry'):
                    ways[element['id']] = {'id': element['id'], 'tags': element.get('tags', {}),
                        'points': [(p['lon'], p['lat']) for p in element['geometry']]}
        else:
            xml = ET.parse(source).getroot()
            nodes = {int(n.attrib['id']): (float(n.attrib['lon']), float(n.attrib['lat'])) for n in xml.findall('node')}
            for way in xml.findall('way'):
                refs = [int(n.attrib['ref']) for n in way.findall('nd')]
                if all(ref in nodes for ref in refs):
                    ways[int(way.attrib['id'])] = {'id': int(way.attrib['id']),
                        'tags': {tag.attrib['k']: tag.attrib['v'] for tag in way.findall('tag')}, 'points': [nodes[ref] for ref in refs]}
    return [way for way in ways.values() if way['tags'].get('highway') in ALLOWED_ROADS
        and way['tags'].get('name') and way['tags'].get('access') not in {'private', 'no'}]


def create_locations(ways, ring):
    names_by_point = defaultdict(set)
    for way in ways:
        for point in way['points']:
            names_by_point[point].add(way['tags']['name'])
    locations = {}
    for point, names in names_by_point.items():
        if len(names) >= 2 and inside(*point, ring):
            lon, lat = (round(point[0], 6), round(point[1], 6))
            if inside(lon, lat, ring):
                locations[(lon, lat)] = {'lon': lon, 'lat': lat, 'street': sorted(names)[0], 'direction': ' / '.join(sorted(names)[:2])}
    road_metres = 0
    for way in ways:
        name = way['tags']['name']
        walked = 0
        for a, b in zip(way['points'], way['points'][1:]):
            length = metres(a, b)
            parts = max(1, math.ceil(length / 55))
            for part in range(parts):
                fraction = (part + .5) / parts
                lon = round(a[0] + (b[0] - a[0]) * fraction, 6)
                lat = round(a[1] + (b[1] - a[1]) * fraction, 6)
                if inside(lon, lat, ring):
                    # Numbers are intentionally synthetic, never geocoded house addresses.
                    number = 100 + (int(abs(lon * 1000000 + lat * 100000)) % 8000)
                    locations.setdefault((lon, lat), {'lon': lon, 'lat': lat, 'street': name, 'direction': f'{name} {number} (numeración simulada)'})
                    road_metres += length / parts
            walked += length
    return sorted(locations.values(), key=lambda item: (item['lon'], item['lat'])), road_metres


def temporal_location_tables(locations):
    """Illustrative spatial changes belong to the records, not the colour ramp.

    Annual concentrations occupy different sectors; two smaller monthly
    concentrations move around the street network. No observed crime pattern
    or historical municipality statistic is used to choose these locations.
    """
    annual_targets = {
        2023: [(-70.572, -33.437), (-70.566, -33.448), (-70.548, -33.434)],
        2024: [(-70.565, -33.457), (-70.548, -33.455), (-70.573, -33.443)],
        2025: [(-70.521, -33.442), (-70.529, -33.454), (-70.543, -33.445)]
    }
    monthly_targets = [(lon, lat) for lat in [-33.437, -33.447, -33.457]
                       for lon in [-70.576, -70.559, -70.542, -70.525]]

    def nearest(target):
        place = min(locations, key=lambda item: metres((item['lon'], item['lat']), target))
        return place['lon'], place['lat']

    annual = {year: [nearest(target) for target in targets] for year, targets in annual_targets.items()}
    monthly = [nearest(target) for target in monthly_targets]
    tables = {}
    for year, peaks in annual.items():
        for month in range(1, 13):
            # Leap to a different real street sector each month. Annual offsets
            # keep the same calendar month from repeating the same map yearly.
            active = (month - 1 + (year - 2023) * 3) % len(monthly)
            components = list(zip(peaks, [4, 2, 1], [400, 300, 250]))
            components += [(monthly[active], 9.5, 180), (monthly[(active + 5) % len(monthly)], 3.5, 220)]
            cumulative, total = [], 0
            for place in locations:
                position = place['lon'], place['lat']
                weight = .035
                for peak, intensity, radius in components:
                    weight += intensity * math.exp(-.5 * (metres(position, peak) / radius) ** 2)
                total += weight
                cumulative.append(total)
            tables[(year, month)] = cumulative
    return tables


def generate(sources, intermediate, output, count=COUNT):
    boundary = json.loads((ROOT / 'assets/la-reina.geojson').read_text())
    ring = boundary['features'][0]['geometry']['coordinates'][0]
    ways = load_ways(sources)
    locations, length = create_locations(ways, ring)
    if len(locations) < 500 or len({p['street'] for p in locations}) < 70:
        raise ValueError('La red cartográfica no cubre suficientes calles de la comuna.')
    rng = random.Random(SEED)
    peaks = rng.sample(locations, 9)
    weighted = []
    total = 0
    for place in locations:
        weight = .28
        for index, peak in enumerate(peaks):
            distance = metres((place['lon'], place['lat']), (peak['lon'], peak['lat']))
            weight += (1.5 + index * .27) * math.exp(-.5 * (distance / (190 + index * 35)) ** 2)
        total += weight
        weighted.append(total)
    start = dt.date(2023, 1, 1)
    last = dt.date(2025, 12, 31)
    days = (last - start).days + 1
    hour_weights = [1.2, 1, .8, .6, .5, .5, .7, 1.5, 2, 1.3, 1, 1, 1.2, 1.4, 1.6, 1.8, 2.3, 3, 3.8, 4.3, 4, 3, 2.2, 1.7]
    spatial_rng = random.Random(SEED + 1)
    temporal_tables = temporal_location_tables(locations)
    prepared_rows = []
    observed = set()
    for index in range(count):
        # A first pass covers each representative street position at least once.
        place_index = index if index < len(locations) else bisect.bisect_right(weighted, rng.random() * total)
        place = locations[place_index]
        observed.add(place_index)
        date = start + dt.timedelta(days=rng.randrange(days))
        hour = rng.choices(range(24), weights=hour_weights, k=1)[0]
        minute = rng.randrange(60)
        kind_index = rng.choices(range(len(TYPES)), weights=[25, 28, 19, 17, 11], k=1)[0]
        resolved = rng.random() < (.34 + kind_index * .035 + .03 * math.sin(hour / 24 * math.tau))
        original_direction = place['direction']
        if index >= len(locations):
            cumulative = temporal_tables[(date.year, date.month)]
            place_index = bisect.bisect_right(cumulative, spatial_rng.random() * cumulative[-1])
            place = locations[place_index]
            observed.add(place_index)
        row = [0, 'Seguridad', TYPES[kind_index], place['direction'], f"{place['lat']:.6f}", f"{place['lon']:.6f}",
               date.isoformat(), f'{hour:02}:{minute:02}', WEEKDAYS[date.weekday()], 'sí' if resolved else 'no', 'simulado']
        # Stable IDs and non-spatial fields remain identical to the previous
        # delivery, including ties in date/time formerly sorted by direction.
        prepared_rows.append(((row[6], row[7], original_direction), row))
    prepared_rows.sort(key=lambda item: item[0])
    rows = [row for _, row in prepared_rows]
    for index, row in enumerate(rows, 1):
        row[0] = index
    intermediate.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    with intermediate.open('w', encoding='utf-8', newline='') as file:
        writer = csv.writer(file, lineterminator='\n')
        writer.writerow(FIELDS)
        writer.writerows(rows)
    metadata = {
        'titulo': 'Seguridad en La Reina: base histórica simulada', 'descripcion': '60.000 incidentes ficticios para probar la sección Análisis. No representan denuncias, delitos ni resoluciones reales.',
        'origen': 'simulado', 'etiqueta': 'Datos simulados · Demostración', 'cantidad': len(rows), 'semilla': SEED,
        'periodo': {'desde': rows[0][6], 'hasta': rows[-1][6]}, 'archivo': 'seguridad-simulada.csv', 'delimitador': ',', 'codificacion': 'UTF-8',
        'columnas': FIELDS, 'categoria': 'Seguridad', 'tipos_incidente': TYPES,
        'resuelto': {'sí': sum(row[9] == 'sí' for row in rows), 'no': sum(row[9] == 'no' for row in rows)},
        'por_ano': dict(sorted(Counter(row[6][:4] for row in rows).items())),
        'por_mes': dict(sorted(Counter(row[6][:7] for row in rows).items())),
        'geografia': {'sistema_coordenadas': 'WGS84', 'limite': 'SUBDERE / IDE Chile, DPA 2023',
            'calles_distintas': len({p['street'] for p in locations}), 'ubicaciones_representativas': len(locations), 'ubicaciones_utilizadas': len(observed),
            'longitud_vial_metros': round(length), 'bbox_incidentes': [min(p['lon'] for p in locations), min(p['lat'] for p in locations), max(p['lon'] for p in locations), max(p['lat'] for p in locations)],
            'alcance': 'Ubicaciones representativas sobre calles reales, recortadas al límite de La Reina. La numeración es simulada. Los cerros sin calles no reciben incidentes inventados.'},
        'metodo': 'Muestreo reproducible sobre la red vial pública. Cobertura general de todas las ubicaciones representativas y concentraciones espaciales distintas para cada año y mes. Fechas, horarios, tipos y resolución sintéticos, sin calibración estadística con delitos reales.',
        'patrones_temporales': {'version_simulacion': 2, 'semilla_espacial': SEED + 1,
            'alcance': 'Los focos anuales cambian de sector y dos focos mensuales se desplazan por calles reales. Son decisiones de demostración, no tendencias históricas observadas.',
            'campos_conservados': ['id', 'categoria', 'tipo_incidente', 'fecha', 'hora', 'dia_semana', 'resuelto', 'origen']},
        'fuentes': [{'nombre': 'OpenStreetMap contributors', 'uso': 'Calles y cruces; no incidentes', 'url': 'https://www.openstreetmap.org/copyright', 'licencia': 'ODbL 1.0', 'descarga': '2026-11-06'}],
        'archivos_fuente': [{'archivo': str(source.relative_to(ROOT)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()} for source in sources],
        'tamano_bytes': intermediate.stat().st_size, 'sha256': hashlib.sha256(intermediate.read_bytes()).hexdigest()
    }
    (output / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    # Compact locations retain street provenance and are useful for geographic checks.
    (output / 'ubicaciones.json').write_text(json.dumps(locations, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'registros': len(rows), 'calles': metadata['geografia']['calles_distintas'], 'ubicaciones': len(locations), 'longitud_km': round(length / 1000, 2), 'intermedio': str(intermediate)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', action='append', type=Path)
    parser.add_argument('--intermediate', type=Path, default=ROOT / 'test-results/analysis/seguridad-intermedio.csv')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/analysis')
    args = parser.parse_args()
    sources = args.source or [ROOT / 'Documentos/fuentes-analisis/calles-la-reina.json']
    if not sources:
        raise ValueError('Faltan los archivos cartográficos de calles de La Reina.')
    generate([source.resolve() for source in sources], args.intermediate, args.output)
