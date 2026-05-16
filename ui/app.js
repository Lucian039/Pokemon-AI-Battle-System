const panelTitle = document.querySelector("#panel-title");
const panelMessage = document.querySelector("#panel-message");
const toast = document.querySelector("#toast");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const modalClose = document.querySelector("#modal-close");
const navButtons = document.querySelectorAll("[data-action]");

const content = {
  profile: {
    title: "玩家狀態",
    message: "查看體力、金幣與目前進度，作為進入冒險或對戰前的總覽。",
    toast: "玩家狀態已切換",
  },
  shop: {
    title: "商城",
    message: "後續可放置補給、道具與金幣消耗流程。",
    toast: "商城準備中",
  },
  bag: {
    title: "背包",
    message: "保存藥水、探索券與辨識相關道具，方便接入道具系統。",
    toast: "背包已打開",
  },
  dex: {
    title: "圖鑑辨識",
    message: "管理圖片辨識、圖鑑資料與未來對戰模組的主入口。",
    toast: "圖鑑頁面",
  },
  nurture: {
    title: "培育",
    message: "未來可放入等級、親密度與訓練紀錄。",
    toast: "培育功能規劃中",
  },
  event: {
    title: "活動",
    message: "活動區可放期間任務、限定獎勵與特殊寶可夢提示。",
    toast: "活動清單已切換",
  },
  quest: {
    title: "任務",
    message: "每日任務可引導玩家完成辨識、冒險與對戰測試。",
    toast: "任務列表已更新",
  },
  friend: {
    title: "好友",
    message: "好友功能可支援分享辨識結果與交換對戰隊伍。",
    toast: "好友功能準備中",
  },
  adventure: {
    title: "冒險",
    message: "冒險模式可接入關卡、探索獎勵與圖片辨識任務。",
    toast: "準備出發",
  },
  battle: {
    title: "對戰準備室",
    message: "辨識出的寶可夢需要存在於 pokemon_battle_data.json，才能進入對戰。",
    toast: "對戰資料待接入",
  },
};

const modalContent = {
  mail: {
    title: "信箱",
    message: "目前沒有新的訊息。之後可以放活動通知、系統獎勵與辨識報告。",
  },
  settings: {
    title: "設定",
    message: "音量、語言、畫面縮放與資料庫重建提示可以放在這裡。",
  },
};

let toastTimer;

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function setActiveButton(action) {
  document.querySelectorAll(".nav-button, .bottom-action").forEach((button) => {
    button.classList.toggle("active", button.dataset.action === action);
  });
}

function openModal(action) {
  const data = modalContent[action];
  modalTitle.textContent = data.title;
  modalMessage.textContent = data.message;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function handleAction(action) {
  if (modalContent[action]) {
    openModal(action);
    return;
  }

  const data = content[action] || content.dex;
  panelTitle.textContent = data.title;
  panelMessage.textContent = data.message;
  setActiveButton(action);
  showToast(data.toast);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    handleAction(button.dataset.action);
  });
});

modalClose.addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});
