/**
 * Mock Discord API responses for testing
 * This simulates Discord behavior without making real API calls
 */

export class MockDiscordAPI {
  constructor() {
    this.members = new Map(); // guildId -> memberId -> member data
    this.roles = new Map(); // guildId -> {roleId -> roleData}
    this.dms = []; // Store sent DMs for verification
  }

  /**
   * Mock: Add role to member
   */
  async addRoleToMember(guildId, memberId, roleId) {
    if (!this.members.has(guildId)) {
      this.members.set(guildId, new Map());
    }

    const guildMembers = this.members.get(guildId);
    if (!guildMembers.has(memberId)) {
      guildMembers.set(memberId, {
        id: memberId,
        roles: [],
      });
    }

    const member = guildMembers.get(memberId);
    if (!member.roles.includes(roleId)) {
      member.roles.push(roleId);
    }

    return member;
  }

  /**
   * Mock: Remove role from member
   */
  async removeRoleFromMember(guildId, memberId, roleId) {
    const guildMembers = this.members.get(guildId);
    if (!guildMembers) return null;

    const member = guildMembers.get(memberId);
    if (!member) return null;

    member.roles = member.roles.filter(r => r !== roleId);
    return member;
  }

  /**
   * Mock: Get member roles
   */
  async getMemberRoles(guildId, memberId) {
    const guildMembers = this.members.get(guildId);
    if (!guildMembers) return [];

    const member = guildMembers.get(memberId);
    return member ? member.roles : [];
  }

  /**
   * Mock: Check if member has role
   */
  async memberHasRole(guildId, memberId, roleId) {
    const roles = await this.getMemberRoles(guildId, memberId);
    return roles.includes(roleId);
  }

  /**
   * Mock: Get all members with a role
   */
  async getMembersWithRole(guildId, roleId) {
    const guildMembers = this.members.get(guildId);
    if (!guildMembers) return [];

    const membersWithRole = [];
    for (const [memberId, member] of guildMembers.entries()) {
      if (member.roles.includes(roleId)) {
        membersWithRole.push(member);
      }
    }

    return membersWithRole;
  }

  /**
   * Mock: Send DM to member
   */
  async sendDM(memberId, { content, embeds = [] }) {
    const dm = {
      id: Math.random().toString(36).substr(2, 9),
      memberId,
      content,
      embeds,
      timestamp: new Date(),
    };
    this.dms.push(dm);
    return dm;
  }

  /**
   * Mock: Get sent DMs for member
   */
  getDMsForMember(memberId) {
    return this.dms.filter(dm => dm.memberId === memberId);
  }

  /**
   * Mock: Get all sent DMs
   */
  getAllDMs() {
    return [...this.dms];
  }

  /**
   * Clear all mock data
   */
  clear() {
    this.members.clear();
    this.roles.clear();
    this.dms = [];
  }

  /**
   * Get guild members
   */
  getGuildMembers(guildId) {
    const guildMembers = this.members.get(guildId);
    if (!guildMembers) return [];
    return Array.from(guildMembers.values());
  }

  /**
   * Debug: Print current state
   */
  debug() {
    console.log('=== Mock Discord State ===');
    console.log('Members:', this.members);
    console.log('DMs sent:', this.dms);
  }
}

export default MockDiscordAPI;
