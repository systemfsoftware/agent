import { router } from '../../third-party/src/deployed/router'
import type { Env } from './protocol'
import { RestoreDO } from './restore-worker'

export class PiDO extends RestoreDO {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, 'pi')
  }
}

export default router<Env & { PI: DurableObjectNamespace<PiDO> }>('pi', {
  stub: (env, query) => env.PI.getByName(query.storageObject ?? query.object, { locationHint: 'wnam' }),
})
