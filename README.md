# subtext

Subtext Astro plugin and starter

## Developing the plugin

```sh
npm run dev
```

Runs the starter against the local `plugin/` instead of the published
package. Changes to `plugin/src/client.js` apply on page reload, and changes
to `plugin/src/text.js` restart the dev server. Changes to
`plugin/src/index.js` need a manual restart.

Running `npm install` in `starter/` switches it back to the published
package.

## Releasing the plugin

```sh
cd plugin && npm version patch && npm publish
cd ../starter && npm install --save-exact @usesubtext/astro@<version>
```
