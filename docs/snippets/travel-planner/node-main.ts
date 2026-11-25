import { NodeRuntime } from '@effect/platform-node'
import { NodeDurableHost } from '@systemfsoftware/agent-platform-node'
import { Effect } from 'effect'

import { HostLive } from './node-host'

NodeRuntime.runMain(NodeDurableHost.run.pipe(Effect.provide(HostLive)))
