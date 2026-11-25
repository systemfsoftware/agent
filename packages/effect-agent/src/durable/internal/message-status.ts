import * as Schema from 'effect/Schema'

import { MessageStatus } from '../../core/Messaging'
import type { MessageDeliveryRecord } from '../MessageDelivery'

/** Share the bounded projection across peer and worker delivery; diagnostics stay in storage. */
export const messageStatus = (row: MessageDeliveryRecord) =>
  Schema.decodeUnknownEffect(MessageStatus)({
    message: row.key,
    status: row.status,
    receipt: row.receipt,
    settlement: row.settlement === null
      ? null
      : { settlementId: row.settlement.settlementId, outcome: row.settlement.outcome },
    reason: row.refusal ??
      row.parkReason ??
      (row.status === 'pending' || row.status === 'accepted' ? row.retry.lastFailure : null),
  })
