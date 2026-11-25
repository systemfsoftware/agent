import * as BrowserCrypto from '@effect/platform-browser/BrowserCrypto'
import * as SqliteClient from '@effect/sql-sqlite-do/SqliteClient'
import type { StorageOwner } from '@systemfsoftware/agent/run-storage'
import type { SettlementPublisher } from '@systemfsoftware/agent/settlement-publisher'
import type { SubmissionLedger } from '@systemfsoftware/agent/submission-ledger'
import type { ThreadStore } from '@systemfsoftware/agent/thread-store'
import type * as CryptoDigest from 'effect/crypto/Digest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as SqlClient from 'effect/sql/SqlClient'
import { describe, it } from 'vitest'

import { ledgerReadCases } from '../../../test/fixtures/ledger-read-contracts'
import { DoStorageFailpoint } from '../src/DoStorageFailpoint'
import { submissionLedgerLayer } from '../src/DoSubmissionLedger'
import { invalidate, storageConfigLayer, threadStoreLayer } from '../src/DoThreadStore'
import { withThreadStorage } from './harness'

let nextId = 0

const withFixture = <A, E>(
  build: (
    storage: DurableObjectStorage,
  ) => Effect.Effect<
    A,
    E,
    | SubmissionLedger
    | SettlementPublisher
    | StorageOwner
    | ThreadStore
    | SqlClient.SqlClient
    | CryptoDigest.Digest
  >,
) =>
  withThreadStorage(`ledger-reads-${nextId++}`, (storage) =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const deps = Layer.mergeAll(
        Layer.succeed(SqlClient.SqlClient)(sql),
        storageConfigLayer({ storage }),
        BrowserCrypto.layer,
        DoStorageFailpoint.layer,
      )

      return yield* build(storage).pipe(
        Effect.provide(
          Layer.mergeAll(submissionLedgerLayer, threadStoreLayer).pipe(Layer.provideMerge(deps)),
        ),
      )
    }).pipe(Effect.provide(SqliteClient.layer({ storage }))))

describe('Durable Object ledger read contracts', () => {
  for (const [index, test] of ledgerReadCases().entries()) {
    // oxlint-disable-next-line vitest/expect-expect -- ledgerReadCases owns the shared contract assertions
    it(`${test.name}`, () => withFixture((storage) => ledgerReadCases(invalidate(storage))[index].run))
  }
})
