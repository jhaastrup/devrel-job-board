#!/usr/bin/env node
/**
 * DevRel Job Scraper — scrapes company ATS boards directly
 * No AI · No API keys · 100% free · Uses Greenhouse + Ashby public ATS APIs
 *
 * Run: node scripts/scrape-jobs.mjs
 * Output: public/jobs.json
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../public/jobs.json");

/* ── Keywords that must appear in the job TITLE ──────────────── */
const DEVREL_TITLE_RE = /developer advocate|developer relations|devrel|devex|developer evangelist|developer experience|developer education|developer marketing|api evangelist|community engineer|technical community|developer community|dev advocate/i;

/* ── Location strings that mean US-only or restricted → exclude ───────────── */
const US_ONLY_RE = /us\b|usa\b|united states|america|\bca\b|canada|san francisco|new york|nyc|boston|austin|chicago|seattle|portland|denver|los angeles|sf\b|california|texas|washington|florida/i;

/* ── Positive location matches (must match for inclusion) ─────── */
const WORLDWIDE_RE = /worldwide|global|international|anywhere|work\s*from\s*anywhere|wfa|emea|europe|eu\b|uk\b|united kingdom|ireland|africa|lagos|nigeria/i;

function isStrictlyRemote(loc) {
  // If loc is an object (common in some APIs), try to find a name/text field
  let l = "";
  if (typeof loc === "string") {
    l = loc;
  } else if (loc && typeof loc === "object") {
    l = loc.name || loc.locationName || loc.text || JSON.stringify(loc);
  }
  l = l.toLowerCase();
  
  // 1. If it explicitly says US/Canada specific stuff, kill it immediately
  if (US_ONLY_RE.test(l)) {
    // Exception: ONLY if it explicitly says Worldwide/Global/Anywhere (not region-limited)
    if (!/worldwide|global|international|anywhere|work\s*from\s*anywhere|wfa/i.test(l)) return false;
  }

  // 2. Must explicitly indicate worldwide/EMEA/Africa/Lagos (no plain "Remote")
  if (WORLDWIDE_RE.test(l)) return true;

  return false;
}

/* ── Category guesser ────────────────────────────────────────── */
function guessCategory(text) {
  const t = (text || "").toLowerCase();
  if (/web3|blockchain|crypto|nft|defi|solana|ethereum|web 3/.test(t)) return "web3";
  if (/fintech|payment|banking|finance|lending|stripe|plaid/.test(t)) return "fintech";
  if (/\bai\b|machine learning|\bml\b|llm|genai|artificial intelligence|openai|anthropic/.test(t)) return "ai";
  if (/devtools|developer tool|\bsdk\b|\bapi\b|\bcli\b|\bide\b|open.?source|postman|ably|twilio/.test(t)) return "devtools";
  if (/cloud|aws|gcp|azure|kubernetes|\bk8s\b|infra|cloudflare|terraform|hashicorp/.test(t)) return "cloud";
  if (/saas|b2b|platform|enterprise|mongodb|datadog|supabase/.test(t)) return "saas";
  return "other";
}

function genId(company, title) {
  return `${company}-${title}`.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 100);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ══════════════════════════════════════════════════════════════
   SOURCE 1: GREENHOUSE ATS
   Public JSON API — no auth, no key: boards-api.greenhouse.io/v1/boards/{slug}/jobs
════════════════════════════════════════════════════════════════ */

// Companies known to hire DevRel — add more slugs here to expand coverage
const GREENHOUSE_COMPANIES = [
  // Infra / Cloud / Devtools
  { slug: "stripe",        name: "Stripe" },
  { slug: "twilio",        name: "Twilio" },
  { slug: "cloudflare",   name: "Cloudflare" },
  { slug: "postman",       name: "Postman" },
  { slug: "mongodb",       name: "MongoDB" },
  { slug: "circleci",     name: "CircleCI" },
  { slug: "snyk",          name: "Snyk" },
  { slug: "launchdarkly", name: "LaunchDarkly" },
  { slug: "vercel",        name: "Vercel" },
  { slug: "planetscale",  name: "PlanetScale" },
  { slug: "supabase",     name: "Supabase" },
  { slug: "neon",          name: "Neon" },
  { slug: "render",        name: "Render" },
  { slug: "tigrisdata",   name: "Tigris Data" },
  { slug: "prisma",        name: "Prisma" },
  // AI / ML
  { slug: "cohere",        name: "Cohere" },
  { slug: "huggingface",  name: "Hugging Face" },
  { slug: "mistral",       name: "Mistral AI" },
  { slug: "perplexityai", name: "Perplexity AI" },
  { slug: "cognitionlabs",name: "Cognition Labs" },
  // Web3 / Crypto
  { slug: "arbitrum",     name: "Arbitrum" },
  { slug: "consensys",    name: "ConsenSys" },
  { slug: "chainlink",    name: "Chainlink Labs" },
  // Community / DevRel-heavy
  { slug: "readme",        name: "ReadMe" },
  { slug: "devrev",        name: "DevRev" },
  { slug: "dagger-io",    name: "Dagger" },
  { slug: "ory",           name: "Ory" },
  { slug: "redpanda",     name: "Redpanda" },
  { slug: "momento",       name: "Momento" },
  { slug: "weaviate",     name: "Weaviate" },
  { slug: "qdrant",        name: "Qdrant" },
  { slug: "pinecone",     name: "Pinecone" },
  { slug: "lightdash",    name: "Lightdash" },
  { slug: "airbyte",      name: "Airbyte" },
  { slug: "meilisearch",  name: "Meilisearch" },
  { slug: "appwrite",     name: "Appwrite" },
];

async function fetchGreenhouse() {
  const jobs = [];
  for (const { slug, name } of GREENHOUSE_COMPANIES) {
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        { headers: { "User-Agent": "DevRel-Job-Tracker/1.0 (personal)" } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const j of data.jobs || []) {
        if (!DEVREL_TITLE_RE.test(j.title)) continue;
        const loc = j.location?.name || "";
        if (!isStrictlyRemote(loc)) continue;
        jobs.push({
          title: j.title.trim(),
          company: name,
          location: loc || "Remote",
          salary: "Not listed",
          url: j.absolute_url || `https://boards.greenhouse.io/${slug}`,
          source: "Greenhouse",
          category: guessCategory(`${j.title} ${name}`),
        });
      }
    } catch { /* skip failed companies */ }
    await sleep(150);
  }
  return jobs;
}

/* ══════════════════════════════════════════════════════════════
   SOURCE 2: ASHBY ATS
   Public JSON API — no auth: api.ashbyhq.com/posting-api/job-board/{slug}
════════════════════════════════════════════════════════════════ */

const ASHBY_COMPANIES = [
  { slug: "railway",       name: "Railway" },
  { slug: "posthog",       name: "PostHog" },
  { slug: "linear",        name: "Linear" },
  { slug: "loom",          name: "Loom" },
  { slug: "retool",        name: "Retool" },
  { slug: "temporal",      name: "Temporal" },
  { slug: "trigger",       name: "Trigger.dev" },
  { slug: "infisical",    name: "Infisical" },
  { slug: "mintlify",     name: "Mintlify" },
  { slug: "speakeasy",    name: "Speakeasy" },
  { slug: "koyeb",         name: "Koyeb" },
  { slug: "substratusai", name: "Substratus AI" },
  { slug: "resend",        name: "Resend" },
  { slug: "stytch",        name: "Stytch" },
  { slug: "clerk",         name: "Clerk" },
  { slug: "propelauth",   name: "PropelAuth" },
  { slug: "lago",          name: "Lago" },
  { slug: "rownd",         name: "Rownd" },
  { slug: "openbb",        name: "OpenBB" },
  { slug: "liveblocks",   name: "Liveblocks" },
  { slug: "pydantic",     name: "Pydantic" },
  { slug: "unstructured-io", name: "Unstructured" },
  { slug: "roboflow",     name: "Roboflow" },
];

async function fetchAshby() {
  const jobs = [];
  for (const { slug, name } of ASHBY_COMPANIES) {
    try {
      const res = await fetch(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        { headers: { "User-Agent": "DevRel-Job-Tracker/1.0 (personal)" } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const j of (data.jobs || data.jobPostings || [])) {
        if (!DEVREL_TITLE_RE.test(j.title)) continue;
        const locParts = [
          j.location,
          j.locationName,
          j.team?.name,
          ...(j.secondaryLocations || []).map(s => s.location || s?.address?.addressLocality || s?.address?.addressRegion || s?.address?.addressCountry),
        ].filter(Boolean);
        const loc = locParts.join(" / ");
        if (!isStrictlyRemote(loc)) continue;
        const url = j.jobUrl || j.applyUrl || `https://jobs.ashbyhq.com/${slug}`;
        jobs.push({
          title: j.title.trim(),
          company: name,
          location: loc || "Remote",
          salary: j.compensation || "Not listed",
          url,
          source: "Ashby",
          category: guessCategory(`${j.title} ${name} ${j.department || ""}`),
        });
      }
    } catch { /* skip */ }
    await sleep(150);
  }
  return jobs;
}

/* ══════════════════════════════════════════════════════════════
   SOURCE 3: LEVER POSTINGS API
   Public JSON API — no auth: api.lever.co/v0/postings/{slug}
════════════════════════════════════════════════════════════════ */

// Add Lever company slugs here (public Lever-hosted job boards)
const LEVER_COMPANIES = [
  // { slug: "example", name: "ExampleCo" },
];

async function fetchLever() {
  const jobs = [];
  for (const { slug, name } of LEVER_COMPANIES) {
    try {
      const res = await fetch(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
        { headers: { "User-Agent": "DevRel-Job-Tracker/1.0 (personal)" } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const postings = Array.isArray(data) ? data : (data?.data || []);
      for (const j of postings) {
        const title = j.text || j.title || "";
        if (!DEVREL_TITLE_RE.test(title)) continue;
        const loc = [
          j.categories?.location,
          j.workplaceType,
          j.location,
        ].filter(Boolean).join(" / ");
        if (!isStrictlyRemote(loc)) continue;
        const url = j.hostedUrl || j.urls?.show || `https://jobs.lever.co/${slug}`;
        jobs.push({
          title: title.trim(),
          company: name,
          location: loc || "Remote",
          salary: j.salaryDescription || "Not listed",
          url,
          source: "Lever",
          category: guessCategory(`${title} ${name} ${j.categories?.team || ""}`),
        });
      }
    } catch { /* skip failed companies */ }
    await sleep(150);
  }
  return jobs;
}

/* ══════════════════════════════════════════════════════════════
   MERGE, DEDUPLICATE, SAVE
════════════════════════════════════════════════════════════════ */
async function main() {
  console.log("🔍 Scraping Greenhouse ATS boards...");
  const gh = await fetchGreenhouse();
  console.log(`   ✓ ${gh.length} DevRel jobs`);

  console.log("🔍 Scraping Ashby ATS boards...");
  const ashby = await fetchAshby();
  console.log(`   ✓ ${ashby.length} DevRel jobs`);

  console.log("🔍 Scraping Lever ATS boards...");
  const lever = await fetchLever();
  console.log(`   ✓ ${lever.length} DevRel jobs`);

  const all = [...gh, ...ashby, ...lever];

  // Deduplicate
  const seen = new Set();
  const now = new Date().toISOString();
  const deduped = [];
  for (const j of all) {
    if (!j.title || !j.company) continue;
    const key = genId(j.company, j.title);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ id: key, ...j, fetchedAt: now });
  }

  // Merge with existing (keep last 14 days)
  let existing = [];
  if (existsSync(OUT)) {
    try { 
      existing = JSON.parse(readFileSync(OUT, "utf8")); 
      // Re-filter existing jobs with the new strict rules
      existing = existing.filter(j => isStrictlyRemote(j.location));
    } catch {}
  }
  const existingMap = new Map(existing.map((j) => [j.id, j]));
  deduped.forEach((j) => existingMap.set(j.id, j));

  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const final = Array.from(existingMap.values())
    .filter((j) => !j.fetchedAt || new Date(j.fetchedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt));

  writeFileSync(OUT, JSON.stringify(final, null, 2));
  console.log(`\n✅ Saved ${final.length} jobs (${deduped.length} today) → public/jobs.json`);
  if (deduped.length) {
    console.log("\nToday's DevRel listings:");
    deduped.forEach((j) => console.log(`  ${j.company}: ${j.title} (${j.location})`));
  }

  // GitHub Actions outputs
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = deduped.slice(0, 20).map(
      (j) => `| [${j.title}](${j.url}) | ${j.company} | ${j.location} | ${j.source} |`
    );
    const summary = [
      `## 🔔 DevRel Jobs — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      `**${deduped.length} listings found across Greenhouse & Ashby boards** (${final.length} total in board)`,
      "", "| Title | Company | Location | Source |", "|---|---|---|---|", ...rows,
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n"), { flag: "a" });
  }

  if (process.env.GITHUB_OUTPUT) {
    const topJobs = deduped.slice(0, 12).map(
      (j) => `- [${j.title} @ ${j.company}](${j.url}) — ${j.location}`
    ).join("\n");
    const body = [
      `**${deduped.length} open DevRel roles found today across Greenhouse & Ashby company boards.**`,
      "", "### Today's open roles:",
      topJobs || "_No new DevRel listings today — check back tomorrow!_",
      "", `> 📋 [Open your full job board](https://devrel-job-board.netlify.app) &nbsp;·&nbsp; Remember to apply to at least one today! 💪`,
    ].join("\n");
    writeFileSync(process.env.GITHUB_OUTPUT, `job_count=${deduped.length}\n`, { flag: "a" });
    writeFileSync(process.env.GITHUB_OUTPUT, `issue_body<<EOF\n${body}\nEOF\n`, { flag: "a" });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
