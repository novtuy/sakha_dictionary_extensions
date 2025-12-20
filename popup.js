let db;
let capsOn = false;
let readedWord = null;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("FlashcardsDB", 1);

        request.onupgradeneeded = function(event) {
            db = event.target.result;
            const store = db.createObjectStore("cards", { keyPath: "id", autoIncrement: true });
            store.createIndex("front", "front", { unique: true });
            store.createIndex("back", "back", { unique: false });
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

async function isCardSaved(front) {
    await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction("cards", "readonly");
        const store = transaction.objectStore("cards");
        const index = store.index("front");
        const request = index.get(front);
        request.onsuccess = () => resolve(!!request.result);
        request.onerror = () => resolve(false);
    });
}

async function getDivFromDict(word) {
    const lowerWord = word.toLowerCase();
    const url = `https://igi.ysn.ru/btsja/index.php?data1=${lowerWord}&talww=2`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.log("Not found:", url);
            return { input: lowerWord, output: "err" };
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const contentBlocks = doc.querySelectorAll("div.text");
        if (contentBlocks.length === 0) {
            return { input: lowerWord, output: [] };
        }

        const texts = Array.from(contentBlocks).map(block => block.innerHTML.trim());
        return { input: lowerWord, output: texts };

    } catch (err) {
        console.error("Error fetching:", err);
        return { input: lowerWord, output: "err" };
    }
}

async function doSearch() {
    const word = document.getElementById("wordInput").value.trim();
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "Көрдөһөбүн, күүтүн...";

    try {
        const data = await getDivFromDict(word);

        if (data.output.length === 0) {
            readedWord = null;
            resultsDiv.innerHTML = "<p>Тылга сөп түбэһии көстүбэтэ</p>";
            return;
        } else if (data.output === "err") {
            readedWord = null;
            resultsDiv.innerHTML = "<p>Көрдөөһүҥҥэ сыыһа баар. Баҕарар VPN холбонон турар эбэтэр интернет арахсан турар</p>";
            return;
        }

        readedWord = word;
        resultsDiv.innerHTML = "";

        for (const [index, htmlBlock] of data.output.entries()) {
            const wrapper = document.createElement("div");
            wrapper.className = "block-wrapper";
            wrapper.style.position = "relative";
            wrapper.style.marginBottom = "10px";

            const div = document.createElement("div");
            div.className = "block";
            div.style.position = "relative"
            div.style.pointerEvents = "auto";

            const html = htmlBlock.replace(/<br\s*\/?>/gi, '<span class="line-break"></span>');
            div.innerHTML = html;

            wrapper.appendChild(div)

            const blockText = div.innerText.trim();
            const boldElements = div.querySelectorAll("b");
            const firstWord = boldElements.length > 0 ? boldElements[0].innerText.trim() : blockText.split(/\s+/)[0];

            const star = document.createElement("span");
            star.className = "star";
            star.id = "star-" + index;
            star.innerHTML = "&#9734;";
            star.style.position = "absolute";
            star.style.top = "3px";
            star.style.right = "10px";
            star.style.cursor = "pointer";
            star.style.fontSize = "25px";
            star.style.zIndex = "999";
            star.style.userSelect = "none";
            star.style.pointerEvents = "auto";
            
            const saved = await isCardSaved(firstWord); // функция проверяет IndexedDB
            if (saved) {
                star.classList.add("active"); // если уже сохранено, звезда золотая
            }
            

            wrapper.appendChild(star);
            resultsDiv.appendChild(wrapper);
        }

    } catch (err) {
        console.error("Error in click handler:", err);
        resultsDiv.innerHTML = "<p>Сыыһа тахсар дааннайдары ылыыга.</p>";
    }
}

function applyCase(src, dst) {
  return src === src.toUpperCase()
    ? dst.toUpperCase()
    : dst;
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("wordInput");
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);

  chrome.storage.local.get(["lastWord", "wordProcessed"], (data) => {
    if (data.lastWord && !data.wordProcessed) {
      const input = document.getElementById("wordInput");
      input.value = data.lastWord;
      doSearch();
      chrome.storage.local.set({ wordProcessed: true });
    }
  });

  const resultsDiv = document.getElementById("results");

  // Обработчик клика делегированно, вешается один раз
  resultsDiv.addEventListener("click", async (event) => {
    const star = event.target.closest(".star");
    if (!star) return;

    // star.style.color = star.style.color === "gold" ? "gray" : "gold";

    const wrapper = star.closest(".block-wrapper");
    const div = wrapper.querySelector(".block");

    const blockText = div.innerText.trim();
    const boldElements = div.querySelectorAll("b");
    const firstWord = boldElements.length > 0 ? boldElements[0].innerText.trim() : blockText.split(/\s+/)[0];

    try {
      await openDB();
      const transaction = db.transaction("cards", "readwrite");
      const store = transaction.objectStore("cards");

      // Добавляем карточку
      const card = { front: firstWord, back: blockText, saved: true };
      const request = store.put(card);
      request.onsuccess = function() {
          console.log("Карточка добавлена с id:", request.result); // request.result = id
      };

      transaction.oncomplete = () => {
          console.log("Карточка добавлена:", card);

          // **CSS анимация через класс**
          star.classList.add("active");
      };
    } catch (err) {
      console.error("Ошибка с DB:", err);
    }
  });
});

document.getElementById("searchBtn").addEventListener("click", doSearch);

document.getElementById("wordInput").addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    doSearch();
  }
});


document.getElementById('btn2').addEventListener('click', () => {
  let url = 'https://igi.ysn.ru/btsja/';
  if (readedWord) {
    url = `https://igi.ysn.ru/btsja/index.php?data1=${readedWord}&talww=2`;
  }
  chrome.tabs.create({ url });
});

document.getElementById('btn1').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("flashcards.html") });
});

document.addEventListener("keydown", (e) => {
  capsOn = e.getModifierState("CapsLock");
});

document.addEventListener("beforeinput", (e) => {
  const el = e.target;
  if (!["INPUT", "TEXTAREA"].includes(el.tagName)) return;
  if (e.data !== "\\") return;

  const pos = el.selectionStart;
  const text = el.value;

  const map = {
    "е": "ө",
    "о": "ө",
    "у": "ү",
    "н": "ҥ",
    "ь": "һ",
    "4": "ҥ",
    "5": "ҕ",
    "6": "ө",
    "7": "һ",
    "8": "ү",
  };

  const prev = text[pos - 1];
  if (!prev || !(prev.toLowerCase() in map)) {
    e.preventDefault();
    return;
  }

  e.preventDefault();

  let replaced = map[prev.toLowerCase()];

  if (/\d/.test(prev)) {
    // цифры → по Caps Lock
    if (capsOn) replaced = replaced.toUpperCase();
  } else {
    // буквы → по регистру буквы
    if (prev === prev.toUpperCase()) {
      replaced = replaced.toUpperCase();
    }
  }

  el.value =
    text.slice(0, pos - 1) +
    replaced +
    text.slice(pos);

  el.selectionStart = el.selectionEnd = pos;
});