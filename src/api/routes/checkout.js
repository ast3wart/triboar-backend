import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as stripeService from '../../services/stripeService.js';
import * as subscriptionService from '../../services/subscriptionService.js';
import logger from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';

const router = express.Router();

// POST /api/checkout/session - Create checkout session
router.post('/session', requireAuth, asyncHandler(async (req, res) => {
  const { coupon_code } = req.body;
  const userId = req.user.id;
  const discordId = req.user.discord_id;

  if (!userId || !discordId) {
    throw new ValidationError('User ID and Discord ID required');
  }

  try {
    // Create checkout session
    const session = await stripeService.createCheckoutSession(userId, discordId, {
      couponCode: coupon_code,
    });

    logger.info({ userId, sessionId: session.id }, 'Checkout session created');

    res.json({
      success: true,
      session: {
        id: session.id,
        url: session.url,
      },
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create checkout session');
    throw err;
  }
}));

// POST /api/checkout/portal - Create customer portal session
router.post('/portal', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const session = await stripeService.createPortalSession(userId);

    logger.info({ userId, portalUrl: session.url }, 'Portal session created');

    res.json({
      success: true,
      session: {
        url: session.url,
      },
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create portal session');
    throw err;
  }
}));

export default router;
