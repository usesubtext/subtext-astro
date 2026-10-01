# Subtext for Astro

The Astro plugin and starter behind every [Subtext](https://usesubtext.ai)
site.

- **`plugin/`** is `@usesubtext/astro`, the plugin a site needs to publish on
  Subtext. It adds Subtext's editing tools to previews and does nothing on the
  live site.
- **`starter/`** is the site every new Subtext site starts from.

## Bringing your own Astro site

Any Astro 7 site can move to Subtext. Add the plugin:

```sh
pnpm add @usesubtext/astro
```

Then add it to your Astro config:

```ts
import { defineConfig } from "astro/config";
import subtext from "@usesubtext/astro";

export default defineConfig({
  integrations: [subtext()],
});
```

Subtext checks for the plugin when you publish, and won't publish a site
without it. For now, sites also need to build to static output, without an
adapter. pnpm, npm and yarn all work; bun isn't supported.

## What the plugin does

In a preview, "Edit text" lets you change text on the page directly. Edits
stay on the page until you save them all at once, or cancel to discard them.
Text that comes from props, slots, expressions or content files can't be
edited this way yet; ask your LLM instead.

The plugin also leaves a small marker in each build so Subtext can tell the
plugin was there. Subtext removes it before the site goes live.

See [`plugin/README.md`](plugin/README.md) for the details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for working on the plugin locally and
releasing it.
