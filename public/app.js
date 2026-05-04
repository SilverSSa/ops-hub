const createForm = document.getElementById("create-form");
const wordInput = document.getElementById("word");
const definitionInput = document.getElementById("definition");
const wordList = document.getElementById("word-list");
const statusText = document.getElementById("status");
const refreshButton = document.getElementById("refresh");
const wordTemplate = document.getElementById("word-template");

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#a62f2f" : "#594f42";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadWords() {
  setStatus("Loading...");
  try {
    const words = await api("/api/words");
    renderWords(words || []);
    setStatus(`${(words || []).length} word(s) loaded`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderWords(words) {
  wordList.innerHTML = "";

  if (!words.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No words yet. Add your first one above.";
    wordList.appendChild(empty);
    return;
  }

  for (const row of words) {
    const fragment = wordTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    const editWord = fragment.querySelector(".edit-word");
    const editDefinition = fragment.querySelector(".edit-definition");
    const saveButton = fragment.querySelector(".save");
    const deleteButton = fragment.querySelector(".delete");

    editWord.value = row.word || "";
    editDefinition.value = row.definition || "";

    saveButton.addEventListener("click", async () => {
      try {
        await api(`/api/words/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            word: editWord.value.trim(),
            definition: editDefinition.value.trim(),
          }),
        });
        setStatus(`Updated word #${row.id}`);
        await loadWords();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    deleteButton.addEventListener("click", async () => {
      try {
        await api(`/api/words/${row.id}`, { method: "DELETE" });
        setStatus(`Deleted word #${row.id}`);
        await loadWords();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    card.dataset.id = row.id;
    wordList.appendChild(fragment);
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    word: wordInput.value.trim(),
    definition: definitionInput.value.trim(),
  };

  if (!payload.word || !payload.definition) {
    setStatus("Word and definition are required", true);
    return;
  }

  try {
    await api("/api/words", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createForm.reset();
    setStatus("Word saved");
    await loadWords();
  } catch (error) {
    setStatus(error.message, true);
  }
});

refreshButton.addEventListener("click", loadWords);
loadWords();
