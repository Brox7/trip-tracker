"""Bake Thailand's outline into map-data.js as SVG paths.

Needs tha50.json alongside this script: the Thailand feature from Natural
Earth's 1:50m admin-0 countries set. It is a one-time download and is not
kept in the repo, so this script only runs when you actually want to
regenerate the map — map-data.js is committed and does not change.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

src = os.path.join(HERE, 'tha50.json')
if not os.path.exists(src):
    raise SystemExit(
        'tha50.json not found next to genmap.py.\n'
        'Download the Thailand feature from Natural Earth 1:50m admin-0 countries '
        'and save it there. map-data.js is already committed, so you only need '
        'this to change the map.')

f = json.load(open(src))
g = f['geometry']
polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
rings = [p[0] for p in polys]                      # outer ring of each polygon

mx = lambda lon: math.radians(lon)
my = lambda lat: math.log(math.tan(math.pi/4 + math.radians(lat)/2))

lons = [c[0] for r in rings for c in r]
lats = [c[1] for r in rings for c in r]
lonMin, lonMax, latMin, latMax = min(lons), max(lons), min(lats), max(lats)

H = 900.0
k = H / (my(latMax) - my(latMin))
proj = lambda lon, lat: ((mx(lon) - mx(lonMin)) * k, (my(latMax) - my(lat)) * k)
W = (mx(lonMax) - mx(lonMin)) * k

def simplify(pts, tol):                            # perpendicular-distance decimation
    if len(pts) < 4: return pts
    out = [pts[0]]
    for p in pts[1:-1]:
        a, b = out[-1], p
        if (a[0]-b[0])**2 + (a[1]-b[1])**2 >= tol*tol: out.append(p)
    out.append(pts[-1])
    return out

paths, kept = [], 0
for r in rings:
    pts = [proj(c[0], c[1]) for c in r]
    pts = simplify(pts, 1.6)
    if len(pts) < 4: continue
    area = abs(sum(pts[i][0]*pts[i-1][1] - pts[i-1][0]*pts[i][1] for i in range(len(pts)))) / 2
    if area < 12: continue                          # drop specks that would render as dust
    kept += 1
    d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z'
    paths.append(d)

PAD = 58
vb = f'{-PAD:.0f} {-PAD:.0f} {W+2*PAD:.0f} {H+2*PAD:.0f}'
out = f"""/* Thailand outline, baked at build time from Natural Earth 50m admin-0.
   Mercator projection; `proj` lets the app place lat/lon on the same grid.
   No runtime network access, no map library. */
window.TH_MAP = {{
  viewBox: '{vb}',
  w: {W:.1f}, h: {H:.1f}, pad: {PAD},
  proj: {{ lonMin: {lonMin:.6f}, latMax: {latMax:.6f}, k: {k:.4f} }},
  land: [
{chr(10).join("    '" + p + "'," for p in paths)}
  ]
}};
"""
open(os.path.join(ROOT, 'map-data.js'), 'w').write(out)
print(f'rings kept {kept}/{len(rings)} | W {W:.0f} H {H:.0f} | bbox lon {lonMin:.2f}..{lonMax:.2f} lat {latMin:.2f}..{latMax:.2f}')
print('bytes', len(out))
