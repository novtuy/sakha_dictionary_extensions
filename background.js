chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-to-popup",
    title: "Тылдьытка ыыт",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-popup" && info.selectionText) {
    const selectedWord = info.selectionText.trim();

    // Сохраняем слово и флаг "не обработано"
    chrome.storage.local.set({ lastWord: selectedWord, wordProcessed: false }, () => {
      chrome.action.openPopup(); // открыть popup
    });
  }
});
