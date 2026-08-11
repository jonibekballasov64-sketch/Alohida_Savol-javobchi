require('dotenv').config();

const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_IDS,
  GROUP_ID: process.env.GROUP_ID,
  DATABASE_URL: process.env.DATABASE_URL,
  INVITE_USERNAME: process.env.INVITE_USERNAME || '@Filolog_N',
  MAX_ATTEMPTS: 3,
  FIRST_TIMEOUT_MS: 5 * 60 * 1000, // 5 daqiqa - ogohlantirish
  SECOND_TIMEOUT_MS: 2 * 60 * 1000, // yana 2 daqiqa - avtomatik tugatish
  isAdmin(id) {
    return ADMIN_IDS.includes(Number(id));
  },
};
