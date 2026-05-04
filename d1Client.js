require("dotenv").config();

function getConfig() {
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_D1_DATABASE_ID || !CF_API_TOKEN) {
    throw new Error(
      "Missing required env vars: CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN"
    );
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;
  return { endpoint, CF_API_TOKEN };
}

async function d1Query(sql, params = []) {
  const { endpoint, CF_API_TOKEN } = getConfig();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors || data)}`);
  }

  return data.result;
}

async function ensureWordsTable() {
  return d1Query(
    "CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, definition TEXT)"
  );
}

module.exports = {
  d1Query,
  ensureWordsTable,
};
