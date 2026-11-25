import * as Schema from 'effect/Schema'

const BoundedName = Schema.NonEmptyString.check(Schema.isMaxLength(256))

/** The implementation and its isolation posture that executed a request. */
export const SandboxImplementation = Schema.Struct({
  isolation: Schema.Literals(['isolated', 'unisolated']),
  identity: BoundedName,
})
export type SandboxImplementation = typeof SandboxImplementation.Type
