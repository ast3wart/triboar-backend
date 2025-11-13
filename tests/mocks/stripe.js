/**
 * Mock Stripe API responses for testing
 * This simulates Stripe behavior without making real API calls
 */

export class MockStripeAPI {
  constructor() {
    this.customers = new Map();
    this.subscriptions = new Map();
    this.invoices = new Map();
    this.checkoutSessions = new Map();
  }

  /**
   * Mock: Create customer
   */
  createCustomer({ email, metadata = {} }) {
    const id = `cus_${Math.random().toString(36).substr(2, 9)}`;
    this.customers.set(id, {
      id,
      email,
      metadata,
      created: Math.floor(Date.now() / 1000),
    });
    return { id, email, metadata };
  }

  /**
   * Mock: Get customer
   */
  getCustomer(id) {
    return this.customers.get(id);
  }

  /**
   * Mock: Create checkout session
   */
  createCheckoutSession({ customerId, priceId, metadata = {}, trialDays = 0 }) {
    const id = `cs_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id,
      object: 'checkout.session',
      customer: customerId,
      mode: 'subscription',
      payment_status: 'unpaid',
      subscription: null,
      metadata,
      url: `https://checkout.stripe.com/pay/${id}`,
      created: Math.floor(Date.now() / 1000),
    };

    this.checkoutSessions.set(id, session);
    return session;
  }

  /**
   * Mock: Complete checkout session (user paid)
   */
  completeCheckoutSession(sessionId, { customerId, subscriptionId }) {
    const session = this.checkoutSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.payment_status = 'paid';
    session.subscription = subscriptionId;

    return session;
  }

  /**
   * Mock: Create subscription
   */
  createSubscription({
    customerId,
    priceId,
    metadata = {},
    trialDays = 0,
  }) {
    const id = `sub_${Math.random().toString(36).substr(2, 9)}`;
    const now = Math.floor(Date.now() / 1000);
    const trialEnd = trialDays > 0 ? now + trialDays * 24 * 60 * 60 : null;
    const periodEnd = now + 30 * 24 * 60 * 60;

    const subscription = {
      id,
      object: 'subscription',
      customer: customerId,
      status: trialDays > 0 ? 'trialing' : 'active',
      items: {
        object: 'list',
        data: [
          {
            id: `si_${Math.random().toString(36).substr(2, 9)}`,
            price: { id: priceId },
          },
        ],
      },
      current_period_start: now,
      current_period_end: periodEnd,
      trial_start: trialDays > 0 ? now : null,
      trial_end: trialEnd,
      cancel_at: null,
      cancel_at_period_end: false,
      canceled_at: null,
      ended_at: null,
      metadata,
      created: now,
    };

    this.subscriptions.set(id, subscription);
    return subscription;
  }

  /**
   * Mock: Get subscription
   */
  getSubscription(id) {
    return this.subscriptions.get(id);
  }

  /**
   * Mock: Cancel subscription
   */
  cancelSubscription(id, { atPeriodEnd = false } = {}) {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription ${id} not found`);

    if (atPeriodEnd) {
      sub.cancel_at_period_end = true;
    } else {
      sub.status = 'canceled';
      sub.canceled_at = Math.floor(Date.now() / 1000);
      sub.ended_at = Math.floor(Date.now() / 1000);
    }

    return sub;
  }

  /**
   * Mock: Payment failure
   */
  simulatePaymentFailure(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    sub.status = 'past_due';
    const invoiceId = `in_${Math.random().toString(36).substr(2, 9)}`;
    this.invoices.set(invoiceId, {
      id: invoiceId,
      object: 'invoice',
      subscription: subscriptionId,
      status: 'failed',
      attempt_count: 1,
      paid: false,
      created: Math.floor(Date.now() / 1000),
    });

    return {
      invoiceId,
      subscription: sub,
    };
  }

  /**
   * Mock: Payment success (retry)
   */
  simulatePaymentSuccess(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    sub.status = 'active';
    const invoiceId = `in_${Math.random().toString(36).substr(2, 9)}`;
    this.invoices.set(invoiceId, {
      id: invoiceId,
      object: 'invoice',
      subscription: subscriptionId,
      status: 'paid',
      attempt_count: 1,
      paid: true,
      created: Math.floor(Date.now() / 1000),
    });

    return {
      invoiceId,
      subscription: sub,
    };
  }

  /**
   * Mock: Get invoice
   */
  getInvoice(id) {
    return this.invoices.get(id);
  }

  /**
   * Clear all mock data
   */
  clear() {
    this.customers.clear();
    this.subscriptions.clear();
    this.invoices.clear();
    this.checkoutSessions.clear();
  }
}

export default MockStripeAPI;
