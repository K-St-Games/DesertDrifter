#!/usr/bin/env python3
"""Check assets/sprites/*.png against art/palette.hex and art/sprites.json. Exits 1 on any violation.

Rules: every opaque pixel is a palette colour, alpha is 0 or 255 only, frame size matches sprites.json
(the road only has to be a palette image), no visible pixel touches a frame edge for sprites.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
pal = {tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in (ROOT / 'art' / 'palette.hex').read_text().split()}
sizes = {k: v for k, v in json.loads((ROOT / 'art' / 'sprites.json').read_text()).items() if not k.startswith('_')}
bad = 0
for path in sorted((ROOT / 'assets' / 'sprites').glob('*.png')):
    name = path.stem
    a = np.array(Image.open(path).convert('RGBA'))
    problems = []
    want = sizes[name]['size'] if isinstance(sizes.get(name), dict) else sizes.get(name)
    if want and a.shape[:2] != (want, want):
        problems.append(f'size {a.shape[1]}x{a.shape[0]} != {want}')
    if name != 'road' and name not in sizes:
        problems.append('not listed in art/sprites.json')
    if not np.isin(a[..., 3], (0, 255)).all():
        problems.append('alpha not 0/255')
    off = {tuple(c) for c in np.unique(a[a[..., 3] == 255][:, :3], axis=0)} - pal
    if off:
        problems.append(f'{len(off)} off-palette colours')
    if name in sizes:
        vis = a[..., 3] > 0
        if vis[0].any() or vis[-1].any() or vis[:, 0].any() or vis[:, -1].any():
            problems.append('art touches the frame edge (no margin)')
    print(('FAIL ' if problems else 'ok   ') + f'{name:11s} ' + '; '.join(problems))
    bad += bool(problems)
sys.exit(1 if bad else 0)
