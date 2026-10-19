// Shared helpers for the Questlog scripts: settings, database access and push sending.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Settings come from the environment (GitHub Actions secrets) or ~/.questlog/env on the Mac.
export function loadEnv() {
  const file = process.env.QUESTLOG_ENV || path.join(os.homedir(), ".questlog", "env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing settings: ${missing.join(", ")}. Run ./setup.sh in the questlog folder first.`);
    process.exit(2);
  }
}

export function connect() {
  need("SUPABASE_URL", "SUPABASE_SECRET_KEY", "QUESTLOG_USER_ID");
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { sb, uid: process.env.QUESTLOG_USER_ID };
}

// All of the user's documents as { collection: { id: data } }.
export async function loadDocs(sb, uid, collection) {
  const out = {};
  for (let from = 0; ; from += 1000) {
    let q = sb.from("docs").select("collection,id,data").eq("user_id", uid).order("collection").order("id").range(from, from + 999);
    if (collection) q = q.eq("collection", collection);
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't read Questlog: ${error.message}`);
    for (const r of data) (out[r.collection] ||= {})[r.id] = r.data;
    if (data.length < 1000) break;
  }
  return out;
}

export async function putDoc(sb, uid, collection, id, data) {
  const { error } = await sb.from("docs").upsert(
    { user_id: uid, collection, id, data, updated_at: new Date().toISOString() },
    { onConflict: "user_id,collection,id" },
  );
  if (error) throw new Error(`Couldn't save ${collection}/${id}: ${error.message}`);
}

export async function deleteDoc(sb, uid, collection, id) {
  const { error } = await sb.from("docs").delete().match({ user_id: uid, collection, id });
  if (error) throw new Error(`Couldn't delete ${collection}/${id}: ${error.message}`);
}

// Send one notification to every registered device; forget devices the push service says are gone.
export async function pushAll(sb, uid, devices, msg) {
  need("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:questlog@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const entries = Object.entries(devices || {});
  if (!entries.length) {
    console.log("No devices have notifications turned on yet.");
    return { sent: 0, failed: 0 };
  }
  let sent = 0, failed = 0;
  for (const [id, d] of entries) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) {
        console.log(`Device ${d.name || id} unsubscribed; removing it.`);
        await deleteDoc(sb, uid, "devices", id);
      } else {
        console.error(`Push to ${d.name || id} failed: ${e.statusCode || ""} ${e.body || e.message}`);
      }
    }
  }
  console.log(`Sent to ${sent} device(s), ${failed} failed.`);
  return { sent, failed };
}

// Local-calendar date helpers (respect process.env.TZ).
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
export const toDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const localDay = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : ymd(d); };
export const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
