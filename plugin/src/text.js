import { realpathSync } from "node:fs";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const ROUTES = {
  "/__subtext/text/check": check,
  "/__subtext/text/save": save,
};

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
};

class Refusal extends Error {}

export function createTextMiddleware(root) {
  const src = path.join(realpathSync(root), "src") + path.sep;

  return async (req, res, next) => {
    const route = ROUTES[req.url?.split("?")[0]];

    if (req.method !== "POST" || !route) {
      return next();
    }

    try {
      respond(res, 200, await route(src, JSON.parse(await readBody(req))));
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

async function save(src, { file, loc, tag, oldText, newText }) {
  const replacement = collapse(String(newText ?? ""));

  if (replacement === "") {
    throw new Refusal("Text can't be empty.");
  }

  const found = await locate(src, file, loc, tag, oldText);

  if (replacement === collapse(oldText)) {
    return { changed: false };
  }

  const content = found.source.slice(found.start, found.end);
  const leading = content.match(/^\s*/)[0];
  const trailing = content.match(/\s*$/)[0];
  const updated = found.source.slice(0, found.start) + leading + encode(replacement) + trailing + found.source.slice(found.end);

  await writeFile(found.path, updated);

  return { changed: true, file: path.relative(path.dirname(src), found.path) };
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
    .replace(/ /g, "&nbsp;");
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
