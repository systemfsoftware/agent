import { constructed, identity, probe } from '../../src/identity'
import type { Env } from '../../src/protocol'
import { PiObject } from './pi'

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
export { default } from '../../src/front'
export { EmptyObject } from '../../src/identity'
