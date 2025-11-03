import axios from 'axios';
import logger from '../utils/logger.js';
import { query } from '../db/connection.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

const api = axios.create({
  baseURL: DISCORD_API_BASE,
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// Exponential backoff for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryAfter = err.response?.headers?.['retry-after'];
      const shouldRetry = err.response?.status === 429 || err.response?.status >= 500;

      if (!shouldRetry || attempt === maxRetries - 1) {
        throw err;
      }

      const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt);
      logger.warn({ attempt, delay, status: err.response?.status }, 'Retrying Discord API call');
      await sleep(delay);
    }
  }
};

export const addRoleToMember = async (discordId, roleId, reason = 'Subscription active') => {
  try {
    await withRetry(async () => {
      await api.put(
        `/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`,
        {},
        { headers: { 'X-Audit-Log-Reason': reason } }
      );
    });

    logger.info({ discordId, roleId }, 'Added role to member');

    // Log the change
    await logRoleChange(discordId, 'added', roleId, reason);

    return true;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    logger.error({ discordId, roleId, error: errorMsg }, 'Failed to add role');

    // Log the failed attempt
    await logRoleChange(discordId, 'added', roleId, reason, errorMsg, 'failed');

    throw err;
  }
};

export const removeRoleFromMember = async (discordId, roleId, reason = 'Subscription ended') => {
  try {
    await withRetry(async () => {
      await api.delete(
        `/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`,
        { headers: { 'X-Audit-Log-Reason': reason } }
      );
    });

    logger.info({ discordId, roleId }, 'Removed role from member');

    // Log the change
    await logRoleChange(discordId, 'removed', roleId, reason);

    return true;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    logger.error({ discordId, roleId, error: errorMsg }, 'Failed to remove role');

    // Log the failed attempt
    await logRoleChange(discordId, 'removed', roleId, reason, errorMsg, 'failed');

    throw err;
  }
};

export const getMemberRoles = async (discordId) => {
  try {
    const response = await withRetry(async () => {
      return await api.get(`/guilds/${GUILD_ID}/members/${discordId}`);
    });

    return response.data.roles || [];
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    logger.error({ discordId, error: errorMsg }, 'Failed to get member roles');
    throw err;
  }
};

export const hasPaidRole = async (discordId) => {
  try {
    const roles = await getMemberRoles(discordId);
    return roles.includes(process.env.DISCORD_PAID_ROLE_ID);
  } catch (err) {
    logger.error({ discordId }, 'Failed to check paid role');
    return false;
  }
};

export const hasPlayerRole = async (discordId) => {
  try {
    const roles = await getMemberRoles(discordId);
    return roles.includes(process.env.DISCORD_PLAYER_ROLE_ID);
  } catch (err) {
    logger.error({ discordId }, 'Failed to check player role');
    return false;
  }
};

export const syncRoles = async (discordId, shouldHavePaid = false) => {
  try {
    const hasPaid = await hasPaidRole(discordId);
    const hasPlayer = await hasPlayerRole(discordId);

    const changes = [];

    // Handle paid role
    if (shouldHavePaid && !hasPaid) {
      await addRoleToMember(discordId, process.env.DISCORD_PAID_ROLE_ID, 'Subscription active - sync');
      changes.push({ action: 'added', role: 'paid' });
    } else if (!shouldHavePaid && hasPaid) {
      await removeRoleFromMember(discordId, process.env.DISCORD_PAID_ROLE_ID, 'Subscription ended - sync');
      changes.push({ action: 'removed', role: 'paid' });
    }

    // Handle guild member role (combined @Player + @Paid Member)
    const shouldHaveGuildMember = hasPlayer && shouldHavePaid;
    const hasGuildMember = await hasRole(discordId, process.env.DISCORD_GUILD_MEMBER_ROLE_ID);

    if (shouldHaveGuildMember && !hasGuildMember) {
      await addRoleToMember(discordId, process.env.DISCORD_GUILD_MEMBER_ROLE_ID, '@Player + @Paid Member');
      changes.push({ action: 'added', role: 'guild_member' });
    } else if (!shouldHaveGuildMember && hasGuildMember) {
      await removeRoleFromMember(discordId, process.env.DISCORD_GUILD_MEMBER_ROLE_ID, 'Revoked - missing requirement');
      changes.push({ action: 'removed', role: 'guild_member' });
    }

    return changes;
  } catch (err) {
    logger.error({ discordId }, 'Failed to sync roles');
    throw err;
  }
};

const hasRole = async (discordId, roleId) => {
  try {
    const roles = await getMemberRoles(discordId);
    return roles.includes(roleId);
  } catch {
    return false;
  }
};

const logRoleChange = async (discordId, action, roleId, reason, errorMessage = null, status = 'success') => {
  try {
    // Get user by discord_id to link the change
    const userResult = await query(
      'SELECT id FROM users WHERE discord_id = $1',
      [discordId]
    );

    const userId = userResult.rows[0]?.id;

    await query(
      `INSERT INTO discord_role_changes (user_id, discord_id, action, role_id, reason, error_message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, discordId, action, roleId, reason, errorMessage, status]
    );
  } catch (err) {
    logger.error({ err, discordId }, 'Failed to log role change');
  }
};

export const getGuildMember = async (discordId) => {
  try {
    const response = await withRetry(async () => {
      return await api.get(`/guilds/${GUILD_ID}/members/${discordId}`);
    });
    return response.data;
  } catch (err) {
    logger.error({ discordId }, 'Failed to get guild member');
    throw err;
  }
};
