import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
};

class Refusal extends Error {}

export function createTextMiddleware(root) {
  const site = realpathSync(root);
  const src = path.join(site, "src") + path.sep;
  let lastSave = Promise.resolve(null);

  const routes = {
    "POST /__subtext/text/check": (body) => check(src, body),
    "POST /__subtext/text/save": (body) => {
      const saving = lastSave.then(() => save(site, src, body));
      lastSave = saving.then(
        (result) => ({ ok: true, ...result }),
        (error) => ({ ok: false, error: error.message }),
      );

      return saving;
    },
    "GET /__subtext/text/last-save": () => lastSave,
  };

  return async (req, res, next) => {
    const route = routes[`${req.method} ${req.url?.split("?")[0]}`];

    if (!route) {
      return next();
    }

    try {
      const body = req.method === "POST" ? JSON.parse(await readBody(req)) : null;
      respond(res, 200, await route(body));
    } catch (error) {
      respond(res, error instanceof Refusal ? 422 : 500, { error: error.message });
    }
  };
}

async function check(src, { file, loc, tag, text }) {
  try {
    await locate(src, file, loc, tag, text);

    return { editable: true };
  } catch (error) {
    if (error instanceof Refusal) {
      return { editable: false, reason: error.message };
    }

    throw error;
  }
}

async function save(site, src, { page, edits }) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Refusal("There are no changes to save.");
  }

  const changes = [];

  for (const edit of edits) {
    const replacement = collapse(String(edit.newText ?? ""));

    if (replacement === "") {
      throw new Refusal("Text can't be empty.");
    }

    let found;

    try {
      found = await locate(src, edit.file, edit.loc, edit.tag, edit.oldText);
    } catch (error) {
      if (error instanceof Refusal) {
        throw new Refusal(`"${collapse(String(edit.oldText ?? ""))}" changed since you started editing. Reload and try again.`);
      }

      throw error;
    }

    if (changes.some((change) => change.path === found.path && change.start === found.start)) {
      throw new Refusal("The same text was edited twice. Reload and try again.");
    }

    if (replacement !== collapse(edit.oldText)) {
      changes.push({ ...found, before: collapse(edit.oldText), after: replacement });
    }
  }

  if (changes.length === 0) {
    return { changed: 0 };
  }

  const files = [...new Set(changes.map((change) => change.path))];

  for (const file of files) {
    const spans = changes.filter((change) => change.path === file).sort((a, b) => b.start - a.start);
    let updated = spans[0].source;

    for (const span of spans) {
      const content = updated.slice(span.start, span.end);
      const leading = content.match(/^\s*/)[0];
      const trailing = content.match(/\s*$/)[0];
      updated = updated.slice(0, span.start) + leading + encode(span.after) + trailing + updated.slice(span.end);
    }

    await writeFile(file, updated);
  }

  const result = { changed: changes.length, files: files.map((file) => path.relative(site, file)) };

  if (process.env.SUBTEXT_PRISM !== "1") {
    return result;
  }

  return { ...result, ...(await commit(site, files, page, changes)) };
}

async function commit(site, files, page, changes) {
  const subject = `Edit text on ${typeof page === "string" && page.startsWith("/") ? page : "the site"}`;
  const body = changes.map((change) => `- "${change.before}" → "${change.after}"`).join("\n");

  try {
    await run("git", ["add", "--", ...files], { cwd: site });
    await run("git", ["commit", "-q", "-m", subject, "-m", body, "--", ...files], { cwd: site });
  } catch (error) {
    return { committed: false, error: `Your changes were written but couldn't be saved to the prism: ${error.stderr?.trim() || error.message}` };
  }

  try {
    await run("git", ["push", "-q"], { cwd: site });
  } catch (error) {
    return { committed: true, pushed: false, error: `Your changes were saved but couldn't be sent: ${error.stderr?.trim() || error.message}` };
  }

  return { committed: true, pushed: true };
}

async function locate(src, file, loc, tag, text) {
  let filePath;
  let source;

  try {
    filePath = await realpath(path.resolve(String(file ?? "")));
    source = await readFile(filePath, "utf8");
  } catch {
    throw new Refusal("This text's source file no longer exists. Reload the page.");
  }

  if (!filePath.startsWith(src) || !filePath.endsWith(".astro")) {
    throw new Refusal("This text isn't part of a page template.");
  }

  const start = offsetOf(source, String(loc ?? ""));
  const tagStart = start === null ? -1 : source.lastIndexOf(`<${String(tag).toLowerCase()}`, start);

  if (tagStart === -1 || endOfOpeningTag(source, tagStart) !== start) {
    throw new Refusal("This page is out of date. Reload and try again.");
  }

  const end = source.indexOf("<", start);
  const content = source.slice(start, end === -1 ? undefined : end);

  if (content.includes("{")) {
    throw new Refusal("This text comes from elsewhere in the site, so it can't be edited here yet.");
  }

  if (end === -1 || !source.startsWith("</", end)) {
    throw new Refusal("This text contains other elements, so it can't be edited here yet.");
  }

  const decoded = decode(content);

  if (decoded === null || collapse(decoded) !== collapse(String(text ?? ""))) {
    throw new Refusal("This text doesn't match its source file. Reload and try again.");
  }

  return { path: filePath, source, start, end };
}

function offsetOf(source, loc) {
  const match = loc.match(/^(\d+):(\d+)$/);

  if (!match) {
    return null;
  }

  const [line, column] = [Number(match[1]), Number(match[2])];
  let offset = 0;

  for (let current = 1; current < line; current++) {
    offset = source.indexOf("\n", offset);

    if (offset === -1) {
      return null;
    }

    offset++;
  }

  return offset + column - 1;
}

function endOfOpeningTag(source, tagStart) {
  let quote = null;
  let depth = 0;

  for (let i = tagStart + 1; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
    } else if (char === ">" && depth === 0) {
      return source[i - 1] === "/" ? null : i + 1;
    }
  }

  return null;
}

function decode(text) {
  let unknown = false;

  const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] === "#") {
      return String.fromCodePoint(name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    }

    if (ENTITIES[name] === undefined) {
      unknown = true;
    }

    return ENTITIES[name] ?? entity;
  });

  return unknown ? null : decoded;
}

function encode(text) {
  return text
    .replace(/&(?=#?[a-z0-9]+;)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;")
    .replace(/\u00a0/g, "&nbsp;");
}

function collapse(text) {
  return text.replace(/[ \t\r\n\f]+/g, " ").trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
