import { NodeRuntime } from '@effect/platform-node'
import { Console, Effect } from 'effect'

import { program } from './delegation-live'

NodeRuntime.runMain(program.pipe(Effect.tap(({ output }) => Console.log(output))))
