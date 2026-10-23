/* GR Tours & Travels – offline trip planning engine.
 * Pure function, no DOM, no network. Works in the browser (window.GRPlanner) and in Node (module.exports).
 *
 *   GRPlanner.plan(DATA, { days: 1-4, start: 'Murdeshwar', interests: ['Beaches & Islands', ...], people: 4 })
 *
 * DATA = places.json: { neighbours, areas: {area:{lat,lng}}, starts: {name:{lat,lng}},
 *                       places: [{district, area, area_town, place, category, hours, description, note, top, hard}] }
 *
 * How it plans
 *  - Drive time is estimated from town coordinates (straight line x 1.3 road factor, 50 km/h average on these roads).
 *  - Each day picks one base area (plus areas within ~50 min of it) that gives the most value for the chosen interests,
 *    minus the drive to get there. Interests not yet covered earn a bonus, so a mixed choice is spread over the days.
 *  - The trip never drives more than ~4.5 h in a day, and the last day must be able to get back to the pickup point.
 *  - Inside a day: matching must-see places first, then other matching places, then (only to reach 3 stops) nearby
 *    must-see highlights. Hard places only when their own category was chosen, at most one a day, never for 8+ people.
 *  - Deterministic: the same inputs always give the same plan.
 */
(function (root) {
  'use strict';

  var INTERESTS = {
    'Waterfalls': ['waterfall'],
    'Beaches & Islands': ['beach', 'island'],
    'Temples & Heritage': ['temple', 'heritage'],
    'Nature & Adventure': ['nature', 'viewpoint', 'park', 'adventure'],
    'Wildlife': ['wildlife'],
    'Historical Forts': ['fort']
  };
  var CAT_LABEL = { waterfall: 'waterfalls', beach: 'beaches', island: 'islands', temple: 'temples', heritage: 'heritage',
    nature: 'nature', viewpoint: 'viewpoints', park: 'parks', adventure: 'adventure', wildlife: 'wildlife', fort: 'forts' };
  var INTEREST_SHORT = { 'Waterfalls': 'Waterfalls', 'Beaches & Islands': 'Beaches', 'Temples & Heritage': 'Temples',
    'Nature & Adventure': 'Nature', 'Wildlife': 'Wildlife', 'Historical Forts': 'Forts' };

  var DAY_HOURS = 10;         // a full touring day incl. driving (about 8 am to 6 pm)
  var MAX_DRIVE_H = 4.5;      // longest drive allowed in one day
  var NEAR_H = 0.85;          // areas this close to the base can be added to the same day
  var STOP_GAP_H = 0.35;      // local driving / parking between two stops in the same area
  var FOOD = {
    'Uttara Kannada': ['Neer dosa with fish curry', 'Kadubu with coconut chutney', 'Goli baje and filter coffee'],
    'Ghats': ['Jolada rotti with ennegai', 'Kadubu with coconut chutney', 'Akki rotti with chutney'],
    'Udupi': ['Udupi vegetarian thali', 'Goli baje and filter coffee', 'Masala dosa'],
    'Dakshina Kannada': ['Kori rotti', 'Mangalorean fish curry', 'Mangalore buns'],
    'Nearby (border)': ['Local vegetarian meals', 'Neer dosa with fish curry', 'Filter coffee and snacks']
  };
  // the region's best-known sights: always planned first when their kind is chosen
  var STAR = {}; ['Jog Falls', 'Om Beach', 'Murdeshwar Temple & Shiva Statue', 'Sri Krishna Matha', 'Mahabaleshwar Temple',
    'Netrani Island', 'Kollur Mookambika Temple', "St Mary's Island", 'Yana Rocks', 'Mirjan Fort', 'Malpe Beach',
    'Sri Marikamba Temple', 'Dharmasthala Manjunatha Temple', 'Kukke Subramanya Temple', 'Kali River Rafting',
    'Unchalli (Lushington) Falls', 'Sathodi Falls', 'Devbagh Beach', 'Kudle Beach', 'Panambur Beach'].forEach(function (n) { STAR[n] = 1; });
  // the six places most visitors come for
  ['Jog Falls', 'Om Beach', 'Murdeshwar Temple & Shiva Statue', 'Sri Krishna Matha', 'Mahabaleshwar Temple',
    'Dandeli Wildlife Sanctuary (Kali Tiger Reserve)'].forEach(function (n) { STAR[n] = 2; });
  var GHATS = { sirsi: 1, siddapur: 1, yellapur: 1, dandeli: 1, jog: 1, yana: 1 };

  function km(a, b) {
    var R = 6371, t = Math.PI / 180;
    var dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // crossing the Western Ghats (coast <-> Sirsi/Jog/Yellapur/Dandeli/Hubballi side) is slow, winding road
  function driveH(a, b) { var d = km(a, b) * 1.3; if (d < 3) return 0; return d / 50 * (!!a.up !== !!b.up ? 1.3 : 1); }
  function pen(h) { return 0.5 * h + 0.6 * Math.max(0, h - 2.5); } // long drives cost more
  function round15(h) { return Math.max(0.25, Math.round(h * 4) / 4); }
  function fmtH(h) {
    var m = Math.round(h * 60 / 15) * 15; if (m < 15) m = 15;
    var hh = Math.floor(m / 60), mm = m % 60;
    return (hh ? hh + ' h' : '') + (hh && mm ? ' ' : '') + (mm ? mm + ' min' : '');
  }

  function plan(DATA, opts) {
    var days = Math.max(1, Math.min(4, opts.days | 0 || 2));
    var people = Math.max(1, opts.people | 0 || 1);
    var interests = (opts.interests || []).filter(function (i) { return INTERESTS[i]; });
    var startName = DATA.starts[opts.start] ? opts.start : 'Murdeshwar';
    var wanted = {}; interests.forEach(function (i) { INTERESTS[i].forEach(function (c) { wanted[c] = i; }); });

    var UP = { sirsi: 1, siddapur: 1, yellapur: 1, dandeli: 1, jog: 1, 'Hubballi Airport': 1 };
    var A = {}, startPt;
    Object.keys(DATA.areas).forEach(function (k) { A[k] = { lat: DATA.areas[k].lat, lng: DATA.areas[k].lng, up: !!UP[k] }; });
    startPt = { lat: DATA.starts[startName].lat, lng: DATA.starts[startName].lng, up: !!UP[startName] };
    var places = DATA.places.map(function (p, i) { return Object.assign({ idx: i }, p); });
    function allowed(p) {
      if (!p.hard) return true;
      return !!wanted[p.category] && people < 8;
    }
    function value(p) {
      if (!allowed(p)) return 0;
      var star = STAR[p.place];
      if (wanted[p.category] && p.hard) return 1;
      if (wanted[p.category]) return STAR[p.place] === 2 ? 8 : star ? 6 : p.top ? 3.5 : 1.5;
      return star ? 1 : p.top ? 0.6 : 0.15;
    }
    var byArea = {};
    places.forEach(function (p) { (byArea[p.area] = byArea[p.area] || []).push(p); });
    var areaNames = Object.keys(A).sort();

    var BEAM = 14;
    // beam search over day bases: keeps the best partial trips so early days leave room for later ones
    var beam = [{ score: 0, used: {}, covered: {}, cur: startPt, curName: startName, days: [] }];
    for (var d = 0; d < days; d++) {
      var last = d === days - 1, next = [];
      beam.forEach(function (st) {
        areaNames.forEach(function (base) {
          var drv = driveH(st.cur, A[base]);
          if (drv > MAX_DRIVE_H) return;
          var home = driveH(A[base], startPt);
          var back = last ? home : 0;
          if (last && back > MAX_DRIVE_H) return;
          if (!last && home > MAX_DRIVE_H * (days - d - 1) + 0.01) return;
          if (drv + back > 6) return;                       // no more than ~6 h in the vehicle on one day
          var budget = DAY_HOURS - drv - back;
          if (budget < 2) return;
          var day = fillDay(base, budget, st.used, st.covered);
          if (!day.stops.length) return;
          if (day.stops.length === 1 && day.stops[0].hard) return; // a hard trek is never the whole day
          // the base must be where the day really is: it holds the most stops (so labels and nights are honest)
          var perArea = {}; day.stops.forEach(function (s) { perArea[s.area] = (perArea[s.area] || 0) + 1; });
          var maxA = 0; for (var a in perArea) maxA = Math.max(maxA, perArea[a]);
          if ((perArea[base] || 0) < maxA) return;
          var bestStop = day.stops.slice().sort(function (x, y) { return value(y) - value(x) || x.idx - y.idx; })[0];
          if (bestStop.area !== base && perArea[bestStop.area] === maxA) return;
          var newCov = {}, matches = 0;
          day.stops.forEach(function (s) { if (!s.filler) { matches++; if (!st.covered[wanted[s.category]]) newCov[wanted[s.category]] = 1; } });
          // diminishing returns: the 4th+ place of the same kind in one trip counts half
          // and a 4th stop in one day counts a little less than the day's three best stops
          var cc = Object.assign({}, st.cats || {}), vals = [];
          day.stops.forEach(function (s) { vals.push(value(s) * ((cc[s.category] || 0) >= 3 ? 0.5 : 1)); cc[s.category] = (cc[s.category] || 0) + 1; });
          vals.sort(function (x, y) { return y - x; });
          var val = vals.reduce(function (t, v, j) { return t + v * (j >= 3 ? 0.6 : 1); }, 0);
          var gain = val + 5 * Object.keys(newCov).length - pen(drv) - pen(back) - (interests.length && !matches ? 3 : 0)
            + (day.stops.length >= 3 ? 0.5 : 0);
          var used = Object.assign({}, st.used), covered = Object.assign({}, st.covered);
          day.stops.forEach(function (s) { used[s.idx] = 1; if (!s.filler) covered[wanted[s.category]] = 1; });
          next.push({ score: st.score + gain, used: used, covered: covered, cats: cc, cur: A[base], curName: byArea[base][0].area_town,
            days: st.days.concat([{ base: base, drv: drv, back: back, day: day, from: st.curName }]) });
        });
      });
      if (!next.length) break;
      next.sort(function (a, b) {
        return b.score - a.score || (a.days.map(function (x) { return x.base; }).join() < b.days.map(function (x) { return x.base; }).join() ? -1 : 1);
      });
      // keep variety in the beam: at most 3 states ending at the same base
      var seenBase = {}; beam = [];
      for (var k = 0; k < next.length && beam.length < BEAM; k++) {
        var lb = next[k].days[next[k].days.length - 1].base;
        if ((seenBase[lb] = (seenBase[lb] || 0) + 1) <= 3) beam.push(next[k]);
      }
    }
    var bestState = beam[0];
    var covered = bestState.covered, out = [], foodIdx = {};
    bestState.days.forEach(function (b, d) {
      var last = d === bestState.days.length - 1;
      var baseTown = byArea[b.base][0].area_town;
      var distKey = GHATS[b.base] ? 'Ghats' : byArea[b.base][0].district;
      var fi = foodIdx[distKey] || 0; foodIdx[distKey] = fi + 1;
      var groups = rankLabels(b.day.stops.filter(function (s) { return !s.filler; }).map(function (s) { return CAT_LABEL[s.category]; }));
      out.push({
        day: d + 1,
        base: b.base,
        town: baseTown,
        theme: baseTown + ' ' + (groups.length ? joinAnd(groups.slice(0, 2)) : 'highlights'),
        driveFrom: b.from,
        driveHours: round15(b.drv),
        driveText: b.drv >= 0.5 ? (d === 0 ? 'Pickup at ' + b.from + ' · drive ≈ ' : 'Drive ≈ ') + fmtH(b.drv) + (d === 0 ? ' to ' + baseTown : ' from ' + b.from) : (d === 0 ? 'Pickup at ' + b.from : ''),
        stops: b.day.stops.map(function (s) {
          return { place: s.place, category: s.category, hours: s.hours, description: s.description, note: s.note,
                   town: s.area_town, filler: !!s.filler, top: !!s.top };
        }),
        hasFiller: b.day.stops.some(function (s) { return s.filler; }),
        night: last ? null : baseTown,
        end: last ? 'Drop back at ' + startName + (b.back >= 0.5 ? ' (≈ ' + fmtH(b.back) + ')' : '') : null,
        food: FOOD[distKey][fi % 3]
      });
    });

    function fillDay(base, budget, used, covSoFar) {
      var near = areaNames.filter(function (a) { return a === base || driveH(A[base], A[a]) <= NEAR_H; });
      var pool = [];
      near.forEach(function (a) {
        (byArea[a] || []).forEach(function (p) {
          if (used[p.idx] || !allowed(p)) return;
          var extra = a === base ? 0 : driveH(A[base], A[a]);
          pool.push({ p: p, extra: extra });
        });
      });
      // order: matching must-see, matching, then filler must-see, other filler; same-area before nearby; data order
      function rank(x) {
        var m = wanted[x.p.category] ? 0 : 3;
        return m + (STAR[x.p.place] ? -1 : x.p.top ? 0 : x.p.hard ? 2 : 1);   // hard treks only after easy places
      }
      pool.sort(function (a, b) { return rank(a) - rank(b) || a.extra - b.extra || a.p.idx - b.p.idx; });
      var stops = [], time = 0, val = 0, hard = 0, cats = {}, areasUsed = {};
      areasUsed[base] = 1;
      function tryAdd(x, isFiller) {
        if (stops.length >= 4) return false;
        if (x.p.hard && hard) return false;
        var big = x.p.hours >= 6;
        if (big && stops.length) return false;
        if (stops.length && stops[0].hours >= 6) return false;
        var hop = areasUsed[x.p.area] ? 0 : x.extra;
        var need = x.p.hours + (stops.length ? STOP_GAP_H : 0) + hop;
        if (time + need > budget + 1e-9) return false;
        // variety: don't take a 3rd stop of the same category while other matching categories exist
        if (!isFiller && cats[x.p.category] >= 2 && interests.length && Object.keys(wanted).length > 1) {
          var other = pool.some(function (y) { return !stops.some(function (s) { return s.idx === y.p.idx; }) && wanted[y.p.category] && y.p.category !== x.p.category && y.p.hours <= budget - time; });
          if (other) return false;
        }
        var s = Object.assign({}, x.p, { filler: isFiller });
        stops.push(s); time += need; val += value(x.p); if (x.p.hard) hard++;
        cats[x.p.category] = (cats[x.p.category] || 0) + 1; areasUsed[x.p.area] = 1;
        return true;
      }
      // first: one place for each chosen interest not yet covered on earlier days (scarcest interest first)
      var open = interests.filter(function (i) { return !covSoFar[i]; }).map(function (i) {
        var c = pool.filter(function (x) { return wanted[x.p.category] === i; });
        return { i: i, c: c };
      }).filter(function (o) { return o.c.length; }).sort(function (a, b) { return a.c.length - b.c.length || interests.indexOf(a.i) - interests.indexOf(b.i); });
      open.forEach(function (o) { for (var j = 0; j < o.c.length; j++) if (tryAdd(o.c[j], false)) break; });
      pool.forEach(function (x) { if ((wanted[x.p.category] || !interests.length) && !stops.some(function (s) { return s.idx === x.p.idx; })) tryAdd(x, false); });
      // second pass for skipped matching places once variety is satisfied
      pool.forEach(function (x) { if ((wanted[x.p.category] || !interests.length) && !stops.some(function (s) { return s.idx === x.p.idx; })) tryAdd(x, false); });
      if (stops.length < 3) {
        pool.forEach(function (x) {
          if (stops.length >= 3) return;
          if (wanted[x.p.category] || stops.some(function (s) { return s.idx === x.p.idx; })) return;
          if (!x.p.top && stops.length >= 2) return;      // only must-see filler to reach the 3rd stop
          tryAdd(x, true);
        });
      }
      // order the day: same-area first, morning temples first, beaches towards the evening
      var ORDER = { wildlife: -1, temple: 0, heritage: 1, fort: 2, waterfall: 3, nature: 4, adventure: 4, park: 5, island: 5, viewpoint: 6, beach: 7 };
      stops.sort(function (a, b) {
        var ea = a.area === base ? 0 : 1, eb = b.area === base ? 0 : 1;
        return ea - eb || (ORDER[a.category] - ORDER[b.category]) || a.idx - b.idx;
      });
      return { stops: stops, value: val, time: time };
    }

    var missing = interests.filter(function (i) { return !covered[i]; });
    var shown = interests.filter(function (i) { return covered[i]; });
    var titleBits = (shown.length ? shown : interests).map(function (i) { return INTEREST_SHORT[i]; });
    var title = days + (days === 1 ? ' Day: ' : ' Days: ') + joinAnd(titleBits) + ' from ' + startName;
    var towns = []; out.forEach(function (x) { if (towns.indexOf(x.town) < 0) towns.push(x.town); });
    var vehicle = people <= 4 ? '5-seater family car' : people <= 6 ? '7-seater family MUV' : people <= 10 ? '11-seater tempo traveller' : 'two or more vehicles';
    return {
      title: title,
      summary: summary(out),
      bestTime: interests.indexOf('Waterfalls') >= 0
        ? 'Waterfalls are fullest August–November; October–March is pleasant overall.'
        : 'October to March, after the monsoon, is the most pleasant time.',
      missing: missing,
      missingText: missing.length ? 'Couldn’t fit ' + joinAnd(missing.map(function (i) { return INTEREST_SHORT[i].toLowerCase(); })) +
        ' in ' + days + (days === 1 ? ' day' : ' days') + ' from ' + startName + ' — try more days or another starting point.' : '',
      days: out,
      start: startName,
      people: people,
      vehicle: vehicle,
      towns: towns
    };
  }

  function summary(out) {
    var ord = ['day one', 'day two', 'day three', 'day four'];
    return out.map(function (d, i) { return d.town + ' on ' + ord[i]; }).join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.';
  }
  function rankLabels(arr) {
    var c = {}, order = []; arr.forEach(function (x) { if (!c[x]) order.push(x); c[x] = (c[x] || 0) + 1; });
    return order.sort(function (a, b) { return c[b] - c[a] || order.indexOf(a) - order.indexOf(b); });
  }
  function mostCommon(arr) {
    var c = {}, best = null; arr.forEach(function (x) { c[x] = (c[x] || 0) + 1; if (!best || c[x] > c[best]) best = x; }); return best;
  }
  function joinAnd(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1]; }

  function whatsappText(P) {
    var lines = ['Hi GR Tours & Travels, I\'d like this trip:', P.title,
      'From: ' + P.start + ' · People: ' + P.people + ' · Vehicle: ' + P.vehicle];
    P.days.forEach(function (d) {
      lines.push('Day ' + d.day + ': ' + d.stops.map(function (s) { return s.place; }).join(', ') + (d.night ? ' (night: ' + d.night + ')' : ''));
    });
    lines.push('Please share the price and available dates.');
    return lines.join('\n');
  }

  var api = { plan: plan, whatsappText: whatsappText, INTERESTS: INTERESTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GRPlanner = api;
})(typeof window !== "undefined" ? window : this);
