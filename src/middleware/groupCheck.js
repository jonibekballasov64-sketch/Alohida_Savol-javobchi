const { GROUP_ID } = require('../config');

/**
 * Foydalanuvchi yopiq guruh a'zosi ekanligini Telegram API orqali tekshiradi.
 * Bot shu guruhga a'zo (yoki admin) bo'lishi shart.
 */
async function isGroupMember(telegram, userId) {
  try {
    const member = await telegram.getChatMember(GROUP_ID, userId);
    return !['left', 'kicked'].includes(member.status);
  } catch (err) {
    console.error('Guruh tekshiruvida xatolik:', err.description || err.message);
    return false;
  }
}

module.exports = { isGroupMember };
