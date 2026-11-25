import * as BrowserCrypto from '@effect/platform-browser/BrowserCrypto'
import { ledgerLayer } from '@systemfsoftware/agent-storage-cloudflare/do-submission-ledger'
import { invalidate, layer } from '@systemfsoftware/agent-storage-cloudflare/do-thread-store'
import * as Agent from '@systemfsoftware/agent/agent'
import { canonicalJson } from '@systemfsoftware/agent/digest'
import { DurableAgentRuntime, DurableRuntimeConfig } from '@systemfsoftware/agent/durable-agent-runtime'
import { DurableRuntimeFailpoint } from '@systemfsoftware/agent/durable-failpoint'
import { RunToolAuthorization } from '@systemfsoftware/agent/run-options'
import { layer as runStorageLayer } from '@systemfsoftware/agent/run-storage'
import { IdempotencyKey } from '@systemfsoftware/agent/submission-ledger'
import { ThreadStore } from '@systemfsoftware/agent/thread-store'
import { ToolReconciler } from '@systemfsoftware/agent/tool-reconciler'
import { WakeScheduler } from '@systemfsoftware/agent/wake-scheduler'
import * as LanguageModel from 'effect/ai/LanguageModel'
import * as Model from 'effect/ai/Model'
import * as Prompt from 'effect/ai/Prompt'
import * as Toolkit from 'effect/ai/Toolkit'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import { expect, it } from 'vitest'

import {
  id,
  TEST_DEPLOYMENT,
  TEST_DIGESTS,
  TEST_PRINCIPAL,
  TEST_PRODUCER,
  thread,
  withThreadStorage,
} from './harness.ts'

// Requested cold-checkpoint seam: native persisted bytes and a real reopen distinguish
// a verified hit from a silently stale prompt or an implementation that always rescans.
it('reopens a projected prefix with an identical prompt and rebuilds damaged derivatives', async () => {
  const run = (
    name: string,
    turn: number,
    damage?: 'missing' | 'json' | 'prompt' | 'head' | 'version',
  ) =>
    withThreadStorage(name, (storage) =>
      Effect.gen(function*() {
        const store = yield* ThreadStore

        if (damage !== undefined) {
          const rows = [
            ...storage.sql.exec<{ key: string; value: string }>(
              "SELECT key, value FROM effect_agent_meta WHERE key >= 'prompt-checkpoint/' AND key < 'prompt-checkpoint0' ORDER BY key",
            ),
          ]

          for (const row of rows) {
            if (damage === 'missing') {
              storage.sql.exec('DELETE FROM effect_agent_meta WHERE key = ?', row.key)
            } else if (damage === 'json') {
              storage.sql.exec(
                'UPDATE effect_agent_meta SET value = ? WHERE key = ?',
                '{',
                row.key,
              )
            } else if (damage === 'prompt' && row.key.endsWith('00001')) {
              storage.sql.exec(
                'UPDATE effect_agent_meta SET value = ? WHERE key = ?',
                row.value.replace('input 0', 'wrong 0'),
                row.key,
              )
            } else if (damage === 'head' && row.key.endsWith('00000')) {
              storage.sql.exec(
                'UPDATE effect_agent_meta SET value = ? WHERE key = ?',
                row.value.replace(/"throughSequence":\d+/, '"throughSequence":2147483647'),
                row.key,
              )
            } else if (damage === 'version' && row.key.endsWith('00000')) {
              storage.sql.exec(
                'UPDATE effect_agent_meta SET value = ? WHERE key = ?',
                row.value.replace(/"version":\d+/, '"version":999'),
                row.key,
              )
            }
          }
          yield* invalidate(storage)
        }
        let promptRecords = 0
        let transcript = ''

        const counted = ThreadStore.of({
          ...store,
          readPrompt: (request) =>
            store.readPrompt(request).pipe(
              Stream.tap(() =>
                Effect.sync(() => {
                  promptRecords++
                })
              ),
            ),
        })

        const model = Model.make(
          'scripted',
          'cold-checkpoint',
          Layer.effect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([]),
              streamText: ({ prompt }) => {
                transcript = canonicalJson(
                  Schema.encodeSync(Schema.toCodecJson(Prompt.Prompt))(prompt),
                )

                return Stream.fromIterable([
                  { type: 'text-start', id: 'answer' },
                  { type: 'text-delta', id: 'answer', delta: '"done"' },
                  { type: 'text-end', id: 'answer' },
                  { type: 'finish', reason: 'stop', usage: { inputTokens: {}, outputTokens: {} } },
                ])
              },
            }),
          ),
        )

        const agent = Agent.withModel(
          Agent.make('cold-checkpoint', {
            input: Schema.String,
            output: Schema.String,
            instructions: 'Retain the conversation.',
            toolkit: Toolkit.empty,
            policy: { maxTurns: 1, maxDuration: '30 seconds' },
          }),
          model,
        )

        const services = yield* Layer.build(
          DurableAgentRuntime.layer.pipe(
            Layer.provide(runStorageLayer),
            Layer.provide(Layer.succeed(ThreadStore, counted)),
          ),
        )

        const runtime = Context.get(services, DurableAgentRuntime)

        const receipt = yield* runtime.submit(agent, `input ${turn}`, {
          threadId: thread(name),
          principal: TEST_PRINCIPAL,
          idempotencyKey: id(IdempotencyKey, `input-${turn}`),
          definitions: TEST_DIGESTS,
        })

        const settlements = yield* runtime.processThread(agent, receipt.threadId)

        expect(settlements).toHaveLength(1)
        expect(settlements[0]?.outcome).toBe('completed')

        return { transcript, promptRecords }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            layer({ storage }),
            ledgerLayer({ storage }),
            WakeScheduler.layerNoop,
            ToolReconciler.uncertain,
            DurableRuntimeFailpoint.layer,
            RunToolAuthorization.allowAll,
            DurableRuntimeConfig.layer({
              deploymentId: TEST_DEPLOYMENT,
              producerId: TEST_PRODUCER,
            }),
            BrowserCrypto.layer,
          ),
        ),
        Effect.scoped,
      ))

  const reference = `prompt-reference-${crypto.randomUUID()}`

  for (let turn = 0; turn < 8; turn++) await run(reference, turn)
  const rebuilt = await run(reference, 8, 'missing')

  expect(rebuilt.promptRecords).toBeGreaterThan(8)

  for (const damage of [undefined, 'json', 'prompt', 'head', 'version'] as const) {
    const name = `prompt-${damage ?? 'hit'}-${crypto.randomUUID()}`

    for (let turn = 0; turn < 8; turn++) await run(name, turn)
    const observed = await run(name, 8, damage)

    expect(observed.transcript).toBe(rebuilt.transcript)
    if (damage === undefined) expect(observed.promptRecords).toBeLessThanOrEqual(8)
    else expect(observed.promptRecords).toBeGreaterThan(8)
  }
}, 60_000)
