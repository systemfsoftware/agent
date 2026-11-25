import { Schema } from 'effect'

import { PlannerAnswer, type PlannerSnapshot, Text } from '../domain'

export type Messages = Array<PlannerSnapshot['messages'][number]>
export const completedAnswer = Schema.Union([Text, PlannerAnswer])
