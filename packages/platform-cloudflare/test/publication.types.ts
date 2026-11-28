import { expectTypeOf } from '@effect/vitest'
import type { LifecyclePublicationHandler } from '@systemfsoftware/agent/lifecycle-publication'
import * as Context from 'effect/Context'
import type * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

import type { ThreadMutationGate } from '../src/Alarm'
import * as ThreadObject from '../src/ThreadObject'

class PublicationDependency extends Context.Service<
  PublicationDependency,
  { readonly ready: boolean }
>()('publication-types/PublicationDependency') {}
class PublicationSetupError extends Schema.TaggedError<PublicationSetupError>()(
  'PublicationSetupError',
  {},
) {}

declare const lifecyclePublication: Layer.Layer<
  LifecyclePublicationHandler,
  PublicationSetupError,
  ThreadMutationGate | PublicationDependency
>

const registered = ThreadObject.layer([], { lifecyclePublication })

expectTypeOf<
  Extract<Layer.Services<typeof registered>, ThreadMutationGate>
>().toEqualTypeOf<never>()
expectTypeOf<
  Extract<Layer.Services<typeof registered>, PublicationDependency>
>().toEqualTypeOf<PublicationDependency>()
expectTypeOf<
  Extract<Layer.Error<typeof registered>, PublicationSetupError>
>().toEqualTypeOf<PublicationSetupError>()
