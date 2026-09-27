# Builds the review images in tools/course-check/:
#   tile-<L>.jpg   BoardGameHelpers catalogue image (left) next to the same board rendered by the game, unrotated (right)
#   course-<id>.jpg  Ravensburger's setup sheet (page 2, rendered at 500 dpi and turned to match) above the game's rendering
# Needs: python3 + Pillow, pdftoppm, curl; game renders from shots.cjs in SHOTS.
#   NODE_PATH=$(npm root -g) node tools/course-check/shots.cjs /tmp/cc tiles=A,D,F,G,L,M courses=winding,witch
#   python3 tools/course-check/compose.py /tmp/cc <Wettlauf nach El Dorado_Spielaufbau.pdf>
import sys, os, subprocess
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
SHOTS, PDF = sys.argv[1], sys.argv[2]
OUT = os.path.dirname(os.path.abspath(__file__))
NUM = {'A': 1, 'B': 1, 'C': 4, 'D': 4, 'E': 5, 'F': 5, 'G': 6, 'H': 6, 'I': 7, 'J': 7, 'K': 8, 'L': 8, 'M': 9, 'N': 9}
# route id -> (crop box on the 500 dpi page, rotation that turns the sheet into the game's view, title)
COURSES = {'hills': ((450, 800, 2700, 2480), 0, 'Hills of Gold (Die goldenen Huegel) - Easy'),
           'winding': ((450, 2380, 3150, 3600), -30, 'Winding Paths (Verschlungene Wege) - Medium'),
           'witch': ((2150, 3200, 4150, 4750), 30, "Witch's Cauldron (Der Hexenkessel) - Hard")}
try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
except Exception: F = ImageFont.load_default()
def side(a, b, h, title):
    a = a.resize((round(a.width * h / a.height), h)); b = b.resize((round(b.width * h / b.height), h))
    im = Image.new('RGB', (a.width + b.width + 60, h + 80), (24, 28, 26)); im.paste(a, (20, 60)); im.paste(b, (a.width + 40, 60))
    ImageDraw.Draw(im).text((20, 14), title, fill=(240, 235, 220), font=F); return im
def stack(a, b, w, title):
    a = a.resize((w, round(a.height * w / a.width))); b = b.resize((w, round(b.height * w / b.width)))
    im = Image.new('RGB', (w + 40, a.height + b.height + 100), (24, 28, 26)); im.paste(a, (20, 60)); im.paste(b, (20, a.height + 80))
    ImageDraw.Draw(im).text((20, 14), title, fill=(240, 235, 220), font=F); return im
for f in sorted(os.listdir(SHOTS)):
    if f.startswith('game-'):
        L = f[5:-4]; cat = os.path.join(SHOTS, f'cat-{L}.gif')
        if not os.path.exists(cat):
            subprocess.run(['curl', '-sSf', '-o', cat, f'https://www.boardgamehelpers.com/QuestforElDorado/Images/Q4eD.{NUM[L]}.{L}.gif'], check=True)
        side(Image.open(cat).convert('RGB'), Image.open(os.path.join(SHOTS, f)).convert('RGB'), 700,
             f'Board {L}: catalogue image (left) / game (right), rotation 0').save(os.path.join(OUT, f'tile-{L}.jpg'), quality=86)
page = os.path.join(SHOTS, 'sheet-2.png')
if not os.path.exists(page):
    subprocess.run(['pdftoppm', '-f', '2', '-l', '2', '-r', '500', '-png', '-singlefile', PDF, page[:-4]], check=True)
for cid, (box, ang, title) in COURSES.items():
    g = os.path.join(SHOTS, f'course-{cid}.png')
    if not os.path.exists(g): continue
    sheet = Image.open(page).convert('RGB').crop(box).rotate(ang, expand=True, fillcolor=(24, 28, 26))
    stack(sheet, Image.open(g).convert('RGB'), 1500, title + (f': setup sheet turned {abs(ang)} deg' if ang else ': setup sheet') + ' (top) / game (bottom)').save(os.path.join(OUT, f'course-{cid}.jpg'), quality=86)
