import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import {
  PageCaptureEngine,
  PageCaptureNavigationError,
  PageCaptureProtocolError,
  PageCaptureRateLimitedError,
  PageCaptureTarget,
  PageCaptureUnsupportedError,
  PageNavigationOptions,
  PageResourcePolicy,
  PageViewport,
} from './PageCapture'
import { SandboxImplementation } from './Sandbox'

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

/** The byte limit and full-page choice are fixed before Browser Run starts. */
export class PageScreenshotLimits extends Schema.Class<PageScreenshotLimits>(
  'PageScreenshotLimits',
)({
  maxOutputBytes: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_SCREENSHOT_BYTES)),
}) {}

/** Lossless PNG encoding. */
export class PageScreenshotPng extends Schema.TaggedClass<PageScreenshotPng>()('PageScreenshotPng', {}) {}

/** Lossy JPEG encoding at a quality from 0 (smallest) to 100 (best). */
export class PageScreenshotJpeg extends Schema.TaggedClass<PageScreenshotJpeg>()('PageScreenshotJpeg', {
  quality: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)),
}) {}

/** The image encoding. Only JPEG carries a quality. */
export const PageScreenshotFormat = Schema.Union([PageScreenshotPng, PageScreenshotJpeg])
export type PageScreenshotFormat = typeof PageScreenshotFormat.Type

/** Schema-first request for exactly one screenshot in the requested format. */
export class PageScreenshotRequest extends Schema.Class<PageScreenshotRequest>(
  'PageScreenshotRequest',
)({
  target: PageCaptureTarget,
  engine: PageCaptureEngine,
  limits: PageScreenshotLimits,
  format: PageScreenshotFormat,
  fullPage: Schema.Boolean,
  navigation: Schema.optionalKey(PageNavigationOptions),
  viewport: Schema.optionalKey(PageViewport),
  resourcePolicy: Schema.optionalKey(PageResourcePolicy),
}) {}

/** The only successful output: bytes are caller-owned and never durable framework data. */
export class PageScreenshotResult extends Schema.Class<PageScreenshotResult>(
  'PageScreenshotResult',
)({
  implementation: SandboxImplementation,
  mediaType: Schema.Literals(['image/png', 'image/jpeg']),
  bytes: Schema.Uint8Array.check(Schema.isMaxLength(MAX_SCREENSHOT_BYTES)),
}) {}

/** The response crossed the request's screenshot byte limit. */
export class PageScreenshotOutputLimitError extends Schema.TaggedError<PageScreenshotOutputLimitError>()(
  'PageScreenshotOutputLimitError',
  {
    implementation: SandboxImplementation,
    limit: PositiveInt,
    observed: Schema.Natural,
  },
) {}

/** Expected screenshot failures. The shared capture errors keep identical semantics. */
export const PageScreenshotError = Schema.Union([
  PageCaptureRateLimitedError,
  PageCaptureNavigationError,
  PageCaptureUnsupportedError,
  PageCaptureProtocolError,
  PageScreenshotOutputLimitError,
])

export type PageScreenshotError = typeof PageScreenshotError.Type

/** Stateless, one-output screenshot port. It owns neither persistence nor later byte handoff. */
export class PageScreenshot extends Context.Service<
  PageScreenshot,
  {
    readonly capture: (
      request: PageScreenshotRequest,
    ) => Effect.Effect<PageScreenshotResult, PageScreenshotError>
  }
>()('@effect-agent/sandbox/PageScreenshot') {}

export type PageScreenshotCapture = (
  request: PageScreenshotRequest,
) => Effect.Effect<PageScreenshotResult, PageScreenshotError>
