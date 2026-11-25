import {
  makeSqlScheduleStore,
  SqlScheduleWriteTransaction,
} from '@systemfsoftware/agent-storage-sql/sql-schedule-store'
import { ScheduleStore } from '@systemfsoftware/agent/schedule'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as SqlClient from 'effect/sql/SqlClient'

import { initializeSqliteStorage } from './internal/sqlite-journal'
import type { SqliteStorageConfig } from './SqliteStorageConfig'
import type { SqliteStorageFailpoint } from './SqliteStorageFailpoint'
import type { SqliteStorageInitializationError } from './SqliteThreadStore'

/** SQLite implementation of the atomic ScheduleStore port. */
export const scheduleStoreLayer: Layer.Layer<
  ScheduleStore,
  SqliteStorageInitializationError,
  SqliteStorageConfig | SqliteStorageFailpoint | SqlClient.SqlClient
> = Layer.effect(
  ScheduleStore,
  Effect.gen(function*() {
    yield* initializeSqliteStorage()

    return yield* makeSqlScheduleStore()
  }),
).pipe(
  Layer.provide(
    Layer.effect(
      SqlScheduleWriteTransaction,
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient

        return { run: sql.withTransaction }
      }),
    ),
  ),
)
