import {
  PageFailedRequest,
  PageInspection,
  PageInspectionCompleted,
  type PageInspectionError,
  PageInspectionFinding,
  type PageInspectionIgnoreRule,
  PageInspectionNotRun,
  type PageInspectionNotRunReason,
  PageInspectionOriginRefusedError,
  type PageInspectionOutcome,
  PageInspectionOutputLimitError,
  PageInspectionProtocolError,
  type PageInspectionReadiness,
  type PageInspectionRequest,
  PageInspectionScriptError,
  type PageInspectionViewport,
} from '@systemfsoftware/agent/page-inspection'
import { PageScreenshotJpeg } from '@systemfsoftware/agent/page-screenshot'
import { SANDBOX_DIAGNOSTIC_MAX_LENGTH, SandboxImplementation } from '@systemfsoftware/agent/sandbox'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import {
  type ConsoleMessage,
  type HTTPRequest,
  type HTTPResponse,
  type PageEvent,
  type PageEvents,
  TimeoutError,
} from 'puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js'

import {
  type BrowserSession,
  type BrowserSessionError,
  BrowserSessionOptions,
  type BrowserSessionPage,
  BrowserSessions,
} from './BrowserSession'

/**
 * `PageInspection` over one `BrowserSessions` session per pass. The pass creates the session,
 * owns it, and closes it when the pass ends. Listeners attach before the first navigation, so
 * events during load are reported. Deployment class `E` only.
 */
export const browserSessionInspectionImplementation = SandboxImplementation.make({
  isolation: 'isolated',
  identity: 'cloudflare-browser-session-inspection',
})

const implementation = browserSessionInspectionImplementation
/** Budget for the script and screenshots, which run after navigation and readiness. */
const CAPTURE_ALLOWANCE_MILLIS = 30_000
const MAX_URL_LENGTH = 8 * 1024
const MAX_HEADER_LENGTH = 8 * 1024

const clip = (text: string, limit: number) => text.slice(0, limit)
const clipText = (text: string) => clip(text, SANDBOX_DIAGNOSTIC_MAX_LENGTH)
const clipUrl = (url: string) => clip(url, MAX_URL_LENGTH)

const KNOWN_RESOURCE_TYPES: ReadonlySet<string> = new Set([
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
])

const resourceTypeOf = (request: HTTPRequest) =>
  KNOWN_RESOURCE_TYPES.has(request.resourceType()) ? request.resourceType() : 'other'

const unsetOrEqual = <A>(expected: A | undefined, actual: A | undefined) =>
  expected === undefined || expected === actual

const matchesRule = (rule: PageInspectionIgnoreRule, request: HTTPRequest, status: number | undefined) =>
  [
    request.url().startsWith(rule.urlPrefix),
    unsetOrEqual<string>(rule.resourceType, resourceTypeOf(request)),
    unsetOrEqual(rule.status, status),
  ].every(Boolean)

const ignored = (request: PageInspectionRequest, failed: HTTPRequest, status: number | undefined) =>
  request.ignoreFailedRequests.some((rule) => matchesRule(rule, failed, status))

interface Records<A> {
  readonly limit: number
  readonly items: Array<A>
  omitted: number
}

const makeRecords = <A>(limit: number): Records<A> => ({ limit, items: [], omitted: 0 })

const pushRecord = <A>(records: Records<A>, item: A) => {
  if (records.items.length < records.limit) {
    records.items.push(item)

    return
  }
  records.omitted += 1
}

const lineOf = (lineNumber: number | undefined) =>
  Option.fromNullishOr(lineNumber).pipe(
    Option.filter((line) => line >= 0),
    Option.match({ onNone: () => ({}), onSome: (line) => ({ lineNumber: line }) }),
  )

const locationOf = (message: ConsoleMessage) => {
  const location = message.location()

  return Option.fromNullishOr(location.url).pipe(
    Option.filter((url) => url !== ''),
    Option.match({
      onNone: () => ({}),
      onSome: (url) => ({ location: { url: clipUrl(url), ...lineOf(location.lineNumber) } }),
    }),
  )
}

const uncaughtMessage = (error: PageEvents[PageEvent.PageError]) =>
  error instanceof Error ? clipText(error.message) : 'The page threw a value that is not an Error'

const errorTextOf = (failed: HTTPRequest) =>
  Option.fromNullishOr(failed.failure()).pipe(
    Option.map((failure) => clipText(failure.errorText)),
    Option.getOrElse(() => 'unknown'),
  )

const reportable = (request: PageInspectionRequest, response: HTTPResponse) =>
  [response.status() >= 400, response.status() <= 599, !ignored(request, response.request(), response.status())]
    .every(Boolean)

/** Page listeners that only record; nothing they do can throw into the page's event loop. */
const recorderFor = (request: PageInspectionRequest) => {
  const findings = makeRecords<typeof PageInspectionFinding.Encoded>(request.limits.maxFindings)
  const failedRequests = makeRecords<typeof PageFailedRequest.Encoded>(request.limits.maxFailedRequests)

  const listeners = {
    console: (message: ConsoleMessage) => {
      if (message.type() !== 'error') return
      pushRecord(findings, { _tag: 'PageConsoleError', text: clipText(message.text()), ...locationOf(message) })
    },
    pageerror: (error: PageEvents[PageEvent.PageError]) =>
      pushRecord(findings, { _tag: 'PageUncaughtError', message: uncaughtMessage(error) }),
    requestfailed: (failed: HTTPRequest) => {
      if (ignored(request, failed, undefined)) return
      pushRecord(failedRequests, {
        _tag: 'PageRequestFailed',
        method: clip(failed.method(), 32),
        url: clipUrl(failed.url()),
        errorText: errorTextOf(failed),
      })
    },
    response: (response: HTTPResponse) => {
      if (!reportable(request, response)) return
      pushRecord(failedRequests, {
        _tag: 'PageErrorResponse',
        method: clip(response.request().method(), 32),
        url: clipUrl(response.url()),
        status: response.status(),
      })
    },
  }

  const attach = (page: BrowserSessionPage) => {
    page.on('console', listeners.console)
    page.on('pageerror', listeners.pageerror)
    page.on('requestfailed', listeners.requestfailed)
    page.on('response', listeners.response)
  }

  const detach = (page: BrowserSessionPage) => {
    page.off('console', listeners.console)
    page.off('pageerror', listeners.pageerror)
    page.off('requestfailed', listeners.requestfailed)
    page.off('response', listeners.response)
  }

  return { findings, failedRequests, attach, detach }
}

const protocolError = (message: string, cause?: BrowserSessionError | Schema.SchemaError) =>
  PageInspectionProtocolError.make({ implementation, message, ...(cause === undefined ? {} : { cause }) })

const notRun = (reason: PageInspectionNotRunReason, detail?: string) =>
  PageInspectionNotRun.make({ implementation, reason, ...(detail === undefined ? {} : { detail }) })

const sessionFailed = (error: BrowserSessionError) =>
  protocolError(`The browser session failed during inspection: ${error.reason}`, error)

const outOfBounds = (cause: Schema.SchemaError) =>
  protocolError('The browser returned an inspection outside its bounds', cause)

const unavailable = (error: BrowserSessionError): Effect.Effect<PageInspectionOutcome, PageInspectionError> =>
  Match.value(error.reason).pipe(
    Match.when('rate-limited', () => Effect.succeed(notRun('ConcurrencyLimited'))),
    Match.when(
      'invalid',
      () => Effect.fail(protocolError('The browser session rejected the inspection options', error)),
    ),
    Match.orElse((reason) => Effect.succeed(notRun('BrowserUnavailable', reason))),
  )

const navigationFailure = (cause: Error) =>
  notRun(cause instanceof TimeoutError ? 'NavigationTimedOut' : 'OriginUnreachable', clipText(cause.message))

interface DocumentFacts {
  readonly status?: number
  readonly responseHeader?: string
}

const headerOf = (response: HTTPResponse, name: string | undefined) =>
  Option.fromNullishOr(name).pipe(
    Option.flatMap((header) => Option.fromNullishOr(response.headers()[header.toLowerCase()])),
    Option.match({ onNone: () => ({}), onSome: (value) => ({ responseHeader: clip(value, MAX_HEADER_LENGTH) }) }),
  )

const documentFacts = (request: PageInspectionRequest) => (response: HTTPResponse | null): DocumentFacts =>
  response === null ? {} : { status: response.status(), ...headerOf(response, request.responseHeader) }

const statusField = (facts: DocumentFacts) =>
  Option.fromNullishOr(facts.status).pipe(
    Option.filter((status) => status >= 100 && status <= 599),
    Option.match({ onNone: () => ({}), onSome: (status) => ({ status }) }),
  )

const viewportOf = (entry: PageInspectionViewport) => ({ width: entry.viewport.width, height: entry.viewport.height })

const isJpeg = Schema.is(PageScreenshotJpeg)

const screenshotOptions = (entry: PageInspectionViewport) =>
  isJpeg(entry.format)
    ? { type: 'jpeg' as const, quality: entry.format.quality, fullPage: entry.fullPage, encoding: 'binary' as const }
    : { type: 'png' as const, fullPage: entry.fullPage, encoding: 'binary' as const }

const mediaTypeOf = (entry: PageInspectionViewport) => (isJpeg(entry.format) ? 'image/jpeg' : 'image/png')

const settleFrames = 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'

const resize = (page: BrowserSessionPage, entry: PageInspectionViewport, index: number) =>
  index === 0 ? Promise.resolve() : page.setViewport(viewportOf(entry)).then(() => page.evaluate(settleFrames))

const originOf = Option.liftThrowable((url: string) => new URL(url).origin)

const allowedOrigins = (request: PageInspectionRequest) =>
  request.allowedOrigins ?? Option.toArray(originOf(request.url))

const functionCondition = (page: BrowserSessionPage, ready: PageInspectionReadiness) =>
  Option.fromNullishOr(ready.pageFunction).pipe(
    Option.map((pageFunction) =>
      page.waitForFunction(pageFunction, { timeout: ready.timeoutMillis, polling: 'raf' }).then((handle) =>
        handle.dispose()
      )
    ),
    Option.toArray,
  )

const idleCondition = (page: BrowserSessionPage, ready: PageInspectionReadiness) =>
  Option.fromNullishOr(ready.networkIdleMillis).pipe(
    Option.map((idleTime) => page.waitForNetworkIdle({ idleTime, timeout: ready.timeoutMillis })),
    Option.toArray,
  )

const pendingField = <A>(pending: A | undefined) => (pending === undefined ? {} : { pending })

const pendingOf = (page: BrowserSessionPage, ready: PageInspectionReadiness) =>
  Option.fromNullishOr(ready.pendingFunction).pipe(
    Option.match({
      onNone: () => Promise.resolve({}),
      onSome: (pendingFunction) =>
        page.evaluate(pendingFunction).then(
          (pending) => pendingField(pending),
          () => ({}),
        ),
    }),
  )

// Any condition that did not hold — a timeout, or a page function that threw — leaves the page not ready.
const awaitReadiness = async (page: BrowserSessionPage, ready: PageInspectionReadiness) => {
  const settled = await Promise.allSettled([...functionCondition(page, ready), ...idleCondition(page, ready)])
  const held = settled.every((result) => result.status === 'fulfilled')

  return held ? { _tag: 'PageReady' } : { _tag: 'PageReadyTimedOut', ...(await pendingOf(page, ready)) }
}

const scriptValue = <A>(value: A): Result.Result<A, string> => Result.succeed(value)

const scriptThrew = (cause: Error): Result.Result<never, string> => Result.fail(clipText(cause.message))

const evaluateScript = (page: BrowserSessionPage, script: string) =>
  page.evaluate(script).then(scriptValue, scriptThrew)

const scriptFailed = (message: string) => PageInspectionScriptError.make({ implementation, message })

const outputLimit = (output: 'script' | 'screenshot', limit: number, observed: number) =>
  PageInspectionOutputLimitError.make({
    implementation,
    output,
    limit,
    observed,
    message: `The ${output} output exceeded its ${limit}-byte limit`,
  })

const utf8Length = (text: string) => new TextEncoder().encode(text).byteLength

const boundScriptValue = Effect.fnUntraced(function*<A>(request: PageInspectionRequest, value: A) {
  const json = yield* Schema.decodeUnknownEffect(Schema.Json)(value).pipe(
    Effect.mapError(() => scriptFailed('The script returned a value that is not JSON')),
  )
  const text = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(json).pipe(Effect.mapError(outOfBounds))

  yield* Effect.filterOrFail(
    Effect.succeed(utf8Length(text)),
    (observed) => observed <= request.limits.maxScriptResultBytes,
    (observed) => outputLimit('script', request.limits.maxScriptResultBytes, observed),
  )

  return { evaluated: json }
})

/** The steps of one pass on an attached session; each step is one bounded session command. */
const passSteps = (session: BrowserSession, request: PageInspectionRequest) => {
  const run = <A>(action: (page: BrowserSessionPage) => Promise<A>) =>
    session.run(Effect.void, action).pipe(Effect.mapError(sessionFailed))

  const recorder = recorderFor(request)
  const [first] = request.viewports

  const navigate = run((page) =>
    page.setViewport(viewportOf(first)).then(() =>
      page.goto(request.url, { waitUntil: 'load', timeout: request.navigationTimeoutMillis }).then(
        documentFacts(request),
        navigationFailure,
      )
    )
  )

  const readiness = Option.match(Option.fromNullishOr(request.readiness), {
    onNone: () => Effect.succeed({ _tag: 'PageReady' }),
    onSome: (ready) => run((page) => awaitReadiness(page, ready)),
  })

  const script = Option.match(Option.fromNullishOr(request.script), {
    onNone: () => Effect.succeed({}),
    onSome: (source) =>
      run((page) => evaluateScript(page, source)).pipe(
        Effect.flatMap((result) =>
          Result.match(result, {
            onFailure: (message) => Effect.fail(scriptFailed(message)),
            onSuccess: (value) => boundScriptValue(request, value),
          })
        ),
      ),
  })

  const screenshot = (entry: PageInspectionViewport, index: number) =>
    run((page) => resize(page, entry, index).then(() => page.screenshot(screenshotOptions(entry)))).pipe(
      Effect.filterOrFail(
        (bytes) => bytes.byteLength <= request.limits.maxScreenshotBytes,
        (bytes) => outputLimit('screenshot', request.limits.maxScreenshotBytes, bytes.byteLength),
      ),
      Effect.map((bytes) => ({ name: entry.name, mediaType: mediaTypeOf(entry), bytes })),
    )

  return {
    recorder,
    attach: run((page) => Promise.resolve(recorder.attach(page))),
    detach: run((page) => Promise.resolve(recorder.detach(page))),
    navigate,
    readiness,
    landedUrl: run((page) => Promise.resolve(page.url())),
    script,
    screenshot,
  }
}

type PassSteps = ReturnType<typeof passSteps>

interface PassClock {
  readonly started: number
  readonly launched: number
  readonly navigationStarted: number
}

const refuseOutsideOrigins = (request: PageInspectionRequest, url: string) =>
  Effect.filterOrFail(
    Effect.succeed(clipUrl(url)),
    (landedUrl) => Option.exists(originOf(landedUrl), (origin) => allowedOrigins(request).includes(origin)),
    (landedUrl) =>
      PageInspectionOriginRefusedError.make({
        implementation,
        landedUrl,
        message: 'Navigation landed outside the allowed origins',
      }),
  )

const afterNavigation = Effect.fnUntraced(function*(
  steps: PassSteps,
  request: PageInspectionRequest,
  facts: DocumentFacts,
  clock: PassClock,
) {
  yield* steps.landedUrl.pipe(Effect.flatMap((url) => refuseOutsideOrigins(request, url)))
  const readiness = yield* steps.readiness
  const readyAt = yield* Clock.currentTimeMillis
  const landedUrl = yield* steps.landedUrl.pipe(Effect.flatMap((url) => refuseOutsideOrigins(request, url)))
  const evaluated = yield* steps.script
  const screenshots = yield* Effect.forEach(request.viewports, steps.screenshot)
  const finished = yield* Clock.currentTimeMillis

  return yield* Schema.decodeUnknownEffect(PageInspectionCompleted)({
    _tag: 'PageInspectionCompleted',
    implementation,
    ...statusField(facts),
    landedUrl,
    ...(facts.responseHeader === undefined ? {} : { responseHeader: facts.responseHeader }),
    readiness,
    findings: steps.recorder.findings.items,
    findingsOmitted: steps.recorder.findings.omitted,
    failedRequests: steps.recorder.failedRequests.items,
    failedRequestsOmitted: steps.recorder.failedRequests.omitted,
    ...evaluated,
    screenshots,
    timings: {
      launchMillis: clock.launched - clock.started,
      readyMillis: readyAt - clock.navigationStarted,
      totalMillis: finished - clock.started,
    },
  }).pipe(Effect.mapError(outOfBounds))
})

const isNotRun = Schema.is(PageInspectionNotRun)

const runPass = Effect.fnUntraced(function*(
  sessions: BrowserSessions['Service'],
  session: BrowserSession,
  request: PageInspectionRequest,
  started: number,
) {
  yield* Effect.addFinalizer(() => sessions.close(session.reference.sessionId).pipe(Effect.ignore))
  const launched = yield* Clock.currentTimeMillis
  const steps = passSteps(session, request)

  yield* Effect.acquireRelease(steps.attach, () => steps.detach.pipe(Effect.ignore))
  const navigationStarted = yield* Clock.currentTimeMillis
  const navigated = yield* steps.navigate

  return isNotRun(navigated)
    ? navigated
    : yield* afterNavigation(steps, request, navigated, { started, launched, navigationStarted })
})

const readinessMillisOf = (request: PageInspectionRequest) =>
  Option.fromNullishOr(request.readiness).pipe(
    Option.map((ready) => ready.timeoutMillis),
    Option.getOrElse(() => 0),
  )

const passMillisOf = (request: PageInspectionRequest) =>
  request.navigationTimeoutMillis + readinessMillisOf(request) + CAPTURE_ALLOWANCE_MILLIS

const inspect = (sessions: BrowserSessions['Service']) => (request: PageInspectionRequest) =>
  Effect.scoped(
    Effect.gen(function*() {
      const started = yield* Clock.currentTimeMillis
      const passMillis = passMillisOf(request)

      return yield* sessions
        .createAttached(
          BrowserSessionOptions.make({
            maxElapsedMillis: passMillis + CAPTURE_ALLOWANCE_MILLIS,
            commandTimeoutMillis: passMillis,
          }),
          () => Effect.void,
        )
        .pipe(
          Effect.matchEffect({
            onFailure: unavailable,
            onSuccess: (session) => runPass(sessions, session, request, started),
          }),
        )
    }),
  )

/** `PageInspection` backed by `BrowserSessions`; one browser session per pass. */
export const browserSessionInspectionLayer: Layer.Layer<PageInspection, never, BrowserSessions> = Layer.effect(
  PageInspection,
  Effect.map(BrowserSessions, (sessions) => PageInspection.of({ inspect: inspect(sessions) })),
)
