const SOURCE = "[data-subtext-source-file]";
const ACTIVE_KEY = "subtext:edit-text";
const SAVING_KEY = "subtext:saving";
const NOTICE_KEY = "subtext:notice";
const ACCENT = "#136fa4";

let active = readSession(ACTIVE_KEY);
let hovered = null;
let editing = null;
let stopEditing = null;
let editingBefore = null;
let saving = false;
const pending = new Map();

const pageStyle = document.createElement("style");
pageStyle.textContent = `
  astro-dev-toolbar { display: none !important; }
  [data-subtext-hover], [data-subtext-editing] { cursor: text !important; }
  [data-subtext-editing] { outline: none !important; }
`;
document.head.append(pageStyle);

const host = document.createElement("subtext-tools");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `
  <style>
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font: 500 13px/1.2 system-ui, sans-serif; }
    .highlight { position: fixed; box-sizing: border-box; border: 2px solid #fff; }
    .highlight::after { content: ""; position: absolute; inset: -2px; border: 2px dashed ${ACCENT}; border-radius: inherit; }
    .highlight.editing { border: 0; box-shadow: 0 0 0 1px #fff, 0 0 0 4px ${ACCENT}, 0 0 0 5px #fff; }
    .highlight.editing::after { display: none; }
    .highlight[hidden] { display: none; }
    .bar { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: auto; }
    .actions { display: flex; gap: 8px; }
    button { all: unset; cursor: pointer; padding: 10px 14px; border-radius: 999px; background: #111; color: #fff; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.4), 0 4px 16px rgb(0 0 0 / 0.25); }
    button[hidden] { display: none; }
    button[disabled] { cursor: default; opacity: 0.6; }
    button.primary { background: ${ACCENT}; }
    button.secondary { background: #fff; color: #111; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.15), 0 4px 16px rgb(0 0 0 / 0.25); }
    .toast { max-width: 280px; padding: 10px 12px; border-radius: 8px; background: #111; color: #fff; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.4), 0 4px 16px rgb(0 0 0 / 0.25); }
    .toast[hidden] { display: none; }
  </style>
  <div class="highlight" hidden></div>
  <div class="bar">
    <div class="toast" role="status" hidden></div>
    <div class="actions">
      <button type="button" data-action="cancel" class="secondary">Cancel</button>
      <button type="button" data-action="save" class="primary"></button>
      <button type="button" data-action="start">Edit text</button>
    </div>
  </div>
`;

const buttons = Object.fromEntries([...shadow.querySelectorAll("button")].map((button) => [button.dataset.action, button]));
const toast = shadow.querySelector(".toast");
const highlight = shadow.querySelector(".highlight");
let toastTimer;

shadow.querySelector(".actions").addEventListener("mousedown", (event) => event.preventDefault());
buttons.start.addEventListener("click", () => setActive(true));
buttons.cancel.addEventListener("click", cancel);
buttons.save.addEventListener("click", save);
document.body.append(host);
render();
requestAnimationFrame(track);
showCarriedNotice();
reportInterruptedSave();

window.addEventListener("beforeunload", (event) => {
  if (changeCount() > 0 && !saving) {
    event.preventDefault();
    event.returnValue = "";
  }
});

document.addEventListener("mouseover", (event) => {
  if (!active || editing) {
    return;
  }

  const candidate = candidateFor(event.target);

  if (candidate !== hovered) {
    hovered?.removeAttribute("data-subtext-hover");
    candidate?.setAttribute("data-subtext-hover", "");
    hovered = candidate;
  }
});

document.addEventListener(
  "click",
  async (event) => {
    if (!active || event.composedPath().includes(host)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (saving || (editing && editing.contains(event.target))) {
      return;
    }

    const candidate = candidateFor(event.target);

    if (!candidate) {
      return;
    }

    if (pending.has(candidate)) {
      begin(candidate);
      return;
    }

    const result = await request("POST", "check", { ...describe(candidate), text: candidate.textContent });

    if (result.editable) {
      begin(candidate);
    } else {
      notify(result.reason ?? result.error ?? "This text can't be edited here.");
    }
  },
  true,
);

function track() {
  const target = editing ?? hovered;

  if (target?.isConnected) {
    const rect = target.getBoundingClientRect();
    const radius = Math.min(parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0, rect.height / 2);
    Object.assign(highlight.style, {
      top: `${rect.top - 3}px`,
      left: `${rect.left - 3}px`,
      width: `${rect.width + 6}px`,
      height: `${rect.height + 6}px`,
      borderRadius: `${Math.max(radius + 3, 4)}px`,
    });
    highlight.classList.toggle("editing", target === editing);
    highlight.hidden = false;
  } else {
    highlight.hidden = true;
  }

  requestAnimationFrame(track);
}

function candidateFor(target) {
  const element = target instanceof Element ? target.closest(SOURCE) : null;

  if (!element || element.children.length > 0 || element.textContent.trim() === "" || host.contains(element)) {
    return null;
  }

  return element;
}

function describe(element) {
  return {
    file: element.getAttribute("data-subtext-source-file"),
    loc: element.getAttribute("data-subtext-source-loc"),
    tag: element.tagName,
  };
}

function begin(element) {
  stopEditing?.(true);
  hovered?.removeAttribute("data-subtext-hover");
  hovered = null;

  const before = element.textContent;
  editing = element;
  editingBefore = before;
  element.setAttribute("data-subtext-editing", "");
  element.contentEditable = "plaintext-only";
  element.focus();

  const finish = (keep) => {
    element.removeEventListener("keydown", onKeydown);
    element.removeEventListener("blur", onBlur);
    element.removeEventListener("input", render);
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-subtext-editing");
    editing = null;
    stopEditing = null;

    if (!keep) {
      element.textContent = before;
    } else if (collapse(element.textContent) === "") {
      element.textContent = before;
      notify("Text can't be empty.");
    } else {
      remember(element, before);
    }

    render();
  };

  const onKeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };

  const onBlur = () => finish(true);

  stopEditing = finish;
  element.addEventListener("keydown", onKeydown);
  element.addEventListener("blur", onBlur);
  element.addEventListener("input", render);
  render();
}

function remember(element, before) {
  const oldText = pending.get(element)?.oldText ?? before;

  if (collapse(element.textContent) === collapse(oldText)) {
    pending.delete(element);
  } else {
    pending.set(element, { ...describe(element), oldText, newText: element.textContent });
  }
}

function cancel() {
  stopEditing?.(false);

  for (const [element, edit] of pending) {
    element.textContent = edit.oldText;
  }

  pending.clear();
  setActive(false);
}

async function save() {
  stopEditing?.(true);

  if (pending.size === 0) {
    setActive(false);
    return;
  }

  saving = true;
  writeSession(SAVING_KEY, true);
  writeSession(ACTIVE_KEY, false);
  render();

  const result = await request("POST", "save", { page: location.pathname, edits: [...pending.values()] });

  saving = false;
  writeSession(SAVING_KEY, false);

  if (result.changed === undefined) {
    render();
    notify(result.error ?? "Your changes couldn't be saved.");
    return;
  }

  pending.clear();
  setActive(false);
  report(result);
}

async function reportInterruptedSave() {
  if (!readSession(SAVING_KEY)) {
    return;
  }

  writeSession(SAVING_KEY, false);
  const result = await request("GET", "last-save");

  if (result?.ok === false) {
    notify(result.error);
  } else if (result) {
    report(result);
  }
}

function report(result) {
  const message = result.error ?? (result.changed > 0 ? `Saved ${result.changed} ${result.changed === 1 ? "change" : "changes"}.` : null);

  if (!message) {
    return;
  }

  notify(message);

  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ message, at: Date.now() }));
  } catch {}
}

function showCarriedNotice() {
  try {
    const notice = JSON.parse(sessionStorage.getItem(NOTICE_KEY) ?? "null");
    sessionStorage.removeItem(NOTICE_KEY);

    if (notice && Date.now() - notice.at < 10000) {
      notify(notice.message);
    }
  } catch {}
}

async function request(method, action, body) {
  try {
    const response = await fetch(`/__subtext/text/${action}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    return await response.json();
  } catch {
    return { error: "Couldn't reach the preview. Try again." };
  }
}

function setActive(value) {
  active = value;
  writeSession(ACTIVE_KEY, value);

  if (!value) {
    hovered?.removeAttribute("data-subtext-hover");
    hovered = null;
    stopEditing?.(true);
  }

  render();
}

function changeCount() {
  if (!editing) {
    return pending.size;
  }

  const base = pending.get(editing)?.oldText ?? editingBefore;
  const changed = collapse(editing.textContent) !== "" && collapse(editing.textContent) !== collapse(base);

  return pending.size - (pending.has(editing) ? 1 : 0) + (changed ? 1 : 0);
}

function render() {
  const count = changeCount();
  buttons.start.hidden = active;
  buttons.cancel.hidden = !active;
  buttons.save.hidden = !active;
  buttons.save.textContent = saving ? "Saving…" : count === 0 ? "Done" : `Save ${count} ${count === 1 ? "change" : "changes"}`;
  buttons.save.disabled = saving;
  buttons.cancel.disabled = saving;
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value ? "1" : "");
  } catch {}
}

function collapse(text) {
  return text.replace(/[ \t\r\n\f]+/g, " ").trim();
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}
