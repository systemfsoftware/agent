import * as Schema from 'effect/Schema'

import { PageResourceType, PageViewport } from './PageCapture.schema.js'
import { PageScreenshotFormat } from './PageScreenshot.schema.js'
import { SandboxImplementation } from './Sandbox.schema.js'

/** Matches `SANDBOX_DIAGNOSTIC_MAX_LENGTH`. */
const DIAGNOSTIC_MAX_LENGTH = 8 * 1024

/**
 * Page inspection: one stateful pass over a page in a single browser session. Event listeners
 * attach before navigation, so the pass reports what the page did while it loaded — console
 * and page errors, failed requests and error responses — then waits for readiness, runs one
 * caller script, and captures a screenshot for each named viewport.
 *
 * It is a sibling of the stateless `PageCapture` and `PageScreenshot` ports, which each run one
 * Quick Action and cannot observe page events or run a script. Everything a pass returns is
 * untrusted, page-influenced content. The caller authorizes the target and owns which failed
 * requests are noise for its pages.
 */

const MAX_VIEWPORTS = 8
const MAX_RECORDS = 1_024
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
const MAX_SCRIPT_RESULT_BYTES = 1024 * 1024
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const BoundedMillis = PositiveInt.check(Schema.isLessThanOrEqualTo(300_000))
const BoundedName = Schema.NonEmptyString.check(Schema.isMaxLength(64))
const BoundedScript = Schema.NonEmptyString.check(Schema.isMaxLength(64 * 1024))
const BoundedText = Schema.String.check(Schema.isMaxLength(DIAGNOSTIC_MAX_LENGTH))
const BoundedUrl = Schema.String.check(Schema.isMaxLength(8 * 1024))
const HeaderName = Schema.String.check(Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,256}$/))
const HttpMethod = Schema.NonEmptyString.check(Schema.isMaxLength(32))
/** An absolute HTTPS URL whose authority carries no credentials. */
const PageInspectionTargetUrl = Schema.String.check(
  Schema.isMaxLength(8 * 1024),
  Schema.isPattern(/^https:\/\/[^/?#@\s:]+(?::\d{1,5})?(?:[/?#]\S*)?$/),
)
const ErrorStatus = Schema.Int.check(Schema.isBetween({ minimum: 400, maximum: 599 }))
const AllowedOrigin = Schema.NonEmptyString.check(Schema.isMaxLength(2_048))

/** One named screenshot: the viewport it is taken at, its encoding, and whether it covers the full page. */
export class PageInspectionViewport
  extends Schema.Class<PageInspectionViewport, { readonly brand: unique symbol }>('PageInspectionViewport')({
    name: BoundedName,
    viewport: PageViewport,
    format: PageScreenshotFormat,
    fullPage: Schema.Boolean,
  })
{}

/**
 * Readiness after the load event: `pageFunction` (a JavaScript expression evaluated in the page)
 * must become truthy and the network must stay idle for `networkIdleMillis`, both within
 * `timeoutMillis`. On timeout the pass continues and `pendingFunction`, when given, is evaluated
 * to report what was still pending.
 */
export class PageInspectionReadiness
  extends Schema.Class<PageInspectionReadiness, { readonly brand: unique symbol }>('PageInspectionReadiness')({
    pageFunction: Schema.optionalKey(BoundedScript),
    networkIdleMillis: Schema.optionalKey(BoundedMillis),
    timeoutMillis: BoundedMillis,
    pendingFunction: Schema.optionalKey(BoundedScript),
  })
{}

/**
 * A failed request or error response that matches every given field is not reported. Use this for
 * requests that are expected to fail on the caller's pages.
 */
export class PageInspectionIgnoreRule extends Schema.Class<PageInspectionIgnoreRule, { readonly brand: unique symbol }>(
  'PageInspectionIgnoreRule',
)({
  urlPrefix: Schema.NonEmptyString.check(Schema.isMaxLength(8 * 1024)),
  resourceType: Schema.optionalKey(PageResourceType),
  status: Schema.optionalKey(ErrorStatus),
}) {}

/** Output bounds. Records past a count limit are counted, not returned. Bytes are encoded bytes. */
export class PageInspectionLimits
  extends Schema.Class<PageInspectionLimits, { readonly brand: unique symbol }>('PageInspectionLimits')({
    maxFindings: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_RECORDS })),
    maxFailedRequests: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_RECORDS })),
    maxScreenshotBytes: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_SCREENSHOT_BYTES)),
    maxScriptResultBytes: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_SCRIPT_RESULT_BYTES)),
  })
{}

const uniqueNames = (viewports: ReadonlyArray<PageInspectionViewport>) =>
  new Set(viewports.map((viewport) => viewport.name)).size === viewports.length

/**
 * One inspection pass. The first viewport is applied before navigation; later viewports resize the
 * same page. `script` is a JavaScript expression, evaluated once after readiness, whose value (or
 * awaited Promise value) must be JSON. `responseHeader` names one header read from the document
 * response. `allowedOrigins` bounds where navigation may land; it defaults to the target's origin.
 */
export class PageInspectionRequest
  extends Schema.Class<PageInspectionRequest, { readonly brand: unique symbol }>('PageInspectionRequest')({
    url: PageInspectionTargetUrl,
    allowedOrigins: Schema.optionalKey(
      Schema.Array(AllowedOrigin).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
    ),
    navigationTimeoutMillis: BoundedMillis,
    readiness: Schema.optionalKey(PageInspectionReadiness),
    script: Schema.optionalKey(BoundedScript),
    responseHeader: Schema.optionalKey(HeaderName),
    viewports: Schema.Array(PageInspectionViewport).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(MAX_VIEWPORTS),
      Schema.makeFilter(uniqueNames, {
        title: 'viewports with unique names',
        arbitraryConstraint: { uniqueBy: (viewport: PageInspectionViewport) => viewport.name },
      }),
    ),
    ignoreFailedRequests: Schema.Array(PageInspectionIgnoreRule).check(Schema.isMaxLength(256)),
    limits: PageInspectionLimits,
  })
{}

/** Where a console message or exception came from, when the browser reported it. */
export class PageInspectionSourceLocation
  extends Schema.Class<PageInspectionSourceLocation, { readonly brand: unique symbol }>(
    'PageInspectionSourceLocation',
  )({
    url: BoundedUrl,
    lineNumber: Schema.optionalKey(Schema.Natural),
  })
{}

export class PageConsoleError
  extends Schema.TaggedClass<PageConsoleError, { readonly brand: unique symbol }>()('PageConsoleError', {
    text: BoundedText,
    location: Schema.optionalKey(PageInspectionSourceLocation),
  })
{}

export class PageUncaughtError
  extends Schema.TaggedClass<PageUncaughtError, { readonly brand: unique symbol }>()('PageUncaughtError', {
    message: BoundedText,
  })
{}

export const PageInspectionFinding = Schema.Union([PageConsoleError, PageUncaughtError])
export type PageInspectionFinding = typeof PageInspectionFinding.Type

export class PageRequestFailed
  extends Schema.TaggedClass<PageRequestFailed, { readonly brand: unique symbol }>()('PageRequestFailed', {
    method: HttpMethod,
    url: BoundedUrl,
    errorText: BoundedText,
  })
{}

/** A response with status 400 or above. */
export class PageErrorResponse
  extends Schema.TaggedClass<PageErrorResponse, { readonly brand: unique symbol }>()('PageErrorResponse', {
    method: HttpMethod,
    url: BoundedUrl,
    status: ErrorStatus,
  })
{}

export const PageFailedRequest = Schema.Union([PageRequestFailed, PageErrorResponse])
export type PageFailedRequest = typeof PageFailedRequest.Type

export class PageReady extends Schema.TaggedClass<PageReady, { readonly brand: unique symbol }>()('PageReady', {}) {}

/** Readiness did not hold within its timeout; `pending` is the pending function's value. */
export class PageReadyTimedOut
  extends Schema.TaggedClass<PageReadyTimedOut, { readonly brand: unique symbol }>()('PageReadyTimedOut', {
    pending: Schema.optionalKey(Schema.Json),
  })
{}

export const PageReadiness = Schema.Union([PageReady, PageReadyTimedOut])
export type PageReadiness = typeof PageReadiness.Type

/** One captured screenshot, named by its viewport. Bytes are caller-owned. */
export class PageInspectionScreenshot
  extends Schema.Class<PageInspectionScreenshot, { readonly brand: unique symbol }>('PageInspectionScreenshot')({
    name: BoundedName,
    mediaType: Schema.Literals(['image/png', 'image/jpeg']),
    bytes: Schema.Uint8Array.check(Schema.isMaxLength(MAX_SCREENSHOT_BYTES)),
  })
{}

export class PageInspectionTimings
  extends Schema.Class<PageInspectionTimings, { readonly brand: unique symbol }>('PageInspectionTimings')({
    /** Opening the browser session. */
    launchMillis: Schema.Natural,
    /** From navigation start until readiness held or timed out. */
    readyMillis: Schema.Natural,
    totalMillis: Schema.Natural,
  })
{}

/** The page loaded and every requested step ran. */
export class PageInspectionCompleted
  extends Schema.TaggedClass<PageInspectionCompleted, { readonly brand: unique symbol }>()(
    'PageInspectionCompleted',
    {
      implementation: SandboxImplementation,
      /** The document response's status, absent when navigation produced none (for example a same-document load). */
      status: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }))),
      landedUrl: BoundedUrl,
      responseHeader: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8 * 1024))),
      readiness: PageReadiness,
      findings: Schema.Array(PageInspectionFinding).check(Schema.isMaxLength(MAX_RECORDS)),
      findingsOmitted: Schema.Natural,
      failedRequests: Schema.Array(PageFailedRequest).check(Schema.isMaxLength(MAX_RECORDS)),
      failedRequestsOmitted: Schema.Natural,
      /** The script's JSON value; absent when the request had no script. */
      evaluated: Schema.optionalKey(Schema.Json),
      screenshots: Schema.Array(PageInspectionScreenshot).check(Schema.isMaxLength(MAX_VIEWPORTS)),
      timings: PageInspectionTimings,
    },
  )
{}

/**
 * The pass did not reach the page. `BrowserUnavailable`: no browser session could be opened;
 * `ConcurrencyLimited`: the platform refused one for rate or concurrency; `OriginUnreachable`:
 * navigation failed at the network; `NavigationTimedOut`: the document did not load in time.
 */
export const PageInspectionNotRunReason = Schema.Literals([
  'BrowserUnavailable',
  'OriginUnreachable',
  'NavigationTimedOut',
  'ConcurrencyLimited',
])
export type PageInspectionNotRunReason = typeof PageInspectionNotRunReason.Type

export class PageInspectionNotRun
  extends Schema.TaggedClass<PageInspectionNotRun, { readonly brand: unique symbol }>()('PageInspectionNotRun', {
    implementation: SandboxImplementation,
    reason: PageInspectionNotRunReason,
    detail: Schema.optionalKey(BoundedText),
  })
{}

export const PageInspectionOutcome = Schema.Union([PageInspectionCompleted, PageInspectionNotRun])
export type PageInspectionOutcome = typeof PageInspectionOutcome.Type

/** Navigation landed outside `allowedOrigins`; no script ran and nothing was captured. */
export class PageInspectionOriginRefusedError
  extends Schema.TaggedError<PageInspectionOriginRefusedError, { readonly brand: unique symbol }>()(
    'PageInspectionOriginRefusedError',
    {
      implementation: SandboxImplementation,
      landedUrl: BoundedUrl,
      message: BoundedText,
    },
  )
{}

/** The script result or a screenshot exceeded its byte limit. */
export class PageInspectionOutputLimitError
  extends Schema.TaggedError<PageInspectionOutputLimitError, { readonly brand: unique symbol }>()(
    'PageInspectionOutputLimitError',
    {
      implementation: SandboxImplementation,
      output: Schema.Literals(['script', 'screenshot']),
      limit: PositiveInt,
      observed: Schema.Natural,
      message: BoundedText,
    },
  )
{}

/** The script threw, or returned a value that is not JSON. */
export class PageInspectionScriptError
  extends Schema.TaggedError<PageInspectionScriptError, { readonly brand: unique symbol }>()(
    'PageInspectionScriptError',
    {
      implementation: SandboxImplementation,
      message: BoundedText,
    },
  )
{}

/** The browser or its session produced a value or failure outside the inspection protocol. */
export class PageInspectionProtocolError
  extends Schema.TaggedError<PageInspectionProtocolError, { readonly brand: unique symbol }>()(
    'PageInspectionProtocolError',
    {
      implementation: SandboxImplementation,
      message: BoundedText,
      cause: Schema.optionalKey(Schema.Defect()),
    },
  )
{}

/** Expected inspection failures. A pass that never reached the page is `PageInspectionNotRun`, not an error. */
export const PageInspectionError = Schema.Union([
  PageInspectionOriginRefusedError,
  PageInspectionOutputLimitError,
  PageInspectionScriptError,
  PageInspectionProtocolError,
])
export type PageInspectionError = typeof PageInspectionError.Type
