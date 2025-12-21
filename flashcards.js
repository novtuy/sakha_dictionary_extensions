let db;
let currentSearch = "";   // для поиска
let currentSort = "added"; // "added" или "alpha" (по алфавиту)

const flashcardSession = { index: 0, showAnswer: false, queue: []};
const pagination = {
    currentPage: 1,
    pageSize: 10,
    totalPages: 1
};

// ---------------------------
// Открытие IndexedDB
// ---------------------------
function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const request = indexedDB.open("FlashcardsDB", 1);

        request.onupgradeneeded = function(event) {
            db = event.target.result;
            if (!db.objectStoreNames.contains("cards")) {
                const store = db.createObjectStore("cards", { keyPath: "id", autoIncrement: true });
                store.createIndex("front", "front", { unique: true });
                store.createIndex("back", "back", { unique: false });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = function(event) {
            console.error("Ошибка открытия базы:", event.target.error);
            reject(event.target.error);
        };
    });
}

async function loadCards(page = 1) {
    await openDB();
    const tbody = document.querySelector("#cardsTable tbody");
    tbody.innerHTML = "";

    const transaction = db.transaction("cards", "readonly");
    const store = transaction.objectStore("cards");
    const request = store.getAll();

    request.onsuccess = function(event) {
        let cards = event.target.result;

        if (!cards || cards.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Карточек нет</td></tr>`;
            pagination.totalPages = 1;
            updatePaginationControls();
            return;
        }

        // --- Фильтр по поиску ---
        if (currentSearch !== "") {
            const searchLower = currentSearch.toLowerCase();
            cards = cards.filter(c =>
                c.front && c.front.toLowerCase().includes(searchLower)
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
        pageCards.forEach(card => {
            if (!card.front) return;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${card.front}</td>
                <td>${card.back}</td>
                <td>
                    <button class="copy-btn">Копировать</button>
                    <button class="delete-btn">Удалить</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        updatePaginationControls();
    };

    request.onerror = (err) => console.error("Ошибка получения карточек:", err);
};

function updatePaginationControls() {
    const pageInput = document.getElementById("pageInput");
    const totalPagesSpan = document.getElementById("totalPages");
    pageInput.value = pagination.currentPage;
    totalPagesSpan.innerText = `/ ${pagination.totalPages}`;

    document.getElementById("prevPage").disabled = pagination.currentPage <= 1;
    document.getElementById("nextPage").disabled = pagination.currentPage >= pagination.totalPages;
}

// Обработчики кнопок и поля ввода
document.getElementById("prevPage").addEventListener("click", () => {
    if (pagination.currentPage > 1) loadCards(pagination.currentPage - 1);
});
document.getElementById("nextPage").addEventListener("click", () => {
    if (pagination.currentPage < pagination.totalPages) loadCards(pagination.currentPage + 1);
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
    request.onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            if (cursor.value.front === front) {
                cursor.delete();
                console.log("Карточка удалена по front:", front);
            }
            cursor.continue();
        }
    };

    request.onerror = function(err) {
        console.error("Ошибка удаления по front:", err);
    };

    transaction.oncomplete = () => loadCards();
    transaction.onerror = (err) => console.error(err);
}

async function exportCards() {
    await openDB();
    const transaction = db.transaction("cards", "readonly");
    const store = transaction.objectStore("cards");

    const request = store.getAll();
    request.onsuccess = function(event) {
        const cards = event.target.result;

        // Фильтруем только нужные поля
        const safeCards = cards.map(c => ({
            front: String(c.front || "").trim(),
            back: String(c.back || "").trim()
        }));

        const blob = new Blob([JSON.stringify(safeCards, null, 2)], { type: "application/json" });
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

async function importCards(file) {
    if (file.name.split('.').pop().toLowerCase() !== 'json') {
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
        req.onsuccess = (event) => resolve(event.target.result.map(c => c.front));
        req.onerror = (err) => reject(err);
    });

    // Добавляем новые карточки последовательно
    for (const card of cards) {
        if (!card.front || !card.back) continue;
        if (existingFronts.includes(card.front.trim())) continue;

        await new Promise((resolve, reject) => {
            const req = store.put({ front: card.front.trim(), back: card.back.trim(), saved: true });
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    transaction.oncomplete = () => {
        loadCards();
        console.log("Импорт завершён");
    };
    transaction.onerror = (err) => console.error("Ошибка транзакции при импорте:", err);
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

// ---------------------------
// Обработчики кликов
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadCards();

    // Удаление отдельной карточки по front
    document.querySelector("#cardsTable tbody").addEventListener("click", (event) => {
        const row = event.target.closest("tr");

        if (event.target.classList.contains("delete-btn")) {
            const front = row.querySelector("td:first-child").innerText;
            deleteCardByFront(front);
        }

        if (event.target.classList.contains("copy-btn")) {
            const back = row.querySelector("td:nth-child(2)").innerText;
            navigator.clipboard.writeText(back).then(() => {
                console.log("Скопировано:", back);
            }).catch(err => console.error("Ошибка копирования:", err));
        }
    });

    // Очистка всей базы
    document.querySelector("#clearAllBtn").addEventListener("click", () => {
        if (confirm("Вы точно хотите очистить всю базу карточек?")) {
            clearAllCards();
        }
    });
    
    document.querySelector("#refreshBtn").addEventListener("click", () => {
        loadCards(); // просто перезагружаем таблицу
    });

    document.querySelector("#exportBtn").addEventListener("click", exportCards);

    document.querySelector("#importBtn").addEventListener("click", () => {
        document.querySelector("#importFile").click();
    });

    document.querySelector("#importFile").addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) importCards(file);
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
        flashcardSession.queue = e.target.result
            .filter(c => c.front)
            .map(c => ({ front: c.front, back: c.back }));

        // Перемешиваем массив случайным образом
        flashcardSession.queue = shuffleArray(flashcardSession.queue);

        flashcardSession.index = 0;
        showFlashcard();
    };
}

function showFlashcard() {
    const frontEl = document.getElementById("flashcardFront");
    const answerEl = document.getElementById("flashcardAnswer");

    if (flashcardSession.queue.length === 0) {
        frontEl.innerText = "Карточек нет";
        answerEl.style.display = "none";
        return;
    }

    if (flashcardSession.index >= flashcardSession.queue.length) {
        frontEl.innerText = "Повторение закончено 🎉";
        answerEl.style.display = "none";
        return;
    }

    document.getElementById("flashcardProgress").innerText =
        `Карточка ${flashcardSession.index + 1} / ${flashcardSession.queue.length}`;

    const card = flashcardSession.queue[flashcardSession.index];

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
    document.getElementById("dontKnowBtn").innerText = flashcardSession.showAnswer ? "Не знаю" : "Показать ответ";
    showFlashcardsMode();
});
document.getElementById("toListBtn").addEventListener("click", showListMode);


document.getElementById("knowBtn").addEventListener("click", () => {
    flashcardSession.index++;
    flashcardSession.showAnswer = false;
    document.getElementById("dontKnowBtn").innerText = flashcardSession.showAnswer ? "Не знаю" : "Показать ответ";
    showFlashcard();
    
});

document.getElementById("dontKnowBtn").addEventListener("click", () => {
    if (!flashcardSession.showAnswer) {
        flashcardSession.showAnswer = true;
        showFlashcard();
        document.getElementById("dontKnowBtn").innerText = flashcardSession.showAnswer ? "Не знаю" : "Показать ответ";
    } else {
        const card = flashcardSession.queue[flashcardSession.index];

        // Убираем текущую карточку из очереди после текущей позиции
        const remaining = flashcardSession.queue.slice(flashcardSession.index + 1);

        // Генерируем случайную позицию минимум через 2 карточки после текущей
        const minIndex = 2; // минимум через 2 карточки
        const maxIndex = remaining.length;
        const insertIndex = minIndex + Math.floor(Math.random() * (maxIndex - minIndex + 1));

        // Вставляем карточку обратно
        remaining.splice(insertIndex, 0, card);

        // Обновляем очередь
        flashcardSession.queue = flashcardSession.queue.slice(0, flashcardSession.index + 1).concat(remaining);

        flashcardSession.index++;      
        flashcardSession.showAnswer = false;
        document.getElementById("dontKnowBtn").innerText = flashcardSession.showAnswer ? "Не знаю" : "Показать ответ";
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
