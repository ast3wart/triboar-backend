import axios from 'axios';
import logger from '../utils/logger.js';
import { query } from '../db/connection.js';
import { UnauthorizedError, ConflictError } from '../utils/errors.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const OAUTH_ENDPOINT = `${DISCORD_API_BASE}/oauth2/authorize`;
const TOKEN_ENDPOINT = `${DISCORD_API_BASE}/oauth2/token`;
const USER_ENDPOINT = `${DISCORD_API_BASE}/users/@me`;

export const getOAuthURL = () => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
  });

  return `${OAUTH_ENDPOINT}?${params.toString()}`;
};

export const exchangeCodeForToken = async (code) => {
  try {
    const params = new URLSearchParams();
    params.append('client_id', process.env.DISCORD_CLIENT_ID);
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', process.env.DISCORD_REDIRECT_URI);

    const response = await axios.post(TOKEN_ENDPOINT, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  } catch (err) {
    logger.error({
      errorMessage: err.message,
      statusCode: err.response?.status,
      discordResponse: err.response?.data,
      clientId: process.env.DISCORD_CLIENT_ID,
      redirectUri: process.env.DISCORD_REDIRECT_URI,
      axiosError: err.isAxiosError,
    }, 'Failed to exchange code for token');
    throw new UnauthorizedError('Failed to authenticate with Discord');
  }
};

export const getDiscordUser = async (accessToken) => {
  try {
    const response = await axios.get(USER_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (err) {
    logger.error({ err }, 'Failed to get Discord user');
    throw new UnauthorizedError('Failed to get Discord user information');
  }
};

export const syncOrCreateUser = async (discordUser) => {
  const { id: discord_id, username: discord_username, avatar: discord_avatar, email } = discordUser;

  if (!discord_id || !email) {
    throw new UnauthorizedError('Discord user missing required fields (id, email)');
  }

  try {
    // Check if user already exists
    const existing = await query(
      'SELECT * FROM users WHERE discord_id = $1',
      [discord_id]
    );

    if (existing.rows.length > 0) {
      // Update existing user
      const user = existing.rows[0];
      await query(
        `UPDATE users
         SET email = $1, discord_username = $2, discord_avatar = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [email, discord_username, discord_avatar, user.id]
      );

      logger.info({ discord_id }, 'Updated existing user');
      return user;
    }

    // Create new user
    const newUserResult = await query(
      `INSERT INTO users (email, discord_id, discord_username, discord_avatar, tier)
       VALUES ($1, $2, $3, $4, 'free')
       RETURNING *`,
      [email, discord_id, discord_username, discord_avatar]
    );

    const newUser = newUserResult.rows[0];
    logger.info({ discord_id }, 'Created new user');

    // Log the creation
    await query(
      `INSERT INTO audit_logs (user_id, event_type, action, resource_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [newUser.id, 'user.created', 'create', 'user', JSON.stringify({
        discord_id,
        email,
      })]
    );

    return newUser;
  } catch (err) {
    logger.error({ err, discord_id }, 'Failed to sync or create user');
    throw err;
  }
};

export const handleOAuthCallback = async (code) => {
  try {
    // Exchange code for token
    const tokenData = await exchangeCodeForToken(code);

    // Get Discord user info
    const discordUser = await getDiscordUser(tokenData.access_token);

    // Sync or create user in database
    const user = await syncOrCreateUser(discordUser);

    return {
      user,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    };
  } catch (err) {
    logger.error({ err }, 'OAuth callback failed');
    throw err;
  }
};

export const refreshAccessToken = async (refreshToken) => {
  try {
    const response = await axios.post(TOKEN_ENDPOINT, {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return response.data;
  } catch (err) {
    logger.error({ err }, 'Failed to refresh access token');
    throw new UnauthorizedError('Failed to refresh Discord token');
  }
};
