import { fileURLToPath } from "node:url";

const textModule = new URL("./text.js", import.meta.url);

export default function subtext() {
  let root;

  return {
    name: "@usesubtext/astro",
    hooks: {
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
