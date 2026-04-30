#!/usr/bin/env python3
import os, re, json
from urllib.parse import urlsplit, unquote

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'web'))
OUT_PREVIEW = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'link_changes_preview.txt'))
OUT_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), 'proposed_changes.json'))
OUT_APPLIER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'apply_proposed_changes.py'))

skip_prefixes = ('http://','https://','mailto:','tel:','javascript:','//')
attr_regex = re.compile(r'(?:href|src)\s*=\s*"([^"]+)"')
js_string_regex = re.compile(r'["\']([^"\']+\.(?:html|css|js|svg|png|jpg|jpeg|gif))(?:["\'])')

changes = []

for dirpath, dirnames, filenames in os.walk(ROOT):
    for fname in filenames:
        if not fname.lower().endswith(('.html','.htm','.js')):
            continue
        fpath = os.path.join(dirpath, fname)
        rel_fpath = os.path.relpath(fpath, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
        try:
            txt = open(fpath, encoding='utf-8').read()
        except Exception as e:
            print('skip', fpath, 'read error', e)
            continue
        found = []
        if fname.lower().endswith(('.html','.htm')):
            for m in attr_regex.findall(txt):
                found.append(m)
        # also scan JS files and inline strings in HTML/JS
        for m in js_string_regex.findall(txt):
            if m not in found:
                found.append(m)

        for target in found:
            if not target or target.startswith(skip_prefixes) or target.startswith('#') or target.startswith('/'):
                continue
            if '${' in target or '{{' in target or '}}' in target:
                # template placeholder — skip
                continue
            sp = urlsplit(target)
            path_only = unquote(sp.path)
            resolved = os.path.normpath(os.path.join(dirpath, path_only))
            exists = os.path.exists(resolved) or os.path.exists(resolved + '.html')
            # only create replacements for files under ROOT
            abs_root = os.path.abspath(ROOT)
            abs_resolved = os.path.abspath(resolved)
            if not abs_resolved.startswith(abs_root):
                note = 'outside_web'
                replacement = None
            else:
                rel_to_root = os.path.relpath(abs_resolved, abs_root).replace('\\','/')
                if rel_to_root.startswith('assets/'):
                    replacement = '/' + rel_to_root
                elif rel_to_root.startswith('pages/'):
                    replacement = '/' + rel_to_root
                else:
                    replacement = '/' + rel_to_root
                if sp.query:
                    replacement += '?' + sp.query
                if sp.fragment:
                    replacement += '#' + sp.fragment
                note = 'ok'
            if replacement and replacement == target:
                continue
            changes.append({
                'file': rel_fpath.replace('\\','/'),
                'original': target,
                'resolved': abs_resolved,
                'exists': exists,
                'replacement': replacement,
                'note': note
            })

# write human preview
with open(OUT_PREVIEW, 'w', encoding='utf-8') as out:
    if not changes:
        out.write('No replacements proposed.\n')
    else:
        byfile = {}
        for c in changes:
            byfile.setdefault(c['file'], []).append(c)
        total = 0
        for f, items in sorted(byfile.items()):
            out.write(f'File: {f}\n')
            for it in items:
                total += 1
                out.write(f"  - {it['original']}  ->  {it['replacement']}  (exists={it['exists']}) note={it['note']}\n")
            out.write('\n')
        out.write(f'Total proposed replacements: {total}\n')

# write JSON for applier
with open(OUT_JSON, 'w', encoding='utf-8') as j:
    json.dump(changes, j, indent=2, ensure_ascii=False)

# write simple applier script (not executed)
applier = f'''#!/usr/bin/env python3
import json, os
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA = os.path.join(os.path.dirname(__file__), 'proposed_changes.json')
with open(DATA, encoding='utf-8') as f:
    changes = json.load(f)
byfile = {{}}
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
'''
with open(OUT_APPLIER, 'w', encoding='utf-8') as ap:
    ap.write(applier)

print('Preview written to', OUT_PREVIEW)
print('JSON written to', OUT_JSON)
print('Applier script written to', OUT_APPLIER)
