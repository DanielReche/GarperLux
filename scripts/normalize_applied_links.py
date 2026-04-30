#!/usr/bin/env python3
import os, re
from urllib.parse import urlsplit, urlunsplit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'web'))
EXTS = ('.html', '.htm', '.js')
string_regex = re.compile(r'(["\'])([^"\']+\.(?:html|css|js|svg|png|jpg|jpeg|gif))\1')

def normalize_candidate(candidate):
    candidate = candidate.replace('\\', '/')
    candidate = re.sub(r'^/+\.', '/', candidate)
    candidate = re.sub(r'/+', '/', candidate)
    candidate = re.sub(r'(/pages/[^/]+/)(?:\1)+', r'\1', candidate)
    if '/pages/' in candidate:
        candidate = candidate.replace('/assets/js/', '/')
    if not candidate.startswith('/'):
        candidate = '/' + candidate.lstrip('/')
    return candidate

def candidate_variants(path):
    variants = []
    seen = set()

    def add(value):
        value = normalize_candidate(value)
        if value not in seen:
            seen.add(value)
            variants.append(value)

    add(path)
    for marker in ('/pages/', '/assets/'):
        start = 0
        while True:
            index = path.find(marker, start)
            if index == -1:
                break
            add(path[index:])
            start = index + 1
    return variants

def resolve_candidate(path):
    normalized = normalize_candidate(path)
    relative = normalized.lstrip('/')
    if os.path.exists(os.path.join(ROOT, relative)):
        return normalized
    for candidate in candidate_variants(path):
        relative = candidate.lstrip('/')
        if os.path.exists(os.path.join(ROOT, relative)):
            return candidate
    return normalized

def clean_path(path):
    # preserve query and fragment
    sp = urlsplit(path)
    if sp.scheme or sp.netloc:
        return path
    return urlunsplit((sp.scheme, sp.netloc, resolve_candidate(sp.path), sp.query, sp.fragment))

changed_files = 0
for dirpath, dirnames, filenames in os.walk(ROOT):
    for fname in filenames:
        if not fname.lower().endswith(EXTS):
            continue
        path = os.path.join(dirpath, fname)
        try:
            txt = open(path, encoding='utf-8').read()
        except Exception as e:
            print('skip', path, 'read error', e)
            continue
        newtxt = txt
        # find candidate strings
        for m in string_regex.findall(txt):
            quote, target = m
            if target.startswith(('http://','https://','mailto:','tel:','javascript:','//')):
                continue
            cleaned = clean_path(target)
            if cleaned != target:
                newtxt = newtxt.replace(quote+target+quote, quote+cleaned+quote)
        if newtxt != txt:
            bak = path + '.norm.bak'
            open(bak, 'w', encoding='utf-8').write(txt)
            open(path, 'w', encoding='utf-8').write(newtxt)
            changed_files += 1
            print('normalized', path, 'backup->', bak)

print('Done. Normalized files:', changed_files)
