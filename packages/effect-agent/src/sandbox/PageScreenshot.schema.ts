import * as Schema from 'effect/Schema'

/** Lossless PNG encoding. */
export const PageScreenshotPng = Schema.TaggedStruct('PageScreenshotPng', {})
export type PageScreenshotPng = typeof PageScreenshotPng.Type

/** Lossy JPEG encoding at a quality from 0 (smallest) to 100 (best). */
export const PageScreenshotJpeg = Schema.TaggedStruct('PageScreenshotJpeg', {
  quality: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
})
export type PageScreenshotJpeg = typeof PageScreenshotJpeg.Type

/** The image encoding. Only JPEG carries a quality. */
export const PageScreenshotFormat = Schema.Union([PageScreenshotPng, PageScreenshotJpeg])
export type PageScreenshotFormat = typeof PageScreenshotFormat.Type
