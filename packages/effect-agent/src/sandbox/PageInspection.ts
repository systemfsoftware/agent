import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { PageInspectionError, PageInspectionOutcome, PageInspectionRequest } from './PageInspection.schema'

export * from './PageInspection.schema'

/** Stateful page inspection port: one browser session per pass, closed when the pass ends. */
export class PageInspection extends Context.Service<
  PageInspection,
  {
    readonly inspect: (
      request: PageInspectionRequest,
    ) => Effect.Effect<PageInspectionOutcome, PageInspectionError>
  }
>()('@effect-agent/sandbox/PageInspection') {}
