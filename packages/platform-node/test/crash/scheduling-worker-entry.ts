import * as NodeRuntime from '@effect/platform-node/NodeRuntime'

import { schedulingCrashWorker } from './scheduling-worker'

NodeRuntime.runMain(schedulingCrashWorker, { disableErrorReporting: true })
