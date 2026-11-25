import { Subagent } from '@systemfsoftware/agent'
import { NodeDurableHost } from '@systemfsoftware/agent-platform-node'
import { SubagentReservationsMemoryLive } from '@systemfsoftware/agent/subagent-reservations'
import { Layer } from 'effect'

import { Coordinator } from './coordinator'
import { Research } from './delegation'
import { definitions, ModelLive, OpenAiLive } from './node-agent'
import { TravelToolsLive } from './tools'

const ResearchLive = Subagent.layer(Research).pipe(
  Layer.provide(ModelLive),
  Layer.provide(TravelToolsLive),
)

export const HostLive = NodeDurableHost.layer(
  [
    { agent: Coordinator, model: ModelLive, definitions },
    { agent: Research.target, model: ModelLive, definitions },
  ],
  {
    filename: './agents.sqlite',
    deploymentId: 'attached-research',
    producerId: 'worker-start-001',
    workerConcurrency: 4,
  },
).pipe(
  Layer.provide(ResearchLive),
  Layer.provide(SubagentReservationsMemoryLive),
  Layer.provide(TravelToolsLive),
  Layer.provide(OpenAiLive),
)
