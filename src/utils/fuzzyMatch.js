const levenshtein = require('fast-levenshtein');

// So'z shaklidagi sonlarni raqamga o'giradigan lug'at (eng ko'p ishlatiladiganlari)
const NUMBER_WORDS = {
  nol: 0, bir: 1, ikki: 2, uch: 3, tort: 4, "to'rt": 4, besh: 5, olti: 6,
  yetti: 7, sakkiz: 8, toqqiz: 9, "to'qqiz": 9,
  on: 10, "o'n": 10, yigirma: 20, ottiz: 30, "o'ttiz": 30, qirq: 40, ellik: 50,
  oltmish: 60, yetmish: 70, sakson: 80, toqson: 90, "to'qson": 90,
  yuz: 100, ming: 1000,
};

// Mazmun bermaydigan bog'lovchi so'zlar - alohida so'z sifatida tekshirilmaydi
const STOPWORDS = new Set(['va', 'bilan', 'uchun', 'ham', 'lekin', 'biroq', 'yoki', 'deb', 'kabi']);

function wordsToNumber(text) {
  const words = text.split(/\s+/).filter(Boolean);
  let total = 0;
  let matchedAny = false;
  for (const w of words) {
    const key = w.toLowerCase();
    if (NUMBER_WORDS[key] !== undefined) {
      matchedAny = true;
      const val = NUMBER_WORDS[key];
      if (val === 100 || val === 1000) {
        total = (total === 0 ? 1 : total) * val;
      } else {
        total += val;
      }
    }
  }
  return matchedAny ? String(total) : null;
}

function normalize(raw) {
  let s = String(raw || '').toLowerCase().trim();

  // apostrof variantlari -> '
  s = s.replace(/[\u2018\u2019\u0060\u00B4\u02BB\u02BC`’‘ʻʼ]/g, "'");

  // o‘ / oʻ / òo va shu kabi variantlar -> o'
  s = s.replace(/o['`´]/g, "o'").replace(/ò/g, "o'");
  // g‘ / ģ / g` -> g'
  s = s.replace(/g['`´]/g, "g'").replace(/ģ/g, "g'");

  // tire/chiziqcha variantlari -> bo'shliq
  s = s.replace(/[\u2010-\u2015\-–—]/g, ' ');

  // ortiqcha bo'shliqlar va tinish belgilari
  s = s.replace(/[.,!?;:()"]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

function normalizeNumbers(s) {
  const asNumber = wordsToNumber(s);
  return asNumber !== null ? asNumber : s;
}

function similarityOk(a, b) {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return true;
  const dist = levenshtein.get(a, b);
  // qisqa javoblar uchun qattiqroq, uzun javoblar uchun yumshoqroq chegara
  const allowedRatio = maxLen <= 4 ? 0.34 : maxLen <= 8 ? 0.4 : 0.3;
  const allowedDistance = Math.max(1, Math.round(maxLen * allowedRatio));
  return dist <= allowedDistance;
}

/**
 * O'quvchi javobi bilan to'g'ri javobni imloviy xatolarga chidamli solishtiradi.
 * - Bir nechta to'g'ri javob variantlari "/" yoki "," bilan berilgan bo'lsa, har biriga tekshiradi.
 * - To'g'ri javob bir nechta so'zdan iborat bo'lsa (masalan "Mavzu va pozitsiya"),
 *   o'quvchi shu so'zlardan FAQAT BITTASINI yozsa ham to'g'ri deb hisoblanadi.
 */
function isAnswerCorrect(studentRaw, correctRaw) {
  const studentNorm = normalizeNumbers(normalize(studentRaw));
  if (!studentNorm) return false;

  const variants = String(correctRaw)
    .split(/[\/,]|;| yoki /i)
    .map((v) => v.trim())
    .filter(Boolean);
  if (variants.length === 0) variants.push(correctRaw);

  for (const variant of variants) {
    const correctNorm = normalizeNumbers(normalize(variant));

    // 1) To'liq javob solishtiruvi
    if (similarityOk(studentNorm, correctNorm)) return true;

    // 2) So'z darajasida solishtiruv - bitta muhim so'z to'g'ri kelsa yetarli
    const words = correctNorm.split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w));
    for (const word of words) {
      if (similarityOk(studentNorm, word)) return true;
    }
  }

  return false;
}

module.exports = { isAnswerCorrect, normalize };
