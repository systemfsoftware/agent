import { fileURLToPath } from 'node:url'

import { OAuthScope } from '@yielded/auth'
import { Config, Effect } from 'effect'

import { plannerStack } from './deployment'

// Production deployment is disabled: this stack was written for another project's domain,
// Cloudflare zone and identity issuer, none of which this repository may deploy into. The
// values are required configuration, so the entrypoint fails before it defines a resource.
export default Effect.gen(function*() {
  const appDomain = yield* Config.NonEmptyString('PLANNER_APP_DOMAIN')
  const appZoneId = yield* Config.NonEmptyString('PLANNER_APP_ZONE_ID')
  const domain = yield* Config.NonEmptyString('PLANNER_DOMAIN')
  const issuer = yield* Config.NonEmptyString('PLANNER_AUTH_ISSUER')

  return plannerStack({
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
  })
})
