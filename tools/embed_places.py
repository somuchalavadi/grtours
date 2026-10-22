"""Copy sections/assistant/data/places.json into the Trip Planner page.

build.py only copies images, so the place data lives inside the section's script, between the markers
/*DATA-START*/ and /*DATA-END*/. Edit places.json, then run:

    python tools/embed_places.py && python build.py
"""
import json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'sections', 'assistant', 'data', 'places.json')
PAGE = os.path.join(BASE, 'sections', 'assistant', 'index.html')
START, END = '/*DATA-START*/', '/*DATA-END*/'
FIELDS = ['district', 'area', 'area_town', 'place', 'category', 'hours', 'description', 'note']
CATEGORIES = {'temple', 'beach', 'waterfall', 'heritage', 'viewpoint', 'nature', 'fort', 'island', 'wildlife', 'park', 'adventure'}


def js(value):
    # compact JSON that is safe inside a <script> tag
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    neighbours, places = data['neighbours'], data['places']

    problems = []
    for p in places:
        missing = [f for f in FIELDS if f not in p]
        if missing:
            problems.append('%s: missing %s' % (p.get('place', '?'), ', '.join(missing)))
        elif p['category'] not in CATEGORIES:
            problems.append('%s: unknown category "%s"' % (p['place'], p['category']))
        elif p['area'] not in neighbours:
            problems.append('%s: area "%s" is not in neighbours' % (p['place'], p['area']))
    names = [p.get('place') for p in places]
    problems += ['duplicate place name: %s' % n for n in sorted({n for n in names if names.count(n) > 1})]
    for a, near in neighbours.items():
        problems += ['neighbour "%s" of "%s" is not an area' % (b, a) for b in near if b not in neighbours]
    if problems:
        sys.exit('places.json has problems:\n  ' + '\n  '.join(problems))

    # one place per line keeps the page readable and diffs small
    body = '{\n"neighbours":' + js(neighbours) + ',\n"places":[\n' + ',\n'.join(js({f: p[f] for f in FIELDS}) for p in places) + '\n]}'

    page = open(PAGE, encoding='utf-8').read()
    i, j = page.find(START), page.find(END)
    if i < 0 or j < i:
        sys.exit('markers %s ... %s not found in %s' % (START, END, PAGE))
    page = page[:i + len(START)] + body + page[j:]
    with open(PAGE, 'w', encoding='utf-8', newline='\n') as f:
        f.write(page)
    print('embedded %d places in %d areas into %s' % (len(places), len(neighbours), os.path.relpath(PAGE, BASE)))


if __name__ == '__main__':
    main()
