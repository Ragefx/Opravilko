/**
 * Finds the date (and time) an email is about: "Nedelja, 11.10.2026",
 * "Čas 16:00", "11. oktobra 2026 ob 16h", "Oct 11, 2026 4:00 PM",
 * "2026-10-11". The first date from today on wins; a time is taken from
 * right after it, or from a line like "Čas: 16:00" / "Time: 4 pm".
 *
 * Plain functions (no Apps Script services), so they can be tested anywhere.
 */

var MONTH_WORDS_ = [
  ["jan"], ["feb"], ["mar"], ["apr"], ["maj", "may"], ["jun"],
  ["jul"], ["avg", "aug"], ["sep"], ["okt", "oct"], ["nov"], ["dec"],
];

function monthFromWord_(word) {
  var w = word.toLowerCase();
  for (var i = 0; i < MONTH_WORDS_.length; i++) {
    for (var k = 0; k < MONTH_WORDS_[i].length; k++) {
      if (w.indexOf(MONTH_WORDS_[i][k]) === 0) return i + 1;
    }
  }
  return 0;
}

function validDate_(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  var t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCDate() === d ? { y: y, m: m, d: d } : null;
}

function findTime_(text) {
  var m = /(?:^|[^\d.])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)\s*(am|pm)?/i.exec(text);
  if (m) {
    var h = Number(m[1]);
    var ampm = (m[3] || "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { h: h, min: Number(m[2]) };
  }
  m = /\bob\s+([01]?\d|2[0-3])\s*h\b/i.exec(text);
  if (m) return { h: Number(m[1]), min: 0 };
  m = /\b(1[0-2]|0?\d)\s*(am|pm)\b/i.exec(text);
  if (m) {
    var hh = Number(m[1]) % 12;
    return { h: m[2].toLowerCase() === "pm" ? hh + 12 : hh, min: 0 };
  }
  return null;
}

function findDateTime_(text, now) {
  var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  var monthRe = "(jan|feb|mar|apr|maj|may|jun|jul|avg|aug|sep|okt|oct|nov|dec)[a-zčšž]*\\.?";
  var patterns = [
    // 2026-10-11
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, get: function (m) { return validDate_(+m[1], +m[2], +m[3]); } },
    // 11.10.2026 / 11. 10. 2026 / 11.10.26
    { re: /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})\b/g, get: function (m) { return validDate_(+m[3], +m[2], +m[1]); } },
    // 5.10. (this year; the second dot keeps "1.5 kg" out)
    { re: /\b(\d{1,2})\.\s?(\d{1,2})\.(?!\s?\d)/g, get: function (m) { return validDate_(now.getFullYear(), +m[2], +m[1]); } },
    // 11. oktobra 2026 / 11 October 2026
    {
      re: new RegExp("\\b(\\d{1,2})\\.?\\s+" + monthRe + "(?:\\s*,?\\s*(\\d{4}))?", "gi"),
      get: function (m) { return validDate_(m[3] ? +m[3] : now.getFullYear(), monthFromWord_(m[2]), +m[1]); },
    },
    // October 11, 2026 / Oct 11
    {
      re: new RegExp("\\b" + monthRe + "\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?", "gi"),
      get: function (m) { return validDate_(m[3] ? +m[3] : now.getFullYear(), monthFromWord_(m[1]), +m[2]); },
    },
  ];
  var found = [];
  patterns.forEach(function (p) {
    var m;
    p.re.lastIndex = 0;
    while ((m = p.re.exec(text))) {
      var d = p.get(m);
      if (d && Date.UTC(d.y, d.m - 1, d.d) >= today) found.push({ date: d, at: m.index, end: m.index + m[0].length });
    }
  });
  if (!found.length) return { date: null, time: null };
  found.sort(function (a, b) { return a.at - b.at; });
  var best = found[0];
  // A time right after the date ("11.10.2026 ob 16:00"), else on a "Čas"/"Time"/"Ura" line.
  var time = findTime_(text.slice(best.end, best.end + 40));
  if (!time) {
    var line = /(?:čas|ura|time|začetek|start)\s*:?\s*\n?\s*([^\n]{0,20})/i.exec(text);
    if (line) time = findTime_(" " + line[1]);
  }
  return { date: best.date, time: time };
}
