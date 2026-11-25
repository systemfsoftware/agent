import { expectTypeOf } from '@effect/vitest'
import type * as PostgresStorage from '@systemfsoftware/agent-storage-postgres/postgres-storage'
import type {
  PostgresStorageError,
  PostgresStorageInitializationError,
} from '@systemfsoftware/agent-storage-postgres/postgres-storage-error'
import type { ActivityMutationFailure, ActivityStoreError } from '@systemfsoftware/agent/activity-store'
import type { StorageOwner } from '@systemfsoftware/agent/run-storage'
import type { SettlementPublisher } from '@systemfsoftware/agent/settlement-publisher'
import type { SubmissionLedger } from '@systemfsoftware/agent/submission-ledger'
import type { ThreadImport } from '@systemfsoftware/agent/thread-import'
import type { ThreadReader, ThreadStore } from '@systemfsoftware/agent/thread-store'
import type * as CryptoDigest from 'effect/crypto/Digest'
import type * as SecureRandom from 'effect/crypto/SecureRandom'
import type * as Layer from 'effect/Layer'
import type * as SqlClient from 'effect/sql/SqlClient'

type Persistence = typeof PostgresStorage.layer
type Ledger = ReturnType<typeof PostgresStorage.submissionLedgerLayer>

expectTypeOf<Layer.Services<Persistence>>().toEqualTypeOf<
  SqlClient.SqlClient | CryptoDigest.Digest | SecureRandom.SecureRandom
>()
expectTypeOf<Layer.Success<Persistence>>().toEqualTypeOf<
  ThreadStore | ThreadReader | ThreadImport | SubmissionLedger | SettlementPublisher | StorageOwner
>()
expectTypeOf<Layer.Error<Persistence>>().toEqualTypeOf<PostgresStorageInitializationError>()
expectTypeOf<Layer.Services<Ledger>>().toEqualTypeOf<
  SqlClient.SqlClient | CryptoDigest.Digest | SecureRandom.SecureRandom
>()
expectTypeOf<Layer.Success<Ledger>>().toEqualTypeOf<
  SubmissionLedger | SettlementPublisher | StorageOwner
>()
expectTypeOf<Layer.Error<Ledger>>().toEqualTypeOf<PostgresStorageInitializationError>()
expectTypeOf<
  Layer.Services<ReturnType<typeof PostgresStorage.scheduleStoreLayer>>
>().toEqualTypeOf<SqlClient.SqlClient>()
expectTypeOf<
  Layer.Services<ReturnType<typeof PostgresStorage.activityStoreLayer>>
>().toEqualTypeOf<SqlClient.SqlClient>()
expectTypeOf<Layer.Error<ReturnType<typeof PostgresStorage.activityStoreLayer>>>().toEqualTypeOf<
  PostgresStorageError | ActivityStoreError | ActivityMutationFailure
>()
expectTypeOf<
  Layer.Services<ReturnType<typeof PostgresStorage.subscriptionStoreLayer>>
>().toEqualTypeOf<SqlClient.SqlClient>()
expectTypeOf<
  Layer.Services<ReturnType<typeof PostgresStorage.messageDeliveryStoreLayer>>
>().toEqualTypeOf<SqlClient.SqlClient | CryptoDigest.Digest>()
