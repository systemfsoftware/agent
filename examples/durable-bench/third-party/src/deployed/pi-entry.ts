import type { Env } from '../../../deployed/worker/protocol'
import { PiDO } from './pi'
import { router } from './router'
export { PiDO }
export default router<Env & { PI: DurableObjectNamespace<PiDO> }>('pi', {
  stub: (env, query) => env.PI.getByName(query.storageObject ?? query.object, { locationHint: 'wnam' }),
})
