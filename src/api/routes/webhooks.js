import express from 'express';
import { raw } from 'express';
import * as stripeService from '../../services/stripeService.js';
import * as subscriptionService from '../../services/subscriptionService.js';
import * as auditLogService from '../../services/auditLogService.js';
import * as discordRoleService from '../../services/discordRoleService.js';
import { markWebhookProcessed } from '../middleware/webhookAuth.js';
import logger from '../../utils/logger.js';
import { query } from '../../db/connection.js';

const router = express.Router();

// Stripe webhook must use raw body for signature verification
router.post('/stripe', raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    // Verify webhook signature
    const event = stripeService.verifyWebhookSignature(req.body, sig);

    logger.info({ eventId: event.id, eventType: event.type }, 'Received Stripe webhook');

    // Check idempotency
    const existingEvent = await query(
      'SELECT * FROM processed_webhooks WHERE stripe_event_id = $1',
      [event.id]
    );

    if (existingEvent.rows.length > 0) {
      logger.info({ eventId: event.id }, 'Webhook already processed');
      return res.json({ ok: true, alreadyProcessed: true });
    }

    // Route to appropriate handler
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event);
        break;

      default:
        logger.warn({ eventType: event.type }, 'Unhandled Stripe event type');
    }

    // Mark webhook as processed
    await markWebhookProcessed(event.id);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, sig }, 'Webhook signature verification failed');
    res.status(400).send('Webhook signature verification failed');
  }
});

// ===== Event Handlers =====

async function handleCheckoutSessionCompleted(event) {
  const { id: sessionId, customer: stripeCustomerId, metadata } = event.data.object;

  try {
    logger.info({ sessionId }, 'Processing checkout.session.completed');

    // Get or find user
    let user;
    if (metadata?.user_id) {
      const userResult = await query(
        'SELECT * FROM users WHERE id = $1',
        [metadata.user_id]
      );
      user = userResult.rows[0];
    } else {
      // Try to find user by Stripe customer ID
      const userResult = await query(
        'SELECT * FROM users WHERE stripe_customer_id = $1',
        [stripeCustomerId]
      );
      user = userResult.rows[0];
    }

    if (!user) {
      logger.error({ sessionId, stripeCustomerId }, 'User not found for checkout session');
      return;
    }

    // Link Stripe customer to user
    await query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [stripeCustomerId, user.id]
    );

    // Get subscription from customer
    const subscriptions = await stripeService.listSubscriptionsForCustomer(stripeCustomerId);
    if (subscriptions.length === 0) {
      logger.error({ stripeCustomerId }, 'No subscription found for customer');
      return;
    }

    const stripeSubscription = subscriptions[0];

    // Create/update subscription in DB
    await subscriptionService.createOrUpdateSubscription(user.id, stripeSubscription);

    // Update user tier
    await query(
      'UPDATE users SET tier = $1 WHERE id = $2',
      ['paid', user.id]
    );

    // Add Discord role
    try {
      await discordRoleService.syncRoles(user.discord_id, true);
      logger.info({ discordId: user.discord_id }, 'Added paid role to Discord');
    } catch (err) {
      logger.error({ err, discordId: user.discord_id }, 'Failed to add Discord role');
    }

    // Log event
    await auditLogService.logStripeEvent(event.id, 'checkout.session.completed', {
      sessionId,
      userId: user.id,
      subscriptionId: stripeSubscription.id,
    }, user.id);

  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to handle checkout.session.completed');
    await auditLogService.logEvent(null, 'stripe.webhook_error', {
      eventId: event.id,
      error: err.message,
    }, { status: 'failure', errorMessage: err.message });
  }
}

async function handleSubscriptionCreated(event) {
  const stripeSubscription = event.data.object;

  try {
    logger.info({ subscriptionId: stripeSubscription.id }, 'Processing customer.subscription.created');

    // Find user by customer ID
    const userResult = await query(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [stripeSubscription.customer]
    );

    if (userResult.rows.length === 0) {
      logger.error({ customerId: stripeSubscription.customer }, 'User not found for subscription');
      return;
    }

    const user = userResult.rows[0];

    // Create subscription record
    await subscriptionService.createOrUpdateSubscription(user.id, stripeSubscription);

    // If already active or trialing, add role
    if (['active', 'trialing'].includes(stripeSubscription.status)) {
      await subscriptionService.handleSubscriptionActive(stripeSubscription);
    }

    await auditLogService.logStripeEvent(event.id, 'subscription.created', {
      subscriptionId: stripeSubscription.id,
      status: stripeSubscription.status,
    }, user.id);

  } catch (err) {
    logger.error({ err, subscriptionId: stripeSubscription.id }, 'Failed to handle subscription.created');
  }
}

async function handleSubscriptionUpdated(event) {
  const stripeSubscription = event.data.object;
  const previousAttributes = event.data.previous_attributes || {};

  try {
    logger.info({ subscriptionId: stripeSubscription.id, changes: previousAttributes }, 'Processing customer.subscription.updated');

    // Find user
    const userResult = await query(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [stripeSubscription.customer]
    );

    if (userResult.rows.length === 0) {
      logger.error({ customerId: stripeSubscription.customer }, 'User not found');
      return;
    }

    const user = userResult.rows[0];

    // Update subscription
    await subscriptionService.createOrUpdateSubscription(user.id, stripeSubscription);

    // Handle status transitions
    if (previousAttributes.status) {
      const oldStatus = previousAttributes.status;
      const newStatus = stripeSubscription.status;

      logger.info({ oldStatus, newStatus }, 'Subscription status changed');

      if (oldStatus !== newStatus) {
        if (newStatus === 'active') {
          await subscriptionService.handleSubscriptionActive(stripeSubscription);
        } else if (newStatus === 'past_due') {
          await subscriptionService.handleSubscriptionPastDue(stripeSubscription);
        }
      }
    }

    await auditLogService.logStripeEvent(event.id, 'subscription.updated', {
      subscriptionId: stripeSubscription.id,
      status: stripeSubscription.status,
      previousAttributes,
    }, user.id);

  } catch (err) {
    logger.error({ err, subscriptionId: stripeSubscription.id }, 'Failed to handle subscription.updated');
  }
}

async function handleSubscriptionDeleted(event) {
  const stripeSubscription = event.data.object;

  try {
    logger.info({ subscriptionId: stripeSubscription.id }, 'Processing customer.subscription.deleted');

    // Find user
    const userResult = await query(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [stripeSubscription.customer]
    );

    if (userResult.rows.length === 0) {
      logger.error({ customerId: stripeSubscription.customer }, 'User not found');
      return;
    }

    const user = userResult.rows[0];

    // Update subscription status
    await subscriptionService.createOrUpdateSubscription(user.id, stripeSubscription);

    // Handle cancellation
    await subscriptionService.handleSubscriptionCanceled(stripeSubscription);

    await auditLogService.logStripeEvent(event.id, 'subscription.deleted', {
      subscriptionId: stripeSubscription.id,
    }, user.id);

  } catch (err) {
    logger.error({ err, subscriptionId: stripeSubscription.id }, 'Failed to handle subscription.deleted');
  }
}

async function handleInvoicePaymentSucceeded(event) {
  const invoice = event.data.object;

  try {
    logger.info({ invoiceId: invoice.id }, 'Processing invoice.payment_succeeded');

    // Find user by customer
    const userResult = await query(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [invoice.customer]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];

      // Ensure subscription is marked active and role is present
      if (invoice.subscription) {
        const stripeSubscription = await stripeService.getSubscription(invoice.subscription);
        await subscriptionService.createOrUpdateSubscription(user.id, stripeSubscription);

        // Ensure paid role
        try {
          await discordRoleService.syncRoles(user.discord_id, true);
        } catch (err) {
          logger.error({ err }, 'Failed to sync Discord roles');
        }
      }

      await auditLogService.logStripeEvent(event.id, 'invoice.payment_succeeded', {
        invoiceId: invoice.id,
        customerId: invoice.customer,
      }, user.id);
    }

  } catch (err) {
    logger.error({ err, invoiceId: invoice.id }, 'Failed to handle invoice.payment_succeeded');
  }
}

async function handleInvoicePaymentFailed(event) {
  const invoice = event.data.object;

  try {
    logger.info({ invoiceId: invoice.id }, 'Processing invoice.payment_failed');

    // Find user
    const userResult = await query(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [invoice.customer]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];

      // Log event but don't remove role yet (Stripe dunning will handle it)
      await auditLogService.logStripeEvent(event.id, 'invoice.payment_failed', {
        invoiceId: invoice.id,
        customerId: invoice.customer,
        attemptCount: invoice.attempt_count,
        nextPaymentAttempt: invoice.next_payment_attempt,
      }, user.id);

      // TODO: Send email/Discord DM to user with payment link
    }

  } catch (err) {
    logger.error({ err, invoiceId: invoice.id }, 'Failed to handle invoice.payment_failed');
  }
}

async function handleTrialWillEnd(event) {
  const stripeSubscription = event.data.object;

  try {
    logger.info({ subscriptionId: stripeSubscription.id }, 'Processing customer.subscription.trial_will_end');

    // Find user
    const userResult = await query(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [stripeSubscription.customer]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];

      // Log event - could send reminder email/DM
      await auditLogService.logStripeEvent(event.id, 'subscription.trial_will_end', {
        subscriptionId: stripeSubscription.id,
        trialEnd: stripeSubscription.trial_end,
      }, user.id);

      // TODO: Send trial ending reminder
    }

  } catch (err) {
    logger.error({ err, subscriptionId: stripeSubscription.id }, 'Failed to handle trial_will_end');
  }
}

export default router;
