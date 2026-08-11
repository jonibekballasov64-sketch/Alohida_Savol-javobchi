const { query } = require('../db');
const { buildReportPdf } = require('../utils/pdfReport');

function registerAdminReportHandler(bot, isAdminFn) {
  // /hisobot_ABC123 formatidagi buyruqni ushlaydi
  bot.hears(/^\/hisobot_([A-Za-z0-9]{6})$/, async (ctx) => {
    if (!isAdminFn(ctx.from.id)) return;
    const code = ctx.match[1].toUpperCase();

    const topicRes = await query('SELECT * FROM topics WHERE code=$1', [code]);
    if (topicRes.rowCount === 0) {
      return ctx.reply("Bunday kod bo'yicha mavzu topilmadi.");
    }
    const topic = topicRes.rows[0];

    // Faqat har o'quvchining 1-urinishi (attempt_number=1) va tugagan sessiyalari hisobga olinadi
    const sessionsRes = await query(
      `SELECT student_name, correct_count, wrong_count
       FROM sessions
       WHERE code=$1 AND attempt_number=1 AND status IN ('finished','timeout')
       ORDER BY student_name`,
      [code]
    );

    const rows = sessionsRes.rows
      .map((s) => {
        const total = s.correct_count + s.wrong_count;
        const percent = total > 0 ? Math.round((s.correct_count / total) * 100) : 0;
        return { name: s.student_name, correct: s.correct_count, total, percent };
      })
      .sort((a, b) => b.percent - a.percent);

    const pdfBuffer = await buildReportPdf({ topicName: topic.name, code, rows });

    await ctx.replyWithDocument({
      source: pdfBuffer,
      filename: `hisobot_${code}.pdf`,
    });
  });
}

module.exports = { registerAdminReportHandler };
