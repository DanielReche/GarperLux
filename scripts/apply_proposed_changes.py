#!/usr/bin/env python3
import json, os
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA = os.path.join(os.path.dirname(__file__), 'proposed_changes.json')
with open(DATA, encoding='utf-8') as f:
    changes = json.load(f)
byfile = {}
for c in changes:
    path = os.path.join(BASE, c['file'])
    byfile.setdefault(path, []).append(c)
for path, items in byfile.items():
    if not os.path.exists(path):
        print('skip missing', path)
        continue
    txt = open(path, encoding='utf-8').read()
    newtxt = txt
    for it in items:
        newtxt = newtxt.replace(it['original'], it['replacement'])
    if newtxt != txt:
        backup = path + '.bak'
        open(backup, 'w', encoding='utf-8').write(txt)
        open(path, 'w', encoding='utf-8').write(newtxt)
        print('patched', path, 'backup->', backup)
print('Done. Reviewed', len(byfile), 'files.')
