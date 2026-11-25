import * as Schema from 'effect/Schema'

/**
 * `validation`: the update is not bounded JSON or the update ID is invalid. `conflict`: the update
 * ID was already used on this Thread with a different update. `contention`: the Thread tail kept
 * moving and the append did not commit.
 */
export class HostUpdateError
  extends Schema.TaggedError<HostUpdateError, { readonly brand: unique symbol }>()('HostUpdateError', {
    reason: Schema.Literals(['validation', 'conflict', 'contention']),
    message: Schema.String,
  })
{}

/** The committed position of a host update; `deduplicated` when an earlier append already wrote it. */
export class HostUpdateAppended extends Schema.Class<HostUpdateAppended, { readonly brand: unique symbol }>(
  'HostUpdateAppended',
)({
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  deduplicated: Schema.Boolean,
}) {}
