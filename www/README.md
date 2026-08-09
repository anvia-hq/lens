# Anvia Lens documentation

The documentation website is a static Astro workspace styled with Tailwind CSS 4 and the Lens
design tokens. Astro components keep the generated documentation free of a client-side framework
runtime.

```sh
pnpm www:dev      # Start the authoring server on http://localhost:4321
pnpm www:build    # Generate the static site
pnpm www:preview  # Preview the generated site
```

Documentation pages live in `src/pages/docs` as Markdown. Add the `DocsLayout` frontmatter to place
a page in the shared documentation shell, then add its route to `src/data/docs-navigation.ts`.

Use a language identifier on every fenced code block so Astro can apply Shiki syntax highlighting:

````md
```ts
const tracing = lens.create();
```
````

Common identifiers in this site are `sh`, `dotenv`, `json`, and `ts`. Run `pnpm www:build` before
submitting documentation changes; the build checks frontmatter, Markdown rendering, internal pages,
and highlighted code blocks.
