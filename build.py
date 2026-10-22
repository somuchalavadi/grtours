"""Combine the approved section pages into one site without changing how any section looks or behaves.

Each section keeps its own CSS, but every selector is scoped under a wrapper class, :root/body rules move onto
that wrapper, keyframe names get a per-section suffix, element ids get a per-section prefix (and every
script/CSS/SVG reference to them is updated), and image paths point at assets/<section>/.
"""
import os, re, shutil, tinycss2

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'site')   # built website goes here
SECTIONS = [  # (key, source folder, wrapper id used by the nav/footer links)
    ('hero',     'sections/hero',          'home'),
    ('route',    'sections/coastal-route', 'route'),
    ('services', 'sections/services',      'services'),
    ('plans',    'sections/tour-plans',    'plans'),
    ('vehicles', 'sections/vehicles',      'vehicles'),
    ('footer',   'sections/footer',        'contact'),
    ('assistant', 'sections/assistant',    'assistant'),
]
SHARED_SYMBOLS = None  # symbol ids (<symbol id=...>) stay global; they are identical icons

def ser(tokens):
    return tinycss2.serialize(tokens)

def scope_selector(sel, scope):
    out = []
    for part in sel.split(','):
        p = part.strip()
        if not p:
            continue
        # :root / html / body become the wrapper itself
        m = re.match(r'^(:root|html|body)\b(.*)$', p)
        if m:
            rest = m.group(2)
            out.append(scope + rest)
            continue
        if p == '*':
            out.append(scope); out.append(scope + ' *'); continue
        out.append(scope + ' ' + p)
    return ', '.join(out)

def rename_anims_in_decls(text, ren):
    def fix(m):
        prop, val = m.group(1), m.group(2)
        for a, b in ren.items():
            val = re.sub(r'(?<![\w-])' + re.escape(a) + r'(?![\w-])', b, val)
        return prop + val
    return re.sub(r'((?:-webkit-)?animation(?:-name)?\s*:)([^;}]*)', fix, text)

def scope_css(css, scope, sfx, idmap):
    rules = tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True)
    # keyframe names in this sheet
    ren = {}
    def collect(rs):
        for r in rs:
            if r.type == 'at-rule' and r.lower_at_keyword.endswith('keyframes'):
                name = ser(r.prelude).strip(); ren[name] = name + '_' + sfx
            elif r.type == 'at-rule' and r.content and r.lower_at_keyword in ('media', 'supports'):
                collect(tinycss2.parse_rule_list(r.content, skip_comments=True, skip_whitespace=True))
    collect(rules)

    def fix_ids(text):
        for a, b in idmap.items():
            text = re.sub(r'#' + re.escape(a) + r'(?![\w-])', '#' + b, text)
        return text

    def walk(rs):
        out = []
        for r in rs:
            if r.type == 'qualified-rule':
                sel = fix_ids(ser(r.prelude).strip())
                body = rename_anims_in_decls(ser(r.content), ren)
                body = re.sub(r'url\(#([\w-]+)\)', lambda m: 'url(#' + idmap.get(m.group(1), m.group(1)) + ')', body)
                out.append(scope_selector(sel, scope) + '{' + body + '}')
            elif r.type == 'at-rule':
                kw = r.lower_at_keyword
                if kw.endswith('keyframes'):
                    name = ser(r.prelude).strip()
                    out.append('@' + r.at_keyword + ' ' + ren.get(name, name) + '{' + ser(r.content) + '}')
                elif kw in ('media', 'supports') and r.content is not None:
                    inner = walk(tinycss2.parse_rule_list(r.content, skip_comments=True, skip_whitespace=True))
                    out.append('@' + r.at_keyword + ' ' + ser(r.prelude).strip() + '{' + '\n'.join(inner) + '}')
                else:
                    out.append(ser([r]))
        return out
    return '\n'.join(walk(rules))

def process(key, src, wrap_id):
    html = open(os.path.join(BASE, src, 'index.html'), encoding='utf-8').read()
    html = html.replace('<style>body{margin:0}</style>\n', '')
    styles = re.findall(r'<style>(.*?)</style>', html, flags=re.S)
    scripts = re.findall(r'<script>(.*?)</script>', html, flags=re.S)
    body = re.sub(r'<style>.*?</style>', '', html, flags=re.S)
    body = re.sub(r'<script>.*?</script>', '', body, flags=re.S)
    body = re.sub(r'<script src=[^>]*></script>', '', body)
    body = re.sub(r'<!doctype[^>]*>', '', body, flags=re.I)
    body = re.sub(r'</?(html|head|body)\b[^>]*>', '', body, flags=re.I)
    body = re.sub(r'<title>.*?</title>', '', body, flags=re.S)
    body = re.sub(r'<(meta|link)[^>]*>', '', body)

    # element ids (not icon symbols) -> prefixed
    symbol_ids = set(re.findall(r'<symbol id="([\w-]+)"', body))
    ids = [i for i in re.findall(r'\sid="([\w-]+)"', body) if i not in symbol_ids]
    idmap = {i: key + '-' + i for i in ids}

    def fix_html_ids(t):
        t = re.sub(r'(\sid=")([\w-]+)(")', lambda m: m.group(1) + idmap.get(m.group(2), m.group(2)) + m.group(3), t)
        t = re.sub(r'(href=")#([\w-]+)(")', lambda m: m.group(1) + '#' + idmap.get(m.group(2), m.group(2)) + m.group(3) if m.group(2) in idmap else m.group(0), t)
        t = re.sub(r'url\(#([\w-]+)\)', lambda m: 'url(#' + idmap.get(m.group(1), m.group(1)) + ')', t)
        t = re.sub(r'(aria-(?:labelledby|controls|describedby)=")([\w-]+)(")', lambda m: m.group(1) + idmap.get(m.group(2), m.group(2)) + m.group(3), t)
        return t
    body = fix_html_ids(body)

    def fix_js(t):
        for a, b in idmap.items():
            t = re.sub(r"getElementById\((['\"])" + re.escape(a) + r"\1\)", "getElementById('" + b + "')", t)
            t = re.sub(r"(['\"])#" + re.escape(a) + r"(?![\w-])", lambda m: m.group(1) + '#' + b, t)
        return t
    scripts = [fix_js(s) for s in scripts]

    # assets
    def fix_paths(t):
        return re.sub(r"([\"'(,\s])img/", lambda m: m.group(1) + 'assets/' + key + '/', t)
    body = fix_paths(body); scripts = [fix_paths(s) for s in scripts]
    scope = '.s-' + key
    css = '\n'.join(fix_paths(scope_css(s, scope, key, idmap)) for s in styles)
    imgdir = os.path.join(BASE, src, 'img')
    if os.path.isdir(imgdir):
        dst = os.path.join(OUT, 'assets', key); os.makedirs(dst, exist_ok=True)
        for f in os.listdir(imgdir):
            if f.endswith(('.webp', '.png', '.jpg')) and not f.endswith('_orig.webp'):
                shutil.copy(os.path.join(imgdir, f), os.path.join(dst, f))
    section = '<div class="s-' + key + '" id="' + wrap_id + '">\n' + body.strip() + '\n</div>'
    return css, section, scripts

def main():
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    css_all, secs, js_all = [], [], []
    for key, src, wid in SECTIONS:
        c, s, j = process(key, src, wid)
        css_all.append('/* ===== ' + key + ' ===== */\n' + c); secs.append(s); js_all += j
    page = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>GR Tours &amp; Travels · Murdeshwar</title>
<meta name="description" content="GR Tours &amp; Travels, Murdeshwar: taxis and tourist vehicles for the Karavali coast and the Western Ghats. Airport pickup, outstation trips, tour packages, scuba diving at Netrani and rooms. Call or WhatsApp 96209 36143.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+Kannada:wght@500;600&display=swap">
<style>
html{scroll-behavior:smooth}
body{margin:0;background:#EEF4FB;overflow-x:clip}
img{max-width:100%}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
''' + '\n'.join(css_all) + '''
</style>
</head>
<body>
''' + '\n'.join(secs) + '\n' + '\n'.join('<script>' + j + '</script>' for j in js_all) + '''
</body>
</html>
'''
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
    print('written', len(page))

main()
