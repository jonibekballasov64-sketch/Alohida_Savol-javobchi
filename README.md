# Alohida_Savol-javobchi
# Nargiza Olimovna - Savol-javob boti

## Railway'ga joylash
1. Bu repo'ni GitHub'ga push qiling.
2. Railway'da "New Project" > "Deploy from GitHub repo" tanlang.
3. Railway loyihasiga **PostgreSQL** plagin qo'shing (Add Plugin > PostgreSQL). `DATABASE_URL` avtomatik qo'shiladi.
4. Variables bo'limiga qo'shing:
   - `BOT_TOKEN` - BotFather'dan olingan token
   - `ADMIN_IDS` - masalan: `123456789,987654321`
   - `GROUP_ID` - yopiq guruh ID (bot shu guruhga a'zo/admin bo'lishi shart)
   - `INVITE_USERNAME` - masalan: `@Filolog_N` (ixtiyoriy, default shu)
5. Deploy avtomatik ishga tushadi, `npm start` orqali botni ko'taradi.

## Admin buyruqlari
- `/yangi_mavzu` - yangi mavzu va savollar qo'shish
- `/mavzular` - barcha mavzular ro'yxati
- `/tahrirlash` - mavjud mavzuga savol qo'shish (slug orqali)
- `/hisobot_KOD6TA` - shu kod bo'yicha PDF hisobot (masalan: `/hisobot_AB12CD`)

## Muhim eslatmalar
- Admin va o'quvchi holatlari (FSM) xotirada saqlanadi - Railway konteyner qayta ishga tushsa (deploy/restart), tugallanmagan jarayon (masalan yarim yozilgan savollar yoki aktiv savol-javob) yo'qoladi. Tugallangan mavzular va yakunlangan natijalar DB'da xavfsiz qoladi.
- Kod alfaviti chalkash harflarni (I, O, 0, 1) o'z ichiga olmaydi.
- Javob solishtirish `fast-levenshtein` orqali imloviy xatolarga (apostrof, o'/g' variantlari, tire) chidamli qilingan; kerak bo'lsa `src/utils/fuzzyMatch.js` dagi `allowedRatio` qiymatlarini sozlang.
