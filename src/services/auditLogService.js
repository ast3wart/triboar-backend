import logger from '../utils/logger.js';
import { query } from '../db/connection.js';

export const logEvent = async (userId, eventType, payload = {}, options = {}) => {
  try {
    const {
      action = null,
      resourceType = null,
      resourceId = null,
      stripeEventId = null,
      status = 'success',
      errorMessage = null,
    } = options;

    await query(
      `INSERT INTO audit_logs
       (user_id, event_type, action, resource_type, resource_id, stripe_event_id, payload, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        eventType,
        action,
        resourceType,
        resourceId,
        stripeEventId,
        JSON.stringify(payload),
        status,
        errorMessage,
      ]
    );
  } catch (err) {
    logger.error({ err, userId, eventType }, 'Failed to log event');
  }
};

export const logStripeEvent = async (stripeEventId, eventType, payload = {}, userId = null) => {
  try {
    await query(
      `INSERT INTO audit_logs
       (user_id, event_type, stripe_event_id, payload, status)
       VALUES ($1, $2, $3, $4, 'success')`,
      [userId, `stripe.${eventType}`, stripeEventId, JSON.stringify(payload)]
    );
  } catch (err) {
    logger.error({ err, stripeEventId }, 'Failed to log Stripe event');
  }
};

export const getAuditLogs = async (filters = {}, limit = 100, offset = 0) => {
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (filters.userId) {
      whereClause += ` AND user_id = $${paramCount++}`;
      params.push(filters.userId);
    }

    if (filters.eventType) {
      whereClause += ` AND event_type = $${paramCount++}`;
      params.push(filters.eventType);
    }

    if (filters.startDate) {
      whereClause += ` AND created_at >= $${paramCount++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ` AND created_at <= $${paramCount++}`;
      params.push(filters.endDate);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await query(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    return {
      logs: result.rows,
      total,
      limit,
      offset,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to get audit logs');
    throw err;
  }
};

export const getUserAuditLogs = async (userId, limit = 50, offset = 0) => {
  return getAuditLogs({ userId }, limit, offset);
};

export const getAuditLogsByStripeEventId = async (stripeEventId) => {
  try {
    const result = await query(
      'SELECT * FROM audit_logs WHERE stripe_event_id = $1',
      [stripeEventId]
    );

    return result.rows;
  } catch (err) {
    logger.error({ err, stripeEventId }, 'Failed to get audit logs by Stripe event ID');
    throw err;
  }
};
