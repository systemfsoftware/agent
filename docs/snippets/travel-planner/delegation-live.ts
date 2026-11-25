import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai'
import { AgentRuntime, InMemory, Subagent } from '@systemfsoftware/agent'
import { Config, Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { Coordinator } from './coordinator'
import { Research } from './delegation'
import { TravelToolsLive } from './tools'

const ModelLive = OpenAiLanguageModel.model('gpt-6-luna')

const ProviderLive = OpenAiClient.layerConfig({ apiKey: Config.Redacted('OPENAI_API_KEY') }).pipe(
  Layer.provide(FetchHttpClient.layer),
)

const ResearchLive = Subagent.layer(Research).pipe(Layer.provide(TravelToolsLive))

const AppLive = ResearchLive.pipe(
  Layer.provideMerge(ModelLive),
  Layer.provideMerge(InMemory.layer),
  Layer.provide(ProviderLive),
)

export const program = AgentRuntime.run(Coordinator, { city: 'Lisbon' }).pipe(
  Effect.provide(AppLive),
)
