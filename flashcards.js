let db;
let flashcardsQueue = [];
let flashcardIndex = 0;
let showAnswer = false;

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

// ---------------------------
// Загрузка всех карточек
// ---------------------------
async function loadCards() {
    await openDB();
    const tbody = document.querySelector("#cardsTable tbody");
    tbody.innerHTML = "";

    const transaction = db.transaction("cards", "readonly");
    const store = transaction.objectStore("cards");
    const request = store.getAll();

    request.onsuccess = function(event) {
        const cards = event.target.result;

        if (!cards || cards.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Карточек нет</td></tr>`;
            return;
        }

        cards.forEach(card => {
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
    };

    request.onerror = (err) => console.error("Ошибка получения карточек:", err);
}

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

    // Получаем все фронты через request.onsuccess
    const getAllRequest = store.getAll();
    getAllRequest.onsuccess = function(event) {
        const existingFronts = event.target.result.map(c => c.front);

        for (const card of cards) {
            if (!card.front || !card.back) continue;
            if (existingFronts.includes(card.front.trim())) continue;
            store.put({ front: card.front.trim(), back: card.back.trim(), saved: true });
        }
    };

    getAllRequest.onerror = (err) => console.error("Ошибка при чтении базы для импорта:", err);

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
        flashcardsQueue = e.target.result
            .filter(c => c.front)
            .map(c => ({ front: c.front, back: c.back }));

        // Перемешиваем массив случайным образом
        flashcardsQueue = shuffleArray(flashcardsQueue);

        flashcardIndex = 0;
        showFlashcard();
    };
}

function showFlashcard() {
    const frontEl = document.getElementById("flashcardFront");
    const answerEl = document.getElementById("flashcardAnswer");

    if (flashcardsQueue.length === 0) {
        frontEl.innerText = "Карточек нет";
        answerEl.style.display = "none";
        return;
    }

    if (flashcardIndex >= flashcardsQueue.length) {
        frontEl.innerText = "Повторение закончено 🎉";
        answerEl.style.display = "none";
        return;
    }

    document.getElementById("flashcardProgress").innerText =
        `Карточка ${flashcardIndex + 1} / ${flashcardsQueue.length}`;

    const card = flashcardsQueue[flashcardIndex];

    if (!showAnswer) {
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
    showAnswer = false;
    document.getElementById("showAnswerBtn").innerText = showAnswer ? "Скрыть ответ" : "Показать ответ";
    showFlashcardsMode();
});
document.getElementById("toListBtn").addEventListener("click", showListMode);


document.getElementById("knowBtn").addEventListener("click", () => {
    flashcardIndex++;
    showAnswer = false;
    document.getElementById("showAnswerBtn").innerText = showAnswer ? "Скрыть ответ" : "Показать ответ";
    showFlashcard();
    
});
document.getElementById("dontKnowBtn").addEventListener("click", () => {
    if (!showAnswer) {
        showAnswer = !showAnswer;
        showFlashcard();
        document.getElementById("showAnswerBtn").innerText = showAnswer ? "Скрыть ответ" : "Показать ответ";
    }
    else {
        const card = flashcardsQueue[flashcardIndex];
        const remaining = flashcardsQueue.slice(flashcardIndex + 1);
        remaining.unshift(card);
        const shuffled = shuffleArray(remaining);
        flashcardsQueue = flashcardsQueue.slice(0, flashcardIndex + 1).concat(shuffled);
        flashcardIndex++;      
        showAnswer = false;
        document.getElementById("showAnswerBtn").innerText = showAnswer ? "Скрыть ответ" : "Показать ответ";
        showFlashcard();
    }
});

document.getElementById("showAnswerBtn").addEventListener("click", () => {
    showAnswer = !showAnswer;
    showFlashcard();
    document.getElementById("showAnswerBtn").innerText = showAnswer ? "Скрыть ответ" : "Показать ответ";
});
