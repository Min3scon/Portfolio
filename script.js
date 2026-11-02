const API = "https://abacus.jasoncameron.dev";
const NAMESPACE = "jackdavey-portfolio";
const KEY = "views";
const STORAGE_KEY = "lastCountedVisit";
const ONE_DAY = 24 * 60 * 60 * 1000;

function alreadyCounted() {
  try {
    const last = Number(localStorage.getItem(STORAGE_KEY));
    return last && Date.now() - last < ONE_DAY;
  } catch {
    return true;
  }
}

function markCounted() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {}
}

function showCount(value) {
  const el = document.getElementById("view-count");
  if (el) el.textContent = value;
}

async function updateViews() {
  const action = alreadyCounted() ? "get" : "hit";

  try {
    const response = await fetch(`${API}/${action}/${NAMESPACE}/${KEY}`);

    if (response.status === 404) {
      showCount("0");
      return;
    }

    if (!response.ok) throw new Error("Request failed");

    const data = await response.json();
    if (action === "hit") markCounted();
    showCount(data.value.toLocaleString());
  } catch {
    showCount("-");
  }
}

function setupCodeViewer() {
  const modal = document.getElementById("code-modal");
  if (!modal) return;

  const title = document.getElementById("code-title");
  const codeBody = document.getElementById("code-body");
  const codeContent = document.getElementById("code-content");
  const infoBody = document.getElementById("info-body");
  const closeButton = document.getElementById("code-close");

  function openModal(box) {
    title.textContent = box.querySelector(".box-header h2").textContent;

    if (box.dataset.info) {
      const template = document.getElementById(box.dataset.info);
      infoBody.innerHTML = "";
      if (template) infoBody.appendChild(template.content.cloneNode(true));
      infoBody.style.display = "block";
      codeBody.style.display = "none";
    } else {
      const source = document.getElementById(box.dataset.code);
      const code = source ? source.textContent.trim() : "";
      codeContent.textContent = code || "No code added yet.";
      codeBody.style.display = "block";
      infoBody.style.display = "none";
    }

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.querySelectorAll(".project-box").forEach(box => {
    box.addEventListener("click", () => openModal(box));
  });

  closeButton.addEventListener("click", closeModal);

  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateViews();
  setupCodeViewer();
});