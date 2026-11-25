import type { Env } from '../../../deployed/worker/protocol'
import { router } from './router'
import { ActorDO, cloudflareThreadName, coordinate, ThreadDO } from './tardie'
export { ActorDO, ThreadDO }
export default router<Env & { ACTORS: DurableObjectNamespace<ActorDO>; THREADS: DurableObjectNamespace<ThreadDO> }>(
  'tardie',
  {
    stub: (env, query) =>
      env.THREADS.getByName(cloudflareThreadName(coordinate(query.storageObject ?? query.object)), {
        locationHint: 'wnam',
      }),
    actor: (env, query) => env.ACTORS.getByName(query.storageObject ?? query.object, { locationHint: 'wnam' }),
  },
)
