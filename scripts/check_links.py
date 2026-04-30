import re
import os
from urllib.parse import urlsplit, unquote

ROOT = os.path.join(os.getcwd(), 'web')

link_re = re.compile(r'(?:href|src)\s*=\s*"([^"]+)"')
base_re = re.compile(r'<base[^>]+href\s*=\s*"([^"]+)"', re.I)

def norm_path(ref, src_dir, base_href):
    # ignore external and schemes
    if ref.startswith(('http://','https://','mailto:','tel:','javascript:','//')):
        return None
    # strip fragment and query
    ref = unquote(urlsplit(ref)._replace(query='',fragment='').geturl())
    # resolve leading / as root of web
    if ref.startswith('/'):
        return os.path.normpath(os.path.join(ROOT, ref.lstrip('/')))
    # apply base_href if present and ref is relative
    if base_href:
        # base may be absolute or relative; handle simple relative paths
        if base_href.startswith(('http://','https://','/')):
            # treat as root-relative when starts with /
            if base_href.startswith('/'):
                base_dir = os.path.normpath(os.path.join(ROOT, base_href.lstrip('/')))
            else:
                return None
        else:
            base_dir = os.path.normpath(os.path.join(src_dir, base_href))
        candidate = os.path.normpath(os.path.join(base_dir, ref))
        # if base_href points to a file, use its dir
        if os.path.isfile(candidate):
            return candidate
        # otherwise ensure path
        return candidate
    # normal relative
    return os.path.normpath(os.path.join(src_dir, ref))

def find_links(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        txt = f.read()
    base_m = base_re.search(txt)
    base = base_m.group(1) if base_m else None
    links = link_re.findall(txt)
    return base, links

broken = []
all_checked = 0

for dirpath, dirnames, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.lower().endswith(('.html','.htm','.js')):
            continue
        path = os.path.join(dirpath, fn)
        base, links = find_links(path)
        # treat component files and JS templates as rooted at web/
        if '\\components\\' in path.replace('/', '\\') or path.lower().endswith('.js'):
            src_dir = ROOT
        else:
            src_dir = dirpath
        for ref in links:
            # skip JS templating placeholders
            if '${' in ref or 'encodeURIComponent' in ref:
                continue
            tgt = norm_path(ref, src_dir, base)
            if tgt is None:
                continue
            # if target has no extension, try adding .html
            tgt_check = tgt
            if not os.path.splitext(tgt_check)[1]:
                if os.path.exists(tgt_check + '.html'):
                    tgt_check = tgt_check + '.html'
            all_checked += 1
            # fallback: also try resolving from web root
            if not os.path.exists(tgt_check):
                root_try = os.path.normpath(os.path.join(ROOT, ref))
                if os.path.exists(root_try):
                    tgt_check = root_try
                elif os.path.exists(root_try + '.html'):
                    tgt_check = root_try + '.html'
                else:
                    broken.append((path, ref, tgt_check))

if not broken:
    print('No broken links found. Scanned %d link references.' % all_checked)
else:
    print('Broken links:')
    for src, ref, tgt in broken:
        print(f'- In {os.path.relpath(src)} -> {ref}  (resolved: {os.path.relpath(tgt)})')
    print('\nTotal broken: %d' % len(broken))
