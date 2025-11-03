import { query } from '../../db/connection.js';
import logger from '../../utils/logger.js';

export const webhookIdempotency = async (req, res, next) => {
  const stripeEventId = req.body.id;

  if (!stripeEventId) {
    return next();
  }

  try {
    // Check if we've already processed this webhook
    const result = await query(
      'SELECT * FROM processed_webhooks WHERE stripe_event_id = $1',
      [stripeEventId]
    );

    if (result.rows.length > 0) {
      logger.info({ stripeEventId }, 'Webhook already processed (idempotent)');
      // Return 200 to acknowledge receipt, but don't process again
      return res.status(200).json({ ok: true, alreadyProcessed: true });
    }

    // Mark as processed after the handler succeeds (in the handler itself)
    req.stripeEventId = stripeEventId;
    next();
  } catch (err) {
    logger.error({ err }, 'Idempotency check failed');
    next();
  }
};

export const markWebhookProcessed = async (stripeEventId) => {
  try {
    await query(
      'INSERT INTO processed_webhooks (stripe_event_id) VALUES ($1)',
      [stripeEventId]
    );
  } catch (err) {
    logger.error({ err, stripeEventId }, 'Failed to mark webhook as processed');
  }
};
