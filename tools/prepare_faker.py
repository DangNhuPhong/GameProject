"""Extract the approved four-view concept into transparent game animation cells.

Usage: python tools/prepare_faker.py <approved-concept.png>
"""
from pathlib import Path
import sys
from PIL import Image, ImageOps

source = Image.open(sys.argv[1]).convert('RGBA')
target = Path(__file__).resolve().parents[1] / 'frontend/src/assets/characters'
# Exclude captions and preserve the full star assembly and wheels.
boxes = [(120, 48, 510, 592), (675, 48, 1075, 592),
         (120, 685, 470, 1208), (725, 685, 1080, 1208)]
views = []
for box in boxes:
    cell = source.crop(box)
    # The concept's cream background includes the gaps inside the chair frame.
    # Remove only pale neutral background pixels, retaining skin and silver metal.
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, a = cell.getpixel((x, y))
            if r > 230 and g > 220 and b > 208 and r - b < 30:
                cell.putpixel((x, y), (r, g, b, 0))
    views.append(cell.crop(cell.getchannel('A').getbbox()))
scale = min(122 / max(v.width for v in views), 152 / max(v.height for v in views))
sheet = Image.new('RGBA', (512, 640))
for row, view in enumerate(views):
    view = view.resize((round(view.width * scale), round(view.height * scale)), Image.Resampling.LANCZOS)
    # The engine mirrors right-facing profiles; compensate to preserve the logo.
    if row == 3:
        view = ImageOps.mirror(view)
    for col in range(4):
        # A restrained one-pixel rolling bounce; the character stays seated.
        bounce = 1 if col in (1, 3) else 0
        sheet.alpha_composite(view, (col * 128 + (128 - view.width) // 2,
                                     row * 160 + 158 - view.height - bounce))
sheet.save(target / 'faker.png')
sheet.crop((0, 0, 128, 160)).save(target / 'faker-portrait.png')
print('Prepared Faker: four directions, transparent sheet and portrait.')
