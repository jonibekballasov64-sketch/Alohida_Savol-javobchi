const levenshtein = require('fast-levenshtein');

// So'z shaklidagi sonlarni raqamga o'giradigan lug'at
const NUMBER_WORDS = {
  nol: 0, bir: 1, ikki: 2, uch: 3, tort: 4, "to'rt": 4, besh: 5, olti: 6,
  yetti: 7, sakkiz: 8, toqqiz: 9, "to'qqiz": 9,
  on: 10, "o'n": 10, yigirma: 20, ottiz: 30, "o'ttiz": 30, qirq: 40, ellik: 50,
  oltmish: 60, yetmish: 70, sakson: 80, toqson: 90, "to'qson": 90,
  yuz: 100, ming: 1000,
};

// Mazmun bermaydigan bog'lovchi so'zlar
const STOPWORDS = new Set(['va', 'bilan', 'uchun', 'ham', 'lekin', 'biroq', 'yoki', 'deb', 'kabi', 'bir']);

// Keng tarqalgan kelishik/egalik qo'shimchalari
const SUFFIXES = [
  'lariniki', 'larining', 'laridan', 'larida', 'larini', 'lariga', 'larni',
  'ning', 'dagi', 'gacha', 'cha', 'lar', 'dan', 'da', 'ga', 'ni',
];

function stripSuffix(word) {
  if (word.length <= 4) return word;
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      return word.slice(0, word.length - suf.length);
    }
  }
  return word;
}

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

  // apostrof va tirnoq (oddiy + qiya) variantlari
  s = s.replace(/[\u2018\u2019\u0060\u00B4\u02BB\u02BC`’‘ʻʼ]/g, "'");
  s = s.replace(/o['`´]/g, "o'").replace(/ò/g, "o'");
  s = s.replace(/g['`´]/g, "g'").replace(/ģ/g, "g'");

  // tire/chiziqcha variantlari -> bo'shliq
  s = s.replace(/[\u2010-\u2015\-–—]/g, ' ');

  // ortiqcha bo'shliqlar va tinish belgilari (qiya/burama tirnoqlar ham)
  s = s.replace(/[.,!?;:()"“”«»]/g, ' ');
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

  // Bitta harflik/belgili javoblarda (masalan unli tovush "i", "a") faqat
  // aniq mos kelish qabul qilinadi - aks holda "i" va "a" bir-biriga
  // "deyarli to'g'ri" deb chalkashtirilib yuboriladi.
  if (maxLen === 1) return false;

  const dist = levenshtein.get(a, b);
  const allowedRatio = maxLen <= 4 ? 0.34 : maxLen <= 8 ? 0.4 : 0.35;
  const allowedDistance = Math.max(1, Math.round(maxLen * allowedRatio));
  if (dist <= allowedDistance) return true;

  const aStripped = stripSuffix(a);
  const bStripped = stripSuffix(b);
  if (aStripped !== a || bStripped !== b) {
    const maxLen2 = Math.max(aStripped.length, bStripped.length);
    if (maxLen2 === 0) return false;
    if (maxLen2 === 1) return aStripped === bStripped;
    const dist2 = levenshtein.get(aStripped, bStripped);
    const allowedDistance2 = Math.max(1, Math.round(maxLen2 * allowedRatio));
    if (dist2 <= allowedDistance2) return true;
  }

  return false;
}

// Faqat bog'lovchi so'zlarni chiqarib tashlaydi - bitta harflik so'zlar
// (masalan unli tovushlar: a, i, o, u, e) SAQLANADI, chunki fonetika
// savollarida bular mustaqil ma'noli javob bo'lishi mumkin. Ularning
// solishtirilishi similarityOk() ichidagi maxLen===1 qoidasi bilan
// nazorat qilinadi (faqat aniq mos kelish).
function meaningfulWords(normText) {
  return normText.split(' ').filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * To'g'ri javobni variantlarga ajratish: "/", ",", ";" yoki "yoki" so'zi bo'yicha.
 * "yoki" so'z chegarasi (\b) orqali qidiriladi - qavs yoki tinish belgisi
 * bilan yonma-yon bo'lsa ham ("(yoki") to'g'ri ajratiladi.
 */
function splitVariants(correctRaw) {
  const variants = String(correctRaw)
    .split(/[\/,;]|\byoki\b/i)
    .map((v) => v.trim())
    .filter(Boolean);
  return variants.length > 0 ? variants : [correctRaw];
}

/**
 * O'quvchi javobi bilan to'g'ri javobni imloviy xatolarga chidamli solishtiradi.
 * - Raqamlar so'z shaklida yozilgan bo'lsa ham ("besh" <-> "5") to'g'ri hisoblanadi.
 * - Bitta harflik javoblarda (masalan "i") faqat aniq mos kelish qabul qilinadi.
 * - Ko'p so'zli to'g'ri javobda bitta muhim so'zni topsa ham yetarli.
 */
function isAnswerCorrect(studentRaw, correctRaw) {
  const studentNorm = normalizeNumbers(normalize(studentRaw));
  if (!studentNorm) return false;

  const variants = splitVariants(correctRaw);

  const studentWords = meaningfulWords(studentNorm);
  if (studentWords.length === 0) studentWords.push(studentNorm);

  for (const variant of variants) {
    const correctNorm = normalizeNumbers(normalize(variant));
    if (!correctNorm) continue;

    // 1) To'liq javoblarni solishtirish
    if (similarityOk(studentNorm, correctNorm)) return true;

    // 2) So'z darajasida solishtiruv
    const correctWords = meaningfulWords(correctNorm);
    if (correctWords.length === 0) correctWords.push(correctNorm);

    for (const cWord of correctWords) {
      for (const sWord of studentWords) {
        if (similarityOk(sWord, cWord)) return true;
      }
    }
  }

  return false;
}

module.exports = { isAnswerCorrect, normalize };
