import type { R2 } from '@systemfsoftware/effect-cf'
import { Context } from 'effect'

/** App tools can declare storage without loading the native Cloudflare entrypoints. */
export class AppBuildBucket extends Context.Service<AppBuildBucket, R2.R2Client>()(
  'trip-app/AppBuildBucket',
) {}
