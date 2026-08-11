const { Telegraf } = require('telegraf');
const { BOT_TOKEN, isAdmin } = require('./config');
const { initSchema } = require('./db');

const { registerAdminTopicHandlers } = require('./handlers/adminTopic');
const { registerAdminListHandler } = require('./handlers/adminList');
const { registerAdminReportHandler } = require('./handlers/adminReport');
const { registerStudentHandlers } = require('./handlers/studentFlow');

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN topilmadi. Railway Variables bo\'limini tekshiring.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Admin buyruqlari
registerAdminReportHandler(bot, isAdmin); // /hisobot_KOD - bot.hears bilan ishlagani uchun oldinroq
registerAdminTopicHandlers(bot, isAdmin); // /yangi_mavzu, /tahrirlash
registerAdminListHandler(bot, isAdmin); // /mavzular

// O'quvchi oqimi
registerStudentHandlers(bot);

bot.catch((err, ctx) => {
  console.error(`Xatolik (update ${ctx.updateType}):`, err);
});

async function main() {
  await initSchema();
  await bot.launch();
  console.log('Bot ishga tushdi.');
}

main().catch((err) => {
  console.error('Botni ishga tushirishda xatolik:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
