"""Create web-sized catalogue assets from Tanee product Website folders.

Usage: python tools/prepare_catalogue.py "C:\\path\\to\\Tanee"
"""

import json
import re
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if SOURCE is None or not SOURCE.is_dir():
    raise SystemExit('Pass the directory containing the Tanee product folders.')

DEST = ROOT / 'assets' / 'products'
DEST.mkdir(parents=True, exist_ok=True)
products = []
views = ('Folded', 'Body', 'Pallu', 'Blouse')

for folder in sorted(SOURCE.iterdir()):
    website = folder / 'Website'
    if not website.is_dir():
        continue
    base = re.sub(r'^Tanee_', '', folder.name)
    base = re.sub(r'_9_Images$', '', base)
    slug = base.lower().replace('_', '-')
    name = base.replace('_', ' ')
    images = {}
    for view in views:
        matches = list(website.glob(f'*_{view}_Website.png'))
        if not matches:
            continue
        target = DEST / f'{slug}-{view.lower()}.webp'
        try:
            with Image.open(matches[0]) as image:
                image = image.convert('RGB')
                image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
                image.save(target, 'WEBP', quality=78, method=6)
        except OSError as error:
            print(f'Skipped damaged image: {matches[0]} ({error})', file=sys.stderr)
            target.unlink(missing_ok=True)
            continue
        images[view.lower()] = f'assets/products/{target.name}'
    if images:
        family = next((part for part in ('Ornate', 'Twill', 'Diamond', 'Check', 'Temple', 'Zigzag') if part.lower() in name.lower()), 'Classic')
        products.append({'id': slug, 'name': name, 'family': family, 'images': images})

(ROOT / 'catalogue.json').write_text(json.dumps(products, indent=2), encoding='utf-8')
print(f'Prepared {len(products)} designs and {sum(len(p["images"]) for p in products)} images.')
