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
