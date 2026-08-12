const { query } = require('../db');
const { buildReportPdf } = require('../utils/pdfReport');

// Reytingga medal biriktirish: teng ballilar bir xil medalni oladi
function assignMedals(rows) {
  let displayRank = 0;
  let prevScore = null;
  return rows.map((r, idx) => {
    if (r.correct_count !== prevScore) {
      displayRank = idx + 1;
      prevScore = r.correct_count;
    }
    let medal = '';
    if (displayRank === 1) medal = ' 🥇';
    else if (displayRank === 2) medal = ' 🥈';
    else if (displayRank === 3) medal = ' 🥉';
    return { ...r, medal };
  });
}

async function getRoundRows(code, round) {
  const res = await query(
    `SELECT student_name, correct_count, wrong_count
     FROM sessions
     WHERE code=$1 AND round=$2 AND attempt_number=1 AND status IN ('finished','timeout')
     ORDER BY correct_count DESC, student_name ASC`,
    [code, round]
  );
  return res.rows.map((s) => ({
    name: s.student_name,
    correct_count: s.correct_count,
    total: s.correct_count + s.wrong_count,
  }));
}

function registerAdminRoundReportHandlers(bot, isAdminFn) {
  // /joriyhisobot_ABC123 - hozirgi holatni ko'rsatadi, hech narsani nollamaydi
  bot.hears(/^\/joriyhisobot_([A-Za-z0-9]{6})$/i, async (ctx) => {
    if (!isAdminFn(ctx.from.id)) return;
    const code = ctx.match[1].toUpperCase();

    const topicRes = await query('SELECT * FROM topics WHERE code=$1', [code]);
    if (topicRes.rowCount === 0) {
      return ctx.reply("Bunday kod bo'yicha mavzu topilmadi.");
    }
    const topic = topicRes.rows[0];

    const countRes = await query('SELECT COUNT(*) FROM questions WHERE topic_id=$1', [topic.id]);
    const questionCount = Number(countRes.rows[0].count);

    const rows = assignMedals(await getRoundRows(code, topic.round));

    let text = `Slug: ${topic.slug}\nMavzu: ${topic.name}\nSavollar soni: ${questionCount}\n\n`;
    if (rows.length === 0) {
      text += "Hozircha hech kim ushbu kod bilan test topshirmagan.";
    } else {
      rows.forEach((r, i) => {
        text += `${i + 1}. ${r.name} — ${r.correct_count} ta to'g'ri${r.medal}\n`;
      });
      text += `\n🎉 Barcha faol o'quvchilarga rahmat! Davom etamiz 💪`;
    }

    await ctx.reply(text);
  });

  // /yakunlash_ABC123 - yakuniy PDF hisobot beradi va hisobni nollaydi (yangi davr boshlanadi)
  bot.hears(/^\/yakunlash_([A-Za-z0-9]{6})$/i, async (ctx) => {
    if (!isAdminFn(ctx.from.id)) return;
    const code = ctx.match[1].toUpperCase();

    const topicRes = await query('SELECT * FROM topics WHERE code=$1', [code]);
    if (topicRes.rowCount === 0) {
      return ctx.reply("Bunday kod bo'yicha mavzu topilmadi.");
    }
    const topic = topicRes.rows[0];

    const rowsForPdf = (await getRoundRows(code, topic.round)).map((r) => ({
      name: r.name,
      correct: r.correct_count,
      total: r.total,
      percent: r.total > 0 ? Math.round((r.correct_count / r.total) * 100) : 0,
    }));

    if (rowsForPdf.length === 0) {
      await ctx.reply("Bu davrda hech kim test topshirmagan, yakunlash uchun ma'lumot yo'q.");
      return;
    }

    const pdfBuffer = await buildReportPdf({ topicName: topic.name, code, rows: rowsForPdf });
    await ctx.replyWithDocument({ source: pdfBuffer, filename: `yakuniy_hisobot_${code}.pdf` });

    // Yangi davrni boshlash - eski natijalar arxivda qoladi, lekin keyingi hisobotlarga kirmaydi
    await query('UPDATE topics SET round = round + 1 WHERE id=$1', [topic.id]);

    await ctx.reply(
      `✅️ Yakuniy hisobot yuborildi va davr yopildi.\n\nKod hali ham ochiq — o'quvchilar shu kod bilan davom etaveradi, lekin bundan keyingi natijalar YANGI hisobot sifatida sanaladi (yuqoridagi hisobot esa arxivda saqlanib qoladi).`
    );
  });
}

module.exports = { registerAdminRoundReportHandlers };
