import { useState, useEffect, useRef } from "react";

/* ─── Config ─── */
const STORAGE_KEYS = { statuses: "dj_stat_v3" };

const CAT_COLORS = {
  saas:     { c: "#5b8eff", bg: "rgba(91,142,255,0.10)" },
  fintech:  { c: "#3ecf8e", bg: "rgba(62,207,142,0.10)" },
  web3:     { c: "#f5a623", bg: "rgba(245,166,35,0.10)" },
  ai:       { c: "#a78bfa", bg: "rgba(167,139,250,0.10)" },
  devtools: { c: "#2dd4bf", bg: "rgba(45,212,191,0.10)" },
  cloud:    { c: "#ff6b6b", bg: "rgba(255,107,107,0.10)" },
  other:    { c: "#8892a8", bg: "rgba(136,146,168,0.08)" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "saas", label: "SaaS" },
  { key: "fintech", label: "Fintech" },
  { key: "web3", label: "Web3" },
  { key: "ai", label: "AI / ML" },
  { key: "devtools", label: "Dev Tools" },
  { key: "cloud", label: "Cloud" },
];

/* ─── Helpers ─── */
const hrsAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : 9999;
const timeLabel = (iso) => {
  if (!iso) return "";
  const h = hrsAgo(iso);
  if (h < 1) return "Just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
};

async function sGet(k) { try { const r = await window.storage.get(k); return r?.value ?? null; } catch { return null; } }
async function sSet(k, v) { try { await window.storage.set(k, v); } catch {} }

/* ─── App ─── */
export default function App() {
  const [jobs, setJobs] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const didInit = useRef(false);

  /* ── Boot: load statuses from storage, then load jobs.json ── */
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      // Restore saved application statuses
      const rs = await sGet(STORAGE_KEYS.statuses);
      if (rs) try { setStatuses(JSON.parse(rs)); } catch {}
      // Load the static jobs file written by the GitHub Action
      await loadJobs();
    })();
  }, []);

  /* ── Load jobs.json (written daily by GitHub Actions) ── */
  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/jobs.json?v=" + Date.now()); // cache-bust
      if (!res.ok) throw new Error(`Could not load jobs (HTTP ${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid jobs data format");
      setJobs(data);
      // Use the most recent fetchedAt as the "last updated" timestamp
      const newest = data.reduce((latest, j) =>
        j.fetchedAt && j.fetchedAt > latest ? j.fetchedAt : latest, "");
      if (newest) setLastFetched(newest);
    } catch (err) {
      setError(String(err.message));
    } finally {
      setLoading(false);
    }
  }

  function setStatus(id, s) {
    setStatuses(prev => {
      const next = { ...prev };
      s === "none" ? delete next[id] : (next[id] = s);
      sSet(STORAGE_KEYS.statuses, JSON.stringify(next));
      return next;
    });
  }

  const filtered = jobs.filter(j => {
    if (filter !== "all" && j.category !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q);
    }
    return true;
  });

  const applied = Object.values(statuses).filter(v => v === "applied").length;
  const saved = Object.values(statuses).filter(v => v === "saved").length;

  return (
    <div className="root">
      <div className="glow glow-1" />
      <div className="glow glow-2" />

      {/* ── Nav ── */}
      <nav className="nav">
        <div className="nav-logo">devrel<span className="accent">.</span>jobs</div>
        <div className="nav-right">
          {lastFetched && <span className="nav-meta">Updated {timeLabel(lastFetched)}</span>}
          <span className="nav-meta hide-mobile">Adejoke Haastrup</span>
          <button className="refresh-btn" onClick={loadJobs} disabled={loading} title="Reload jobs.json">
            {loading ? <Spinner /> : <RefreshIcon />}
            <span className="hide-mobile">{loading ? "Loading..." : "Reload"}</span>
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="hero">
        <div className="hero-tag">
          <span className="tag-dot" />
          Live Scraper · Auto-Updated Daily · No AI Required
        </div>
        <h1 className="hero-h1">
          Remote DevRel roles<br /><em>scraped fresh for you</em>
        </h1>
        <p className="hero-sub">
          Worldwide, EMEA &amp; Africa-friendly roles only. No US-restricted positions.<br />
          Scraped from Himalayas &amp; RemoteOK · Updated daily at 10am · Reminders via GitHub Issues
        </p>
      </header>

      {/* ── Stats ── */}
      <div className="stats">
        <StatCard label="Found" value={jobs.length} color="var(--accent)" />
        <StatCard label="Showing" value={filtered.length} color="var(--text)" />
        <StatCard label="Applied" value={applied} color="var(--green)" />
        <StatCard label="Saved" value={saved} color="var(--amber)" />
      </div>

      {/* ── Banners ── */}
      {loading && (
        <div className="banner banner-info">
          <Spinner /><span>Loading jobs...</span>
        </div>
      )}
      {error && (
        <div className="banner banner-error">
          <span>⚠ {error}</span>
          <button className="dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="controls">
        <div className="filters">
          {FILTERS.map(f => (
            <button key={f.key} className={`fbtn${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="search" type="text" placeholder="Search jobs, companies..." value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      {/* ── Job List ── */}
      <div className="jobs">
        {!filtered.length && !loading && (
          <div className="empty">
            <div className="empty-icon">🌍</div>
            <strong>{jobs.length ? "No matches" : "No jobs yet"}</strong>
            <p>{jobs.length ? "Try different filters or search terms." : <>Hit <strong>Refresh Jobs</strong> to search the web.</>}</p>
          </div>
        )}

        {filtered.map((job, i) => (
          <JobCard key={job.id} job={job} index={i} status={statuses[job.id] || "none"} onStatus={setStatus} />
        ))}
      </div>

      <footer className="footer">
        Built for Adejoke Haastrup · Remote Worldwide / EMEA / Africa · 2026 · Scraped via Himalayas &amp; RemoteOK
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

/* ─── Components ─── */
function StatCard({ label, value, color }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-val" style={{ color }}>{value}</div>
    </div>
  );
}

function JobCard({ job, index, status, onStatus }) {
  const cat = CAT_COLORS[job.category] || CAT_COLORS.other;
  return (
    <div className={`card${status === "applied" ? " card-applied" : status === "saved" ? " card-saved" : ""}`} style={{ animationDelay: `${index * 40}ms` }}>
      <div className="card-top">
        <div className="card-info">
          <div className="card-title">{job.title}</div>
          <div className="card-meta">{job.company} · {job.location}</div>
        </div>
        {status === "applied" && <span className="pill pill-green">✓ Applied</span>}
        {status === "saved" && <span className="pill pill-amber">★ Saved</span>}
      </div>
      <div className="badges">
        <span className="badge" style={{ color: cat.c, background: cat.bg, borderColor: cat.c + "33" }}>{job.category.toUpperCase()}</span>
        <span className="badge badge-teal">🌍 Remote</span>
        {job.salary !== "Not listed" && <span className="badge badge-green">{job.salary}</span>}
        <span className="badge badge-muted">via {job.source}</span>
      </div>
      <div className="actions">
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">View Job →</a>
        {status !== "applied" && <button className="btn btn-green" onClick={() => onStatus(job.id, "applied")}>Mark Applied</button>}
        {status === "none" && <button className="btn btn-amber" onClick={() => onStatus(job.id, "saved")}>Save</button>}
        {status !== "none" && <button className="btn btn-ghost" onClick={() => onStatus(job.id, "none")}>Clear</button>}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="spinner" />;
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

/* ─── Styles ─── */
const CSS = `
:root {
  --bg: #0a0c10;
  --surface: #12151c;
  --surface2: #1a1e28;
  --border: rgba(255,255,255,0.06);
  --border2: rgba(255,255,255,0.10);
  --text: #e4e7ee;
  --muted: #6b7394;
  --accent: #5b8eff;
  --accent-bg: rgba(91,142,255,0.10);
  --green: #34d399;
  --green-bg: rgba(52,211,153,0.10);
  --amber: #fbbf24;
  --amber-bg: rgba(251,191,36,0.10);
  --coral: #f87171;
  --coral-bg: rgba(248,113,113,0.08);
  --teal: #2dd4bf;
  --radius: 12px;
}

.root {
  font-family: 'DM Sans', -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  position: relative;
}

/* Glows */
.glow { position: fixed; pointer-events: none; border-radius: 50%; }
.glow-1 { top: -250px; right: -150px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(91,142,255,0.06), transparent 70%); }
.glow-2 { bottom: -200px; left: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(167,139,250,0.04), transparent 70%); }

/* Nav */
.nav {
  position: sticky; top: 0; z-index: 100;
  background: rgba(10,12,16,0.92); backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  padding: 0 24px; height: 54px;
  display: flex; align-items: center; justify-content: space-between;
}
.nav-logo { font-family: 'Instrument Serif', Georgia, serif; font-size: 20px; color: var(--text); }
.accent { color: var(--accent); }
.nav-right { display: flex; align-items: center; gap: 14px; }
.nav-meta { font-size: 12px; color: var(--muted); }
.refresh-btn {
  display: flex; align-items: center; gap: 6px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid rgba(91,142,255,0.25); border-radius: 8px;
  padding: 6px 14px; font-size: 13px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: all 0.2s;
}
.refresh-btn:hover { background: rgba(91,142,255,0.18); }
.refresh-btn:disabled { opacity: 0.5; cursor: wait; }

/* Hero */
.hero { padding: 44px 24px 10px; max-width: 1120px; margin: 0 auto; position: relative; z-index: 1; }
.hero-tag {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 14px;
}
.tag-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s ease-in-out infinite; }
.hero-h1 {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: clamp(1.6rem, 4vw, 2.8rem); font-weight: 400; line-height: 1.15; margin-bottom: 12px;
}
.hero-h1 em { color: var(--accent); font-style: italic; }
.hero-sub { font-size: 14px; color: var(--muted); max-width: 560px; line-height: 1.6; }

/* Stats */
.stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
  max-width: 1120px; margin: 18px auto; padding: 0 24px;
  position: relative; z-index: 1;
}
.stat {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 14px 16px;
}
.stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }
.stat-val { font-size: 24px; font-weight: 700; }

/* Banners */
.banner { max-width: 1120px; margin: 10px auto; padding: 0 24px; position: relative; z-index: 1; }
.banner-info {
  display: flex; align-items: center; gap: 10px;
  background: var(--accent-bg); border: 1px solid rgba(91,142,255,0.2);
  border-radius: 10px; padding: 10px 16px; font-size: 13px; color: var(--accent);
}
.banner-error {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--coral-bg); border: 1px solid rgba(248,113,113,0.25);
  border-radius: 10px; padding: 10px 16px; font-size: 13px; color: var(--coral);
}
.dismiss { background: none; border: none; color: var(--coral); cursor: pointer; font-size: 16px; padding: 0 2px; }

/* Controls */
.controls {
  max-width: 1120px; margin: 14px auto; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px; flex-wrap: wrap; position: relative; z-index: 1;
}
.filters { display: flex; gap: 6px; flex-wrap: wrap; }
.fbtn {
  background: rgba(255,255,255,0.03); border: 1px solid var(--border2);
  border-radius: 20px; padding: 5px 14px;
  font-size: 12px; font-weight: 500; color: var(--muted);
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.fbtn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
.fbtn.active { background: var(--accent-bg); border-color: rgba(91,142,255,0.35); color: var(--accent); }
.search {
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: 8px; padding: 7px 14px;
  font-size: 13px; color: var(--text); font-family: inherit; outline: none;
  min-width: 200px; transition: border-color 0.2s;
}
.search:focus { border-color: rgba(91,142,255,0.4); }

/* Jobs list */
.jobs {
  max-width: 1120px; margin: 0 auto; padding: 6px 24px 48px;
  display: flex; flex-direction: column; gap: 10px;
  position: relative; z-index: 1;
}
.empty { text-align: center; padding: 56px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 10px; }
.empty strong { font-size: 16px; display: block; margin-bottom: 6px; }
.empty p { color: var(--muted); font-size: 14px; }

/* Card */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 16px 20px;
  transition: border-color 0.2s, box-shadow 0.2s;
  animation: fadeIn 0.3s ease-out both;
}
.card:hover { border-color: var(--border2); box-shadow: 0 2px 20px rgba(0,0,0,0.15); }
.card-applied { border-color: rgba(52,211,153,0.25); background: linear-gradient(135deg, var(--surface), rgba(52,211,153,0.03)); }
.card-saved { border-color: rgba(251,191,36,0.25); background: linear-gradient(135deg, var(--surface), rgba(251,191,36,0.03)); }
.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.card-info { flex: 1; min-width: 0; }
.card-title { font-size: 15px; font-weight: 600; line-height: 1.3; }
.card-meta { font-size: 13px; color: var(--muted); margin-top: 2px; }
.pill { font-size: 11px; font-weight: 600; border-radius: 20px; padding: 2px 10px; white-space: nowrap; flex-shrink: 0; border: 1px solid; }
.pill-green { background: var(--green-bg); color: var(--green); border-color: rgba(52,211,153,0.3); }
.pill-amber { background: var(--amber-bg); color: var(--amber); border-color: rgba(251,191,36,0.3); }

/* Badges */
.badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.badge { font-size: 10px; font-weight: 600; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 5px; border: 1px solid; }
.badge-teal { background: rgba(45,212,191,0.08); color: var(--teal); border-color: rgba(45,212,191,0.2); font-weight: 500; }
.badge-green { background: var(--green-bg); color: var(--green); border-color: rgba(52,211,153,0.2); font-weight: 500; }
.badge-muted { background: rgba(255,255,255,0.02); color: var(--muted); border-color: var(--border); font-weight: 500; }

/* Actions */
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: opacity 0.15s; border: 1px solid transparent;
  text-decoration: none; display: inline-block;
}
.btn:hover { opacity: 0.85; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-green { background: var(--green-bg); color: var(--green); border-color: rgba(52,211,153,0.25); }
.btn-amber { background: var(--amber-bg); color: var(--amber); border-color: rgba(251,191,36,0.25); }
.btn-ghost { background: rgba(255,255,255,0.03); color: var(--muted); border-color: var(--border2); }

/* Spinner */
.spinner {
  display: inline-block; width: 14px; height: 14px; flex-shrink: 0;
  border: 2px solid rgba(91,142,255,0.2); border-top-color: var(--accent);
  border-radius: 50%; animation: spin 0.7s linear infinite;
}

/* Footer */
.footer {
  text-align: center; padding: 28px 24px; font-size: 12px;
  color: var(--muted); border-top: 1px solid var(--border);
  position: relative; z-index: 1;
}

/* Responsive */
@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .hide-mobile { display: none; }
  .hero-h1 { font-size: 1.5rem; }
  .controls { flex-direction: column; align-items: stretch; }
  .search { min-width: auto; }
}
`;
