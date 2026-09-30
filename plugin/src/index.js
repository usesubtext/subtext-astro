import { fileURLToPath } from "node:url";
import { createTextMiddleware } from "./text.js";

export default function subtext() {
  let root;

  return {
    name: "@usesubtext/astro",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig, injectScript }) => {
        if (command !== "dev") {
          return;
        }

        root = fileURLToPath(config.root);
        updateConfig({ devToolbar: { enabled: true }, vite: { plugins: [preserveSourceAnnotations()] } });
        injectScript("page", `import "@usesubtext/astro/client";`);
      },
      "astro:server:setup": ({ server }) => {
        if (root) {
          server.middlewares.use(createTextMiddleware(root));
        }
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
