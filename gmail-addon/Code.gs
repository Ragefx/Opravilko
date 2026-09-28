/**
 * Opravilko for Gmail: open an email, and the side panel suggests a task
 * (the subject as its name, a date and time found in the email), to add to
 * one of your lists, shared with your partner if you like.
 *
 * It talks to Opravilko's helper on Cloudflare (worker/ in the repo) with a
 * personal key made in Opravilko (Settings > Import, backup & Gmail), pasted here once
 * ("Opravilko key" in the panel's ⋮ menu). Setup: gmail-addon/README.md.
 */

var HELPER_URL = "https://opravilko.cloudsan-29b.workers.dev"; // the helper (worker/ in the repo)
var ACCENT = "#10897d";

// ---------- triggers ----------

function onHomepage(e) {
  if (!getKey_()) return [keyCard_("")];
  return [taskCard_({ content: "", date: null, time: null, link: "" })];
}

function onGmailMessage(e) {
  if (!getKey_()) return [keyCard_("")];
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var message = GmailApp.getMessageById(e.gmail.messageId);
  var subject = cleanSubject_(message.getSubject() || "");
  var body = (message.getPlainBody() || "").slice(0, 20000);
  var found = findDateTime_(subject + "\n" + body, new Date());
  var link = "https://mail.google.com/mail/u/0/#all/" + message.getThread().getId();
  return [taskCard_({ content: subject, date: found.date, time: found.time, link: link, from: message.getFrom() })];
}

function onSettings(e) {
  return CardService.newUniversalActionResponseBuilder().displayAddOnCards([keyCard_("")]).build();
}

// ---------- cards ----------

function taskCard_(s) {
  var lists = helperLists_();
  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextInput().setFieldName("content").setTitle("Task").setValue(s.content || "").setMultiline(true)
  );

  var date = CardService.newDatePicker().setFieldName("date").setTitle("Date");
  if (s.date) date.setValueInMsSinceEpoch(Date.UTC(s.date.y, s.date.m - 1, s.date.d));
  section.addWidget(date);
  var time = CardService.newTimePicker().setFieldName("time").setTitle("Time");
  if (s.time) time.setHours(s.time.h).setMinutes(s.time.min);
  section.addWidget(time);
  if (s.date) {
    section.addWidget(
      CardService.newDecoratedText().setText("Found in the email: " + describe_(s.date, s.time)).setWrapText(true)
    );
  }

  var pick = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName("projectId")
    .setTitle("List");
  var first = true;
  (lists.projects || []).forEach(function (p) {
    pick.addItem(p.name, p.id, first);
    first = false;
  });
  if (first) pick.addItem("Inbox", "", true);
  section.addWidget(pick);

  if (lists.partner) {
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Share with " + lists.partner.name)
        .setSwitchControl(CardService.newSwitch().setFieldName("shared").setValue("yes").setSelected(false))
    );
  }
  if (s.link) {
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Add a link to this email")
        .setSwitchControl(CardService.newSwitch().setFieldName("withLink").setValue("yes").setSelected(true))
    );
  }

  var add = CardService.newAction()
    .setFunctionName("addTask_")
    .setParameters({ link: s.link || "", from: s.from || "" });
  section.addWidget(
    CardService.newButtonSet().addButton(
      CardService.newTextButton()
        .setText("Add task")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(ACCENT)
        .setOnClickAction(add)
    )
  );
  if (lists.error) section.addWidget(CardService.newTextParagraph().setText("⚠ " + lists.error));

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Add to Opravilko"))
    .addSection(section)
    .build();
}

function keyCard_(message) {
  var section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        "Paste your Opravilko key. Make it in Opravilko: <b>Settings › Import, backup & Gmail › Make a key</b>."
      )
    )
    .addWidget(CardService.newTextInput().setFieldName("key").setTitle("Opravilko key").setHint("opk_…"))
    .addWidget(
      CardService.newTextButton()
        .setText("Save")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(ACCENT)
        .setOnClickAction(CardService.newAction().setFunctionName("saveKey_"))
    );
  if (message) section.addWidget(CardService.newTextParagraph().setText(message));
  if (!HELPER_URL) section.addWidget(CardService.newTextParagraph().setText("⚠ HELPER_URL isn't set at the top of Code.gs yet."));
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Opravilko key"))
    .addSection(section)
    .build();
}

// ---------- actions ----------

function saveKey_(e) {
  var key = input_(e, "key").trim();
  if (!key) return notify_("Paste the key first");
  var props = PropertiesService.getUserProperties();
  props.setProperty("key", key);
  CacheService.getUserCache().remove("lists");
  var lists = helperLists_();
  if (lists.error) {
    props.deleteProperty("key");
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(keyCard_("⚠ " + lists.error)))
      .build();
  }
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Saved. Open an email to add it as a task."))
    .setNavigation(CardService.newNavigation().updateCard(taskCard_({ content: "", date: null, time: null, link: "" })))
    .build();
}

function addTask_(e) {
  var content = input_(e, "content").trim();
  if (!content) return notify_("The task needs a name");
  var common = e.commonEventObject || {};
  var tz = (common.timeZone && common.timeZone.id) || Session.getScriptTimeZone();
  var inputs = common.formInputs || {};
  var body = { content: content, projectId: input_(e, "projectId"), shared: input_(e, "shared") === "yes" };

  var ms = inputs.date && inputs.date.dateInput && inputs.date.dateInput.msSinceEpoch;
  if (ms) {
    var day = new Date(Number(ms));
    body.date = Utilities.formatDate(day, "UTC", "yyyy-MM-dd");
    var t = inputs.time && inputs.time.timeInput;
    if (t && t.hours !== undefined && t.hours !== null) {
      var local = Utilities.parseDate(body.date + " " + pad_(t.hours) + ":" + pad_(t.minutes || 0), tz, "yyyy-MM-dd HH:mm");
      body.datetime = local.toISOString();
      body.dueLabel = Utilities.formatDate(local, tz, "EEE d MMM HH:mm");
    } else {
      body.dueLabel = Utilities.formatDate(day, "UTC", "EEE d MMM");
    }
  }
  var params = common.parameters || {};
  if (params.link && input_(e, "withLink") === "yes") {
    body.description = "✉ " + (params.from ? params.from.replace(/<.*>/, "").trim() + ": " : "") + params.link;
  }

  var res = helper_("post", "/addon/task", body);
  if (res.error) return notify_("⚠ " + res.error);
  return notify_("✓ Added to " + (res.list || "Opravilko"));
}

// ---------- the helper ----------

function helper_(method, path, payload) {
  if (!HELPER_URL) return { error: "HELPER_URL isn't set in Code.gs" };
  var options = { method: method, muteHttpExceptions: true, headers: { "X-Opravilko-Key": getKey_() } };
  if (payload) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  try {
    var res = UrlFetchApp.fetch(HELPER_URL.replace(/\/$/, "") + path, options);
    var data = JSON.parse(res.getContentText() || "{}");
    if (res.getResponseCode() >= 400) return { error: data.error || "Opravilko said no (" + res.getResponseCode() + ")" };
    return data;
  } catch (err) {
    return { error: "Couldn't reach Opravilko" };
  }
}

/** Your lists and partner, kept for ten minutes. */
function helperLists_() {
  var cache = CacheService.getUserCache();
  var hit = cache.get("lists");
  if (hit) return JSON.parse(hit);
  var lists = helper_("get", "/addon/projects");
  if (!lists.error) cache.put("lists", JSON.stringify(lists), 600);
  return lists;
}

function getKey_() {
  return PropertiesService.getUserProperties().getProperty("key") || "";
}

// ---------- small things ----------

function input_(e, name) {
  var i = e.commonEventObject && e.commonEventObject.formInputs && e.commonEventObject.formInputs[name];
  return i && i.stringInputs && i.stringInputs.value && i.stringInputs.value[0] ? i.stringInputs.value[0] : "";
}

function notify_(text) {
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text)).build();
}

function pad_(n) {
  return (n < 10 ? "0" : "") + n;
}

function cleanSubject_(s) {
  return s.replace(/^\s*((re|fwd?|fw|odg|pos|vs)\s*:\s*)+/i, "").trim();
}

var DAYS_ = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS_ = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function describe_(d, t) {
  var day = new Date(Date.UTC(d.y, d.m - 1, d.d));
  return DAYS_[day.getUTCDay()] + " " + d.d + " " + MONTHS_[d.m - 1] + " " + d.y + (t ? ", " + t.h + ":" + pad_(t.min) : "");
}

// ---------- finding the date in an email ----------

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
