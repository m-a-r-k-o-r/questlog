// Command-line access to Questlog's data, used by Claude's check-ins (and handy for you).
//   node scripts/questlog.mjs dump [collection]          print documents as JSON
//   node scripts/questlog.mjs get <collection> <id>
//   node scripts/questlog.mjs set <collection> <id> <json | @file.json | ->     replace a document
//   node scripts/questlog.mjs update <collection> <id> <json | @file.json | ->  merge top-level fields
//   node scripts/questlog.mjs delete <collection> <id>
//   node scripts/questlog.mjs import <file.json>         { collection: { id: data } }, upserts everything
//   node scripts/questlog.mjs push <title> <body> [url]  notify every device now
//   node scripts/questlog.mjs new-id                     a fresh random document id
import fs from "node:fs";
import crypto from "node:crypto";
import { loadEnv, connect, loadDocs, putDoc, deleteDoc, pushAll } from "./lib.mjs";

loadEnv();
process.env.TZ = process.env.QUESTLOG_TZ || "America/New_York";

const newId = () => Array.from(crypto.randomBytes(15), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const readJson = (arg) => {
  const text = arg === "-" ? fs.readFileSync(0, "utf8") : arg?.startsWith("@") ? fs.readFileSync(arg.slice(1), "utf8") : arg;
  if (!text) throw new Error("Give the document as JSON, @file.json, or - for stdin.");
  const v = JSON.parse(text);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("A document must be a JSON object.");
  return v;
};
const usage = () => { console.error(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n")); process.exit(2); };

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (!cmd) usage();
  if (cmd === "new-id") return console.log(newId());
  const { sb, uid } = connect();
  switch (cmd) {
    case "dump": return console.log(JSON.stringify(await loadDocs(sb, uid, a), null, 2));
    case "get": {
      if (!a || !b) usage();
      const docs = await loadDocs(sb, uid, a);
      const doc = docs[a]?.[b];
      if (!doc) { console.error(`No document ${a}/${b}.`); process.exit(1); }
      return console.log(JSON.stringify(doc, null, 2));
    }
    case "set": {
      if (!a || !b) usage();
      await putDoc(sb, uid, a, b, readJson(c));
      return console.log(`Saved ${a}/${b}.`);
    }
    case "update": {
      if (!a || !b) usage();
      const cur = (await loadDocs(sb, uid, a))[a]?.[b];
      if (!cur) { console.error(`No document ${a}/${b} to update.`); process.exit(1); }
      await putDoc(sb, uid, a, b, { ...cur, ...readJson(c) });
      return console.log(`Updated ${a}/${b}.`);
    }
    case "delete": {
      if (!a || !b) usage();
      await deleteDoc(sb, uid, a, b);
      return console.log(`Deleted ${a}/${b}.`);
    }
    case "import": {
      if (!a) usage();
      const all = readJson(a.startsWith("@") || a === "-" ? a : "@" + a);
      let n = 0;
      for (const [coll, docs] of Object.entries(all)) for (const [id, data] of Object.entries(docs)) { await putDoc(sb, uid, coll, id, data); n++; }
      return console.log(`Imported ${n} documents.`);
    }
    case "push": {
      if (!a || !b) usage();
      const { devices } = await loadDocs(sb, uid, "devices");
      await pushAll(sb, uid, devices, { title: a, body: b, url: c || "./", tag: "questlog-claude" });
      return;
    }
    default: usage();
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
