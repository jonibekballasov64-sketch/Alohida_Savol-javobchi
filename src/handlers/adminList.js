const { query } = require('../db');

function registerAdminListHandler(bot, isAdminFn) {
  bot.command(['mavzular', 'Mavzular'], async (ctx) => {
    if (!isAdminFn(ctx.from.id)) return;

    const res = await query(`
      SELECT t.id, t.slug, t.name, t.code, t.finalized, COUNT(q.id) AS qcount
      FROM topics t
      LEFT JOIN questions q ON q.topic_id = t.id
      GROUP BY t.id
      ORDER BY t.id DESC
    `);

    if (res.rowCount === 0) {
      return ctx.reply('Hozircha birorta ham mavzu yaratilmagan.');
    }

    let text = 'Mavzular ro\'yxati:\n\n';
    res.rows.forEach((t, i) => {
      text += `${i + 1}. ${t.name}\n   slug: ${t.slug}\n   kod: ${t.finalized ? t.code : "hali yakunlanmagan"}\n   savollar: ${t.qcount} ta\n\n`;
    });

    await ctx.reply(text);
  });
}

module.exports = { registerAdminListHandler };
