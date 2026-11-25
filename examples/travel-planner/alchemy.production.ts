import { fileURLToPath } from 'node:url'

import { OAuthScope } from '@yielded/auth'
import { Config, Effect } from 'effect'

import { plannerStackFrom } from './deployment'

// Production is disabled until an approved domain, Cloudflare zone and auth issuer exist for
// this repository: every one of them is required configuration, read before any resource is
// defined, so the entrypoint cannot fall back to the previous project's deployment.
const deployment = Effect.gen(function*() {
  const appDomain = yield* Config.NonEmptyString('PLANNER_APP_DOMAIN')
  const appZoneId = yield* Config.NonEmptyString('PLANNER_APP_ZONE_ID')
  const domain = yield* Config.NonEmptyString('PLANNER_DOMAIN')
  const issuer = yield* Config.NonEmptyString('PLANNER_AUTH_ISSUER')

  return {
    stackName: 'effect-agent-travel-planner',
    workerName: 'effect-agent-travel-planner',
    rootDir: fileURLToPath(new URL('.', import.meta.url)),
    artifactsNamespace: 'effect-agent-travel-planner-auth-v1',
    appDomain,
    appZoneId,
    domain,
    routes: [{ pattern: `${domain}/*`, zoneId: appZoneId }],
    workersDev: false,
    auth: {
      issuer,
      resource: `https://${appDomain}`,
      jwksUrl: `${issuer}/oauth/yielded/jwks`,
      requiredScope: OAuthScope.make('agent:planner'),
      hostedModelScope: OAuthScope.make('agent:hosted-model'),
    },
  }
})

export default plannerStackFrom('effect-agent-travel-planner')(deployment)
