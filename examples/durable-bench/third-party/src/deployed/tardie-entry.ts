import type { Env } from '../../../deployed/worker/protocol.ts'
import { router } from './router.ts'
import { ActorDO, cloudflareThreadName, coordinate, ThreadDO } from './tardie.ts'
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
