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
editable in place. Saving writes the change to the source file and the dev
server reloads the page. Text that comes from props, slots, expressions or
content files can't be edited this way yet.
