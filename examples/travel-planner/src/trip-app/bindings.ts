import { Schema } from 'effect'
import { R2, Workflow } from '@systemfsoftware/effect-cf'
import * as Sandbox from '@systemfsoftware/effect-cf/sandbox'

import { AppBuildRequest, AppCommit } from '../domain'
import { AppBuildBucket } from './bucket'

export const AppBuildBucketLive = R2.layer(AppBuildBucket, { binding: 'APP_BUILDS' })

export class SiteBuildBinding extends Workflow.Tag<SiteBuildBinding>()('trip-app/SiteBuild', {
  payload: AppBuildRequest,
  result: Schema.Struct({ commitId: AppCommit }),
}) {}

export class AppBuildSandbox extends Sandbox.Tag<AppBuildSandbox>()('trip-app/AppBuildSandbox') {}
