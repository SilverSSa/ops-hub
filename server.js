const path = require("path");
const express = require("express");
const { AsyncLocalStorage } = require("async_hooks");
const { d1Query, ensureWordsTable } = require("./d1Client.js");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 2223;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const R2_BUCKET = "ops0hub0storage";
const R2_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}`;
const requestState = new AsyncLocalStorage();

function d1Rows(result) {
  return Array.isArray(result) && result[0] && Array.isArray(result[0].results) ? result[0].results : (Array.isArray(result) ? result : []);
}

function jsonText(value, fallback) {
  if (value === undefined) return fallback;
  return typeof value === "string" ? value : JSON.stringify(value ?? JSON.parse(fallback));
}

function friendlyR2Error(action, status, text) {
  let message = "";
  try {
    const data = JSON.parse(text || "{}");
    message = data.errors?.[0]?.message || "";
  } catch {}
  if (status === 401 || status === 403 || /authentication|unauthorized|forbidden/i.test(message || text || "")) {
    return `R2 ${action} is unavailable because CF_API_TOKEN does not have R2 access. Update .env with a Cloudflare token that includes Account > Cloudflare R2 > Edit, then restart the server.`;
  }
  return `R2 ${action} failed${status ? ` (${status})` : ""}.`;
}

function normalizeR2Object(object) {
  return {
    name: object?.name || object?.key || "",
    size: Number(object?.size || 0),
    uploaded: object?.uploaded || object?.last_modified || object?.modified || null
  };
}

async function ensureColumn(table, column, definition) {
  try {
    await d1Query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (e) {
    if (!/duplicate column|already exists/i.test(e.message || "")) throw e;
  }
}

async function ensureFutureProjectsTable() {
  await d1Query("CREATE TABLE IF NOT EXISTS future_projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'idea', priority TEXT DEFAULT 'medium', tags TEXT DEFAULT '[]', phases TEXT DEFAULT '[]', board TEXT DEFAULT '{}', created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))");
  await ensureColumn("future_projects", "phases", "TEXT DEFAULT '[]'");
  await ensureColumn("future_projects", "board", "TEXT DEFAULT '{}'");
}

app.use(express.json());

app.use((req, res, next) => {
  requestState.run({ backupErrors: [], backupKeys: [] }, () => {
    const json = res.json.bind(res);
    res.json = (body) => {
      const state = requestState.getStore();
      if (body && typeof body === "object" && !Array.isArray(body) && !body.error && state?.backupErrors?.length) {
        body.backup = { ok: false, error: state.backupErrors[0] };
      } else if (body && typeof body === "object" && !Array.isArray(body) && !body.error && state?.backupKeys?.length) {
        body.backup = { ok: true, count: state.backupKeys.length, key: state.backupKeys[state.backupKeys.length - 1] };
      }
      return json(body);
    };
    next();
  });
});

// ── AUTH MIDDLEWARE ──────────────────────────────────────
const AUTH_USER = process.env.AUTH_USER || "SilverSa";
const AUTH_PASS = process.env.AUTH_PASS || "Xd123Xd123@";

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === AUTH_USER && password === AUTH_PASS) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials" });
  }
});

function authMiddleware(req, res, next) {
  if (req.path === "/login" || req.path === "/telegram" || req.path === "/files/download" || req.path === "/ai/chat/poll" || req.path === "/api/ai/chat/poll") return next();
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing authorization header" });
  
  const [scheme, credentials] = auth.split(" ");
  if (scheme !== "Basic") return res.status(401).json({ error: "Invalid auth scheme" });
  
  const decoded = Buffer.from(credentials, "base64").toString();
  const [user, pass] = decoded.split(":");
  
  if (user === AUTH_USER && pass === AUTH_PASS) {
    next();
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
}

app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.get('/favicon.ico', (_req, res) => res.status(204).end());

// ── PUBLIC CHAT ROUTES (before auth) ──────────────
app.get("/api/ai/chat/poll", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || "default";
    await d1Query("CREATE TABLE IF NOT EXISTS chat_bridge (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, delivered INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
    const rows = d1Rows(await d1Query("SELECT * FROM chat_bridge WHERE session_id = ? AND delivered = 0 AND sender = 'bot' ORDER BY created_at ASC", [sessionId]));
    for (const row of rows) {
      await d1Query("UPDATE chat_bridge SET delivered = 1 WHERE id = ?", [row.id]);
    }
    res.json(rows.map(r => ({ sender: r.sender, text: r.text, time: r.created_at })));
  } catch (e) { res.json([]); }
});

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message = "", sessionId = "default" } = req.body || {};
    const lowMsg = String(message).toLowerCase().trim();
    const pending = PENDING_ACTIONS.get(sessionId);
    if (pending && (lowMsg === "yes" || lowMsg === "confirm" || lowMsg === "accept" || lowMsg === "ok" || lowMsg === "sure" || lowMsg === "y")) {
      PENDING_ACTIONS.delete(sessionId);
      return res.json({ response: await executeToolAction(pending.action), action: pending.uiAction || null });
    }
    if (pending && (lowMsg === "no" || lowMsg === "cancel" || lowMsg === "reject" || lowMsg === "stop" || lowMsg === "n")) {
      PENDING_ACTIONS.delete(sessionId);
      return res.json({ response: "Alright, I've cancelled that action. What else can I help with?" });
    }
    let result = null;
    let llmText = null;
    if (process.env.OPENAI_API_KEY) llmText = await callOpenAI(message);
    if (!llmText && process.env.N8N_AI_WEBHOOK_URL) { result = await callN8N(message); if (result) llmText = JSON.stringify(result); }
    if (llmText) {
      const parsed = result || parseAIResponse(llmText);
      if (parsed.needsConfirm && parsed.confirmAction) {
        PENDING_ACTIONS.set(sessionId, { action: parsed.confirmAction, uiAction: parsed.action || null });
        return res.json({ response: parsed.response, needsConfirm: true, action: null });
      }
      if (parsed.action && parsed.action.type) {
        const actionResult = await executeToolAction(parsed.action);
        return res.json({ response: parsed.response + "\n\n" + actionResult, action: mapUIAction(parsed.action) });
      }
      return res.json({ response: parsed.response || llmText, action: null });
    }
    const fallback = await runAIFallback(message);
    bridgeToTelegram(sessionId, message);
    res.json(fallback);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Only apply auth to /api routes
app.use("/api", authMiddleware);

app.post("/api/setup", async (_req, res) => {
  try {
    await ensureWordsTable();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── WORDS (legacy) ────────────────────────────────────
app.get("/api/words", async (_req, res) => {
  try {
    const result = await d1Query("SELECT * FROM words ORDER BY id DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/words", async (req, res) => {
  const { word, definition } = req.body;
  if (!word || !definition) return res.status(400).json({ error: "word and definition required" });
  try {
    await d1Query("INSERT INTO words (word, definition) VALUES (?, ?)", [word, definition]);
    res.status(201).json({ message: "Created" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.patch("/api/words/:id", async (req, res) => {
  const { id } = req.params;
  const { word, definition } = req.body;
  if (!word || !definition) return res.status(400).json({ error: "word and definition required" });
  try {
    const old = await d1Query("SELECT * FROM words WHERE id = ?", [id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("words", id, current);
    await d1Query("UPDATE words SET word = ?, definition = ? WHERE id = ?", [word, definition, id]);
    res.json({ message: "Updated" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete("/api/words/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const old = await d1Query("SELECT * FROM words WHERE id = ?", [id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("words", id, current);
    await d1Query("DELETE FROM words WHERE id = ?", [id]);
    res.json({ message: "Deleted" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── GDDs ─────────────────────────────────────────────
app.get("/api/gdds", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS gdds (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '', created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))");
    const result = await d1Query("SELECT * FROM gdds ORDER BY updated_at DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/gdds", async (req, res) => {
  try {
    const { title, body = "" } = req.body;
    const id = "gdd_" + Date.now();
    await d1Query("INSERT INTO gdds (id, title, body) VALUES (?, ?, ?)", [id, title, body]);
    res.status(201).json({ id, title, body, created_at: Math.floor(Date.now()/1000), updated_at: Math.floor(Date.now()/1000) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/gdds/:id", async (req, res) => {
  try {
    const { title, body } = req.body;
    const old = await d1Query("SELECT * FROM gdds WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("gdds", req.params.id, current);
    await d1Query("UPDATE gdds SET title = ?, body = ?, updated_at = unixepoch() WHERE id = ?", [title, body, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/gdds/:id", async (req, res) => {
  try {
    const old = await d1Query("SELECT * FROM gdds WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("gdds", req.params.id, current);
    await d1Query("DELETE FROM gdds WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Custom Sites ─────────────────────────────────────
app.get("/api/custom-sites", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS custom_sites (id TEXT PRIMARY KEY, name TEXT, url TEXT, note TEXT, created_at INTEGER DEFAULT (unixepoch()))");
    const result = await d1Query("SELECT * FROM custom_sites ORDER BY created_at DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/custom-sites", async (req, res) => {
  try {
    const { name, url, note = "" } = req.body;
    const id = "cs_" + Date.now();
    await d1Query("INSERT INTO custom_sites (id, name, url, note) VALUES (?, ?, ?, ?)", [id, name, url, note]);
    res.status(201).json({ id, name, url, note, _manual: true, created_at: Math.floor(Date.now()/1000) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/custom-sites/:id", async (req, res) => {
  try {
    const { name, url, note } = req.body;
    const old = await d1Query("SELECT * FROM custom_sites WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("custom-sites", req.params.id, current);
    await d1Query("UPDATE custom_sites SET name = ?, url = ?, note = ? WHERE id = ?", [name, url, note, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/custom-sites/:id", async (req, res) => {
  try {
    const old = await d1Query("SELECT * FROM custom_sites WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("custom-sites", req.params.id, current);
    await d1Query("DELETE FROM custom_sites WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Future Projects ─────────────────────────────────
app.get("/api/projects", async (_req, res) => {
  try {
    await ensureFutureProjectsTable();
    const result = await d1Query("SELECT * FROM future_projects ORDER BY created_at DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/projects", async (req, res) => {
  try {
    await ensureFutureProjectsTable();
    const { title, description = "", status = "idea", priority = "medium", tags = "[]", phases = "[]", board = "{}" } = req.body;
    const id = "fp_" + Date.now();
    const phasesText = jsonText(phases, "[]");
    const boardText = jsonText(board, "{}");
    await d1Query("INSERT INTO future_projects (id, title, description, status, priority, tags, phases, board) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, title, description, status, priority, jsonText(tags, "[]"), phasesText, boardText]);
    res.status(201).json({ id, title, description, status, priority, tags: jsonText(tags, "[]"), phases: phasesText, board: boardText, created_at: Math.floor(Date.now()/1000), updated_at: Math.floor(Date.now()/1000) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    await ensureFutureProjectsTable();
    const old = await d1Query("SELECT * FROM future_projects WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (!current) return res.status(404).json({ error: "Project not found" });
    await backupItem("projects", req.params.id, current);
    const next = {
      title: req.body.title ?? current.title,
      description: req.body.description ?? current.description ?? "",
      status: req.body.status ?? current.status ?? "idea",
      priority: req.body.priority ?? current.priority ?? "medium",
      tags: jsonText(req.body.tags, current.tags || "[]"),
      phases: jsonText(req.body.phases, current.phases || "[]"),
      board: jsonText(req.body.board, current.board || "{}")
    };
    await d1Query("UPDATE future_projects SET title = ?, description = ?, status = ?, priority = ?, tags = ?, phases = ?, board = ?, updated_at = unixepoch() WHERE id = ?", [next.title, next.description, next.status, next.priority, next.tags, next.phases, next.board, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    await ensureFutureProjectsTable();
    const old = await d1Query("SELECT * FROM future_projects WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("projects", req.params.id, current);
    await d1Query("DELETE FROM future_projects WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Cloudflare Sites Proxy ──────────────────────────
app.get("/api/cf-sites", async (_req, res) => {
  try {
    if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
      return res.json([]);
    }
    const zRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=alsfeany.dev`, {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" }
    });
    const zJson = await zRes.json();
    const zoneId = zJson.result && zJson.result[0] ? zJson.result[0].id : null;
    if (!zoneId) return res.json([]);

    const dRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`, {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" }
    });
    const dJson = await dRes.json();
    const records = (dJson.result || []).filter(r => ["A","CNAME","AAAA"].includes(r.type));
    res.json(records);
  } catch (e) {
    res.json([]);
  }
});

// ── CATEGORIES ───────────────────────────────────────
app.get("/api/categories", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '📁', color TEXT DEFAULT '#6366f1', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
    const result = await d1Query("SELECT * FROM categories ORDER BY sort_order ASC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.json([]); }
});

app.post("/api/categories", async (req, res) => {
  try {
    const { name, description = "", icon = "📁", color = "#6366f1" } = req.body;
    const id = "cat_" + Date.now();
    await d1Query("INSERT INTO categories (id, name, description, icon, color) VALUES (?,?,?,?,?)", [id, name, description, icon, color]);
    res.status(201).json({ id, name, description, icon, color });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/categories/:id", async (req, res) => {
  try {
    const { name, description, icon, color } = req.body;
    const old = await d1Query("SELECT * FROM categories WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("categories", req.params.id, current);
    await d1Query("UPDATE categories SET name=?, description=?, icon=?, color=? WHERE id=?", [name, description, icon, color, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const old = await d1Query("SELECT * FROM categories WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("categories", req.params.id, current);
    await d1Query("DELETE FROM categories WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUBCATEGORIES ───────────────────────────────────
app.get("/api/subcategories", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS subcategories (id TEXT PRIMARY KEY, root_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '📂', type TEXT DEFAULT 'regular', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
    const rootId = _req.query.root_id;
    const sql = rootId
      ? "SELECT * FROM subcategories WHERE root_id=? ORDER BY sort_order ASC"
      : "SELECT * FROM subcategories ORDER BY sort_order ASC";
    const params = rootId ? [rootId] : [];
    const result = await d1Query(sql, params);
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.json([]); }
});

app.post("/api/subcategories", async (req, res) => {
  try {
    const { root_id, name, description = "", icon = "📂", type = "regular" } = req.body;
    const id = "sub_" + Date.now();
    await d1Query("INSERT INTO subcategories (id, root_id, name, description, icon, type) VALUES (?,?,?,?,?,?)", [id, root_id, name, description, icon, type]);
    res.status(201).json({ id, root_id, name, description, icon, type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/subcategories/:id", async (req, res) => {
  try {
    const { name, description, icon, type } = req.body;
    const old = await d1Query("SELECT * FROM subcategories WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("subcategories", req.params.id, current);
    await d1Query("UPDATE subcategories SET name=?, description=?, icon=?, type=? WHERE id=?", [name, description, icon, type, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/subcategories/:id", async (req, res) => {
  try {
    const old = await d1Query("SELECT * FROM subcategories WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("subcategories", req.params.id, current);
    await d1Query("DELETE FROM subcategories WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LINKS ───────────────────────────────────────────
app.get("/api/links", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, root_id TEXT NOT NULL, sub_id TEXT, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '🌐', image_url TEXT DEFAULT '', tags TEXT DEFAULT '[]', created_at INTEGER DEFAULT (unixepoch()))");
    await ensureColumn("links", "type", "TEXT DEFAULT 'website'");
    await ensureColumn("links", "sort_order", "INTEGER DEFAULT 0");
    const result = await d1Query("SELECT * FROM links ORDER BY created_at DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.json([]); }
});

app.post("/api/links", async (req, res) => {
  try {
    const { root_id, sub_id = null, name, url, description = "", icon = "🌐", image_url = "", tags = [], type = "website" } = req.body;
    const id = "lnk_" + Date.now();
    await d1Query("INSERT INTO links (id, root_id, sub_id, name, url, description, icon, image_url, tags, type) VALUES (?,?,?,?,?,?,?,?,?,?)", [id, root_id, sub_id, name, url, description, icon, image_url, JSON.stringify(tags), type]);
    res.status(201).json({ id, root_id, sub_id, name, url, description, icon, image_url, tags, type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/links/:id", async (req, res) => {
  try {
    const { name, url, description, icon, image_url, tags, sub_id, root_id, type } = req.body;
    const old = await d1Query("SELECT * FROM links WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("links", req.params.id, current);
    await d1Query("UPDATE links SET name=?, url=?, description=?, icon=?, image_url=?, tags=?, sub_id=?, root_id=?, type=? WHERE id=?", [name, url, description, icon, image_url||"", JSON.stringify(tags||[]), sub_id||null, root_id, type||"website", req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/links/:id", async (req, res) => {
  try {
    const old = await d1Query("SELECT * FROM links WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("links", req.params.id, current);
    await d1Query("DELETE FROM links WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// MD file proxy — fetches raw content from a URL
app.get("/api/links/:id/md", async (req, res) => {
  try {
    const rows = d1Rows(await d1Query("SELECT * FROM links WHERE id = ?", [req.params.id]));
    if (!rows.length) return res.status(404).json({ error: "Link not found" });
    const link = rows[0];
    if (!link.url) return res.status(400).json({ error: "No URL" });
    const r = await fetch(link.url, { headers: { 'Accept': 'text/markdown,text/plain,*/*' }, redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: `Upstream returned ${r.status}` });
    const text = await r.text();
    res.set('Content-Type', 'text/plain; charset=utf-8').send(text);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COMMANDS PANEL ─────────────────────────────────
app.get("/api/commands", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, name TEXT NOT NULL, command TEXT NOT NULL, category TEXT DEFAULT 'project', description TEXT DEFAULT '', os TEXT DEFAULT 'any', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
    // Seed useful defaults if table is empty
    const count = d1Rows(await d1Query("SELECT COUNT(*) as c FROM commands"))[0]?.c || 0;
    if (count === 0) {
      const seeds = [
        // Project
        { name:"Start Dev Server", command:"npm run dev", category:"project", description:"Launch the local development server" },
        { name:"Build Project", command:"npm run build", category:"project", description:"Compile and bundle for production" },
        { name:"Run Tests", command:"npm test", category:"project", description:"Execute the test suite" },
        { name:"Install Dependencies", command:"npm install", category:"project", description:"Install all package dependencies" },
        { name:"Git Status", command:"git status", category:"project", description:"Show working tree status" },
        { name:"Git Pull", command:"git pull", category:"project", description:"Fetch and merge remote changes" },
        { name:"Quick Commit", command:"git add . && git commit -m \"update\"", category:"project", description:"Stage all and commit with message" },
        { name:"Lint Fix", command:"npx eslint . --fix", category:"project", description:"Auto-fix linting errors" },
        { name:"Type Check", command:"npx tsc --noEmit", category:"project", description:"Run TypeScript type checking" },
        { name:"List Node Modules Size", command:"dir node_modules /s 2>nul | findstr /i \"files\"", category:"project", description:"Check node_modules disk usage" },
        // Debug
        { name:"Listening Ports", command:"netstat -ano | findstr LISTENING", category:"debug", description:"Show all processes listening on ports" },
        { name:"Find Node Process", command:"tasklist | findstr node", category:"debug", description:"List running Node.js processes" },
        { name:"Flush DNS", command:"ipconfig /flushdns", category:"debug", description:"Clear the DNS resolver cache" },
        { name:"Ping Test", command:"ping google.com -n 4", category:"debug", description:"Test internet connectivity (4 pings)" },
        { name:"DNS Lookup", command:"nslookup google.com", category:"debug", description:"Query DNS for a domain" },
        { name:"Trace Route", command:"tracert google.com", category:"debug", description:"Trace network route to host" },
        { name:"Check Disk", command:"chkdsk C:", category:"debug", description:"Check C: drive for errors" },
        { name:"Kill Port 3000", command:"for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :3000') do taskkill /f /pid %a", category:"debug", description:"Force-kill the process on port 3000" },
        { name:"System Info", command:"systeminfo | findstr /i \"os memory processor\"", category:"debug", description:"Quick system hardware summary" },
        // Windows
        { name:"System File Checker", command:"sfc /scannow", category:"windows", description:"Scan and repair Windows system files", os:"win32" },
        { name:"Repair Windows Image", command:"dism /online /cleanup-image /restorehealth", category:"windows", description:"Repair the Windows component store", os:"win32" },
        { name:"Disk Cleanup", command:"cleanmgr", category:"windows", description:"Open Disk Cleanup utility", os:"win32" },
        { name:"System Config", command:"msconfig", category:"windows", description:"Open System Configuration", os:"win32" },
        { name:"DirectX Diagnostic", command:"dxdiag", category:"windows", description:"Open DirectX diagnostic tool", os:"win32" },
        { name:"Restart Now", command:"shutdown /r /t 0", category:"windows", description:"Restart computer immediately", os:"win32" },
        { name:"Group Policy Update", command:"gpupdate /force", category:"windows", description:"Force group policy refresh", os:"win32" },
        { name:"Winget Upgrade All", command:"winget upgrade --all", category:"windows", description:"Upgrade all winget packages", os:"win32" },
        { name:"Resource Monitor", command:"resmon", category:"windows", description:"Open Resource Monitor", os:"win32" },
      ];
      for (const s of seeds) {
        await d1Query("INSERT INTO commands (id, name, command, category, description, os) VALUES (?,?,?,?,?,?)",
          ["cmd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), s.name, s.command, s.category, s.description, s.os || "any"]);
      }
    }
    const result = await d1Query("SELECT * FROM commands ORDER BY category, sort_order, created_at DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.json([]); }
});

app.post("/api/commands", async (req, res) => {
  try {
    const { name, command, category = "project", description = "", os = "any" } = req.body;
    const id = "cmd_" + Date.now();
    await d1Query("INSERT INTO commands (id, name, command, category, description, os) VALUES (?,?,?,?,?,?)", [id, name, command, category, description, os]);
    res.status(201).json({ id, name, command, category, description, os });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/commands/:id", async (req, res) => {
  try {
    const { name, command, category, description, os } = req.body;
    await d1Query("UPDATE commands SET name=?, command=?, category=?, description=?, os=? WHERE id=?", [name, command, category||"project", description||"", os||"any", req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/commands/:id", async (req, res) => {
  try {
    await d1Query("DELETE FROM commands WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── APP LAUNCHER ───────────────────────────────────
app.get("/api/apps", async (_req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, category TEXT DEFAULT 'gamedev', icon TEXT DEFAULT '🎮', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
    const count = d1Rows(await d1Query("SELECT COUNT(*) as c FROM apps"))[0]?.c || 0;
    if (count === 0) {
      const seeds = [
        // Game Dev
        { name:"Blender", path:"C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe", category:"gamedev", icon:"🧊" },
        { name:"Unity Hub", path:"C:\\Program Files\\Unity Hub\\Unity Hub.exe", category:"gamedev", icon:"🎮" },
        { name:"Godot", path:"C:\\Program Files\\Godot\\Godot_v4.3-stable_win64.exe", category:"gamedev", icon:"🤖" },
        { name:"VS Code", path:"C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", category:"gamedev", icon:"💻" },
        { name:"Unreal Editor", path:"C:\\Program Files\\Epic Games\\UE_5.4\\Engine\\Binaries\\Win64\\UnrealEditor.exe", category:"gamedev", icon:"🎯" },
        // Design
        { name:"Figma", path:"C:\\Users\\%USERNAME%\\AppData\\Local\\Figma\\Figma.exe", category:"design", icon:"🎨" },
        { name:"Photoshop", path:"C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe", category:"design", icon:"🖼️" },
        { name:"GIMP", path:"C:\\Program Files\\GIMP 2\\bin\\gimp-2.10.exe", category:"design", icon:"🖌️" },
        { name:"Inkscape", path:"C:\\Program Files\\Inkscape\\bin\\inkscape.exe", category:"design", icon:"✏️" },
        // Tools
        { name:"Windows Terminal", path:"wt.exe", category:"tools", icon:"⬛" },
        { name:"Task Manager", path:"taskmgr.exe", category:"tools", icon:"📊" },
        { name:"Notepad++", path:"C:\\Program Files\\Notepad++\\notepad++.exe", category:"tools", icon:"📝" },
        { name:"Postman", path:"C:\\Users\\%USERNAME%\\AppData\\Local\\Postman\\Postman.exe", category:"tools", icon:"📮" },
        { name:"Docker Desktop", path:"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe", category:"tools", icon:"🐋" },
      ];
      for (const s of seeds) {
        await d1Query("INSERT INTO apps (id, name, path, category, icon) VALUES (?,?,?,?,?)",
          ["app_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), s.name, s.path, s.category, s.icon]);
      }
    }
    const result = await d1Query("SELECT * FROM apps ORDER BY category, sort_order, created_at DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.json([]); }
});

app.post("/api/apps", async (req, res) => {
  try {
    const { name, path, category = "gamedev", icon = "🎮" } = req.body;
    if (!name || !path) return res.status(400).json({ error: "Name and path required" });
    const id = "app_" + Date.now();
    await d1Query("INSERT INTO apps (id, name, path, category, icon) VALUES (?,?,?,?,?)", [id, name, path, category, icon]);
    res.status(201).json({ id, name, path, category, icon });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/apps/:id", async (req, res) => {
  try {
    const { name, path, category, icon } = req.body;
    await d1Query("UPDATE apps SET name=?, path=?, category=?, icon=? WHERE id=?", [name, path, category||"gamedev", icon||"🎮", req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/apps/:id", async (req, res) => {
  try {
    await d1Query("DELETE FROM apps WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EXEC (Windows commands & app launch) ──────────
const { exec } = require("child_process");

app.post("/api/commands/run", (req, res) => {
  try {
    const { command } = req.body || {};
    if (!command) return res.status(400).json({ error: "No command provided" });
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : (process.env.SHELL || "/bin/sh");
    const shellFlag = isWin ? "/c" : "-c";
    exec(`"${shell}" ${shellFlag} "${command}"`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return res.json({ ok: false, output: stderr || err.message, code: err.code });
      res.json({ ok: true, output: stdout || stderr || "Command completed with no output." });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/apps/launch", (req, res) => {
  try {
    const { path: appPath } = req.body || {};
    if (!appPath) return res.status(400).json({ error: "No path provided" });
    const isWin = process.platform === "win32";
    const cmd = isWin ? `start "" "${appPath}"` : `open "${appPath}"`;
    exec(cmd, { shell: isWin ? "cmd.exe" : "/bin/sh" }, (err) => {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ───────────────────────────────────────────
app.get("/api/stats", async (_req, res) => {
  try {
    const cats = (await d1Query("SELECT COUNT(*) as c FROM categories")).c || 0;
    const subs = (await d1Query("SELECT COUNT(*) as c FROM subcategories")).c || 0;
    const links = (await d1Query("SELECT COUNT(*) as c FROM links")).c || 0;
    res.json({ cats, subs, links });
  } catch (e) { res.json({ cats: 0, subs: 0, links: 0 }); }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ── VOCAB ───────────────────────────────────────────
app.get("/api/vocab", async (req, res) => {
  try {
    await d1Query("CREATE TABLE IF NOT EXISTS vocab (id TEXT PRIMARY KEY, word TEXT NOT NULL, translation TEXT NOT NULL, example TEXT DEFAULT '', source_lang TEXT DEFAULT 'en', target_lang TEXT DEFAULT 'ar', tags TEXT DEFAULT '[]', created_at INTEGER DEFAULT (unixepoch()))");
    const lang = req.query.lang;
    const search = req.query.q;
    let sql, params = [];
    if (search) {
      sql = "SELECT * FROM vocab WHERE word LIKE ? OR translation LIKE ? OR example LIKE ? ORDER BY created_at DESC";
      params = [`%${search}%`, `%${search}%`, `%${search}%`];
    } else if (lang) {
      sql = "SELECT * FROM vocab WHERE source_lang = ? OR target_lang = ? ORDER BY created_at DESC";
      params = [lang, lang];
    } else {
      sql = "SELECT * FROM vocab ORDER BY created_at DESC";
    }
    const result = await d1Query(sql, params);
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows || []);
  } catch (e) { res.json([]); }
});

app.post("/api/vocab", async (req, res) => {
  try {
    const { word, translation, example = "", source_lang = "en", target_lang = "ar", tags = "[]" } = req.body;
    if (!word || !translation) return res.status(400).json({ error: "word and translation required" });
    const id = "voc_" + Date.now();
    await d1Query("INSERT INTO vocab (id, word, translation, example, source_lang, target_lang, tags) VALUES (?,?,?,?,?,?,?)", [id, word, translation, example, source_lang, target_lang, tags]);
    res.status(201).json({ id, word, translation, example, source_lang, target_lang, tags, created_at: Math.floor(Date.now()/1000) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/vocab/:id", async (req, res) => {
  try {
    const { word, translation, example, source_lang, target_lang, tags = "[]" } = req.body;
    const old = await d1Query("SELECT * FROM vocab WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("vocab", req.params.id, current);
    await d1Query("UPDATE vocab SET word=?, translation=?, example=?, source_lang=?, target_lang=?, tags=? WHERE id=?", [word, translation, example, source_lang, target_lang, tags, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/vocab/:id", async (req, res) => {
  try {
    const old = await d1Query("SELECT * FROM vocab WHERE id = ?", [req.params.id]);
    const current = d1Rows(old)[0];
    if (current) await backupItem("vocab", req.params.id, current);
    await d1Query("DELETE FROM vocab WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TELEGRAM BOT WEBHOOK ──────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

app.post("/api/telegram", async (req, res) => {
  res.json({ ok: true });
  try {
    const msg = req.body.message || req.body.edited_message;
    if (!msg || !msg.text) return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Vocab commands
    if (text.startsWith("#add ") || text.startsWith("/add ")) {
      const prefix = text.startsWith("#add ") ? "#add " : "/add ";
      const parts = text.slice(prefix.length).split("|").map(s => s.trim());
      const word = parts[0] || "";
      const translation = parts[1] || "";
      const example = parts[2] || "";
      if (!word || !translation) {
        await sendTelegram(chatId, "Usage: #add word | translation | example\nExample: #add Hello | مرحبا | Hello, how are you?");
        return;
      }
      const id = "voc_" + Date.now();
      await d1Query("INSERT INTO vocab (id, word, translation, example, source_lang, target_lang) VALUES (?,?,?,?,?,?)", [id, word, translation, example, "en", "ar"]);
      await sendTelegram(chatId, `✅ Added: ${word} = ${translation}\n📝 ${example || "(no example)"}`);
    } else if (text.startsWith("#list") || text.startsWith("/list")) {
      const result = await d1Query("SELECT * FROM vocab ORDER BY created_at DESC LIMIT 20");
      const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
      if (!rows.length) { await sendTelegram(chatId, "No words yet. Use #add to add one."); return; }
      const list = rows.map(r => `• ${r.word} = ${r.translation}${r.example ? '\n  💬 ' + r.example : ''}`).join('\n\n');
      await sendTelegram(chatId, `📚 Your words:\n\n${list}`);
    } else if (text.startsWith("#search ") || text.startsWith("/search ")) {
      const q = text.startsWith("#search ") ? text.slice(8) : text.slice(9);
      const result = await d1Query("SELECT * FROM vocab WHERE word LIKE ? OR translation LIKE ? LIMIT 10", [`%${q}%`, `%${q}%`]);
      const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
      if (!rows.length) { await sendTelegram(chatId, `No results for "${q}"`); return; }
      await sendTelegram(chatId, rows.map(r => `• ${r.word} = ${r.translation}`).join('\n'));
    } else {
      // Forward to AI chat system
      try {
        let aiResponse = null;
        if (process.env.N8N_AI_WEBHOOK_URL) {
          aiResponse = await callN8N(text);
        }
        if (aiResponse) {
          let reply = aiResponse.response || aiResponse.text || aiResponse.message || JSON.stringify(aiResponse);
          await sendTelegram(chatId, reply);
          await bridgeFromTelegram("default", reply);
        } else {
          const fallback = await runAIFallback(text);
          await sendTelegram(chatId, fallback.response || "Done");
          await bridgeFromTelegram("default", fallback.response || "Done");
        }
      } catch (e) {
        await sendTelegram(chatId, "DevHub AI is processing... " + (e.message || "Try again."));
      }
    }
  } catch (e) { console.error("Telegram error:", e.message); }
});

async function sendTelegram(chatId, text) {
  if (!TELEGRAM_TOKEN) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
  await new Promise(resolve => {
    const req = require("https").request({ hostname: "api.telegram.org", path: `/bot${TELEGRAM_TOKEN}/sendMessage`, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, res => {
      res.on("data", () => {}); res.on("end", resolve);
    });
    req.write(body); req.end();
  });
}

// ── AI CHAT & BACKUPS ──────────────────────────────────────
// ── AI CHAT ──────────────────────────────────────────
const AI_SYSTEM_PROMPT = `You are DevHub Assistant, an AI that helps manage a personal development hub. You have access to tools and must respond conversationally.

AVAILABLE TOOLS:
- create_gdd(title) — Create a new GDD document
- rename_gdd(old_title, new_title) — Rename a GDD
- append_gdd(title, text) — Append markdown text to a GDD body
- create_project(title) — Create a new project
- set_project_status(title, status) — Set project status (idea|planning|in-progress|on-hold|done)
- add_phase(project_title, phase_title) — Add a phase to a project
- create_category(name) — Create a new root category
- add_link(name, url) — Prepare a new link (opens modal for user to review)
- navigate(section) — Navigate to: storage, vocab, gdds, sites, fproj
- refresh_sources() — Refresh and show sources sidebar
- refresh_projects() — Refresh projects data
- clean_backups() — Clean old R2 backup files
- storage_info() — Show R2 storage usage

RULES:
1. Always be conversational and helpful
2. For CREATE/DELETE operations, ask for confirmation before executing
3. When asking for confirmation, explain what will happen
4. If the user says "yes", "confirm", "accept", "ok", "sure" — execute the pending action
5. If the user says "no", "cancel", "reject", "stop" — cancel the pending action
6. When executing an action, explain what happened in a friendly way
7. If unsure what the user wants, ask clarifying questions
8. Keep responses concise (1-3 sentences) unless explaining details

RESPOND IN THIS JSON FORMAT:
{"response": "your conversational reply", "action": null or {"type":"tool_name", "params":{...}}, "needsConfirm": false or true, "confirmAction": null or {"type":"tool_name", "params":{...}, "description":"what will happen"}}

When you want to confirm an action, set needsConfirm=true, confirmAction with the action details, and explain in "response" why you need confirmation. The action field should be null when needsConfirm is true.

For simple conversational messages (greetings, questions, etc.), just return a response with no action.`;

const pendingActions = new Map(); // sessionId -> pendingAction

function parseAIResponse(text) {
  try {
    const json = JSON.parse(text);
    return json;
  } catch {
    // Try to extract JSON from text
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return { response: text, action: null };
  }
}

async function callOpenAI(message) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 600
    })
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callN8N(message) {
  const url = process.env.N8N_AI_WEBHOOK_URL;
  if (!url) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.TELEGRAM_BOT_TOKEN || ""}`,
        "X-Telegram-Token": process.env.TELEGRAM_BOT_TOKEN || ""
      },
      body: JSON.stringify({ message, system: AI_SYSTEM_PROMPT })
    });
    const text = await r.text();
    if (!r.ok) {
      console.error("n8n webhook error:", r.status, text.slice(0, 200));
      return null;
    }
    try {
      const data = JSON.parse(text);
      if (typeof data === 'string') return { response: data, action: null };
      return { response: data.response || data.text || data.message || data.output || '', action: data.action || null, needsConfirm: data.needsConfirm || false, confirmAction: data.confirmAction || null };
    } catch {
      return { response: text, action: null };
    }
  } catch (e) {
    console.error("n8n webhook unreachable:", e.message);
    return null;
  }
}

// Debug endpoint to check AI connectivity
app.get("/api/ai/health", async (_req, res) => {
  const status = {
    n8nConfigured: !!process.env.N8N_AI_WEBHOOK_URL,
    n8nUrl: process.env.N8N_AI_WEBHOOK_URL || "(not set)",
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    n8nStatus: "unknown",
    fallbackActive: true,
  };
  if (process.env.N8N_AI_WEBHOOK_URL) {
    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.TELEGRAM_BOT_TOKEN || ""}`,
        "X-Telegram-Token": process.env.TELEGRAM_BOT_TOKEN || ""
      };
      const r = await fetch(process.env.N8N_AI_WEBHOOK_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: "ping", system: "Reply with just 'pong'." }),
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) {
        const text = await r.text();
        status.n8nStatus = `HTTP ${r.status}: ${text.slice(0, 100)}`;
      } else {
        const data = await r.json().catch(() => ({}));
        status.n8nStatus = "connected";
        status.n8nSampleResponse = typeof data === 'string' ? data.slice(0, 60) : (data.response || data.text || data.message || JSON.stringify(data)).slice(0, 60);
      }
    } catch (e) {
      status.n8nStatus = `unreachable: ${e.message}`;
    }
  }
  res.json(status);
});

// ── CHAT BRIDGE helpers ─────────────────────────

// Store a web chat message and forward to Telegram
async function bridgeToTelegram(sessionId, message) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "800625752";
  const id = "bridge_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  await d1Query("CREATE TABLE IF NOT EXISTS chat_bridge (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, delivered INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
  await d1Query("INSERT INTO chat_bridge (id, session_id, sender, text) VALUES (?,?,?,?)", [id, sessionId, "user", message]);
  const body = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: "Web: " + message, parse_mode: "HTML" });
  require("https").request({ hostname: "api.telegram.org", path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, res => res.on("data", () => {})).end(body);
}

// Save Telegram reply for website polling
async function bridgeFromTelegram(sessionId, text) {
  if (!sessionId || !text) return;
  const id = "bridge_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  await d1Query("CREATE TABLE IF NOT EXISTS chat_bridge (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, delivered INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
  await d1Query("INSERT INTO chat_bridge (id, session_id, sender, text) VALUES (?,?,?,?)", [id, sessionId, "bot", text]);
}

async function executeToolAction(action) {
  if (!action || !action.type) return "Done.";
  const { type, params = {} } = action;
  try {
    switch (type) {
      case 'create_gdd': {
        await d1Query("CREATE TABLE IF NOT EXISTS gdds (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '', created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))");
        await d1Query("INSERT INTO gdds (id, title, body) VALUES (?, ?, ?)", ["gdd_" + Date.now(), params.title || "Untitled", ""]);
        return `Created GDD **"${params.title}"**.`;
      }
      case 'rename_gdd': {
        const rows = d1Rows(await d1Query("SELECT * FROM gdds WHERE lower(title) LIKE ? LIMIT 1", [`%${(params.old_title||'').toLowerCase()}%`]));
        if (!rows.length) return `Couldn't find a GDD matching "${params.old_title}".`;
        await backupItem("gdds", rows[0].id, rows[0]);
        await d1Query("UPDATE gdds SET title = ?, updated_at = unixepoch() WHERE id = ?", [params.new_title, rows[0].id]);
        return `Renamed **"${rows[0].title}"** → **"${params.new_title}"**.`;
      }
      case 'append_gdd': {
        const rows = d1Rows(await d1Query("SELECT * FROM gdds WHERE lower(title) LIKE ? LIMIT 1", [`%${(params.title||'').toLowerCase()}%`]));
        if (!rows.length) return `Couldn't find a GDD matching "${params.title}".`;
        await backupItem("gdds", rows[0].id, rows[0]);
        const body = `${rows[0].body || ""}${rows[0].body ? "\n\n" : ""}${params.text || ""}`;
        await d1Query("UPDATE gdds SET body = ?, updated_at = unixepoch() WHERE id = ?", [body, rows[0].id]);
        return `Appended to GDD **"${rows[0].title}"**.`;
      }
      case 'create_project': {
        await ensureFutureProjectsTable();
        const id = "fp_" + Date.now();
        await d1Query("INSERT INTO future_projects (id, title, description, status, priority, tags, phases, board) VALUES (?,?,?,?,?,?,?,?)", [id, params.title || "Untitled", "", "idea", "medium", "[]", "[]", "{}"]);
        return `Created project **"${params.title}"**.`;
      }
      case 'set_project_status': {
        await ensureFutureProjectsTable();
        const rows = d1Rows(await d1Query("SELECT * FROM future_projects WHERE lower(title) LIKE ? LIMIT 1", [`%${(params.title||'').toLowerCase()}%`]));
        if (!rows.length) return `Couldn't find a project matching "${params.title}".`;
        await backupItem("projects", rows[0].id, rows[0]);
        await d1Query("UPDATE future_projects SET status = ?, updated_at = unixepoch() WHERE id = ?", [params.status, rows[0].id]);
        return `Updated **"${rows[0].title}"** status to **${params.status}**.`;
      }
      case 'add_phase': {
        await ensureFutureProjectsTable();
        const rows = d1Rows(await d1Query("SELECT * FROM future_projects WHERE lower(title) LIKE ? LIMIT 1", [`%${(params.project_title||'').toLowerCase()}%`]));
        if (!rows.length) return `Couldn't find a project matching "${params.project_title}".`;
        await backupItem("projects", rows[0].id, rows[0]);
        let phases = [];
        try { phases = JSON.parse(rows[0].phases || "[]"); } catch { phases = []; }
        phases.push({ id: "ph_" + Date.now(), title: params.phase_title || "New Phase", done: false });
        await d1Query("UPDATE future_projects SET phases = ?, updated_at = unixepoch() WHERE id = ?", [JSON.stringify(phases), rows[0].id]);
        return `Added phase **"${params.phase_title}"** to **"${rows[0].title}"**.`;
      }
      case 'create_category': {
        await d1Query("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '📁', color TEXT DEFAULT '#6366f1', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
        await d1Query("INSERT INTO categories (id, name, description, icon, color) VALUES (?,?,?,?,?)", ["cat_" + Date.now(), params.name || "New Category", "Created by AI", "📁", "#ae4b29"]);
        return `Created category **"${params.name}"**.`;
      }
      case 'add_link': return `I've prepared the link form for **"${params.name || 'your site'}"**. Please review and save.`;
      case 'navigate': return `Navigating to ${params.section || 'that section'}...`;
      case 'refresh_sources': return "Refreshing sources...";
      case 'refresh_projects': return "Refreshing projects...";
      case 'clean_backups': {
        const cleaned = await cleanOldBackups();
        return `Cleaned ${cleaned} old backup files from R2.`;
      }
      case 'storage_info': {
        const size = await calculateR2Storage();
        return `R2 storage: ${size} MB used.`;
      }
      default: return `Action "${type}" completed.`;
    }
  } catch (e) { return `Error: ${e.message}`; }
}

function mapUIAction(action) {
  if (!action || !action.type) return null;
  switch (action.type) {
    case 'navigate': return { type: 'nav', params: { section: action.params?.section || 'fproj' } };
    case 'refresh_sources': return { type: 'refresh_sources' };
    case 'refresh_projects': return { type: 'refresh_projects' };
    case 'open_modal': return { type: 'open_modal', params: { id: action.params?.id, data: action.params?.data } };
    default: return null;
  }
}

async function runAIFallback(message) {
  const lowMsg = String(message).toLowerCase();
  if (lowMsg.includes("clean") && lowMsg.includes("backup")) {
    const cleaned = await cleanOldBackups();
    return { response: `Done! I cleaned up ${cleaned} old backup files from R2.` };
  }
  if (lowMsg.includes("storage") && (lowMsg.includes("size") || lowMsg.includes("capacity") || lowMsg.includes("used"))) {
    const size = await calculateR2Storage();
    return { response: `Your R2 storage is currently using ${size} MB.` };
  }
  const gddMatch = String(message).match(/^(?:create|add|new)\s+gdd\s+(.+)$/i);
  if (gddMatch) {
    const title = gddMatch[1].trim();
    await d1Query("CREATE TABLE IF NOT EXISTS gdds (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '', created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))");
    await d1Query("INSERT INTO gdds (id, title, body) VALUES (?, ?, ?)", ["gdd_" + Date.now(), title, ""]);
    return { response: `Created GDD **"${title}"**.`, action: { type: "nav", params: { section: "gdds" } } };
  }
  const projectMatch = String(message).match(/^(?:create|add|new)\s+project\s+(.+)$/i);
  if (projectMatch) {
    await ensureFutureProjectsTable();
    await d1Query("INSERT INTO future_projects (id, title, description, status, priority, tags, phases, board) VALUES (?,?,?,?,?,?,?,?)", ["fp_" + Date.now(), projectMatch[1].trim(), "", "idea", "medium", "[]", "[]", "{}"]);
    return { response: `Created project **"${projectMatch[1].trim()}"**.`, action: { type: "nav", params: { section: "fproj" } } };
  }
  const statusMatch = String(message).match(/^set\s+project\s+(.+?)\s+status\s+(idea|planning|in[- ]progress|on[- ]hold|done)$/i);
  if (statusMatch) {
    await ensureFutureProjectsTable();
    const status = statusMatch[2].toLowerCase().replace(" ", "-");
    const rows = d1Rows(await d1Query("SELECT * FROM future_projects WHERE lower(title) LIKE ? LIMIT 1", [`%${statusMatch[1].trim().toLowerCase()}%`]));
    if (!rows.length) return { response: `Couldn't find project "${statusMatch[1].trim()}".` };
    await backupItem("projects", rows[0].id, rows[0]);
    await d1Query("UPDATE future_projects SET status = ?, updated_at = unixepoch() WHERE id = ?", [status, rows[0].id]);
    return { response: `Updated **"${rows[0].title}"** to **${status}**.`, action: { type: "nav", params: { section: "fproj" } } };
  }
  const phaseMatch = String(message).match(/^add\s+phase\s+(.+?)\s+to\s+project\s+(.+)$/i);
  if (phaseMatch) {
    await ensureFutureProjectsTable();
    const rows = d1Rows(await d1Query("SELECT * FROM future_projects WHERE lower(title) LIKE ? LIMIT 1", [`%${phaseMatch[2].trim().toLowerCase()}%`]));
    if (!rows.length) return { response: `Couldn't find project "${phaseMatch[2].trim()}".` };
    await backupItem("projects", rows[0].id, rows[0]);
    let phases = [];
    try { phases = JSON.parse(rows[0].phases || "[]"); } catch { phases = []; }
    phases.push({ id: "ph_" + Date.now(), title: phaseMatch[1].trim(), done: false });
    await d1Query("UPDATE future_projects SET phases = ?, updated_at = unixepoch() WHERE id = ?", [JSON.stringify(phases), rows[0].id]);
    return { response: `Added phase **"${phaseMatch[1].trim()}"** to **"${rows[0].title}"**.`, action: { type: "nav", params: { section: "fproj" } } };
  }
  if (lowMsg.startsWith("add category ") || lowMsg.startsWith("create category ")) {
    const name = message.replace(/^(add category |create category )/i, "").trim();
    await d1Query("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '📁', color TEXT DEFAULT '#6366f1', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))");
    await d1Query("INSERT INTO categories (id, name, description, icon, color) VALUES (?,?,?,?,?)", ["cat_" + Date.now(), name, "Created by AI", "📁", "#ae4b29"]);
    return { response: `Created category **"${name}"**.`, action: { type: "refresh_sources" } };
  }
  if (lowMsg.startsWith("add link ") || lowMsg.startsWith("create link ")) {
    const parts = message.replace(/^(add link |create link )/i, "").split("|");
    return { response: `Prepared link for **"${parts[0]?.trim() || 'site'}"**.`, action: { type: "open_modal", params: { id: "m-add-link", data: { name: parts[0]?.trim(), url: parts[1]?.trim() } } } };
  }
  if (lowMsg.includes("show me the") || lowMsg.includes("go to") || lowMsg.includes("open") || lowMsg.includes("navigate")) {
    const secs = { storage:'storage', vocab:'vocab', document:'gdds', gdd:'gdds', website:'sites', site:'sites', future:'fproj', project:'fproj', command:'commands', app:'apps' };
    for (const [k, v] of Object.entries(secs)) { if (lowMsg.includes(k)) return { response: `Opening ${v}...`, action: { type: "nav", params: { section: v } } }; }
  }
  if (lowMsg.match(/^(hello|hi|hey|yo)\b/)) {
    return { response: "Hey! I'm your DevHub assistant. I can create GDDs, projects, navigate, and more. What are you working on?" };
  }
  if (lowMsg.includes("help") || lowMsg.includes("what can you do")) {
    return { response: "**Create** — GDDs, projects, categories, links\n**Edit** — Rename GDDs, append, set status, add phases\n**Navigate** — Jump to any section\n**Maintain** — Clean backups, check storage" };
  }
  return { response: "Try:\n• **create gdd My Design**\n• **go to storage**\n• **help**" };
}

async function backupItem(type, id, data) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const key = `backups/${type}/${id}_${timestamp}.json`;
    const buf = Buffer.from(JSON.stringify(data));
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("R2 backups are not configured");
    const r = await fetch(`${R2_ENDPOINT}/objects/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: buf
    });
    const text = await r.text();
    if (!r.ok) throw new Error(friendlyR2Error("backup", r.status, text));
    const state = requestState.getStore();
    if (state?.backupKeys) state.backupKeys.push(key);
    return { ok: true, key };
  } catch (e) {
    const state = requestState.getStore();
    if (state?.backupErrors) state.backupErrors.push(e.message);
    console.warn("Backup skipped:", e.message);
    return { ok: false, error: e.message };
  }
}

async function cleanOldBackups() {
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const r = await fetch(`${R2_ENDPOINT}/objects?prefix=backups/`, {
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
  });
  const data = await r.json();
  let count = 0;
  for (const raw of (data.result || [])) {
    const o = normalizeR2Object(raw);
    if (!o.name || !o.uploaded) continue;
    const uploaded = new Date(o.uploaded).getTime();
    if (uploaded < oneMonthAgo) {
      await fetch(`${R2_ENDPOINT}/objects/${encodeURIComponent(o.name)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
      });
      count++;
    }
  }
  return count;
}

async function calculateR2Storage() {
  const r = await fetch(`${R2_ENDPOINT}/objects`, {
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
  });
  const data = await r.json();
  const totalBytes = (data.result || []).reduce((acc, o) => acc + normalizeR2Object(o).size, 0);
  return (totalBytes / (1024 * 1024)).toFixed(2);
}

async function r2ListObjects(prefix = "") {
  const r = await fetch(`${R2_ENDPOINT}/objects?prefix=${encodeURIComponent(prefix)}`, {
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(friendlyR2Error("list", r.status, text));
  const data = JSON.parse(text);
  if (data.success === false) throw new Error(friendlyR2Error("list", null, text));
  return data;
}

async function r2GetObject(name) {
  const r = await fetch(`${R2_ENDPOINT}/objects/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(friendlyR2Error("download", r.status, text));
  }
  return r;
}

async function r2PutObject(name, body, contentType) {
  const r = await fetch(`${R2_ENDPOINT}/objects/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": contentType },
    body
  });
  const text = await r.text();
  if (!r.ok) throw new Error(friendlyR2Error("upload", r.status, text));
  return text;
}

async function r2DeleteObject(name) {
  const r = await fetch(`${R2_ENDPOINT}/objects/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(friendlyR2Error("delete", r.status, text));
  return text;
}

const BACKUP_CONFIG = {
  gdds: { table: "gdds", fields: ["id", "title", "body", "created_at", "updated_at"] },
  "custom-sites": { table: "custom_sites", fields: ["id", "name", "url", "note", "created_at"] },
  projects: { table: "future_projects", fields: ["id", "title", "description", "status", "priority", "tags", "phases", "board", "created_at", "updated_at"] },
  categories: { table: "categories", fields: ["id", "name", "description", "icon", "color", "sort_order", "created_at"] },
  subcategories: { table: "subcategories", fields: ["id", "root_id", "name", "description", "icon", "type", "sort_order", "created_at"] },
  links: { table: "links", fields: ["id", "root_id", "sub_id", "name", "url", "description", "icon", "image_url", "tags", "created_at"] },
  vocab: { table: "vocab", fields: ["id", "word", "translation", "example", "source_lang", "target_lang", "tags", "created_at"] },
  words: { table: "words", fields: ["id", "word", "definition"] }
};

async function restoreBackupRecord(type, data) {
  const config = BACKUP_CONFIG[type];
  if (!config) throw new Error("Unsupported backup type");
  const cols = config.fields.filter((field) => Object.prototype.hasOwnProperty.call(data, field));
  if (!cols.length) throw new Error("Backup payload is empty");
  if (config.table === "future_projects") await ensureFutureProjectsTable();
  if (data.id) {
    const current = d1Rows(await d1Query(`SELECT * FROM ${config.table} WHERE id = ?`, [data.id]))[0];
    if (current) await backupItem(type, data.id, current);
  }
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((field) => data[field] ?? null);
  await d1Query(`INSERT OR REPLACE INTO ${config.table} (${cols.join(", ")}) VALUES (${placeholders})`, values);
}

app.get("/api/backups", async (req, res) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) return res.status(400).json({ error: "type and id required" });
    const data = await r2ListObjects(`backups/${type}/${id}_`);
    const backups = (data.result || [])
      .map(normalizeR2Object)
      .filter((o) => o.name)
      .map((o) => ({ key: o.name, size: o.size, uploaded: o.uploaded }))
      .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());
    res.json(backups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/backups/restore", async (req, res) => {
  try {
    const { type, key } = req.body || {};
    if (!type || !key) return res.status(400).json({ error: "type and key required" });
    const response = await r2GetObject(key);
    const payload = JSON.parse(Buffer.from(await response.arrayBuffer()).toString("utf8"));
    await restoreBackupRecord(type, payload);
    res.json({ ok: true, restored: payload.id || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/backups/cleanup", async (_req, res) => {
  try {
    const cleaned = await cleanOldBackups();
    res.json({ ok: true, cleaned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── R2 Storage ──────────────────────────────────────
app.get("/api/files", async (req, res) => {
  try {
    const prefix = req.query.prefix || "";
    const data = await r2ListObjects(prefix);
    const objects = (data.result || [])
      .map(normalizeR2Object)
      .filter(o => o.name)
      .filter(o => !o.name.endsWith("/.keep"))
      .map(o => ({ name: o.name, size: o.size, uploaded: o.uploaded }));
    const folders = new Set();
    objects.forEach(o => {
      const rel = prefix ? o.name.slice(prefix.length) : o.name;
      const parts = rel.split("/");
      if (parts.length > 1) folders.add(parts[0] + "/");
    });
    res.json({ objects, folders: [...folders] });
  } catch (e) { res.status(500).json({ error: e.message, objects: [], folders: [] }); }
});

app.get("/api/files/download", async (req, res) => {
  try {
    const name = req.query.name || "";
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await r2GetObject(name);
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/octet-stream");
    const disp = r.headers.get("content-disposition");
    if (disp) res.setHeader("Content-Disposition", disp);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/files/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { file, folder } = req.body;
    const buf = Buffer.from(file, "base64");
    const key = folder ? `${folder}/${name}` : name;
    await r2PutObject(key, buf, "application/octet-stream");
    res.json({ ok: true, name: key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/files", async (req, res) => {
  try {
    await r2DeleteObject(req.body.name);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/folders", async (req, res) => {
  try {
    const { folder } = req.body;
    const buf = Buffer.from("");
    await r2PutObject(folder + "/.keep", buf, "application/octet-stream");
    res.json({ ok: true, folder });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/storage/health", async (_req, res) => {
  try {
    const data = await r2ListObjects("");
    const objects = Array.isArray(data.result) ? data.result : [];
    const totalBytes = objects.reduce((acc, o) => acc + parseInt(o.size || 0), 0);
    res.json({ ok: true, bucket: R2_BUCKET, objects: objects.length, size_mb: (totalBytes / (1024 * 1024)).toFixed(2) });
  } catch (e) {
    res.status(500).json({ ok: false, bucket: R2_BUCKET, error: e.message });
  }
});

async function start() {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});
