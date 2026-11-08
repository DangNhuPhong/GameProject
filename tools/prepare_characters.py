"""Extract generated character animation cells into the game's 128x160 grid."""
from PIL import Image
from pathlib import Path
import sys

source = Image.open(sys.argv[1]).convert('RGBA')
target = Path(__file__).resolve().parents[1] / 'frontend/src/assets/characters'
target.mkdir(parents=True, exist_ok=True)
frames = []
asymmetric = '--asymmetric' in sys.argv
names = [name for name in sys.argv[2:] if name != '--asymmetric'] or ['pepper', 'mint', 'sage']
row_count = 4 if asymmetric else 3
columns = 4 * len(names)
for character in range(len(names)):
    cells = []
    for row in range(row_count):
        for col in range(4):
            x = character * 4 + col
            row_edges = tuple(index/row_count for index in range(row_count+1)) if len(names) == 1 else (0, .32, .64, 1)
            cell = source.crop((round(x*source.width/columns), round(row_edges[row]*source.height), round((x+1)*source.width/columns), round(row_edges[row+1]*source.height)))
            # Keep the main connected silhouette, discarding detached generation specks.
            alpha = cell.getchannel('A')
            pixels = alpha.load()
            seen, largest = set(), []
            for py in range(cell.height):
                for px in range(cell.width):
                    if (px, py) in seen or pixels[px, py] < 32:
                        continue
                    stack, component = [(px, py)], []
                    seen.add((px, py))
                    while stack:
                        point = stack.pop()
                        component.append(point)
                        for nx, ny in ((point[0]-1, point[1]), (point[0]+1, point[1]), (point[0], point[1]-1), (point[0], point[1]+1)):
                            if 0 <= nx < cell.width and 0 <= ny < cell.height and (nx, ny) not in seen and pixels[nx, ny] >= 32:
                                seen.add((nx, ny)); stack.append((nx, ny))
                    if len(component) > len(largest): largest = component
            mask = Image.new('L', cell.size)
            for point in largest: mask.putpixel(point, pixels[point])
            cell.putalpha(mask)
            cells.append(cell.crop(mask.getbbox()))
    frames.append(cells)

scale = min(122/max(f.width for c in frames for f in c), 154/max(f.height for c in frames for f in c))
for name, cells in zip(names, frames):
    sheet = Image.new('RGBA', (512, 160*row_count))
    for index, frame in enumerate(cells):
        frame = frame.resize((round(frame.width*scale), round(frame.height*scale)), Image.Resampling.NEAREST)
        sheet.alpha_composite(frame, ((index%4)*128+(128-frame.width)//2, (index//4)*160+159-frame.height))
    sheet.save(target / f'{name}.png')
    sheet.crop((0, 0, 128, 160)).save(target / f'{name}-portrait.png')
print(f'Prepared {len(names)} animation sheets (512x{160*row_count}) and portraits.')
