# @usesubtext/astro

Astro integration that adds Subtext's editing tools to a site's dev server.
It does nothing in production builds.

```ts
import subtext from "@usesubtext/astro";

export default defineConfig({
  integrations: [subtext()],
});
```

## Text editing

In a preview, "Edit text" makes text written directly in an `.astro` template
editable in place. Edits stay in the page until "Save", which writes them all
to their source files at once, or "Cancel", which discards them. Leaving the
page with unsaved edits asks for confirmation. Text that comes from props,
slots, expressions or content files can't be edited this way yet.

When the dev server runs with `SUBTEXT_PRISM=1`, as it does in a Subtext
prism, saved edits are also committed and pushed.

## Build marker

`astro build` writes `.subtext/build.json` into the output directory with the
plugin and Astro versions, the build output (`static` or `server`) and the
adapter, if any. Subtext requires it to publish a site, reads it, and removes
it before the site goes live.
