import { describe, it } from '@effect/vitest'
import { MemoryScheduleStoreLive } from '@systemfsoftware/agent-storage-memory/memory-schedule-store'
import { scheduleStoreConformanceCases } from '@systemfsoftware/agent/testing/schedule-store-conformance'
import * as Effect from 'effect/Effect'

describe('MemoryScheduleStore', () => {
  for (const conformanceCase of scheduleStoreConformanceCases) {
    it.effect(conformanceCase.name, () => conformanceCase.run.pipe(Effect.provide(MemoryScheduleStoreLive)))
  }
})
