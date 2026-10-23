"""Copy the Trip Planner's data and engine into its section page.

build.py only copies images and drops <script src> tags, so both live inside sections/assistant/index.html:
  - sections/assistant/data/places.json  ->  between /*DATA-START*/ and /*DATA-END*/
  - sections/assistant/planner.js        ->  between /*PLANNER-START*/ and /*PLANNER-END*/
Edit either file, then run:

    python tools/embed_places.py && python build.py
"""
import json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTION = os.path.join(BASE, 'sections', 'assistant')
SRC = os.path.join(SECTION, 'data', 'places.json')
ENGINE = os.path.join(SECTION, 'planner.js')
PAGE = os.path.join(SECTION, 'index.html')
FIELDS = ['district', 'area', 'area_town', 'place', 'category', 'hours', 'description', 'note', 'top', 'hard']
CATEGORIES = {'temple', 'beach', 'waterfall', 'heritage', 'viewpoint', 'nature', 'fort', 'island', 'wildlife', 'park', 'adventure'}
STARTS = ['Murdeshwar', 'Udupi', 'Mangaluru Airport', 'Goa', 'Hubballi Airport']


def js(value):
    # compact JSON that is safe inside a <script> tag
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


def check(data):
    neighbours, areas, starts, places = data['neighbours'], data['areas'], data['starts'], data['places']
    problems = []
    for p in places:
        missing = [f for f in FIELDS if f not in p]
        if missing:
            problems.append('%s: missing %s' % (p.get('place', '?'), ', '.join(missing)))
            continue
        if p['category'] not in CATEGORIES:
            problems.append('%s: unknown category "%s"' % (p['place'], p['category']))
        if p['area'] not in neighbours or p['area'] not in areas:
            problems.append('%s: area "%s" needs an entry in neighbours and areas' % (p['place'], p['area']))
        if not isinstance(p['top'], bool) or not isinstance(p['hard'], bool):
            problems.append('%s: "top" and "hard" must be true or false' % p['place'])
    names = [p.get('place') for p in places]
    problems += ['duplicate place name: %s' % n for n in sorted({n for n in names if names.count(n) > 1})]
    for a, near in neighbours.items():
        problems += ['neighbour "%s" of "%s" is not an area' % (b, a) for b in near if b not in neighbours]
    for name, pt in list(areas.items()) + list(starts.items()):
        if not isinstance(pt, dict) or not all(isinstance(pt.get(k), (int, float)) for k in ('lat', 'lng')):
            problems.append('"%s" needs numeric lat and lng' % name)
    problems += ['starts is missing "%s"' % s for s in STARTS if s not in starts]
    return problems


def put(page, start, end, body):
    i, j = page.find(start), page.find(end)
    if i < 0 or j < i:
        sys.exit('markers %s ... %s not found in %s' % (start, end, PAGE))
    return page[:i + len(start)] + body + page[j:]


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    problems = check(data)
    if problems:
        sys.exit('places.json has problems:\n  ' + '\n  '.join(problems))
    engine = open(ENGINE, encoding='utf-8').read()
    if '</script' in engine.lower():
        sys.exit('planner.js must not contain "</script"')

    # one place per line keeps the page readable and diffs small
    body = ('{\n"neighbours":' + js(data['neighbours']) + ',\n"areas":' + js(data['areas']) + ',\n"starts":' + js(data['starts']) +
            ',\n"places":[\n' + ',\n'.join(js({f: p[f] for f in FIELDS}) for p in data['places']) + '\n]}')

    page = open(PAGE, encoding='utf-8').read()
    page = put(page, '/*DATA-START*/', '/*DATA-END*/', body)
    page = put(page, '/*PLANNER-START*/', '/*PLANNER-END*/', '\n' + engine.strip() + '\n')
    with open(PAGE, 'w', encoding='utf-8', newline='\n') as f:
        f.write(page)
    print('embedded %d places in %d areas and planner.js into %s' % (len(data['places']), len(data['neighbours']), os.path.relpath(PAGE, BASE)))


if __name__ == '__main__':
    main()
