const path = require("path");
const express = require("express");
const { d1Query, ensureWordsTable } = require("./d1Client.js");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/words", async (_req, res) => {
  try {
    const result = await d1Query("SELECT * FROM words ORDER BY id DESC");
    const rows = Array.isArray(result) && result[0] && result[0].results ? result[0].results : result;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/words", async (req, res) => {
  const { word, definition } = req.body;
  if (!word || !definition) {
    return res.status(400).json({ error: "word and definition are required" });
  }

  try {
    await d1Query("INSERT INTO words (word, definition) VALUES (?, ?)", [word, definition]);
    res.status(201).json({ message: "Created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/words/:id", async (req, res) => {
  const { id } = req.params;
  const { word, definition } = req.body;
  if (!word || !definition) {
    return res.status(400).json({ error: "word and definition are required" });
  }

  try {
    await d1Query("UPDATE words SET word = ?, definition = ? WHERE id = ?", [word, definition, id]);
    res.json({ message: "Updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/words/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await d1Query("DELETE FROM words WHERE id = ?", [id]);
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  await ensureWordsTable();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});
