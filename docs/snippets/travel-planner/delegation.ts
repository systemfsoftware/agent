import { Subagent } from '@systemfsoftware/agent'

import { Researcher } from './researcher'

export const Research = Subagent.make('delegate_research_activities', { target: Researcher })
