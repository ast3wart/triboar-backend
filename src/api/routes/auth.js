import express from 'express';
import { generateToken } from '../../utils/jwt.js';
import * as discordAuthService from '../../services/discordAuthService.js';
import * as stripeService from '../../services/stripeService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// GET /api/auth/discord - Redirect to Discord OAuth
router.get('/discord', (req, res) => {
  const authUrl = discordAuthService.getOAuthURL();
  res.redirect(authUrl);
});

// GET /api/auth/discord/callback - Handle Discord OAuth callback
router.get('/discord/callback', asyncHandler(async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    logger.error({ error, error_description }, 'Discord OAuth error');
    return res.status(401).json({
      error: {
        code: 'DISCORD_AUTH_FAILED',
        message: error_description || 'Discord authentication failed',
      },
    });
  }

  if (!code) {
    return res.status(400).json({
      error: {
        code: 'MISSING_CODE',
        message: 'Authorization code missing',
      },
    });
  }

  try {
    // Handle OAuth callback
    const { user, accessToken } = await discordAuthService.handleOAuthCallback(code);

    logger.info({ userId: user.id }, 'User authenticated, creating Stripe session');

    // Create Stripe checkout session directly
    const checkoutSession = await stripeService.createCheckoutSession(user.id, user.discord_id);

    logger.info({ userId: user.id, sessionId: checkoutSession.id, url: checkoutSession.url }, 'User authenticated and checkout session created');

    // Redirect directly to Stripe checkout
    res.redirect(checkoutSession.url);
  } catch (err) {
    logger.error({
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
      stripeError: err.raw?.message,
      fullError: JSON.stringify(err, null, 2)
    }, 'OAuth callback failed - checkout session creation error');
    res.redirect(`http://localhost:1313/triboar-site?error=${encodeURIComponent('Authentication failed. Please try again.')}`);
  }
}));

// POST /api/auth/logout (optional, for clearing client-side state)
router.post('/logout', (req, res) => {
  // Token-based auth doesn't require server-side logout
  // Client just discards the token
  res.json({ success: true, message: 'Logged out' });
});

export default router;
