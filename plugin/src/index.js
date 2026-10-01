import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const textModule = new URL("./text.js", import.meta.url);
const pluginPackage = new URL("../package.json", import.meta.url);

export default function subtext() {
  let root;
  let build;

  return {
    name: "@usesubtext/astro",
    hooks: {
      "astro:config:done": async ({ config, buildOutput }) => {
        const astroPackage = createRequire(config.root).resolve("astro/package.json");

        build = {
          outDir: config.outDir,
          marker: {
            plugin: (await readJson(pluginPackage)).version,
            astro: (await readJson(astroPackage)).version,
            output: buildOutput,
            adapter: config.adapter?.name ?? null,
          },
        };
      },
      "astro:build:done": async () => {
        const dir = new URL(".subtext/", build.outDir);

        await mkdir(dir, { recursive: true });
        await writeFile(new URL("build.json", dir), JSON.stringify(build.marker, null, 2) + "\n");
      },
      "astro:config:setup": ({ command, config, updateConfig, injectScript, addWatchFile }) => {
        if (command !== "dev") {
          return;
        }

        root = fileURLToPath(config.root);
        addWatchFile(textModule);
        updateConfig({ devToolbar: { enabled: true }, vite: { plugins: [preserveSourceAnnotations()] } });
        injectScript("page", `import "@usesubtext/astro/client";`);
      },
      "astro:server:setup": async ({ server }) => {
        if (!root) {
          return;
        }

        const { createTextMiddleware } = await import(`${textModule.href}?t=${Date.now()}`);
        server.watcher.add(fileURLToPath(textModule));
        server.middlewares.use(createTextMiddleware(root));
      },
    },
  };
}

function preserveSourceAnnotations() {
  return {
    name: "subtext:preserve-source-annotations",
    enforce: "post",
    transform(code, id) {
      if (id.split("?")[0].endsWith(".astro") && code.includes("data-astro-source-")) {
        return { code: code.replaceAll("data-astro-source-", "data-subtext-source-"), map: null };
      }
    },
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
