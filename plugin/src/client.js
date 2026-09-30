const SOURCE = "[data-subtext-source-file]";
const ACTIVE_KEY = "subtext:edit-text";
const ACCENT = "#6d4aff";

let active = readActive();
let hovered = null;
let editing = null;

const pageStyle = document.createElement("style");
pageStyle.textContent = `
  astro-dev-toolbar { display: none !important; }
  [data-subtext-hover] { outline: 2px dashed ${ACCENT} !important; outline-offset: 3px; cursor: text !important; }
  [data-subtext-editing] { outline: 2px solid ${ACCENT} !important; outline-offset: 3px; cursor: text !important; }
`;
document.head.append(pageStyle);

const host = document.createElement("subtext-tools");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `
  <style>
    :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 500 13px/1.2 system-ui, sans-serif; }
    .bar { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    button { all: unset; cursor: pointer; padding: 10px 14px; border-radius: 999px; background: #111; color: #fff; box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); }
    button[aria-pressed="true"] { background: ${ACCENT}; }
    .toast { max-width: 280px; padding: 10px 12px; border-radius: 8px; background: #111; color: #fff; box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); }
    .toast[hidden] { display: none; }
  </style>
  <div class="bar">
    <div class="toast" role="status" hidden></div>
    <button type="button"></button>
  </div>
`;

const toggle = shadow.querySelector("button");
const toast = shadow.querySelector(".toast");
let toastTimer;

toggle.addEventListener("click", () => setActive(!active));
document.body.append(host);
render();

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

    if (editing && editing.contains(event.target)) {
      return;
    }

    const candidate = candidateFor(event.target);

    if (!candidate) {
      return;
    }

    const result = await request("check", { ...describe(candidate), text: candidate.textContent });

    if (result.editable) {
      begin(candidate);
    } else {
      notify(result.reason ?? result.error ?? "This text can't be edited here.");
    }
  },
  true,
);

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
  hovered?.removeAttribute("data-subtext-hover");
  hovered = null;

  const original = element.textContent;
  editing = element;
  element.setAttribute("data-subtext-editing", "");
  element.contentEditable = "plaintext-only";
  element.focus();

  let finished = false;

  const finish = async (commit) => {
    if (finished) {
      return;
    }

    finished = true;
    element.removeEventListener("keydown", onKeydown);
    element.removeEventListener("blur", onBlur);
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-subtext-editing");
    editing = null;

    if (!commit) {
      element.textContent = original;
      return;
    }

    const result = await request("save", { ...describe(element), oldText: original, newText: element.textContent });

    if (result.error) {
      element.textContent = original;
      notify(result.error);
    } else if (result.changed) {
      notify(`Saved to ${result.file}`);
    }
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

  element.addEventListener("keydown", onKeydown);
  element.addEventListener("blur", onBlur);
}

async function request(action, body) {
  try {
    const response = await fetch(`/__subtext/text/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return await response.json();
  } catch {
    return { error: "Couldn't reach the preview. Try again." };
  }
}

function setActive(value) {
  active = value;

  try {
    sessionStorage.setItem(ACTIVE_KEY, value ? "1" : "");
  } catch {}

  if (!value) {
    hovered?.removeAttribute("data-subtext-hover");
    hovered = null;
    editing?.blur();
  }

  render();
}

function readActive() {
  try {
    return sessionStorage.getItem(ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function render() {
  toggle.textContent = active ? "Done editing" : "Edit text";
  toggle.setAttribute("aria-pressed", String(active));
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}
