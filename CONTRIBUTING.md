# Contributing

## Developing the plugin

```sh
npm run dev
```

Runs the starter against the local `plugin/` instead of the published
package. Changes to `plugin/src/client.js` apply on page reload, and changes
to `plugin/src/text.js` restart the dev server. Changes to
`plugin/src/index.js` need a manual restart.

Running `pnpm install --ignore-workspace` in `starter/` switches it back to
the published package.

## Releasing the plugin

Bump the version and push it to `main`:

```sh
cd plugin && npm version patch --no-git-tag-version
```

The Release workflow publishes `plugin/` to npm through trusted publishing
whenever a push to `main` changes `plugin/package.json` to a version npm
doesn't have yet. npm can take several minutes to list a new version. Once it
does, point the starter at it and push again:

```sh
cd starter && pnpm add --save-exact --ignore-workspace @usesubtext/astro@<version>
```
