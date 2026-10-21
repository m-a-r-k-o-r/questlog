// Questlog's morning and evening pings. GitHub Actions runs this every 10 minutes;
// it sends each ping once per day, inside its time window, even when the Mac is off.
//   node scripts/pings.mjs                 send whatever is due now
//   node scripts/pings.mjs --mode test     send a test ping right away
//   node scripts/pings.mjs --mode morning  send the morning ping now (also: evening)
//   add --dry-run to print the message without sending
import { loadEnv, connect, loadDocs, putDoc, pushAll, ymd, isYmd, localDay, diffDays } from "./lib.mjs";

loadEnv();
process.env.TZ = process.env.QUESTLOG_TZ || "America/New_York";

const MORNING = { from: 7 * 60 + 40, until: 11 * 60 };
const EVENING = { from: 20 * 60 + 30, until: 23 * 60 + 45 };
const SIDE_QUESTS = [
  "Text a friend you haven't talked to in a while. No agenda, just hi.",
  "Thank someone for something specific they did this week.",
  "Give someone a genuine, specific compliment.",
  "Write a positive note home about a student who's been trying hard.",
  "Offer to help someone with something they're stuck on.",
  "Pick up a small treat for someone: a coffee, a snack, a flower.",
  "Step outside for 10 minutes and notice three beautiful things.",
  "Spend 20 minutes on something purely for fun.",
];
const REFLECTIONS = [
  "What went well today, even something small?",
  "Who made your day better today?",
  "What's one moment from today you want to remember?",
  "What did you do today that past-you would be proud of?",
  "What made you laugh today?",
];

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const mode = flag("--mode") || "auto";
const dryRun = args.includes("--dry-run");
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const isActive = (q) => !q.status || q.status === "active";
const objectives = (q) => (q.chapters || []).flatMap((c) => c.objectives || []);

function deadlines(D, t) {
  const overdue = [], soon = [];
  for (const q of Object.values(D.quests || {})) {
    if (!isActive(q)) continue;
    const items = [{ title: q.title, due: q.due }, ...objectives(q).filter((o) => !o.done).map((o) => ({ title: o.title, due: o.due }))];
    for (const it of items) {
      if (!isYmd(it.due)) continue;
      const days = diffDays(t, it.due);
      if (days < 0) overdue.push({ ...it, days });
      else if (days <= 3) soon.push({ ...it, days });
    }
  }
  overdue.sort((a, b) => a.days - b.days);
  soon.sort((a, b) => a.days - b.days);
  return { overdue, soon };
}

function activeDays(D) {
  const days = new Set();
  for (const q of Object.values(D.quests || {})) for (const o of objectives(q)) if (o.done && localDay(o.doneAt)) days.add(localDay(o.doneAt));
  for (const c of Object.values(D.chronicle || {})) { const d = isYmd(c.date) ? c.date : localDay(c.at); if (d) days.add(d); }
  return days;
}

function streak(D, now) {
  const days = activeDays(D), d = new Date(now);
  if (!days.has(ymd(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function nextObjective(D, t) {
  const list = [];
  for (const q of Object.values(D.quests || {})) {
    if (!isActive(q)) continue;
    const o = objectives(q).find((x) => !x.done);
    if (o) list.push({ title: o.title, due: o.due || q.due, pri: Number(q.priority) || 1 });
  }
  list.sort((a, b) => (a.due ? diffDays(t, a.due) : 999) - (b.due ? diffDays(t, b.due) : 999) || b.pri - a.pri);
  return list[0];
}

function sideQuest(D, t) {
  const today = D.meta?.today;
  if (today?.date === t && today.deed?.text) return today.deed.text;
  const fading = Object.values(D.allies || {})
    .map((a) => {
      // No contact logged yet: the clock starts on the day they were added.
      const start = isYmd(a.last) ? a.last : String(a.createdAt || "").slice(0, 10);
      return { a, since: isYmd(start) ? diffDays(start, t) : null, every: Number(a.every) || 14 };
    })
    .filter((x) => x.since == null || x.since >= x.every)
    .sort((x, y) => (y.since ?? 999) / y.every - (x.since ?? 999) / x.every);
  if (fading.length) return `Reach out to ${fading[0].a.name}.`;
  return SIDE_QUESTS[hash(t) % SIDE_QUESTS.length];
}

function morning(D, t, now) {
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const { overdue, soon } = deadlines(D, t);
  if (weekend && !overdue.length && !soon.some((x) => x.days <= 1)) return null;
  const today = D.meta?.today?.date === t ? D.meta.today : null;
  const parts = [];
  if (overdue.length) parts.push(`${overdue.length} overdue: ${overdue[0].title}.`);
  else if (soon.length) parts.push(`Due ${soon[0].days === 0 ? "today" : soon[0].days === 1 ? "tomorrow" : "soon"}: ${soon[0].title}.`);
  const focus = today?.focus?.[0] || nextObjective(D, t)?.title;
  if (focus && !parts.join(" ").includes(focus)) parts.push(`Focus: ${focus}.`);
  parts.push(`Side quest: ${sideQuest(D, t)}`);
  const s = streak(D, now);
  return {
    title: s ? `Questlog · ${s}-day streak` : "Questlog · Good morning",
    body: clip(parts.join(" "), 230),
    tag: "questlog-morning",
    url: "./#today",
  };
}

function evening(D, t, now) {
  const doneToday = Object.values(D.quests || {}).flatMap(objectives).filter((o) => o.done && localDay(o.doneAt) === t).length;
  const deedsToday = Object.values(D.chronicle || {}).filter((c) => (isYmd(c.date) ? c.date : localDay(c.at)) === t);
  const s = streak(D, now);
  const reflection = (D.meta?.today?.date === t && D.meta.today.reflection) || REFLECTIONS[hash(t) % REFLECTIONS.length];
  if (!doneToday && !deedsToday.length) {
    return {
      title: "Questlog · Evening",
      body: s ? `Your ${s}-day streak ends at midnight. One small good deed or a quick journal line keeps it alive.` : "Quiet day? One small good deed or a journal line starts a new streak.",
      tag: "questlog-evening",
      url: "./#journal",
    };
  }
  const wins = [];
  if (doneToday) wins.push(`${doneToday} objective${doneToday === 1 ? "" : "s"} done`);
  if (deedsToday.length) wins.push(`${deedsToday.length} good deed${deedsToday.length === 1 ? "" : "s"}`);
  return {
    title: s ? `Questlog · ${s}-day streak` : "Questlog · Evening",
    body: clip(`Today: ${wins.join(", ")}. Tonight: ${reflection} Log it for XP.`, 230),
    tag: "questlog-evening",
    url: "./#journal",
  };
}

async function main() {
  if (process.env.GITHUB_ACTIONS && !process.env.SUPABASE_SECRET_KEY) {
    console.log("Questlog isn't set up yet (run ./setup.sh on the Mac). Skipping.");
    return;
  }
  const { sb, uid } = connect();
  const D = await loadDocs(sb, uid);
  const now = new Date(), t = ymd(now), minutes = now.getHours() * 60 + now.getMinutes();
  const sent = D.meta?.pings || {};

  let kind = ["morning", "evening", "test"].includes(mode) ? mode : null;
  if (mode === "auto") {
    if (minutes >= MORNING.from && minutes < MORNING.until && sent.morning !== t) kind = "morning";
    else if (minutes >= EVENING.from && minutes < EVENING.until && sent.evening !== t) kind = "evening";
  }
  if (!kind) { console.log(`Nothing to send at ${now.toLocaleString("en-US")} (${process.env.TZ}).`); return; }

  const msg = kind === "test"
    ? { title: "Questlog", body: "Test ping. Notifications are working.", tag: "questlog-test", url: "./" }
    : kind === "morning" ? morning(D, t, now) : evening(D, t, now);

  if (msg) {
    console.log(`${kind}: ${msg.title} | ${msg.body}`);
    if (!dryRun) await pushAll(sb, uid, D.devices, msg);
  } else {
    console.log(`${kind}: weekend with nothing due, staying quiet.`);
  }
  if (!dryRun && (kind === "morning" || kind === "evening")) await putDoc(sb, uid, "meta", "pings", { ...sent, [kind]: t });
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
