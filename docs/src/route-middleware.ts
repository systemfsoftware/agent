import { defineRouteMiddleware } from '@astrojs/starlight/route-data'

export const onRequest = defineRouteMiddleware((context) => {
  const { head, entry } = context.locals.starlightRoute

  if (context.url.pathname === '/agent/404/') return

  const title = entry.data.title === '@systemfsoftware/agent'
    ? '@systemfsoftware/agent'
    : `${entry.data.title} | @systemfsoftware/agent`

  const description = entry.data.description ??
    'An agent harness toolkit for TypeScript, built on Effect and Effect AI.'

  for (const item of head) {
    if (item.tag === 'title') item.content = title
    if (item.tag === 'meta' && item.attrs?.property === 'og:title') item.attrs.content = title
    if (item.tag === 'meta' && item.attrs?.property === 'og:type') item.attrs.content = 'website'
    if (item.tag === 'meta' && item.attrs?.name === 'twitter:card') {
      item.attrs.content = 'summary'
    }
  }

  // Social-card images are generated into the build, but the tags that reference them need an
  // absolute docs origin; they return with the domain.
  for (
    const [name, content] of Object.entries({
      'twitter:title': title,
      'twitter:description': description,
    })
  ) {
    head.push({ tag: 'meta', attrs: { name, content } })
  }
})
