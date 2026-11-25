import { fileURLToPath } from 'node:url'

import { NodeServices } from '@effect/platform-node'
import type { AstroIntegration } from 'astro'
import { Effect, FileSystem } from 'effect'

import { type SocialPage, writeSocialImages } from './social-renderer.ts'

// Read the rendered metadata so crawlers and generated cards always share page copy.
const decodeHtml = (text: string) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

export const socialImages = (): AstroIntegration => ({
  name: 'effect-agent-social-images',
  hooks: {
    'astro:build:done': ({ dir, pages }) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const fs = yield* FileSystem.FileSystem
          const cards: SocialPage[] = []

          for (const { pathname } of pages) {
            if (pathname.replace(/\/$/, '') === '404') continue

            const html = yield* fs.readFileString(new URL(`${pathname}index.html`, dir).pathname)

            const meta = (property: string) => {
              const value = new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(
                html,
              )?.[1]

              if (value === undefined) throw new Error(`Missing ${property} in ${pathname}`)

              return decodeHtml(value)
            }

            // Cards are derived from the page path: until a docs domain is approved no absolute
            // origin exists, so og:url and og:image are not emitted for these pages.
            cards.push({
              title: meta('og:title').replace(/ \| @systemfsoftware\/agent$/, ''),
              description: meta('og:description'),
              url: pathname,
              imagePath: `social/${pathname.replace(/^\/agent\/?/, '').replace(/\/$/, '') || 'index'}.png`,
            })
          }

          yield* writeSocialImages(
            fileURLToPath(new URL('../', import.meta.url)),
            fileURLToPath(dir),
            cards,
          )
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      ),
  },
})
