let db;
let cards = [];
let currentIndex = 0;

// 1️⃣ Открываем IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("FlashcardsDB", 1);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains("cards")) {
                const store = db.createObjectStore("cards", { keyPath: "front" });
                store.createIndex("front", "front", { unique: true });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

// 2️⃣ Добавление карточки
function addCard(card) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("cards", "readwrite");
        const store = tx.objectStore("cards");
        store.put(card);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

// 3️⃣ Получение всех карточек
function getAllCards() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("cards", "readonly");
        const store = tx.objectStore("cards");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// 4️⃣ Отображение карточки
function showCard(index) {
    if (!cards.length) return;
    document.getElementById('front').textContent = cards[index].front;
    document.getElementById('back').textContent = cards[index].back;
    document.getElementById('back').style.display = 'none';
}

// 5️⃣ Показ/скрытие ответа
document.getElementById('showBtn').addEventListener('click', () => {
    const back = document.getElementById('back');
    back.style.display = back.style.display === 'none' ? 'block' : 'none';
});

// 6️⃣ Следующая карточка
document.getElementById('nextBtn').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % cards.length;
    showCard(currentIndex);
});

// 7️⃣ Добавление слова из словаря
document.getElementById('addBtn').addEventListener('click', async () => {
    chrome.storage.local.get('lastWord', async (data) => {
        const word = data.lastWord;
        if (word) {
            const card = { front: word, back: "" };
            await addCard(card);
            cards.push(card);
            currentIndex = cards.length - 1;
            showCard(currentIndex);
            alert(`Слово "${word}" добавлено в карточки!`);
        } else {
            alert("Нет слова из словаря для добавления.");
        }
    });
});

// 8️⃣ Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    cards = await getAllCards();
    if (cards.length) showCard(currentIndex);
});
