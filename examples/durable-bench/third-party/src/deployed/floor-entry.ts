import { EffectAiFloorDO } from '../../../deployed/worker/effect-ai-floor'
import type { Env } from '../../../deployed/worker/protocol'
import { router } from './router'
export { EffectAiFloorDO }
export default router<Env & { FLOOR: DurableObjectNamespace<EffectAiFloorDO> }>('effect-ai-floor', {
  stub: (env, query) => env.FLOOR.getByName(query.storageObject ?? query.object, { locationHint: 'wnam' }),
})
