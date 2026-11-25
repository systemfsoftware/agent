import * as Schema from 'effect/Schema'

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

/** The rendered viewport. */
export const PageViewport = Schema.Struct({
  width: PositiveInt.check(Schema.isLessThanOrEqualTo(7_680)),
  height: PositiveInt.check(Schema.isLessThanOrEqualTo(7_680)),
})
export type PageViewport = typeof PageViewport.Type

/** A browser request's resource type. */
export const PageResourceType = Schema.Literals([
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'eventsource',
  'websocket',
  'manifest',
  'other',
])
export type PageResourceType = typeof PageResourceType.Type
