#!/usr/bin/env python3
"""
Build pc.js — concatenates src/ ES modules into a single ES module bundle.

Modules are auto-discovered by following relative imports from the entry
(src/index.js) and concatenated in dependency order (deps first, entry last),
with import / re-export-from / export-declaration syntax stripped. Adding a new
src/draw/*.js therefore requires no edit here: as long as it is reachable from
index.js (directly or transitively) it is picked up automatically. Files not
reachable from the entry (e.g. src/spec-overlay.js, src/draw-overlay.js) are
intentionally excluded, exactly as the old hand-maintained list did.

A size regression guard refuses to write a bundle smaller than MIN_BYTES: after
the Phase 2 split (draw-layer.js became a thin re-export barrel over src/draw/*),
a stale file list silently dropped every src/draw/* module and shipped a stunted
~106KB bundle over dist/pc.js — the CDN single source of truth for all
live-markup courses. The guard fails closed so that can never ship unnoticed.

Usage:
    python3 build.py [output_path]

Default output: ../jubo-line-badminton-check-in-system/docs/design/pc.js
Always also writes: dist/pc.js (CDN release artifact + e2e harness source).
"""
import re, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ENTRY = 'index.js'          # bundle entry, relative to SRC
MIN_BYTES = 250 * 1024      # regression guard; healthy bundle is ~300KB

DEFAULT_OUTPUT = os.path.join(
    ROOT, '../jubo-line-badminton-check-in-system/docs/design/pc.js')

# Captures the specifier of a static import or a re-export-from, including the
# multi-line `export { a, b, ... } from '...'` barrel form.
_FROM_SPEC = re.compile(
    r"(?:^import\s+[\s\S]*?\s+from|^export\s*\{[\s\S]*?\}\s*from)"
    r"\s*['\"]([^'\"]+)['\"]",
    re.MULTILINE)


def deps_of(rel):
    """Relative-import targets of `rel` that resolve to a real file under SRC."""
    with open(os.path.join(SRC, rel), encoding='utf-8') as f:
        text = f.read()
    out = []
    for spec in _FROM_SPEC.findall(text):
        if not spec.startswith('.'):
            continue  # bare/external specifier — leave untouched (none today)
        target = os.path.normpath(os.path.join(os.path.dirname(rel), spec))
        if os.path.isfile(os.path.join(SRC, target)) and target not in out:
            out.append(target)
    return out


def resolve_order(entry):
    """Post-order DFS from entry → dependency-first topological order."""
    order, done = [], set()

    def visit(rel, stack):
        if rel in done:
            return
        if rel in stack:
            sys.exit('✗ circular import: ' + ' -> '.join(stack + [rel]))
        for dep in deps_of(rel):
            visit(dep, stack + [rel])
        done.add(rel)
        order.append(rel)

    visit(entry, [])
    return order


def strip_module_syntax(text, is_entry):
    # Static imports (single- or multi-line): `import ... from '...';`
    text = re.sub(r"^import\s+[\s\S]*?\s+from\s+['\"][^'\"]+['\"];?[ \t]*\n?",
                  '', text, flags=re.MULTILINE)
    # Re-export-from (barrel), single- or multi-line: `export { ... } from '...';`
    text = re.sub(r"^export\s*\{[\s\S]*?\}\s*from\s+['\"][^'\"]+['\"];?[ \t]*\n?",
                  '', text, flags=re.MULTILINE)
    if not is_entry:
        # Deps are concatenated into shared scope: drop the `export ` prefix so
        # declarations become plain top-level bindings. The entry keeps its
        # `export`s — they are the bundle's public API (initPrototypeComments …).
        text = re.sub(r'^export (const|function|async function|class|let|var) ',
                      r'\1 ', text, flags=re.MULTILINE)
    return text


def build():
    order = resolve_order(ENTRY)
    parts = []
    for rel in order:
        with open(os.path.join(SRC, rel), encoding='utf-8') as f:
            parts.append(strip_module_syntax(f.read(), rel == ENTRY).rstrip())
    return '\n\n'.join(parts) + '\n', order


def main():
    result, order = build()
    nbytes = len(result.encode('utf-8'))

    print('Modules (%d, dependency order):' % len(order))
    for rel in order:
        print('  - src/%s' % rel)

    if nbytes < MIN_BYTES:
        sys.exit(
            '\n✗ REFUSING TO WRITE: bundle is %s bytes, below the %s-byte floor.\n'
            '  A reachable module was likely dropped (stale entry graph or a '
            'broken barrel).\n  Expected ~300KB; not overwriting dist/pc.js.'
            % (format(nbytes, ','), format(MIN_BYTES, ',')))

    output = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUTPUT)
    targets = [output, os.path.join(ROOT, 'dist', 'pc.js')]
    for path in targets:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(result)
        print('Built %s (%s bytes, %s chars)'
              % (path, format(nbytes, ','), format(len(result), ',')))


if __name__ == '__main__':
    main()
