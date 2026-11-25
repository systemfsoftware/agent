import { NodeRuntime } from '@effect/platform-node'
import { NodeDurableHost } from '@systemfsoftware/agent-platform-node'
import { Effect } from 'effect'

import { HostLive } from './background-host'

NodeRuntime.runMain(NodeDurableHost.run.pipe(Effect.provide(HostLive)))
