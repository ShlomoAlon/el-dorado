import re,glob,sys
files=['src/client/shell.html']+[f for f in glob.glob('src/client/*.js')+glob.glob('src/client/board/*.js') if not f.endswith(('art.js','meeple.js','train.html'))]
fs=set();rad=set();hexes=set();inl=0;hexn=0
for f in files:
    s=open(f).read()
    if f.endswith('shell.html'):
        # drop the tokens block (definitions don't count as uses) and the <symbol> art
        s=re.sub(r'/\*TOKENS\*/.*?/\*END TOKENS\*/','',s,flags=re.S)
        s=re.sub(r'<svg width="0".*?</svg>','',s,flags=re.S)
    fs|=set(re.findall(r'font-size:\s*([\d.]+px)',s)); fs|=set(re.findall(r'font:\s*\d+\s+([\d.]+px)',s))
    rad|=set(re.findall(r'border-radius:\s*([^;}"]+)',s))
    h=re.findall(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])',s); hexes|=set(x.lower() for x in h)
    inl+=len(re.findall(r'style="',s))
print(f'font sizes (px, distinct): {len(fs)}\nborder radii (distinct): {len(rad)}\nhex colours (distinct): {len(hexes)}\ninline style=" (count): {inl}')
if '-v' in sys.argv: print(sorted(fs,key=lambda x:float(x[:-2])),sorted(rad),sorted(hexes))
# the chrome alone: shell.html's CSS without the art rules (card faces, deck back, board background)
s=open('src/client/shell.html').read()
s=re.sub(r'/\*TOKENS\*/.*?/\*END TOKENS\*/','',s,flags=re.S); s=s[:s.index('<svg width="0"')]
ART=('.k-','.c-','.cface','.back','#vp','.mcard','.card.dpick')
lines=[l for l in s.split('\n') if not l.lstrip().startswith(ART)]; c='\n'.join(lines)
print('chrome CSS only: font sizes',len(set(re.findall(r'font-size:\s*([\d.]+px)',c))),'radii',len(set(re.findall(r'border-radius:\s*([^;}"]+)',c))),'hex',len(set(x.lower() for x in re.findall(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])',c))))
