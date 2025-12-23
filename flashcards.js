const DEBUG = false; // true — для разработки, false — для релиза

if (!DEBUG) {
  console.log = function () {};
  console.warn = function () {}; // если хотите убрать предупреждения
  console.error = function () {}; // если хотите убрать ошибки (обычно оставляют)
}

const api = typeof browser !== "undefined" ? browser : chrome;

let db;
let currentSearch = ""; // для поиска
let currentSort = "added"; // "added" или "alpha" (по алфавиту)
// let flashcardSession.modeType = null;

const flashcardSession = {
  index: 0,
  showAnswer: false,
  queue: [],
  modeType: null,
};
const pagination = {
  currentPage: 1,
  pageSize: 10,
  totalPages: 1,
};

const countInput = document.getElementById("flashcardCountInput");

// ---------------------------
// Открытие IndexedDB
// ---------------------------
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open("FlashcardsDB", 1);

    request.onupgradeneeded = function (event) {
      db = event.target.result;
      if (!db.objectStoreNames.contains("cards")) {
        const store = db.createObjectStore("cards", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("front", "front", { unique: true });
        store.createIndex("back", "back", { unique: false });
        store.createIndex("daysLeft", "daysLeft", { unique: false });
        store.createIndex("counter", "counter", { unique: false });
      }
    };

    request.onsuccess = function (event) {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = function (event) {
      console.error("Ошибка открытия базы:", event.target.error);
      reject(event.target.error);
    };
  });
}

function fibonacciByIndex(n) {
  if (n === 0) return 0;
  if (n === 1) return 1;

  let a = 0,
    b = 1;

  for (let i = 2; i <= n; i++) {
    const next = a + b;
    a = b;
    b = next;
  }

  return b;
}

// ---------------------------
// Загрузка карт в базу данных
// ---------------------------
async function loadCards(page = 1) {
  await openDB();
  const tbody = document.querySelector("#cardsTable tbody");
  tbody.innerHTML = "";

  const transaction = db.transaction("cards", "readonly");
  const store = transaction.objectStore("cards");
  const request = store.getAll();

  request.onsuccess = function (event) {
    let cards = event.target.result;

    if (!cards || cards.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Карточек нет</td></tr>`;
      pagination.totalPages = 1;
      updatePaginationControls();
      return;
    }

    // --- Фильтр по поиску ---
    if (currentSearch !== "") {
      const searchLower = currentSearch.toLowerCase();
      cards = cards.filter(
        (c) => c.front && c.front.toLowerCase().includes(searchLower)
      );
    }

    // --- Сортировка ---
    if (currentSort === "addedAsc") {
      // Оставляем порядок по добавлению
      cards.sort((a, b) => (a.id || 0) - (b.id || 0)); // если есть id, иначе порядок в IndexedDB
    } else if (currentSort === "addedDesc") {
      cards.sort((a, b) => (b.id || 0) - (a.id || 0));
    } else if (currentSort === "alphaAsc") {
      cards.sort((a, b) => (a.front || "").localeCompare(b.front || ""));
    } else if (currentSort === "alphaDesc") {
      cards.sort((a, b) => (b.front || "").localeCompare(a.front || ""));
    }
    // "added" оставляем порядок как есть (по добавлению)

    // --- Пагинация ---
    pagination.totalPages = Math.ceil(cards.length / pagination.pageSize);
    if (page > pagination.totalPages) page = pagination.totalPages;
    if (page < 1) page = 1;
    pagination.currentPage = page;

    const start = (page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    const pageCards = cards.slice(start, end);

    // --- Отображение карточек ---
    pageCards.forEach((card) => {
      if (!card.front) return;
      const row = document.createElement("tr");
      row.innerHTML = `
                <td style="text-align: left">${card.front}</td>
                <td style="text-align: justify">${card.back}</td>
                <td style="text-align: center">${card.daysLeft}\\${
        fibonacciByIndex(card.counter + 1) - 1
      } (${card.counter})</td>
                <td><button class="clear-btn">Обн. счетчик</button>
                    <button class="copy-btn">Копировать</button>
                    <button class="delete-btn">Удалить</button></td>
            `;
      tbody.appendChild(row);
    });
    updatePaginationControls();
  };
  request.onerror = (err) => console.error("Ошибка получения карточек:", err);
}

function updatePaginationControls() {
  const pageInput = document.getElementById("pageInput");
  const totalPagesSpan = document.getElementById("totalPages");
  pageInput.value = pagination.currentPage;
  totalPagesSpan.innerText = `/ ${pagination.totalPages}`;

  document.getElementById("prevPage").disabled = pagination.currentPage <= 1;
  document.getElementById("nextPage").disabled =
    pagination.currentPage >= pagination.totalPages;
}

// Обработчики кнопок и поля ввода
document.getElementById("prevPage").addEventListener("click", () => {
  if (pagination.currentPage > 1) loadCards(pagination.currentPage - 1);
});
document.getElementById("nextPage").addEventListener("click", () => {
  if (pagination.currentPage < pagination.totalPages)
    loadCards(pagination.currentPage + 1);
});
document.getElementById("pageInput").addEventListener("change", (e) => {
  let page = parseInt(e.target.value);
  if (isNaN(page) || page < 1) page = 1;
  if (page > pagination.totalPages) page = pagination.totalPages;
  loadCards(page);
});

// ---------------------------
// Удаление карточки по front
// ---------------------------
async function deleteCardByFront(front) {
  await openDB();
  const transaction = db.transaction("cards", "readwrite");
  const store = transaction.objectStore("cards");

  const request = store.openCursor();
  request.onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      if (cursor.value.front === front) {
        cursor.delete();
        console.log("Карточка удалена по front:", front);
      }
      cursor.continue();
    }
  };

  request.onerror = function (err) {
    console.error("Ошибка удаления по front:", err);
  };

  transaction.oncomplete = () => loadCards();
  transaction.onerror = (err) => console.error(err);
}

// ---------------------------
// Функционал экспорта
// ---------------------------
async function exportCards() {
  await openDB();
  const transaction = db.transaction("cards", "readonly");
  const store = transaction.objectStore("cards");

  const request = store.getAll();
  request.onsuccess = function (event) {
    const cards = event.target.result;

    // Фильтруем только нужные поля
    const safeCards = cards.map((c) => ({
      front: String(c.front || "").trim(),
      back: String(c.back || "").trim(),
      daysLeft: c.daysLeft !== undefined ? c.daysLeft : 0,
      counter: c.counter !== undefined ? c.counter : 0,
    }));

    const blob = new Blob([JSON.stringify(safeCards, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "flashcards.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  request.onerror = (err) => console.error("Ошибка экспорта:", err);
}

// ---------------------------
// Функционал импорта
// ---------------------------
async function importCards(file) {
  if (file.name.split(".").pop().toLowerCase() !== "json") {
    alert("Можно импортировать только JSON-файл!");
    return;
  }

  const text = await file.text();
  let cards;
  try {
    cards = JSON.parse(text);
  } catch (e) {
    alert("Ошибка: неверный формат файла JSON");
    return;
  }

  if (!Array.isArray(cards)) {
    alert("Ошибка: файл должен содержать массив карточек");
    return;
  }

  await openDB();
  const transaction = db.transaction("cards", "readwrite");
  const store = transaction.objectStore("cards");

  const existingFronts = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = (event) => resolve(event.target.result.map((c) => c.front));
    req.onerror = (err) => reject(err);
  });

  // Добавляем новые карточки последовательно
  for (const card of cards) {
    if (!card.front || !card.back) continue;
    if (existingFronts.includes(card.front.trim())) continue;

    await new Promise((resolve, reject) => {
      const req = store.put({
        front: card.front.trim(),
        back: card.back.trim(),
        daysLeft: card.daysLeft !== undefined ? card.daysLeft : 0,
        counter: card.counter !== undefined ? card.counter : 0,
        saved: true,
      });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e);
    });
  }

  transaction.oncomplete = () => {
    loadCards();
    console.log("Импорт завершён");
  };
  transaction.onerror = (err) =>
    console.error("Ошибка транзакции при импорте:", err);
}

// ---------------------------
// Очистка всей базы
// ---------------------------
async function clearAllCards() {
  await openDB();
  const transaction = db.transaction("cards", "readwrite");
  const store = transaction.objectStore("cards");

  const request = store.clear();
  request.onsuccess = () => loadCards();
  request.onerror = (err) => console.error("Ошибка очистки базы:", err);
}

async function updateDaysLeftIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  let lastUpdate = localStorage.getItem("lastDaysUpdate");

  if (!lastUpdate) {
    localStorage.setItem("lastDaysUpdate", today);
    lastUpdate = today;
    return;
  }

  if (lastUpdate === today) return; // уже обновляли сегодня

  // сколько дней прошло
  const diffDays = lastUpdate
    ? Math.floor(
        (new Date(today) - new Date(lastUpdate)) / (1000 * 60 * 60 * 24)
      )
    : 1;

  await openDB();
  const tx = db.transaction("cards", "readwrite");
  const store = tx.objectStore("cards");

  const req = store.getAll();
  req.onsuccess = () => {
    const cards = req.result;

    cards.forEach((card) => {
      if (typeof card.daysLeft === "number") {
        card.daysLeft -= diffDays;
        if (card.counter == 0 && card.daysLeft < 0) card.daysLeft = 0;
        store.put(card);
      }
    });
  };

  localStorage.setItem("lastDaysUpdate", today);
}

// ---------------------------
// Обработчики кликов
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  updateDaysLeftIfNeeded();
  loadCards();

  const savedCount = localStorage.getItem("flashcardCount");
  if (savedCount !== null) {
    document.getElementById("flashcardCountInput").value = savedCount;
  }

  // Удаление отдельной карточки по front
  document
    .querySelector("#cardsTable tbody")
    .addEventListener("click", async (event) => {
      const row = event.target.closest("tr");
      if (event.target.classList.contains("clear-btn")) {
        const front = row.querySelector("td:first-child").innerText;
        if (!front) return;

        await openDB();
        const tx = db.transaction("cards", "readwrite");
        const store = tx.objectStore("cards");

        const getRequest = store.index("front").get(front);
        getRequest.onsuccess = (e) => {
          const dbCard = e.target.result;
          if (!dbCard) return;

          dbCard.counter = 0;
          dbCard.daysLeft = 0;

          store.put(dbCard);
        };
        getRequest.onerror = (err) =>
          console.error("Ошибка обнуления карточки:", err);

        loadCards(parseInt(document.getElementById("pageInput").value));
      }

      if (event.target.classList.contains("delete-btn")) {
        const front = row.querySelector("td:first-child").innerText;
        deleteCardByFront(front);
      }

      if (event.target.classList.contains("copy-btn")) {
        const back = row.querySelector("td:nth-child(2)").innerText;
        navigator.clipboard
          .writeText(back)
          .then(() => {
            console.log("Скопировано:", back);
          })
          .catch((err) => console.error("Ошибка копирования:", err));
      }
    });

  showFlashcardsMode();
});

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function loadFlashcards() {
  await openDB();

  const transaction = db.transaction("cards", "readonly");
  const store = transaction.objectStore("cards");
  const request = store.getAll();

  request.onsuccess = (e) => {
    let cards = e.target.result.filter((c) => c.front); // убираем пустые front

    if (flashcardSession.modeType === "smart") {
      // берем только те карточки, где daysLeft <= 0
      cards = cards.filter((c) => c.daysLeft <= 0);

      // сортируем по возрастанию daysLeft (приоритет: меньшее значение)
      cards.sort((a, b) => a.daysLeft - b.daysLeft);
    } else {
      // обычный режим — перемешиваем карточки
      cards = shuffleArray(cards);
    }

    // Ограничение количества карточек по input
    const countInput = document.getElementById("flashcardCountInput").value;
    const count = parseInt(countInput);
    if (!isNaN(count) && count > 0 && count < cards.length) {
      cards = shuffleArray(cards.slice(0, count));
    }

    // Сохраняем в сессию
    flashcardSession.queue = cards.map((c) => ({
      front: c.front,
      back: c.back,
      daysLeft: c.daysLeft,
      counter: c.counter,
    }));
    flashcardSession.index = 0;

    showFlashcard();
  };

  request.onerror = (err) => console.error("Ошибка загрузки карточек:", err);
}

function showFlashcard() {
  if (!flashcardSession.modeType) return;
  const frontEl = document.getElementById("flashcardFront");
  const answerEl = document.getElementById("flashcardAnswer");

  const card = flashcardSession.queue[flashcardSession.index];

  document.getElementById("flashcardProgress").innerText = `Карточка ${
    flashcardSession.index + 1
  } / ${flashcardSession.queue.length}`;

  if (flashcardSession.queue.length === 0) {
    frontEl.innerText = "Карточек нет";
    frontEl.classList.add("front");
    answerEl.style.display = "none";
    document.getElementById("flashcardProgress").innerText = `Карточка 0 / 0`;
    return;
  }

  if (flashcardSession.index >= flashcardSession.queue.length) {
    frontEl.innerText = "Повторение закончено 🎉";
    frontEl.classList.add("front");
    answerEl.style.display = "none";
    document.getElementById(
      "flashcardProgress"
    ).innerText = `Карточка ${flashcardSession.queue.length} / ${flashcardSession.queue.length}`;
    return;
  }

  if (!flashcardSession.showAnswer) {
    frontEl.classList.add("front");
    answerEl.style.display = "none";
    frontEl.innerText = card.front;
  } else {
    frontEl.classList.remove("front");
    frontEl.innerText = card.front;
    answerEl.style.display = "block";
    answerEl.innerText = card.back;
  }
}

function showFlashcardsMode() {
  document.getElementById("flashcardMode").style.display = "block";
  document.getElementById("listMode").style.display = "none";
  loadFlashcards();
}

function showListMode() {
  document.getElementById("flashcardMode").style.display = "none";
  document.getElementById("listMode").style.display = "block";
  loadCards();
}

document.getElementById("toFlashcardsBtn").addEventListener("click", () => {
  flashcardSession.showAnswer = false;
  flashcardSession.modeType = null;
  document.getElementById("flashcardModeSelect").style.display = "block";
  document.getElementById("flashcardContent").style.display = "none";
  document.getElementById("flashcardCountSelect").style.display = "block";
  document.getElementById("dontKnowBtn").innerText = flashcardSession.showAnswer
    ? "Не знаю"
    : "Показать ответ";
  showFlashcardsMode();
});

document.getElementById("toListBtn").addEventListener("click", showListMode);

document.getElementById("knowBtn").addEventListener("click", async () => {
  const card = flashcardSession.queue[flashcardSession.index];
  if (!card) return;

  // Обновляем только в режиме smart
  if (flashcardSession.modeType === "smart") {
    await openDB();
    const transaction = db.transaction("cards", "readwrite");
    const store = transaction.objectStore("cards");

    const getRequest = store.index("front").get(card.front);
    getRequest.onsuccess = (e) => {
      const dbCard = e.target.result;
      if (dbCard) {
        // Увеличиваем counter на 1
        dbCard.counter = (dbCard.counter || 0) + 1;

        // Обновляем daysLeft, например, равно counter
        dbCard.daysLeft = fibonacciByIndex(dbCard.counter + 1) - 1;

        // Сохраняем обратно в базу
        store.put(dbCard);
      }
    };
    getRequest.onerror = (err) =>
      console.error("Ошибка при обновлении карточки:", err);
  }

  flashcardSession.index++;
  console.log(flashcardSession.index);
  flashcardSession.showAnswer = false;
  document.getElementById("dontKnowBtn").innerText = flashcardSession.showAnswer
    ? "Не знаю"
    : "Показать ответ";
  showFlashcard();
});

document.getElementById("dontKnowBtn").addEventListener("click", async () => {
  if (flashcardSession.index >= flashcardSession.queue.length) {
    showFlashcard();
    return;
  }
  if (!flashcardSession.showAnswer) {
    flashcardSession.showAnswer = true;
    showFlashcard();
    document.getElementById("dontKnowBtn").innerText =
      flashcardSession.showAnswer ? "Не знаю" : "Показать ответ";
  } else {
    const card = flashcardSession.queue[flashcardSession.index];

    // Если режим smart — обнуляем поля в базе
    if (flashcardSession.modeType === "smart") {
      await openDB();
      const transaction = db.transaction("cards", "readwrite");
      const store = transaction.objectStore("cards");

      const getRequest = store.index("front").get(card.front); // используем front для поиска
      getRequest.onsuccess = (e) => {
        const dbCard = e.target.result;
        if (dbCard) {
          dbCard.counter =
            dbCard.counter <= 3 ? (dbCard.counter == 0 ? 0 : 1) : 3;
          dbCard.daysLeft = fibonacciByIndex(dbCard.counter + 1) - 1;
          store.put(dbCard);
        }
      };
      getRequest.onerror = (err) =>
        console.error("Ошибка при получении карточки:", err);
    }

    // Убираем текущую карточку из очереди после текущей позиции
    const remaining = flashcardSession.queue.slice(flashcardSession.index + 1);

    // Генерируем случайную позицию минимум через 2 карточки после текущей
    const minIndex = 2; // минимум через 2 карточки
    const maxIndex = remaining.length;
    const insertIndex =
      minIndex + Math.floor(Math.random() * (maxIndex - minIndex + 1));

    // Вставляем карточку обратно
    remaining.splice(insertIndex, 0, card);

    // Обновляем очередь
    flashcardSession.queue = flashcardSession.queue
      .slice(0, flashcardSession.index + 1)
      .concat(remaining);

    flashcardSession.index++;
    flashcardSession.showAnswer = false;
    document.getElementById("dontKnowBtn").innerText =
      flashcardSession.showAnswer ? "Не знаю" : "Показать ответ";
    showFlashcard();
  }
});

document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    currentSearch = e.target.value.trim(); // убираем лишние пробелы
    loadCards(1); // сбрасываем на первую страницу
  }
});

document.getElementById("sortSelect").addEventListener("change", (e) => {
  currentSort = e.target.value;
  loadCards(1); // при сортировке тоже на первую страницу
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  loadCards(1); // просто перезагружаем таблицу
});

document.getElementById("exportBtn").addEventListener("click", exportCards);

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importCards(file);
});

// Очистка всей базы
document.getElementById("clearAllBtn").addEventListener("click", () => {
  if (confirm("Вы точно хотите очистить всю базу карточек?")) {
    clearAllCards();
  }
});

// Выбор режима флеш-карт
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    flashcardSession.modeType = btn.dataset.mode;

    // Скрываем выбор режима, показываем поле количества и карточки
    document.getElementById("flashcardModeSelect").style.display = "none";
    document.getElementById("flashcardContent").style.display = "block";
    document.getElementById("flashcardCountSelect").style.display = "none";

    // сброс состояния
    flashcardSession.showAnswer = false;
    flashcardSession.index = 0;

    loadFlashcards();

    console.log("Выбран режим:", flashcardSession.modeType);
  });
});

countInput.addEventListener("change", () => {
  localStorage.setItem("flashcardCount", countInput.value);
});

document.getElementById("skipDayBtn").addEventListener("click", async () => {
  if (!confirm("Пропустить один день?")) {
    return;
  }

  await openDB();
  const tx = db.transaction("cards", "readwrite");
  const store = tx.objectStore("cards");

  const req = store.getAll();
  req.onsuccess = () => {
    req.result.forEach((card) => {
      if (typeof card.daysLeft === "number" && card.daysLeft >= 0) {
        card.daysLeft = Math.max(0, card.daysLeft - 1);
        store.put(card);
      }
    });
  };

  // обновляем дату последнего обновления
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem("lastDaysUpdate", today);

  loadCards(1);
});

document
  .getElementById("resetAllCountersBtn")
  .addEventListener("click", async () => {
    if (!confirm("Сбросить счётчик и время у ВСЕХ карточек?")) return;

    await openDB();
    const tx = db.transaction("cards", "readwrite");
    const store = tx.objectStore("cards");

    const request = store.getAll();

    request.onsuccess = () => {
      const cards = request.result;

      cards.forEach((card) => {
        card.counter = 0;
        card.daysLeft = 0;
        store.put(card);
      });
    };

    request.onerror = (e) => console.error("Ошибка сброса карточек:", e);

    loadCards(1);
  });
