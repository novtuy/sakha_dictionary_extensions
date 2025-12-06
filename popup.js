let readedWord = null; // переменная, которое хранит правильно прочитанное слово

// необходимо для работы с ПКМ. 
// lastWord - выделенное слово, wordProcessed - флаг для отметки правильной работы
document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["lastWord", "wordProcessed"], (data) => {
        if (data.lastWord && !data.wordProcessed) {
            const input = document.getElementById("wordInput");
            input.value = data.lastWord;
            doSearch();

            // Помечаем слово как обработанное
            chrome.storage.local.set({ wordProcessed: true });
        }
    });
});

// Функция для выделения div со страницы
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

// Основная функция поиска
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
            resultsDiv.innerHTML = "<p>Көрдөөһүҥҥэ сыыһа баар. VPN холбонон турар.</p>";
            return;
        }

        readedWord = word;
        resultsDiv.innerHTML = "";

        data.output.forEach(htmlBlock => {
            // Wrapper для блока
            const wrapper = document.createElement("div");
            wrapper.className = "block-wrapper";
            wrapper.style.position = "relative";
            wrapper.style.marginBottom = "10px";

            // Блок с HTML с сайта
            const div = document.createElement("div");
            div.className = "block";

            const html = htmlBlock.replace(/<br\s*\/?>/gi, '<span class="line-break"></span>');
            div.innerHTML = html;
            
            wrapper.appendChild(div);

            // Звезда поверх блока, невидимая для потока текста
            const star = document.createElement("span");
            star.className = "star";
            star.innerHTML = "&#9734;";
            star.style.position = "absolute";
            star.style.top = "3px";
            star.style.right = "10px";
            star.style.cursor = "pointer";
            star.style.fontSize = "25px";
            star.style.zIndex = "999"; 
            star.style.userSelect = "none";

            // Чтобы текст и блок не «видели» звезду
            star.style.pointerEvents = "auto";  // клики работают
            div.style.pointerEvents = "auto";   // текст остаётся интерактивным

            wrapper.appendChild(star);
            resultsDiv.appendChild(wrapper);
        });


    } catch (err) {
        console.error("Error in click handler:", err);
        resultsDiv.innerHTML = "<p>Сыыһа тахсар дааннайдары ылыыга.</p>";
    }
}

// Обработчик кнопки поиска
document.getElementById("searchBtn").addEventListener("click", doSearch);

// Обработчик Enter в поле ввода
document.getElementById("wordInput").addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        doSearch();           
    }
});

// Обработчик кнопки сайта
document.getElementById('btn2').addEventListener('click', () => {
    let url = 'https://igi.ysn.ru/btsja/';

    if (readedWord) {
        url = `https://igi.ysn.ru/btsja/index.php?data1=${readedWord}&talww=2`;
    }

    // Открыть сайт в новой вкладке
    chrome.tabs.create({ url });
});

// Кнопка флеш-карточек
document.getElementById('btn1').addEventListener('click', () => {
    // Открываем flashcards.html в новой вкладке
    chrome.tabs.create({ url: chrome.runtime.getURL("flashcards.html") })
});