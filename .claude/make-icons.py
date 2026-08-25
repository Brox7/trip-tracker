"""Generate the app icons as PNGs, with no image library available.

Writes raw RGBA and compresses it with zlib — a PNG is not much more than that.
The mark matches the app's brand: a coral gradient tile with a white paper plane.
"""
import zlib, struct

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    out = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(out)

# the paper plane, in 0..1 space
PLANE = [(0.10,0.52),(0.90,0.11),(0.56,0.90),(0.45,0.63),(0.10,0.52)]
FOLD  = [(0.45,0.63),(0.90,0.11),(0.56,0.90),(0.45,0.63)]

def inside(poly, x, y):
    n, c = len(poly), False
    for i in range(n-1):
        x1,y1 = poly[i]; x2,y2 = poly[i+1]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1+1e-12)+x1:
            c = not c
    return c

def lerp(a, b, t): return tuple(round(a[i]+(b[i]-a[i])*t) for i in range(3))
TOP, BOT = (0xFF,0x5A,0x6E), (0xD3,0x12,0x6A)

def build(size, rounded=True, inset=0.0):
    SS = 3                                   # supersample for smooth edges
    W = size
    px = bytearray(W*W*4)
    r = size*0.22 if rounded else 0
    for y in range(W):
        for x in range(W):
            hits = plane = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = (x + (sx+0.5)/SS); fy = (y + (sy+0.5)/SS)
                    # rounded-rect test
                    inx = min(fx, W-fx); iny = min(fy, W-fy)
                    ok = True
                    if r:
                        if inx < r and iny < r:
                            ok = ((r-inx)**2 + (r-iny)**2) <= r*r
                    if not ok: continue
                    hits += 1
                    # plane glyph, kept inside a safe zone for maskable icons
                    gx = (fx/W - inset) / (1 - 2*inset)
                    gy = (fy/W - inset) / (1 - 2*inset)
                    if 0 <= gx <= 1 and 0 <= gy <= 1 and inside(PLANE, gx, gy):
                        plane += 1
            total = SS*SS
            if not hits: continue
            a = round(255 * hits/total)
            base = lerp(TOP, BOT, y/W)
            pf = plane/total
            col = tuple(round(base[i] + (255-base[i])*pf) for i in range(3))
            i = (y*W + x)*4
            px[i:i+4] = bytes((col[0], col[1], col[2], a))
    return px

for name, size, rounded, inset in [
    ('icons/icon-192.png', 192, True, 0.18),
    ('icons/icon-512.png', 512, True, 0.18),
    ('icons/icon-maskable-512.png', 512, False, 0.28),   # full bleed, glyph in the safe zone
    ('icons/apple-touch-icon.png', 180, False, 0.18),    # iOS applies its own rounding
]:
    png(name, size, size, build(size, rounded, inset))
    print(f'  {name}')
