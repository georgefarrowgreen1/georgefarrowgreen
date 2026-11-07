#!/usr/bin/env python3
"""Stage a new data lock for review; this never changes a running router."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
import hashlib,json,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'data.lock.json';lock=json.loads(path.read_text())
with tempfile.TemporaryDirectory(prefix='inflite-uk-update-') as temp:
 folder=Path(temp)
 def get(item):
  name=item['file'];target=folder/name;headers=folder/(name+'.headers')
  subprocess.run(['curl','-fsSL','--retry','2','--max-time','180','-D',str(headers),lock['source']+name,'-o',str(target)],check=True)
  size=target.stat().st_size
  if size<1000 or size>256*1024*1024:raise RuntimeError('Unexpected routing segment size: '+name)
  # A reviewed lock is promoted only after container integrity/UK probes pass.
  with target.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  return {'file':name,'bytes':size,'sha256':sha}
 with ThreadPoolExecutor(max_workers=3) as pool:lock['files']=list(pool.map(get,lock['files']))
 lock['date']=datetime.now(timezone.utc).strftime('%Y-%m-%d')
 path.write_text(json.dumps(lock,indent=2)+'\n')
 print('Staged new UK routing data lock. Run the verified-container workflow before merging/deploying it.')
