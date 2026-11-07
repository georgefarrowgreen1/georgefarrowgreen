#!/usr/bin/env python3
"""Materialise a checksum-pinned engine and UK snapshot before the image is built."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, os, shutil, subprocess, zipfile
ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'data.lock.json').read_text())
OUT=ROOT/'.build';OUT.mkdir(exist_ok=True)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def download(url,path,want):
 if path.exists() and digest(path)==want:return
 path.parent.mkdir(parents=True,exist_ok=True)
 mirror=Path(os.environ.get('ROUTING_SNAPSHOT_DIR','/nonexistent'))/path.name
 if mirror.exists():shutil.copyfile(mirror,path)
 else:
  part=path.with_suffix(path.suffix+'.part')
  subprocess.run(['curl','-fsSL','--retry','2','--max-time','180',url,'-o',str(part)],check=True)
  part.replace(path)
 if digest(path)!=want:raise RuntimeError(f'{path.name}: checksum differs; use the owned snapshot or review a map-data update')
engine=LOCK['engine'];archive=OUT/'engine.zip';download(engine['url'],archive,engine['sha256'])
with zipfile.ZipFile(archive) as z:
 prefix='brouter-'+engine['version']+'/'
 (OUT/'brouter.jar').write_bytes(z.read(prefix+'brouter-'+engine['version']+'-all.jar'))
 (OUT/'profiles').mkdir(exist_ok=True)
 (OUT/'profiles/lookups.dat').write_bytes(z.read(prefix+'profiles2/lookups.dat'))
 for name,upstream in [('road','fastbike'),('mixed','trekking')]:
  text=(ROOT/'profiles/road.brf').read_text() if name=='road' else z.read(prefix+'profiles2/'+upstream+'.brf').decode()
  # Intermediate points only shape loops; never force a dead-end visit and U-turn.
  text=text.replace('assign correctMisplacedViaPoints = false','assign correctMisplacedViaPoints = true').replace('assign correctMisplacedViaPointsDistance = 400','assign correctMisplacedViaPointsDistance = 0')
  text=text.replace('---context:global','---context:global\n# InFlite: snap via points to a nearby cycleable road; the API separately limits the start to 250 m.\nassign waypointCatchingRange = 1000',1)
  (OUT/'profiles'/f'{name}.brf').write_text(text)
def get(item):
 path=OUT/'segments'/item['file'];download(LOCK['source']+item['file'],path,item['sha256'])
 if path.stat().st_size!=item['bytes']:raise RuntimeError('Wrong segment length: '+item['file'])
with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(get,LOCK['files']))
version=LOCK['date']+'-'+hashlib.sha256((ROOT/'data.lock.json').read_bytes()).hexdigest()[:12]+'-'+digest(ROOT/'profiles/road.brf')[:12]
(OUT/'version.txt').write_text(version+'\n')
files=[OUT/'brouter.jar',OUT/'version.txt',*sorted((OUT/'profiles').glob('*')),*sorted((OUT/'segments').glob('*.rd5'))]
(OUT/'SHA256SUMS').write_text(''.join(digest(p)+'  '+str(p.relative_to(OUT))+'\n' for p in files))
# Keep the pinned release archive for the owned R2 snapshot.
print(json.dumps({'snapshot':version,'tiles':len(LOCK['files']),'bytes':sum(i['bytes'] for i in LOCK['files'])}))
