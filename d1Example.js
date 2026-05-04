const { d1Query, ensureWordsTable } = require("./d1Client.js");

async function run() {
  await ensureWordsTable();

  await d1Query("INSERT INTO words (word, definition) VALUES (?, ?)", [
    "hello",
    "a greeting",
  ]);

  const before = await d1Query("SELECT * FROM words");
  console.log("Rows before update:", before);

  await d1Query("UPDATE words SET definition = ? WHERE word = ?", [
    "a friendly greeting",
    "hello",
  ]);

  const after = await d1Query("SELECT * FROM words");
  console.log("Rows after update:", after);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
