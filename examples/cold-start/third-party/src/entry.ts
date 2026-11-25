import { constructed, identity, probe } from '../../src/identity.ts'
import type { Env } from '../../src/protocol.ts'
import { PiObject } from './pi.ts'

export class Thread extends PiObject {
  private readonly environment: Env
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.environment = env
    constructed()
  }
  touch() {
    return identity(this.environment.VERSION.id)
  }
  probe(sample: string) {
    return probe(this.environment.VERSION.id, () => this.run(sample))
  }
}
export { default } from '../../src/front.ts'
export { EmptyObject } from '../../src/identity.ts'
