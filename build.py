#!/usr/bin/env python3
"""
Build pc.js — concatenates src/ files into a single ES module bundle.

Usage:
    python3 build.py [output_path]

Default output: ../jubo-line-badminton-check-in-system/docs/design/pc.js
"""
import re, os, sys

src_dir = os.path.join(os.path.dirname(__file__), 'src')
default_output = os.path.join(
    os.path.dirname(__file__),
    '../jubo-line-badminton-check-in-system/docs/design/pc.js'
)
output = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else default_output)

files = [
    ('styles.js',        'lib'),
    ('store.js',         'lib'),
    ('note-comments.js', 'lib'),
    ('index.js',         'entry'),
]

parts = []
for fname, role in files:
    with open(os.path.join(src_dir, fname)) as f:
        content = f.read()

    if role == 'lib':
        # Strip 'export ' prefix from top-level declarations
        content = re.sub(r'^export (const|function|async function|class) ', r'\1 ', content, flags=re.MULTILINE)
    else:
        # entry: strip import lines (keep export on initPrototypeComments)
        content = re.sub(r'^import\s+\{[^}]+\}\s+from\s+[\'"][^\'\"]+[\'"];?\n?', '', content, flags=re.MULTILINE)

    parts.append(content.rstrip())

result = '\n\n'.join(parts) + '\n'

def _write(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(result)
    print(f'Built {path} ({len(result):,} chars)')

_write(output)
# 同步輸出一份到本 repo dist/（e2e harness 載入 + 未來 CDN release artifact，見 SSOT §4.6）
_write(os.path.join(os.path.dirname(__file__), 'dist', 'pc.js'))
