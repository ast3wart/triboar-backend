import Stripe from 'stripe';
import logger from '../utils/logger.js';
import { query } from '../db/connection.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (userId, discordId, { couponCode = null } = {}) => {
  try {
    // Get or create Stripe customer
    const userResult = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    let customerId = userResult.rows[0]?.stripe_customer_id;

    if (!customerId) {
      const userEmailResult = await query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );
      const email = userEmailResult.rows[0]?.email;

      // Create new customer
      const customer = await stripe.customers.create({
        email,
        metadata: {
          discord_id: discordId,
        },
      });

      customerId = customer.id;

      // Save customer ID
      await query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, userId]
      );

      logger.info({ customerId, userId }, 'Created new Stripe customer');
    }

    // Prepare line items
    const lineItems = [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ];

    // Prepare session params
    const sessionParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: lineItems,
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata: {
        user_id: userId,
        discord_id: discordId,
      },
    };

    // Add coupon if provided
    if (couponCode) {
      try {
        // Validate coupon exists and is valid
        const coupon = await stripe.coupons.retrieve(couponCode);
        if (coupon && !coupon.deleted) {
          sessionParams.discounts = [{ coupon: couponCode }];
          logger.info({ couponCode }, 'Applied coupon to session');
        }
      } catch (err) {
        logger.warn({ couponCode }, 'Invalid coupon code');
        // Continue without coupon
      }
    }

    // Create session
    const session = await stripe.checkout.sessions.create(sessionParams);

    logger.info({ sessionId: session.id, customerId }, 'Created checkout session');

    return session;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create checkout session');
    throw err;
  }
};

export const createPortalSession = async (userId) => {
  try {
    const userResult = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    const customerId = userResult.rows[0]?.stripe_customer_id;

    if (!customerId) {
      throw new Error('User has no Stripe customer ID');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL || 'http://localhost:3000',
    });

    logger.info({ customerId }, 'Created billing portal session');

    return session;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create portal session');
    throw err;
  }
};

export const getCustomer = async (customerId) => {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer;
  } catch (err) {
    logger.error({ err, customerId }, 'Failed to get customer');
    throw err;
  }
};

export const getSubscription = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (err) {
    logger.error({ err, subscriptionId }, 'Failed to get subscription');
    throw err;
  }
};

export const listSubscriptionsForCustomer = async (customerId) => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
    });
    return subscriptions.data;
  } catch (err) {
    logger.error({ err, customerId }, 'Failed to list subscriptions');
    throw err;
  }
};

export const cancelSubscription = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.del(subscriptionId);
    logger.info({ subscriptionId }, 'Canceled subscription');
    return subscription;
  } catch (err) {
    logger.error({ err, subscriptionId }, 'Failed to cancel subscription');
    throw err;
  }
};

export const verifyWebhookSignature = (body, signature) => {
  try {
    return stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error({ err }, 'Webhook signature verification failed');
    throw err;
  }
};

export const createRefund = async (chargeId, amount = null) => {
  try {
    const refundParams = { charge: chargeId };
    if (amount) {
      refundParams.amount = amount;
    }

    const refund = await stripe.refunds.create(refundParams);
    logger.info({ chargeId }, 'Created refund');
    return refund;
  } catch (err) {
    logger.error({ err, chargeId }, 'Failed to create refund');
    throw err;
  }
};
