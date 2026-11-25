import { NodeDurableHost } from '@systemfsoftware/agent-platform-node'
import { Layer } from 'effect'

import { WorkerAccessLive } from './background-access'
import { BackgroundCoordinator, FollowUpResearch, ResearchReporting, StartResearch } from './background-coordinator'
import { definitions, ModelLive, OpenAiLive } from './node-agent'
import { Researcher } from './researcher'
import { TravelToolsLive } from './tools'

export const HostLive = NodeDurableHost.layer(
  [
    {
      agent: BackgroundCoordinator,
      model: ModelLive,
      reporting: [ResearchReporting],
      definitions,
    },
    { agent: Researcher, model: ModelLive, definitions },
  ],
  {
    filename: './agents.sqlite',
    deploymentId: 'background-research',
    producerId: 'worker-start-001',
    workerConcurrency: 4,
  },
).pipe(
  Layer.provide([StartResearch.layer, FollowUpResearch.layer]),
  Layer.provide(TravelToolsLive),
  Layer.provide(WorkerAccessLive),
  Layer.provide(OpenAiLive),
)
