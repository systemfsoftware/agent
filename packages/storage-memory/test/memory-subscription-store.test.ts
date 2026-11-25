import { describe, it } from '@effect/vitest'
import { memorySubscriptionStoreLayer } from '@systemfsoftware/agent-storage-memory/memory-subscription-store'
import {
  subscriptionConformancePartition,
  subscriptionStoreConformanceCases,
} from '@systemfsoftware/agent/testing/subscription-store-conformance'
import * as Effect from 'effect/Effect'

describe('MemorySubscriptionStore', () => {
  for (const testCase of subscriptionStoreConformanceCases) {
    it.effect(testCase.name, () =>
      testCase.run.pipe(
        Effect.provide(memorySubscriptionStoreLayer(subscriptionConformancePartition)),
      ))
  }
})
