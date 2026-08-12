const { Markup } = require('telegraf');
const { query } = require('../db');
const { adminStates } = require('../state');
const { generateUniqueCode } = require('../utils/codeGen');

// Xabar ichidan ⁉️/✅️/⚠️ juftliklarini ajratib olish
function parseQuestions(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const pairs = [];
  let currentQ = null;

  for (const line of lines) {
    if (line.startsWith('⁉️') || line.startsWith('❓')) {
      currentQ = line.replace(/^⁉️|^❓/, '').trim();
    } else if (line.startsWith('✅️') || line.startsWith('✅')) {
      if (currentQ) {
        const answer = line.replace(/^✅️|^✅/, '').trim();
        pairs.push({ question: currentQ, answer, explanation: null });
        currentQ = null;
      }
    } else if (line.startsWith('⚠️')) {
      if (pairs.length > 0) {
        const explanation = line.replace(/^⚠️\s*(izoh\s*:\s*)?/i, '').trim();
        pairs[pairs.length - 1].explanation = explanation || null;
      }
    }
  }
  return pairs;
}

function progressKeyboard(topicId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Davom etaman', `topic_continue_${topicId}`)],
    [Markup.button.callback('✅️ Yakunlab saqlayman', `topic_finish_${topicId}`)],
  ]);
}

function registerAdminTopicHandlers(bot, isAdminFn) {
  bot.command(['yangi_mavzu', 'Yangi_Mavzu', 'yangi_Mavzu'], async (ctx) => {
    if (!isAdminFn(ctx.from.id)) return;
    adminStates.set(ctx.from.id, { step: 'awaiting_slug_name' });
    await ctx.reply(
      "Yangi mavzu yaratamiz.\n\nQuyidagi formatda yuboring:\nslug | Mavzu nomi\n\nMasalan:\nsudxorning-olimi | Sudxo'rning o'limi"
    );
  });

  bot.command(['tahrirlash', 'Tahrirlash'], async (ctx) => {
    if (!isAdminFn(ctx.from.id)) return;
    adminStates.set(ctx.from.id, { step: 'awaiting_edit_slug' });
    await ctx.reply('Tahrirlamoqchi bo\'lgan mavzuning slug\'ini kiriting:');
  });

  bot.on('text', async (ctx, next) => {
    if (!isAdminFn(ctx.from.id)) return next();
    const state = adminStates.get(ctx.from.id);
    if (!state) return next();

    const text = ctx.message.text.trim();

    if (state.step === 'awaiting_slug_name') {
      const parts = text.split('|').map((p) => p.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return ctx.reply("Format noto'g'ri. Namuna: slug | Mavzu nomi");
      }
      const [slug, name] = parts;
      const existing = await query('SELECT id FROM topics WHERE slug=$1', [slug]);
      if (existing.rowCount > 0) {
        return ctx.reply('Bu slug allaqachon mavjud. Boshqa slug kiriting:');
      }
      const tempCode = 'PENDING';
      const res = await query(
        'INSERT INTO topics (slug, name, code, admin_id, finalized) VALUES ($1,$2,$3,$4,false) RETURNING id',
        [slug, name, tempCode + '_' + Date.now(), ctx.from.id]
      );
      const topicId = res.rows[0].id;
      adminStates.set(ctx.from.id, { step: 'awaiting_questions', topicId });
      await ctx.reply(
        `Mavzu yaratildi: "${name}"\n\nEndi savollarni shu formatda yuboring (bitta xabarda bir nechtasi bo'lishi mumkin, izoh ixtiyoriy):\n\n⁉️ Savol matni\n✅️ Javob matni\n⚠️ Izoh: qo'shimcha tushuntirish (ixtiyoriy)\n\n⁉️ Yana savol\n✅️ Yana javob`
      );
      return;
    }

    if (state.step === 'awaiting_questions') {
      const pairs = parseQuestions(text);
      if (pairs.length === 0) {
        return ctx.reply(
          "Savol topilmadi. Har bir savol ⁉️ bilan, javob ✅️ bilan boshlanishi kerak."
        );
      }
      const countRes = await query('SELECT COUNT(*) FROM questions WHERE topic_id=$1', [state.topicId]);
      let orderIndex = Number(countRes.rows[0].count);
      for (const p of pairs) {
        orderIndex += 1;
        await query(
          'INSERT INTO questions (topic_id, order_index, question, answer, explanation) VALUES ($1,$2,$3,$4,$5)',
          [state.topicId, orderIndex, p.question, p.answer, p.explanation]
        );
      }
      await ctx.reply(
        `✅️ ${pairs.length} ta savol-javob saqlandi. Shu mavzuda jami: ${orderIndex} ta savol.`,
        progressKeyboard(state.topicId)
      );
      return;
    }

    if (state.step === 'awaiting_edit_slug') {
      const topicRes = await query('SELECT * FROM topics WHERE slug=$1', [text]);
      if (topicRes.rowCount === 0) {
        return ctx.reply("Bunday slug topilmadi. Qayta kiriting yoki /tahrirlash bilan qaytadan boshlang.");
      }
      const topic = topicRes.rows[0];
      adminStates.set(ctx.from.id, { step: 'awaiting_questions', topicId: topic.id });
      await ctx.reply(
        `Mavzu topildi: "${topic.name}" (kod: ${topic.finalized ? topic.code : 'hali yakunlanmagan'})\n\nQo'shimcha savollarni yuboring:\n\n⁉️ Savol matni\n✅️ Javob matni\n⚠️ Izoh: qo'shimcha tushuntirish (ixtiyoriy)`
      );
      return;
    }

    return next();
  });

  bot.action(/topic_continue_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await ctx.reply('Davom etamiz. Keyingi savol-javoblarni yuboring:');
  });

  bot.action(/topic_finish_(\d+)/, async (ctx) => {
    const topicId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});

    const topicRes = await query('SELECT * FROM topics WHERE id=$1', [topicId]);
    const topic = topicRes.rows[0];

    let code = topic.code;
    if (!topic.finalized || code.includes('_')) {
      code = await generateUniqueCode();
      await query('UPDATE topics SET code=$1, finalized=true WHERE id=$2', [code, topicId]);
    }

    adminStates.delete(ctx.from.id);
    await ctx.reply(
      `Mavzu yakunlandi va saqlandi. ✅️\n\nMavzu: ${topic.name}\n6 xonali kod: ${code}\n\nShu kodni o'quvchilarga bering.`
    );
  });
}

module.exports = { registerAdminTopicHandlers };
