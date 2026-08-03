// Everything the account ever says, in both languages.
//
// Kept in one file because the whole point is that a person can read every possible outgoing
// message in one sitting and know exactly what the account will say in their name. Copy
// scattered across handlers is how an outreach account ends up sending something nobody
// remembers writing.
//
// Russian is the default. Uzbek is sent only when somebody asks for it — see replies.mjs.

/* ------------------------------------------------------------------- the intro */

export const INTRO = {
  ru: `Здравствуйте! 👋

Мы запускаем EasyQ — сервис онлайн-записи для бизнеса. Сейчас подключаем первых партнеров, поэтому первый месяц бесплатно.

С EasyQ вы получите:

✅ Онлайн-запись 24/7
✅ CRM с базой клиентов
✅ Расписание сотрудников
✅ Запись через Telegram
✅ Автоматические напоминания клиентам
✅ Бизнес-страницу с услугами, ценами и фотографиями
✅ Ссылку для онлайн-записи (Instagram, Telegram и др.)
✅ Статистику и аналитику
✅ Управление с телефона или компьютера

Тарифы после бесплатного месяца:

• До 2 сотрудников — 175 000 сум/мес
• До 5 сотрудников — 299 000 сум/мес ⭐
• До 8 сотрудников — 499 000 сум/мес
• До 15 сотрудников — 799 000 сум/мес

Подключение занимает около 10 минут.

Если интересно, ответьте «+», и мы покажем, как работает платформа.`,

  uz: `Assalomu alaykum! 👋

Biz EasyQ — biznes uchun onlayn yozilish xizmatini ishga tushiryapmiz. Hozir birinchi hamkorlarni ulayapmiz, shuning uchun birinchi oy bepul.

EasyQ bilan siz quyidagilarga ega bo'lasiz:

✅ 24/7 onlayn yozilish
✅ Mijozlar bazasi bilan CRM
✅ Xodimlar ish jadvali
✅ Telegram orqali yozilish
✅ Mijozlarga avtomatik eslatmalar
✅ Xizmatlar, narxlar va rasmlar bilan biznes sahifa
✅ Onlayn yozilish uchun havola (Instagram, Telegram va boshqalar)
✅ Statistika va tahlil
✅ Telefon yoki kompyuterdan boshqarish

Bepul oydan keyingi tariflar:

• 2 tagacha xodim — 175 000 so'm/oy
• 5 tagacha xodim — 299 000 so'm/oy ⭐
• 8 tagacha xodim — 499 000 so'm/oy
• 15 tagacha xodim — 799 000 so'm/oy

Ulanish taxminan 10 daqiqa vaqt oladi.

Qiziqsangiz, «+» deb javob bering — platforma qanday ishlashini ko'rsatamiz.`,
};

/* ------------------------------------------------- what "+" gets back */

export const INTERESTED = {
  ru: `Отлично! 🙌

Наш менеджер свяжется с вами в ближайшее время и всё покажет — займёт минут 10.

А пока можете посмотреть сами: https://easyq.uz

Если появятся вопросы, просто напишите сюда — мы на связи.`,

  uz: `Ajoyib! 🙌

Menejerimiz tez orada siz bilan bog'lanadi va hammasini ko'rsatadi — taxminan 10 daqiqa vaqt oladi.

Shu vaqt ichida o'zingiz ham ko'rib chiqishingiz mumkin: https://easyq.uz

Savollaringiz bo'lsa, shu yerga yozing — biz aloqadamiz.`,
};

/**
 * Sent when somebody writes something we have no confident answer for.
 *
 * Deliberately short and honest: it says a person will reply, and then a person has to. The
 * alternative — guessing at an answer — is how an autoresponder tells a prospect something the
 * business does not actually offer.
 */
export const HANDOFF = {
  ru: `Спасибо за вопрос! Передал менеджеру — он ответит вам здесь в ближайшее время.

Если удобнее, можно посмотреть платформу самому: https://easyq.uz`,

  uz: `Savolingiz uchun rahmat! Menejerga uzatdim — u tez orada shu yerda javob beradi.

Qulay bo'lsa, platformani o'zingiz ham ko'rishingiz mumkin: https://easyq.uz`,
};

/* ------------------------------------------------------------------------ FAQ */

/**
 * Each entry: keywords that trigger it, and the answer in both languages.
 *
 * Keywords are matched against a normalised copy of the message (lowercased, punctuation
 * stripped, Uzbek apostrophes folded) — see replies.mjs. They cover Russian, Uzbek in Latin,
 * and Uzbek in Cyrillic, because people write all three and often mix them in one sentence.
 *
 * Order matters: the FIRST entry whose keywords match wins, so put the specific ones above the
 * general ones. "бесплатно" would otherwise swallow every pricing question.
 */
export const FAQ = [
  {
    id: "trial",
    keywords: [
      "бесплат", "беспл", "халява", "trial", "триал", "тест", "sinov", "bepul", "текин",
      "бепул", "free",
    ],
    ru: `Первый месяц — полностью бесплатно, без карты и без предоплаты.

Подключаем, вы работаете месяц, и только потом решаете, продолжать или нет.`,
    uz: `Birinchi oy — mutlaqo bepul, karta ham, oldindan to'lov ham kerak emas.

Ulaymiz, siz bir oy ishlaysiz va shundan keyin davom etish yoki etmaslikni hal qilasiz.`,
  },
  {
    id: "staff",
    keywords: ["сотрудник", "мастер", "персонал", "команда", "xodim", "usta", "jamoa", "ходим"],
    ru: `Сотрудников можно добавить сколько нужно — тариф зависит от их количества.

У каждого свой график, свои услуги и свой календарь. Мастеру можно дать отдельный вход, где он видит только свой день и своих клиентов.`,
    uz: `Xodimlarni kerakligicha qo'shish mumkin — tarif ularning soniga bog'liq.

Har birining o'z jadvali, o'z xizmatlari va o'z kalendari bo'ladi. Ustaga alohida kirish berish mumkin — u faqat o'z kunini va o'z mijozlarini ko'radi.`,
  },
  {
    id: "price",
    keywords: [
      "цена", "цены", "стоит", "стоимость", "тариф", "сколько", "почем", "почём", "оплат",
      "narx", "narxi", "qancha", "tarif", "нарх", "канча", "price", "abonent",
    ],
    ru: `Тарифы после бесплатного месяца:

• До 2 сотрудников — 175 000 сум/мес
• До 5 сотрудников — 299 000 сум/мес ⭐
• До 8 сотрудников — 499 000 сум/мес
• До 15 сотрудников — 799 000 сум/мес

Никаких комиссий с записей и скрытых платежей — только эта сумма.`,
    uz: `Bepul oydan keyingi tariflar:

• 2 tagacha xodim — 175 000 so'm/oy
• 5 tagacha xodim — 299 000 so'm/oy ⭐
• 8 tagacha xodim — 499 000 so'm/oy
• 15 tagacha xodim — 799 000 so'm/oy

Yozuvlardan komissiya va yashirin to'lovlar yo'q — faqat shu summa.`,
  },
  {
    id: "commission",
    keywords: ["комисси", "процент", "foiz", "komissiya", "процентов", "скрыт", "yashirin"],
    ru: `Комиссии нет. Мы не берём процент с записей и не берём деньги с ваших клиентов — только фиксированная оплата за месяц по тарифу.`,
    uz: `Komissiya yo'q. Yozuvlardan foiz olmaymiz va mijozlaringizdan pul olmaymiz — faqat tarif bo'yicha oylik belgilangan to'lov.`,
  },
  {
    id: "setup",
    keywords: [
      "подключ", "установ", "начать", "старт", "настро", "долго", "сложно", "как работает",
      "ulash", "ulanish", "boshlash", "sozlash", "qanday ishlaydi", "уланиш", "бошлаш",
    ],
    ru: `Подключение занимает около 10 минут — регистрация через Telegram, добавляете услуги и сотрудников, и страница записи готова.

Настраивать ничего сложного не нужно, мы всё покажем и поможем на старте.`,
    uz: `Ulanish taxminan 10 daqiqa — Telegram orqali ro'yxatdan o'tasiz, xizmat va xodimlarni qo'shasiz, yozilish sahifangiz tayyor.

Murakkab sozlash kerak emas, boshida hammasini ko'rsatamiz va yordam beramiz.`,
  },
  {
    id: "telegram",
    keywords: ["телеграм", "telegram", "телега", "бот", "bot"],
    ru: `Да — клиенты могут записываться прямо в Telegram через нашего бота, и им автоматически приходят напоминания о визите.

Плюс у вас будет обычная ссылка на страницу записи, которую можно поставить в Instagram или отправить в переписке.`,
    uz: `Ha — mijozlar to'g'ridan-to'g'ri Telegram orqali botimizda yozilishlari mumkin va ularga tashrif haqida avtomatik eslatma boradi.

Bundan tashqari, Instagram'ga qo'yish yoki yozishmada yuborish uchun oddiy havola ham bo'ladi.`,
  },
  {
    id: "website",
    keywords: ["сайт", "инстаграм", "instagram", "ссылк", "havola", "sayt", "линк", "link"],
    ru: `Свой сайт не нужен — мы даём готовую страницу записи с вашим названием, услугами, ценами и фотографиями.

Ссылку можно поставить в шапку Instagram, в Telegram или отправлять клиентам напрямую.`,
    uz: `O'z saytingiz kerak emas — nomingiz, xizmatlaringiz, narxlaringiz va rasmlaringiz bilan tayyor yozilish sahifasini beramiz.

Havolani Instagram profilingizga, Telegram'ga qo'yish yoki mijozlarga to'g'ridan-to'g'ri yuborish mumkin.`,
  },
  {
    id: "reminders",
    keywords: ["напомин", "уведомл", "смс", "sms", "eslatma", "xabar", "эслатма"],
    ru: `Напоминания уходят клиентам автоматически в Telegram перед визитом — это заметно снижает число тех, кто не пришёл.

Отдельно платить за SMS не нужно.`,
    uz: `Eslatmalar mijozlarga tashrifdan oldin Telegram orqali avtomatik yuboriladi — bu kelmay qolganlar sonini sezilarli kamaytiradi.

SMS uchun alohida to'lash shart emas.`,
  },
  {
    id: "clients-base",
    keywords: ["база", "клиент", "crm", "црм", "mijoz", "baza", "мижоз"],
    ru: `В CRM собирается база клиентов: кто приходил, к какому мастеру, как часто и на какую сумму.

Она ваша — выгрузить или посмотреть можно в любой момент.`,
    uz: `CRM'da mijozlar bazasi to'planadi: kim kelgan, qaysi ustaga, qanchalik tez-tez va qancha summaga.

Baza sizniki — istalgan vaqtda ko'rish yoki yuklab olish mumkin.`,
  },
  {
    id: "devices",
    keywords: ["телефон", "компьютер", "приложение", "андроид", "айфон", "ilova", "kompyuter", "телефонда"],
    ru: `Работает с телефона и с компьютера через браузер — скачивать ничего не нужно.`,
    uz: `Telefondan ham, kompyuterdan ham brauzer orqali ishlaydi — hech narsa yuklab olish shart emas.`,
  },
];

/* ------------------------------------------------- Saved Messages control panel */

export const HELP = `EasyQ outreach — commands, in Saved Messages

  /send        reply to a message containing usernames → sends the intro to all of them
  /send dry    same, but resolves only and sends nothing
  /report      status of everyone contacted so far
  /status @x   one person
  /stop        halt a run in progress
  /help        this

Put the list in a Saved Message, one username per line (@name, name, or a t.me link),
then REPLY to that message with /send.`;
