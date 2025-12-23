const api = typeof browser !== "undefined" ? browser : chrome;

// Определяем браузер
const isChrome =
  typeof chrome !== "undefined" && chrome.action && chrome.action.openPopup;
const isFirefox = !isChrome;

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: "send-to-popup",
    title: "Тылдьытка ыыт",
    contexts: ["selection"],
  });
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-popup" && info.selectionText) {
    const selectedWord = info.selectionText.trim();

    if (isChrome) {
      // Chrome/Edge — сохраняем и открываем popup
      api.storage.local.set(
        { lastWord: selectedWord, wordProcessed: false },
        () => {
          api.action.openPopup();
        }
      );
    }

    if (isFirefox) {
      // Firefox — сразу открываем сайт словаря с выбранным словом
      const url = `https://igi.ysn.ru/btsja/index.php?data1=${encodeURIComponent(
        selectedWord.toLowerCase()
      )}&talww=2`;
      api.tabs.create({ url });
    }
  }
});
