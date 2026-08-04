import { createContext, useContext } from 'react';

export type Lang = 'uz' | 'ru' | 'en';
export type Theme = 'light' | 'dark';
/** Mirrors ActorRole in src/server/permissions.ts. One vocabulary end to end. */
export type Role = 'owner' | 'manager' | 'specialist';

export const CRM_LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'uz', label: 'O‘z' },
  { code: 'ru', label: 'Рус' },
  { code: 'en', label: 'Eng' },
];

// Permissive types: the design accesses many keys dynamically (t.status[x], t.via[x], s.nav[k]).
export const CRM_T: Record<Lang, any> = {
  uz: {
    nav: { dashboard: 'Boshqaruv paneli', calendar: 'Jadval', customers: 'Mijozlar', staff: 'Xodimlar', services: 'Xizmatlar', inventory: 'Ombor', finance: 'Kassa', loyalty: 'Sodiqlik', payroll: 'Ish haqi', reviews: 'Sharhlar', marketing: 'Marketing', automations: 'Avtomatlashtirish', analytics: 'Tahlil', branding: 'Brending', settings: 'Sozlamalar' },
    search: 'Mijoz, navbat yoki xizmat qidirish…',
    newBooking: 'Yangi navbat',
    notif: {
      title: 'Bildirishnomalar', markAll: 'Hammasini o‘qilgan deb belgilash', empty: 'Yangi bildirishnoma yo‘q', viewAll: 'Barchasini ko‘rish', justNow: 'hozir', minAgo: 'daq oldin', hAgo: 'soat oldin',
      items: [
        { type: 'booking', title: 'Yangi navbat', body: 'Jasur Aliyev — Soch olish, bugun 15:00', time: '2 daq oldin', unread: true },
        { type: 'cancel', title: 'Navbat bekor qilindi', body: 'Dilnoza Rashidova — 16:30 ni bekor qildi', time: '18 daq oldin', unread: true },
        { type: 'review', title: 'Yangi sharh — 5.0', body: 'Otabek M.: “Zo‘r xizmat, rahmat!”', time: '1 soat oldin', unread: true },
        { type: 'stock', title: 'Ombor tugayapti', body: 'Pomada (gel) — 3 dona qoldi', time: '3 soat oldin', unread: false },
        { type: 'payment', title: 'To‘lov qabul qilindi', body: '110 000 so‘m — Aziz Karimov (Telegram)', time: '5 soat oldin', unread: false },
      ],
    },
    inv: { sub: 'Ombor va mahsulotlar', add: 'Mahsulot qo‘shish', colName: 'Mahsulot', colCat: 'Turkum', colStock: 'Qoldiq', colPrice: 'Narx', colStatus: 'Holat', inStock: 'Yetarli', low: 'Kam qoldi', out: 'Tugadi', units: 'dona', lowAlerts: 'Kam qolgan mahsulotlar', totalValue: 'Ombor qiymati', items: 'mahsulot', restock: 'To‘ldirish', cats: { hair: 'Soch parvarishi', beard: 'Soqol', tools: 'Asboblar', retail: 'Sotuvga' } },
    today: 'Bugun', week: 'Hafta', day: 'Kun', month: 'Oy',
    biz: 'Barber House', bizType: 'Sartaroshxona · Toshkent',
    branchAll: 'Barcha filiallar', branchesLabel: 'Filiallar',
    branches: [
      { name: 'Yunusobod', type: 'Sartaroshxona · Yunusobod', staff: 4, today: 18 },
      { name: 'Chilonzor', type: 'Sartaroshxona · Chilonzor', staff: 3, today: 12 },
      { name: 'Mirzo Ulug‘bek', type: 'Sartaroshxona · M. Ulug‘bek', staff: 5, today: 21 },
    ],
    auth: {
      title: 'Tizimga kirish',
      tagline: 'Navbat, mijozlar va kassa — bitta joyda.',
      points: ['Kunlik jadval va navbatlar', 'Mijozlar bazasi va tashriflar tarixi', 'Kassa, xizmatlar va xodimlar'],
      show: 'Ko‘rsatish', hide: 'Yashirish',
      help: 'Parolni yo‘qotdingizmi? Biznes egasidan yangi parol so‘rashingiz kerak.',
    },
    roles: { owner: 'Egasi', manager: 'Menejer', specialist: 'Usta', viewAs: 'Ko‘rinish:', roleDesc: { owner: 'To‘liq kirish', manager: 'Navbat, to‘lov va jadval', specialist: 'Faqat o‘z jadvali' } },
    auto: {
      sub: 'Avtomatik eslatma va kampaniyalar', add: 'Qoida qo‘shish', active: 'Faol', sent: 'yuborilgan', trigger: 'Shart', channel: 'Kanal', enabled: 'Yoqilgan', toastOn: 'Qoida yoqildi', toastOff: 'Qoida o‘chirildi',
      rules: [
        { key: 'remind24', title: '24 soat oldin eslatma', desc: 'Navbatdan bir kun oldin Telegram eslatma yuboriladi', trig: 'Navbatdan 24 soat oldin', ch: 'Telegram', sent: 1240, on: true },
        { key: 'remind2', title: '2 soat oldin eslatma', desc: 'Navbatdan 2 soat oldin qisqa eslatma', trig: 'Navbatdan 2 soat oldin', ch: 'Telegram', sent: 980, on: true },
        { key: 'winback', title: 'Qaytarish kampaniyasi', desc: '60 kun kelmagan mijozlarga 20% chegirma', trig: '60 kun faolsizlik', ch: 'Telegram', sent: 312, on: true },
        { key: 'birthday', title: 'Tug‘ilgan kun tabrigi', desc: 'Tug‘ilgan kuni sovg‘a chegirma yuboriladi', trig: 'Mijoz tug‘ilgan kuni', ch: 'Telegram', sent: 86, on: true },
        { key: 'thanks', title: 'Tashrifdan keyin minnatdorchilik', desc: 'Xizmatdan so‘ng sharh so‘rab xabar', trig: 'Tashrifdan 3 soat keyin', ch: 'Telegram', sent: 1530, on: false },
        { key: 'noshow', title: 'Kelmaganlarni qaytarish', desc: 'Kelmay qolgan mijozga qayta yozish taklifi', trig: 'Kelmay qolgandan keyin', ch: 'SMS', sent: 47, on: false },
      ],
    },
    greeting: 'Xush kelibsiz', owner: 'Sardor',
    dash: {
      subtitle: 'Bugungi ko‘rsatkichlar va navbatlar',
      kpis: [
        { l: 'Bugungi tushum', v: '4 250 000', u: 'so‘m', d: '+12%' },
        { l: 'Bugungi navbatlar', v: '18', u: 'ta', d: '+4' },
        { l: 'Bandlik', v: '82', u: '%', d: '+6%' },
        { l: 'Kelmaganlar', v: '3', u: '%', d: '−70%' },
      ],
      revenue: 'Haftalik tushum', revenueSub: 'So‘nggi 7 kun', upcoming: 'Yaqin navbatlar', viewAll: 'Hammasi', recent: 'So‘nggi mijozlar', source: 'Manba', staffToday: 'Bugungi xodimlar', load: 'Yuklama', bookingsBy: 'Xizmat bo‘yicha navbatlar',
    },
    cal: { title: 'Jadval', staffAll: 'Barcha ustalar', addSlot: 'Bo‘sh', booked: 'Band', break: 'Tanaffus', weekdays: ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sh', 'Ya'], weekdaysFull: ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'], monthNames: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'], bookingsWord: 'navbat', moreWord: 'yana' },
    cust: { title: 'Mijozlar', count: 'ta mijoz', add: 'Mijoz qo‘shish', colName: 'Mijoz', colPhone: 'Telefon', colVisits: 'Tashriflar', colSpent: 'Sarflagan', colLast: 'Oxirgi tashrif', colStatus: 'Holat', vip: 'VIP', reg: 'Doimiy', new: 'Yangi', detailVisits: 'Tashriflar', detailSpent: 'Jami sarflagan', detailNoshow: 'Kelmagan', detailUpcoming: 'Kutilmoqda', history: 'Tashriflar tarixi', notes: 'Eslatmalar', book: 'Navbatga yozish', message: 'Xabar yuborish', pref: 'Sevimli usta' },
    staff: { title: 'Xodimlar', add: 'Xodim qo‘shish', role: 'Lavozim', bookings: 'Navbatlar', revenue: 'Tushum', rating: 'Reyting', load: 'Yuklama', today: 'Bugun', schedule: 'Jadval', edit: 'Tahrirlash', slots: 'Slotlar', delete: 'O‘chirish', phone: 'Telefon', photoRemove: 'Rasmni o‘chirish', photoUpload: 'Rasm yuklash', photoReplaceStaff: 'Rasmni almashtirish', noRole: 'Mutaxassis', clients: 'Mijozlar', noClients: 'Hali mijoz yo‘q', clientsSub: 'Bu ustaga yozilgan mijozlar', quick: 'Tez sozlash', from: 'Dan', to: 'Gacha', apply: 'Belgilash', selectAll: 'Hammasi', clearDay: 'Tozalash', copyTo: 'Boshqa kunlarga ko‘chirish', copyAll: 'Barcha kunlarga', copied: 'Ko‘chirildi', slotCount: 'slot', dayOffLabel: 'Dam olish kuni' },
    serv: { title: 'Xizmatlar', add: 'Xizmat qo‘shish', colName: 'Xizmat', colCat: 'Turkum', colDur: 'Davomiyligi', colPrice: 'Narx', noStaff: 'Usta tayinlanmagan', noStaffHint: 'Bu xizmat navbat sahifasida ko‘rinmaydi — uni bajaradigan ustani tanlang.', colBookings: 'Navbatlar', min: 'daq', active: 'faol', archived: 'arxivda', edit: 'Tahrirlash', archive: 'Arxivlash', restore: 'Tiklash', photoHint: 'Rasm yuklash uchun bosing', photoRemove: 'Rasmni o‘chirish', photoReplace: 'Rasmni almashtirish' },
    an: { title: 'Tahlil va hisobot', sub: 'Biznes ko‘rsatkichlari', revenue: 'Tushum dinamikasi', bookings: 'Navbatlar', noshow: 'Kelmaganlar', newCust: 'Yangi mijozlar', topServices: 'Eng ko‘p xizmatlar', topStaff: 'Eng faol ustalar', bySource: 'Manba bo‘yicha', months: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun'], totalRevenue: 'Umumiy tushum', monthRevenue: 'Shu oy', collectedToday: 'Bugun yig‘ildi', outstanding: 'Qarz qoldi' },
    sub: { recommended: 'Tavsiya etiladi', upTo: 'Gacha', staffWord: 'xodim', perMonth: 'oyiga', tooSmall: 'Jamoangiz uchun kichik', choose: 'Tanlash', choosePlan: 'Tarif tanlash', trialOverTitle: 'Bepul oy tugadi', expiredTitle: 'Obuna muddati tugadi', trialOverSub: 'Ishlashda davom etish uchun tarif tanlang.', expiredSub: 'CRM’ga kirishni tiklash uchun tarifni yangilang.', lapsedDays: (n: number) => `${n} kun oldin tugagan.`, trialEndsIn: (n: number) => `Bepul oy tugashiga ${n} kun qoldi.`, planEndsIn: (n: number) => `Obuna tugashiga ${n} kun qoldi.`, bookingStillWorks: 'Mijozlaringizning yozilish sahifasi va Telegram botlar ishlashda davom etmoqda — faqat CRM to‘xtatilgan.' },
    status: { confirmed: 'Tasdiqlangan', pending: 'Kutilmoqda', done: 'Bajarildi', cancelled: 'Bekor qilindi' },
    via: { telegram: 'Telegram', web: 'Veb-sayt', walkin: 'Tashrif', phone: 'Telefon' },
    fin: { sub: 'Kassa va to‘lovlar', today: 'Bugungi tushum', cash: 'Naqd', card: 'Karta', online: 'Onlayn', transfer: 'O‘tkazma', other: 'Boshqa', txns: 'So‘nggi to‘lovlar', byMethod: 'To‘lov usuli bo‘yicha', count: 'ta to‘lov', avgCheck: 'O‘rtacha chek', incoming: 'Kirim', refund: 'Qaytarish', noTxns: 'Bu kunda to‘lovlar yo‘q' },
    rev: { sub: 'Mijozlar baholari', avg: 'O‘rtacha baho', total: 'ta sharh', recent: 'So‘nggi sharhlar', reply: 'Javob berish', replied: 'Javob berildi', all: 'Barchasi', positive: 'Ijobiy', replyPh: 'Javobingizni yozing…', send: 'Yuborish', replyToast: 'Javob yuborildi' },
    mkt: { sub: 'Telegram orqali mijozlarga xabar yuboring', broadcast: 'Telegram tarqatma', audience: 'Auditoriya', segAll: 'Barcha mijozlar', segVip: 'VIP mijozlar', segInactive: 'Nofaol mijozlar', reach: 'qamrov', msg: 'Xabar matni', msgPh: 'Masalan: Shu hafta sochga 20% chegirma! Hoziroq yoziling.', send: 'Tarqatmani yuborish', sent: 'Tarqatma yuborildi', recent: 'So‘nggi kampaniyalar', opened: 'ochildi', templates: 'Tayyor shablonlar', tpl: ['Chegirma e’loni', 'Bo‘sh vaqt bor', 'Yangi xizmat', 'Bayram tabrigi'] },
    loy: { sub: 'Sodiqlik dasturi va chegirmalar', program: 'Sodiqlik dasturi', programDesc: 'Mijozlar har tashrifda ball to‘playdi', earnRule: 'Ball yig‘ish', earnRuleDesc: 'Har 10 000 so‘mga 1 ball', redeem: '100 ball = 50 000 so‘m chegirma', members: 'ta a’zo', points: 'ball', visits: 'tashrif', topClients: 'Eng sodiq mijozlar', tierName: ['Bronza', 'Kumush', 'Oltin'], tierPerk: ['5% chegirma', '10% chegirma + tug‘ilgan kun sovg‘asi', '15% chegirma + VIP navbat'], tierReq: ['0+ ball', '300+ ball', '800+ ball'] },
    pay: { sub: 'Ish haqi va ulush', period: 'Davr', month: 'Shu oy', staff: 'Xodim', servicesDone: 'Xizmatlar', revenue: 'Tushum', commission: 'Ulush', base: 'Stavka', payout: 'To‘lov', total: 'Jami to‘lov', payAll: 'Hammasini to‘lash', paid: 'To‘langan', pay: 'To‘lash', paidToast: 'Ish haqi to‘landi' },
    set: {
      sub: 'Biznes va hisob sozlamalari',
      nav: { profile: 'Biznes profili', booking: 'Navbat sahifasi', hours: 'Ish vaqti', notif: 'Bildirishnomalar', appearance: 'Ko‘rinish', team: 'Jamoa va kirish' },
      profile: 'Biznes profili', profileSub: 'Bu ma’lumotlar navbat sahifangizda ko‘rinadi',
      bizName: 'Biznes nomi', category: 'Soha', phone: 'Telefon', address: 'Manzil', addressPh: 'Ko‘cha, uy, shahar', description: 'Tavsif', schedule: 'Ish vaqti (matn)',
      booking: 'Navbat sahifasi', bookingSub: 'Mijozlar shu havola orqali yoziladi',
      yourLink: 'Sizning havolangiz', copy: 'Nusxa olish', copied: 'Nusxa olindi', open: 'Ochish',
      qr: 'QR-kod', qrSub: 'Mijozlar skanerlab navbatga yoziladi', qrScan: 'Telefon kamerasi bilan skanerlang', download: 'Yuklab olish', print: 'Chop etish',
      links: { publicBooking: 'Sizning navbat sahifangiz', clientBot: 'Mijozlar uchun Telegram bot', ownerBot: 'Egasi uchun Telegram bot' },
      onlineBooking: 'Onlayn navbatni yoqish', onlineBookingD: 'Mijozlar o‘zi navbat olsin',
      confirm: 'Tasdiqlash talab qilinsin', confirmD: 'Har bir navbatni qo‘lda tasdiqlaysiz',
      deposit: 'Oldindan to‘lov (deposit)', depositD: 'Navbat band qilishda qisman to‘lov olinadi', depositAmt: 'Deposit miqdori',
      hours: 'Ish vaqti', hoursSub: 'Qabul qilish soatlari',
      notif: 'Bildirishnomalar', notifSub: 'Telegram va eslatmalar',
      tgReminders: 'Telegram eslatmalari', tgRemindersD: 'Mijozlarga avtomatik eslatma yuboriladi',
      remindBefore: 'Eslatma vaqti', newBookingAlert: 'Yangi navbat bildirishnomasi', newBookingAlertD: 'Yangi navbat tushganda xabar olasiz',
      reviewReq: 'Sharh so‘rovi', reviewReqD: 'Tashrifdan keyin baho so‘raladi',
      appearance: 'Ko‘rinish', appearanceSub: 'Til va mavzu', language: 'Til', theme: 'Mavzu', light: 'Yorug‘', dark: 'Tungi',
      save: 'Saqlash', saved: 'Sozlamalar saqlandi', photoUploaded: 'Rasm yuklandi', photoDeleted: 'Rasm o‘chirildi', logout: 'Hisobdan chiqish', closed: 'Yopiq', hoursPerWeek: 'soat/hafta',
      mins: ['15 daqiqa', '30 daqiqa', '1 soat', '2 soat', '1 kun oldin'],
      credentials: 'CRM kirish', credentialsSub: 'Login va parolni yangilang', username: 'Login', currentPassword: 'Joriy parol', newPassword: 'Yangi parol', confirmPassword: 'Parolni takrorlang', credentialsSave: 'Kirishni saqlash', tempPassword: 'Vaqtinchalik parol ishlatilmoqda',
      team: 'Jamoa va kirish', teamSub: 'Xodimlarga CRM kirish huquqini bering',
      roleManager: 'Menejer', roleSpecialist: 'Usta', roleOwner: 'Egasi',
      roleManagerHint: 'Navbatlar, to‘lovlar, jadval va xizmatlar', roleSpecialistHint: 'Faqat o‘z jadvali',
      grant: 'Kirish berish', resetPass: 'Parolni tiklash', revoke: 'Kirishni o‘chirish', noAccess: 'Kirish yo‘q',
      accessOn: 'Faol', accessOff: 'O‘chirilgan', loginLabel: 'Login', newPassLabel: 'Yangi parol',
      copyCreds: 'Nusxa olish', credsWarn: 'Bu parol boshqa ko‘rsatilmaydi — xodimga hozir yuboring.',
      confirmRevoke: 'Bu xodimning kirishini o‘chirasizmi?', ownerOnly: 'Faqat egasi uchun',
      brand: 'Brend', logoErr_over_storage_cap: 'Rasm juda katta. Sahifani yangilab qayta urinib ko‘ring.', logoErr_empty: 'Bu fayl bo‘sh.', logoErr_too_large: 'Rasm 4 MB dan katta. Kichikroq fayl yuklang.', logoErr_svg_or_html: 'SVG va HTML fayllar qabul qilinmaydi. PNG, JPG yoki WebP yuklang.', logoErr_executable: 'Bu rasm emas, dastur. PNG, JPG yoki WebP yuklang.', logoErr_archive: 'Bu rasm emas, arxiv. PNG, JPG yoki WebP yuklang.', logoErr_pdf: 'Bu rasm emas, PDF. PNG, JPG yoki WebP yuklang.', logoErr_not_an_image: 'Bu fayl PNG, JPG yoki WebP rasm emas.', flow: 'Navbat olish tartibi', flowSub: 'Mijoz nimani birinchi tanlaydi', flowServiceFirst: 'Xizmat, keyin usta', flowServiceFirstHint: 'Mijoz xizmatni tanlaydi, so‘ng ustani', flowStaffFirst: 'Usta, keyin xizmat', flowStaffFirstHint: 'O‘z ustasiga qaytadigan mijozlar uchun', flowTimeFirst: 'Vaqt, keyin xizmat', flowTimeFirstHint: 'Bo‘sh vaqtidan kelib chiqadigan mijozlar uchun', flowServiceOnly: 'Faqat xizmat', flowServiceOnlyHint: 'Ustani mijoz ko‘rmaydi — o‘zimiz tayinlaymiz', logo: 'Logotip', logoSub: 'Navbat sahifasi va CRM’da ko‘rinadi', logoHint: 'PNG yoki JPG, kvadrat rasm eng yaxshi ko‘rinadi. Yuklamasangiz biznes nomining birinchi harfi ishlatiladi.', logoUpload: 'Logotip yuklash', logoReplace: 'Almashtirish', logoRemove: 'O‘chirish', brandSub: 'Navbat sahifangiz shu ranglarda ko‘rinadi', brandCustom: 'O‘z ranglaringiz',
      brandPreview: 'Ko‘rinishi', brandReset: 'Standart ko‘rinish', brandInvalid: 'Rang #1d4ed8 ko‘rinishida bo‘lishi kerak.',
      brandBook: 'Navbatga yozilish',
      brandThemes: 'Tayyor ko‘rinishlar', brandBg: 'Fon', brandInk: 'Matn', brandAccent: 'Tugmalar',
      brandContrast: 'Matn kontrasti', brandContrastOk: 'O‘qish uchun yetarli',
      brandContrastLow: 'Matn bu fonda yaxshi o‘qilmaydi. Matnni to‘qroq yoki fonni ochroq qiling.',
      brandThemeNames: {
        easyq: 'easyQ', paper: 'Oq qog‘oz', sand: 'Qum', mint: 'Yalpiz',
        rose: 'Gul', midnight: 'Yarim tun', noir: 'Qora', forest: 'O‘rmon',
      },
      myPassword: 'Mening parolim', myPasswordSub: 'Faqat siz biladigan parolni o‘rnating',
      changePassword: 'Parolni o‘zgartirish', passwordChanged: 'Parol o‘zgartirildi',
      tempPasswordWarn: 'Siz vaqtinchalik paroldan foydalanmoqdasiz. Iltimos, o‘zingizning parolingizni o‘rnating.',
      passwordShort: 'Parol kamida 8 belgidan iborat bo‘lishi kerak.', passwordMismatch: 'Parollar bir xil emas.',
    },
    tour: {
      next: 'Keyingi', back: 'Orqaga', skip: 'O‘tkazib yuborish', done: 'Boshladik!', goServices: 'Xizmat qo‘shishga o‘tish', replay: 'Qo‘llanma', stepOf: '{n}/{total}',
      steps: [
        { title: 'EasyQ CRM’ga xush kelibsiz', body: 'Keling, asosiy imkoniyatlar bilan bir daqiqada tanishamiz.' },
        { title: 'Biznesingiz', body: 'Bu yerda biznesingiz nomi va turi ko‘rinadi — profilingizdan olinadi.' },
        { title: 'Jadval', body: 'Barcha navbatlaringiz — kun, hafta va usta bo‘yicha shu yerda.' },
        { title: 'Xodimlar', body: 'Jamoangizni qo‘shing va har bir usta uchun ish vaqtini belgilang.' },
        { title: 'Xizmatlar', body: 'Xizmatlar, narx va davomiylikni qo‘shing — mijozlar shularni band qiladi.' },
        { title: 'Sozlamalar', body: 'Navbat havolangiz, QR-kod va CRM login ma’lumotlari shu yerda.' },
        { title: 'Til, mavzu va yordam', body: 'Tilni almashtiring, tungi rejimni yoqing va bu qo‘llanmani “?” tugmasi orqali qayta oching.' },
        { title: 'Tayyor!', body: 'Boshlash uchun birinchi xizmatingizni qo‘shing.' },
      ],
    },
  },

  ru: {
    nav: { dashboard: 'Панель', calendar: 'Расписание', customers: 'Клиенты', staff: 'Сотрудники', services: 'Услуги', inventory: 'Склад', finance: 'Касса', loyalty: 'Лояльность', payroll: 'Зарплата', reviews: 'Отзывы', marketing: 'Маркетинг', automations: 'Автоматизация', analytics: 'Аналитика', branding: 'Брендинг', settings: 'Настройки' },
    search: 'Поиск клиента, записи или услуги…',
    newBooking: 'Новая запись',
    notif: {
      title: 'Уведомления', markAll: 'Отметить все прочитанными', empty: 'Нет новых уведомлений', viewAll: 'Показать все', justNow: 'сейчас', minAgo: 'мин назад', hAgo: 'ч назад',
      items: [
        { type: 'booking', title: 'Новая запись', body: 'Жасур Алиев — Стрижка, сегодня 15:00', time: '2 мин назад', unread: true },
        { type: 'cancel', title: 'Запись отменена', body: 'Дильноза Рашидова отменила 16:30', time: '18 мин назад', unread: true },
        { type: 'review', title: 'Новый отзыв — 5.0', body: 'Отабек М.: «Отличный сервис, спасибо!»', time: '1 ч назад', unread: true },
        { type: 'stock', title: 'Заканчивается на складе', body: 'Помада (гель) — осталось 3 шт', time: '3 ч назад', unread: false },
        { type: 'payment', title: 'Оплата получена', body: '110 000 сум — Азиз Каримов (Telegram)', time: '5 ч назад', unread: false },
      ],
    },
    inv: { sub: 'Склад и товары', add: 'Добавить товар', colName: 'Товар', colCat: 'Категория', colStock: 'Остаток', colPrice: 'Цена', colStatus: 'Статус', inStock: 'В наличии', low: 'Заканчивается', out: 'Нет в наличии', units: 'шт', lowAlerts: 'Заканчивающиеся товары', totalValue: 'Стоимость склада', items: 'товаров', restock: 'Пополнить', cats: { hair: 'Уход за волосами', beard: 'Борода', tools: 'Инструменты', retail: 'На продажу' } },
    today: 'Сегодня', week: 'Неделя', day: 'День', month: 'Месяц',
    biz: 'Barber House', bizType: 'Барбершоп · Ташкент',
    branchAll: 'Все филиалы', branchesLabel: 'Филиалы',
    branches: [
      { name: 'Юнусабад', type: 'Барбершоп · Юнусабад', staff: 4, today: 18 },
      { name: 'Чиланзар', type: 'Барбершоп · Чиланзар', staff: 3, today: 12 },
      { name: 'Мирзо Улугбек', type: 'Барбершоп · М. Улугбек', staff: 5, today: 21 },
    ],
    auth: {
      title: 'Вход в систему',
      tagline: 'Расписание, клиенты и касса — в одном месте.',
      points: ['Расписание дня и записи', 'База клиентов и история визитов', 'Касса, услуги и сотрудники'],
      show: 'Показать', hide: 'Скрыть',
      help: 'Забыли пароль? Его должен выдать заново владелец бизнеса.',
    },
    roles: { owner: 'Владелец', manager: 'Менеджер', specialist: 'Мастер', viewAs: 'Просмотр:', roleDesc: { owner: 'Полный доступ', manager: 'Записи, платежи и график', specialist: 'Только своё расписание' } },
    auto: {
      sub: 'Автонапоминания и кампании', add: 'Добавить правило', active: 'Активно', sent: 'отправлено', trigger: 'Условие', channel: 'Канал', enabled: 'Включено', toastOn: 'Правило включено', toastOff: 'Правило выключено',
      rules: [
        { key: 'remind24', title: 'Напоминание за 24 часа', desc: 'За день до записи отправляется напоминание в Telegram', trig: 'За 24 часа до записи', ch: 'Telegram', sent: 1240, on: true },
        { key: 'remind2', title: 'Напоминание за 2 часа', desc: 'Короткое напоминание за 2 часа до записи', trig: 'За 2 часа до записи', ch: 'Telegram', sent: 980, on: true },
        { key: 'winback', title: 'Кампания возврата', desc: 'Скидка 20% клиентам, не приходившим 60 дней', trig: '60 дней без визита', ch: 'Telegram', sent: 312, on: true },
        { key: 'birthday', title: 'Поздравление с днём рождения', desc: 'В день рождения отправляется скидка-подарок', trig: 'День рождения клиента', ch: 'Telegram', sent: 86, on: true },
        { key: 'thanks', title: 'Благодарность после визита', desc: 'После услуги — сообщение с просьбой об отзыве', trig: 'Через 3 часа после визита', ch: 'Telegram', sent: 1530, on: false },
        { key: 'noshow', title: 'Возврат неявок', desc: 'Предложение перезаписаться тем, кто не пришёл', trig: 'После неявки', ch: 'SMS', sent: 47, on: false },
      ],
    },
    greeting: 'С возвращением', owner: 'Сардор',
    dash: {
      subtitle: 'Показатели и записи на сегодня',
      kpis: [
        { l: 'Выручка за сегодня', v: '4 250 000', u: 'сум', d: '+12%' },
        { l: 'Записей сегодня', v: '18', u: 'шт', d: '+4' },
        { l: 'Заполняемость', v: '82', u: '%', d: '+6%' },
        { l: 'Неявки', v: '3', u: '%', d: '−70%' },
      ],
      revenue: 'Выручка за неделю', revenueSub: 'Последние 7 дней', upcoming: 'Ближайшие записи', viewAll: 'Все', recent: 'Недавние клиенты', source: 'Источник', staffToday: 'Сотрудники сегодня', load: 'Загрузка', bookingsBy: 'Записи по услугам',
    },
    cal: { title: 'Расписание', staffAll: 'Все мастера', addSlot: 'Свободно', booked: 'Занято', break: 'Перерыв', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], weekdaysFull: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'], monthNames: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'], bookingsWord: 'записей', moreWord: 'ещё' },
    cust: { title: 'Клиенты', count: 'клиентов', add: 'Добавить клиента', colName: 'Клиент', colPhone: 'Телефон', colVisits: 'Визиты', colSpent: 'Потрачено', colLast: 'Последний визит', colStatus: 'Статус', vip: 'VIP', reg: 'Постоянный', new: 'Новый', detailVisits: 'Визиты', detailSpent: 'Всего потрачено', detailNoshow: 'Неявки', detailUpcoming: 'Предстоящие', history: 'История визитов', notes: 'Заметки', book: 'Записать', message: 'Написать', pref: 'Любимый мастер' },
    staff: { title: 'Сотрудники', add: 'Добавить сотрудника', role: 'Должность', bookings: 'Записи', revenue: 'Выручка', rating: 'Рейтинг', load: 'Загрузка', today: 'Сегодня', schedule: 'График', edit: 'Изменить', slots: 'Слоты', delete: 'Удалить', phone: 'Телефон', photoRemove: 'Удалить фото', photoUpload: 'Загрузить фото', photoReplaceStaff: 'Заменить фото', noRole: 'Специалист', clients: 'Клиенты', noClients: 'Пока нет клиентов', clientsSub: 'Клиенты, которые записывались к этому мастеру', quick: 'Быстрая настройка', from: 'С', to: 'До', apply: 'Отметить', selectAll: 'Все', clearDay: 'Очистить', copyTo: 'Скопировать на другие дни', copyAll: 'На все дни', copied: 'Скопировано', slotCount: 'слот.', dayOffLabel: 'Выходной' },
    serv: { title: 'Услуги', add: 'Добавить услугу', colName: 'Услуга', colCat: 'Категория', colDur: 'Длительность', colPrice: 'Цена', noStaff: 'Мастер не назначен', noStaffHint: 'Эта услуга не показывается на странице записи — назначьте мастера, который её выполняет.', colBookings: 'Записи', min: 'мин', active: 'активных', archived: 'в архиве', edit: 'Изменить', archive: 'В архив', restore: 'Вернуть', photoHint: 'Нажмите, чтобы загрузить фото', photoRemove: 'Удалить фото', photoReplace: 'Заменить фото' },
    an: { title: 'Аналитика и отчёты', sub: 'Показатели бизнеса', revenue: 'Динамика выручки', bookings: 'Записи', noshow: 'Неявки', newCust: 'Новые клиенты', topServices: 'Топ услуг', topStaff: 'Активные мастера', bySource: 'По источникам', months: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'], totalRevenue: 'Общая выручка', monthRevenue: 'За месяц', collectedToday: 'Собрано сегодня', outstanding: 'Остаток к оплате' },
    sub: { recommended: 'Рекомендуем', upTo: 'До', staffWord: 'сотрудников', perMonth: 'в месяц', tooSmall: 'Мало для вашей команды', choose: 'Выбрать', choosePlan: 'Выбрать тариф', trialOverTitle: 'Бесплатный месяц закончился', expiredTitle: 'Подписка закончилась', trialOverSub: 'Выберите тариф, чтобы продолжить работу.', expiredSub: 'Продлите тариф, чтобы вернуть доступ к CRM.', lapsedDays: (n: number) => `Закончилась ${n} дн. назад.`, trialEndsIn: (n: number) => `Бесплатный месяц заканчивается через ${n} дн.`, planEndsIn: (n: number) => `Подписка заканчивается через ${n} дн.`, bookingStillWorks: 'Страница записи для клиентов и Telegram-боты продолжают работать — остановлен только CRM.' },
    status: { confirmed: 'Подтверждена', pending: 'Ожидает', done: 'Выполнена', cancelled: 'Отменена' },
    via: { telegram: 'Telegram', web: 'Сайт', walkin: 'Визит', phone: 'Телефон' },
    fin: { sub: 'Касса и платежи', today: 'Выручка за сегодня', cash: 'Наличные', card: 'Карта', online: 'Онлайн', transfer: 'Перевод', other: 'Другое', txns: 'Последние платежи', byMethod: 'По способу оплаты', count: 'платежей', avgCheck: 'Средний чек', incoming: 'Поступление', refund: 'Возврат', noTxns: 'За этот день платежей нет' },
    rev: { sub: 'Оценки клиентов', avg: 'Средняя оценка', total: 'отзывов', recent: 'Последние отзывы', reply: 'Ответить', replied: 'Отвечено', all: 'Все', positive: 'Положительные', replyPh: 'Напишите ответ…', send: 'Отправить', replyToast: 'Ответ отправлен' },
    mkt: { sub: 'Отправляйте клиентам сообщения через Telegram', broadcast: 'Telegram-рассылка', audience: 'Аудитория', segAll: 'Все клиенты', segVip: 'VIP-клиенты', segInactive: 'Неактивные клиенты', reach: 'охват', msg: 'Текст сообщения', msgPh: 'Например: На этой неделе скидка 20% на стрижку! Записывайтесь.', send: 'Отправить рассылку', sent: 'Рассылка отправлена', recent: 'Последние кампании', opened: 'открыли', templates: 'Готовые шаблоны', tpl: ['Анонс скидки', 'Есть свободное время', 'Новая услуга', 'Поздравление с праздником'] },
    loy: { sub: 'Программа лояльности и скидки', program: 'Программа лояльности', programDesc: 'Клиенты копят баллы за каждый визит', earnRule: 'Начисление баллов', earnRuleDesc: '1 балл за каждые 10 000 сум', redeem: '100 баллов = скидка 50 000 сум', members: 'участников', points: 'баллов', visits: 'визитов', topClients: 'Самые лояльные клиенты', tierName: ['Бронза', 'Серебро', 'Золото'], tierPerk: ['Скидка 5%', 'Скидка 10% + подарок на день рождения', 'Скидка 15% + VIP-запись'], tierReq: ['0+ баллов', '300+ баллов', '800+ баллов'] },
    pay: { sub: 'Зарплата и комиссия', period: 'Период', month: 'Этот месяц', staff: 'Сотрудник', servicesDone: 'Услуги', revenue: 'Выручка', commission: 'Комиссия', base: 'Ставка', payout: 'Выплата', total: 'Итого к выплате', payAll: 'Выплатить всем', paid: 'Выплачено', pay: 'Выплатить', paidToast: 'Зарплата выплачена' },
    set: {
      sub: 'Настройки бизнеса и аккаунта',
      nav: { profile: 'Профиль бизнеса', booking: 'Страница записи', hours: 'Часы работы', notif: 'Уведомления', appearance: 'Внешний вид', team: 'Команда и доступ' },
      profile: 'Профиль бизнеса', profileSub: 'Эти данные видны на странице записи',
      bizName: 'Название бизнеса', category: 'Отрасль', phone: 'Телефон', address: 'Адрес', addressPh: 'Улица, дом, город', description: 'Описание', schedule: 'График (текст)',
      booking: 'Страница записи', bookingSub: 'Клиенты записываются по этой ссылке',
      yourLink: 'Ваша ссылка', copy: 'Копировать', copied: 'Скопировано', open: 'Открыть',
      qr: 'QR-код', qrSub: 'Клиенты сканируют и записываются', qrScan: 'Наведите камеру телефона', download: 'Скачать', print: 'Печать',
      links: { publicBooking: 'Ваша страница записи', clientBot: 'Telegram-бот для клиентов', ownerBot: 'Telegram-бот для владельца' },
      onlineBooking: 'Включить онлайн-запись', onlineBookingD: 'Клиенты записываются сами',
      confirm: 'Требовать подтверждение', confirmD: 'Вы подтверждаете каждую запись вручную',
      deposit: 'Предоплата (депозит)', depositD: 'При записи берётся частичная оплата', depositAmt: 'Размер депозита',
      hours: 'Часы работы', hoursSub: 'Часы приёма',
      notif: 'Уведомления', notifSub: 'Telegram и напоминания',
      tgReminders: 'Напоминания в Telegram', tgRemindersD: 'Клиентам уходят автоматические напоминания',
      remindBefore: 'Время напоминания', newBookingAlert: 'Уведомление о новой записи', newBookingAlertD: 'Вы получаете сообщение при новой записи',
      reviewReq: 'Запрос отзыва', reviewReqD: 'После визита запрашивается оценка',
      appearance: 'Внешний вид', appearanceSub: 'Язык и тема', language: 'Язык', theme: 'Тема', light: 'Светлая', dark: 'Тёмная',
      save: 'Сохранить', saved: 'Настройки сохранены', photoUploaded: 'Фото загружено', photoDeleted: 'Фото удалено', logout: 'Выйти из аккаунта', closed: 'Закрыто', hoursPerWeek: 'ч/неделю',
      mins: ['15 минут', '30 минут', '1 час', '2 часа', 'за 1 день'],
      credentials: 'Доступ в CRM', credentialsSub: 'Обновите логин и пароль', username: 'Логин', currentPassword: 'Текущий пароль', newPassword: 'Новый пароль', confirmPassword: 'Повторите пароль', credentialsSave: 'Сохранить доступ', tempPassword: 'Используется временный пароль',
      team: 'Команда и доступ', teamSub: 'Выдайте сотрудникам доступ в CRM',
      roleManager: 'Менеджер', roleSpecialist: 'Мастер', roleOwner: 'Владелец',
      roleManagerHint: 'Записи, платежи, график и услуги', roleSpecialistHint: 'Только свой график',
      grant: 'Выдать доступ', resetPass: 'Сбросить пароль', revoke: 'Отключить доступ', noAccess: 'Нет доступа',
      accessOn: 'Активен', accessOff: 'Отключён', loginLabel: 'Логин', newPassLabel: 'Новый пароль',
      copyCreds: 'Скопировать', credsWarn: 'Этот пароль больше не будет показан — отправьте его сотруднику сейчас.',
      confirmRevoke: 'Отключить доступ этому сотруднику?', ownerOnly: 'Только для владельца',
      brand: 'Бренд', logoErr_over_storage_cap: 'Изображение слишком большое. Обновите страницу и попробуйте снова.', logoErr_empty: 'Файл пустой.', logoErr_too_large: 'Изображение больше 4 МБ. Загрузите файл меньше.', logoErr_svg_or_html: 'SVG и HTML не принимаются. Загрузите PNG, JPG или WebP.', logoErr_executable: 'Это программа, а не изображение. Загрузите PNG, JPG или WebP.', logoErr_archive: 'Это архив, а не изображение. Загрузите PNG, JPG или WebP.', logoErr_pdf: 'Это PDF, а не изображение. Загрузите PNG, JPG или WebP.', logoErr_not_an_image: 'Этот файл не является изображением PNG, JPG или WebP.', flow: 'Порядок записи', flowSub: 'Что клиент выбирает первым', flowServiceFirst: 'Услуга, затем мастер', flowServiceFirstHint: 'Клиент выбирает услугу, потом мастера', flowStaffFirst: 'Мастер, затем услуга', flowStaffFirstHint: 'Для клиентов, которые ходят к своему мастеру', flowTimeFirst: 'Время, затем услуга', flowTimeFirstHint: 'Для клиентов, которые идут от свободного времени', flowServiceOnly: 'Только услуга', flowServiceOnlyHint: 'Мастера клиент не видит — назначаем сами', logo: 'Логотип', logoSub: 'Показывается на странице записи и в CRM', logoHint: 'PNG или JPG, лучше всего квадратное изображение. Без загрузки используется первая буква названия.', logoUpload: 'Загрузить логотип', logoReplace: 'Заменить', logoRemove: 'Удалить', brandSub: 'В этих цветах будет ваша страница записи', brandCustom: 'Свои цвета',
      brandPreview: 'Предпросмотр', brandReset: 'Оформление по умолчанию', brandInvalid: 'Цвет должен быть в формате #1d4ed8.',
      brandBook: 'Записаться',
      brandThemes: 'Готовые темы', brandBg: 'Фон', brandInk: 'Текст', brandAccent: 'Кнопки',
      brandContrast: 'Контраст текста', brandContrastOk: 'Читается хорошо',
      brandContrastLow: 'На этом фоне текст плохо читается. Сделайте текст темнее или фон светлее.',
      brandThemeNames: {
        easyq: 'easyQ', paper: 'Бумага', sand: 'Песок', mint: 'Мята',
        rose: 'Роза', midnight: 'Полночь', noir: 'Нуар', forest: 'Лес',
      },
      myPassword: 'Мой пароль', myPasswordSub: 'Задайте пароль, который знаете только вы',
      changePassword: 'Изменить пароль', passwordChanged: 'Пароль изменён',
      tempPasswordWarn: 'Вы используете временный пароль. Задайте свой собственный.',
      passwordShort: 'Пароль должен содержать минимум 8 символов.', passwordMismatch: 'Пароли не совпадают.',
    },
    tour: {
      next: 'Далее', back: 'Назад', skip: 'Пропустить', done: 'Начать!', goServices: 'Перейти к услугам', replay: 'Обучение', stepOf: '{n}/{total}',
      steps: [
        { title: 'Добро пожаловать в EasyQ CRM', body: 'Давайте за минуту познакомимся с основными возможностями.' },
        { title: 'Ваш бизнес', body: 'Здесь отображается название и тип бизнеса — из вашего профиля.' },
        { title: 'Расписание', body: 'Все ваши записи — по дню, неделе и мастеру.' },
        { title: 'Сотрудники', body: 'Добавьте команду и задайте часы работы для каждого мастера.' },
        { title: 'Услуги', body: 'Добавьте услуги, цены и длительность — клиенты записываются на них.' },
        { title: 'Настройки', body: 'Здесь ваша ссылка для записи, QR-код и данные для входа в CRM.' },
        { title: 'Язык, тема и помощь', body: 'Меняйте язык, включайте тёмную тему и открывайте это обучение снова кнопкой «?».' },
        { title: 'Готово!', body: 'Начните с добавления первой услуги.' },
      ],
    },
  },

  en: {
    nav: { dashboard: 'Dashboard', calendar: 'Schedule', customers: 'Customers', staff: 'Staff', services: 'Services', inventory: 'Inventory', finance: 'Cash desk', loyalty: 'Loyalty', payroll: 'Payroll', reviews: 'Reviews', marketing: 'Marketing', automations: 'Automations', analytics: 'Analytics', branding: 'Branding', settings: 'Settings' },
    search: 'Search customer, booking or service…',
    newBooking: 'New booking',
    notif: {
      title: 'Notifications', markAll: 'Mark all as read', empty: 'No new notifications', viewAll: 'View all', justNow: 'just now', minAgo: 'min ago', hAgo: 'h ago',
      items: [
        { type: 'booking', title: 'New booking', body: 'Jasur Aliyev — Haircut, today 3:00 PM', time: '2 min ago', unread: true },
        { type: 'cancel', title: 'Booking cancelled', body: 'Dilnoza Rashidova cancelled 4:30 PM', time: '18 min ago', unread: true },
        { type: 'review', title: 'New review — 5.0', body: 'Otabek M.: “Great service, thank you!”', time: '1 h ago', unread: true },
        { type: 'stock', title: 'Running low in stock', body: 'Pomade (gel) — 3 left', time: '3 h ago', unread: false },
        { type: 'payment', title: 'Payment received', body: '110,000 UZS — Aziz Karimov (Telegram)', time: '5 h ago', unread: false },
      ],
    },
    inv: { sub: 'Inventory & products', add: 'Add product', colName: 'Product', colCat: 'Category', colStock: 'Stock', colPrice: 'Price', colStatus: 'Status', inStock: 'In stock', low: 'Low', out: 'Out of stock', units: 'pcs', lowAlerts: 'Low-stock products', totalValue: 'Inventory value', items: 'products', restock: 'Restock', cats: { hair: 'Hair care', beard: 'Beard', tools: 'Tools', retail: 'Retail' } },
    today: 'Today', week: 'Week', day: 'Day', month: 'Month',
    biz: 'Barber House', bizType: 'Barbershop · Tashkent',
    branchAll: 'All branches', branchesLabel: 'Branches',
    branches: [
      { name: 'Yunusobod', type: 'Barbershop · Yunusobod', staff: 4, today: 18 },
      { name: 'Chilonzor', type: 'Barbershop · Chilonzor', staff: 3, today: 12 },
      { name: 'Mirzo Ulugbek', type: 'Barbershop · M. Ulugbek', staff: 5, today: 21 },
    ],
    auth: {
      title: 'Sign in',
      tagline: 'Bookings, clients and the cash desk — in one place.',
      points: ['The day’s schedule and bookings', 'Client book and visit history', 'Cash desk, services and staff'],
      show: 'Show', hide: 'Hide',
      help: 'Lost your password? The business owner has to issue a new one.',
    },
    roles: { owner: 'Owner', manager: 'Manager', specialist: 'Specialist', viewAs: 'View as:', roleDesc: { owner: 'Full access', manager: 'Bookings, payments & schedules', specialist: 'Own schedule only' } },
    auto: {
      sub: 'Automated reminders & campaigns', add: 'Add rule', active: 'Active', sent: 'sent', trigger: 'Trigger', channel: 'Channel', enabled: 'Enabled', toastOn: 'Rule enabled', toastOff: 'Rule disabled',
      rules: [
        { key: 'remind24', title: '24-hour reminder', desc: 'A Telegram reminder is sent a day before the appointment', trig: '24h before appointment', ch: 'Telegram', sent: 1240, on: true },
        { key: 'remind2', title: '2-hour reminder', desc: 'A short reminder 2 hours before the appointment', trig: '2h before appointment', ch: 'Telegram', sent: 980, on: true },
        { key: 'winback', title: 'Win-back campaign', desc: '20% discount for clients inactive for 60 days', trig: '60 days inactive', ch: 'Telegram', sent: 312, on: true },
        { key: 'birthday', title: 'Birthday greeting', desc: 'A gift discount is sent on the client’s birthday', trig: 'Client’s birthday', ch: 'Telegram', sent: 86, on: true },
        { key: 'thanks', title: 'Post-visit thank-you', desc: 'After the service, a message asking for a review', trig: '3h after visit', ch: 'Telegram', sent: 1530, on: false },
        { key: 'noshow', title: 'No-show recovery', desc: 'Offer a no-show client to rebook', trig: 'After a no-show', ch: 'SMS', sent: 47, on: false },
      ],
    },
    greeting: 'Welcome back', owner: 'Sardor',
    dash: {
      subtitle: 'Today’s metrics and bookings',
      kpis: [
        { l: 'Today’s revenue', v: '4,250,000', u: 'UZS', d: '+12%' },
        { l: 'Bookings today', v: '18', u: '', d: '+4' },
        { l: 'Occupancy', v: '82', u: '%', d: '+6%' },
        { l: 'No-shows', v: '3', u: '%', d: '−70%' },
      ],
      revenue: 'Weekly revenue', revenueSub: 'Last 7 days', upcoming: 'Upcoming bookings', viewAll: 'View all', recent: 'Recent customers', source: 'Source', staffToday: 'Staff today', load: 'Load', bookingsBy: 'Bookings by service',
    },
    cal: { title: 'Schedule', staffAll: 'All specialists', addSlot: 'Free', booked: 'Booked', break: 'Break', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], weekdaysFull: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], bookingsWord: 'bookings', moreWord: 'more' },
    cust: { title: 'Customers', count: 'customers', add: 'Add customer', colName: 'Customer', colPhone: 'Phone', colVisits: 'Visits', colSpent: 'Spent', colLast: 'Last visit', colStatus: 'Status', vip: 'VIP', reg: 'Regular', new: 'New', detailVisits: 'Visits', detailSpent: 'Total spent', detailNoshow: 'No-shows', detailUpcoming: 'Upcoming', history: 'Visit history', notes: 'Notes', book: 'Book', message: 'Message', pref: 'Preferred specialist' },
    staff: { title: 'Staff', add: 'Add staff', role: 'Position', bookings: 'Bookings', revenue: 'Revenue', rating: 'Rating', load: 'Load', today: 'Today', schedule: 'Schedule', edit: 'Edit', slots: 'Slots', delete: 'Delete', phone: 'Phone', photoRemove: 'Remove photo', photoUpload: 'Upload photo', photoReplaceStaff: 'Replace photo', noRole: 'Specialist', clients: 'Clients', noClients: 'No clients yet', clientsSub: 'Clients who have booked with this specialist', quick: 'Quick set', from: 'From', to: 'To', apply: 'Apply', selectAll: 'All', clearDay: 'Clear', copyTo: 'Copy to other days', copyAll: 'All days', copied: 'Copied', slotCount: 'slots', dayOffLabel: 'Day off' },
    serv: { title: 'Services', add: 'Add service', colName: 'Service', colCat: 'Category', colDur: 'Duration', colPrice: 'Price', noStaff: 'No specialist assigned', noStaffHint: 'This service is not shown on your booking page — assign a specialist who performs it.', colBookings: 'Bookings', min: 'min', active: 'active', archived: 'archived', edit: 'Edit', archive: 'Archive', restore: 'Restore', photoHint: 'Click to upload a picture', photoRemove: 'Remove picture', photoReplace: 'Replace picture' },
    an: { title: 'Analytics & reports', sub: 'Business performance', revenue: 'Revenue trend', bookings: 'Bookings', noshow: 'No-shows', newCust: 'New customers', topServices: 'Top services', topStaff: 'Top specialists', bySource: 'By source', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], totalRevenue: 'Total revenue', monthRevenue: 'This month', collectedToday: 'Collected today', outstanding: 'Outstanding' },
    sub: { recommended: 'Recommended', upTo: 'Up to', staffWord: 'staff', perMonth: 'per month', tooSmall: 'Too small for your team', choose: 'Choose', choosePlan: 'Choose a plan', trialOverTitle: 'Your free month is over', expiredTitle: 'Your subscription has expired', trialOverSub: 'Choose a plan to carry on working.', expiredSub: 'Renew to get your CRM back.', lapsedDays: (n: number) => `Expired ${n} days ago.`, trialEndsIn: (n: number) => `Your free month ends in ${n} days.`, planEndsIn: (n: number) => `Your subscription ends in ${n} days.`, bookingStillWorks: 'Your customers’ booking page and the Telegram bots are still running — only the CRM is paused.' },
    status: { confirmed: 'Confirmed', pending: 'Pending', done: 'Done', cancelled: 'Cancelled' },
    via: { telegram: 'Telegram', web: 'Website', walkin: 'Walk-in', phone: 'Phone' },
    fin: { sub: 'Cash desk & payments', today: 'Today’s revenue', cash: 'Cash', card: 'Card', online: 'Online', transfer: 'Transfer', other: 'Other', txns: 'Recent payments', byMethod: 'By payment method', count: 'payments', avgCheck: 'Avg. check', incoming: 'Incoming', refund: 'Refund', noTxns: 'No payments on this day' },
    rev: { sub: 'Customer ratings', avg: 'Average rating', total: 'reviews', recent: 'Recent reviews', reply: 'Reply', replied: 'Replied', all: 'All', positive: 'Positive', replyPh: 'Write your reply…', send: 'Send', replyToast: 'Reply sent' },
    mkt: { sub: 'Message your customers through Telegram', broadcast: 'Telegram broadcast', audience: 'Audience', segAll: 'All customers', segVip: 'VIP customers', segInactive: 'Inactive customers', reach: 'reach', msg: 'Message text', msgPh: 'e.g. 20% off haircuts this week! Book now.', send: 'Send broadcast', sent: 'Broadcast sent', recent: 'Recent campaigns', opened: 'opened', templates: 'Quick templates', tpl: ['Discount announcement', 'Free slots available', 'New service', 'Holiday greeting'] },
    loy: { sub: 'Loyalty program & discounts', program: 'Loyalty program', programDesc: 'Customers earn points on every visit', earnRule: 'Earning points', earnRuleDesc: '1 point per 10,000 UZS', redeem: '100 points = 50,000 UZS discount', members: 'members', points: 'points', visits: 'visits', topClients: 'Most loyal customers', tierName: ['Bronze', 'Silver', 'Gold'], tierPerk: ['5% discount', '10% discount + birthday gift', '15% discount + VIP booking'], tierReq: ['0+ points', '300+ points', '800+ points'] },
    pay: { sub: 'Payroll & commission', period: 'Period', month: 'This month', staff: 'Staff', servicesDone: 'Services', revenue: 'Revenue', commission: 'Commission', base: 'Base', payout: 'Payout', total: 'Total payout', payAll: 'Pay everyone', paid: 'Paid', pay: 'Pay', paidToast: 'Payroll paid out' },
    set: {
      sub: 'Business & account settings',
      nav: { profile: 'Business profile', booking: 'Booking page', hours: 'Working hours', notif: 'Notifications', appearance: 'Appearance', team: 'Team & access' },
      profile: 'Business profile', profileSub: 'This appears on your booking page',
      bizName: 'Business name', category: 'Industry', phone: 'Phone', address: 'Address', addressPh: 'Street, building, city', description: 'Description', schedule: 'Schedule (text)',
      booking: 'Booking page', bookingSub: 'Customers book through this link',
      yourLink: 'Your link', copy: 'Copy', copied: 'Copied', open: 'Open',
      qr: 'QR code', qrSub: 'Customers scan it to book', qrScan: 'Scan with your phone camera', download: 'Download', print: 'Print',
      links: { publicBooking: 'Your booking page', clientBot: 'Telegram bot for customers', ownerBot: 'Telegram bot for the owner' },
      onlineBooking: 'Enable online booking', onlineBookingD: 'Let customers book themselves',
      confirm: 'Require confirmation', confirmD: 'You approve each booking manually',
      deposit: 'Prepayment (deposit)', depositD: 'Take a partial payment at booking', depositAmt: 'Deposit amount',
      hours: 'Working hours', hoursSub: 'Opening hours',
      notif: 'Notifications', notifSub: 'Telegram & reminders',
      tgReminders: 'Telegram reminders', tgRemindersD: 'Automatic reminders are sent to customers',
      remindBefore: 'Remind before', newBookingAlert: 'New booking alert', newBookingAlertD: 'You get a message on every new booking',
      reviewReq: 'Review request', reviewReqD: 'Ask for a rating after the visit',
      appearance: 'Appearance', appearanceSub: 'Language & theme', language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark',
      save: 'Save changes', saved: 'Settings saved', photoUploaded: 'Photo uploaded', photoDeleted: 'Photo removed', logout: 'Log out', closed: 'Closed', hoursPerWeek: 'h/week',
      mins: ['15 minutes', '30 minutes', '1 hour', '2 hours', '1 day before'],
      credentials: 'CRM access', credentialsSub: 'Update your login and password', username: 'Username', currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Repeat password', credentialsSave: 'Save access', tempPassword: 'A temporary password is in use',
      team: 'Team & access', teamSub: 'Give your staff access to the CRM',
      roleManager: 'Manager', roleSpecialist: 'Specialist', roleOwner: 'Owner',
      roleManagerHint: 'Bookings, payments, schedules and services', roleSpecialistHint: 'Their own schedule only',
      grant: 'Give access', resetPass: 'Reset password', revoke: 'Turn off access', noAccess: 'No access',
      accessOn: 'Active', accessOff: 'Turned off', loginLabel: 'Username', newPassLabel: 'New password',
      copyCreds: 'Copy', credsWarn: 'This password will not be shown again — send it to your staff member now.',
      confirmRevoke: 'Turn off access for this employee?', ownerOnly: 'Owner only',
      brand: 'Branding', logoErr_over_storage_cap: 'That image is too large. Reload the page and try again.', logoErr_empty: 'That file is empty.', logoErr_too_large: 'That image is larger than 4 MB. Please upload a smaller file.', logoErr_svg_or_html: 'SVG and HTML files are not accepted. Please upload a PNG, JPG or WebP.', logoErr_executable: 'That is a program, not an image. Please upload a PNG, JPG or WebP.', logoErr_archive: 'That is an archive, not an image. Please upload a PNG, JPG or WebP.', logoErr_pdf: 'That is a PDF, not an image. Please upload a PNG, JPG or WebP.', logoErr_not_an_image: 'That file is not a PNG, JPG or WebP image.', flow: 'Booking order', flowSub: 'What the customer chooses first', flowServiceFirst: 'Service, then specialist', flowServiceFirstHint: 'The customer picks a service, then who does it', flowStaffFirst: 'Specialist, then service', flowStaffFirstHint: 'For customers who come back to one person', flowTimeFirst: 'Time, then service', flowTimeFirstHint: 'For customers who start from when they are free', flowServiceOnly: 'Service only', flowServiceOnlyHint: 'The specialist is never shown — you assign them', logo: 'Logo', logoSub: 'Shown on your booking page and in the CRM', logoHint: 'PNG or JPG; a square image works best. Without one, the first letter of the business name is used.', logoUpload: 'Upload logo', logoReplace: 'Replace', logoRemove: 'Remove', brandSub: 'Your booking page is shown in these colours', brandCustom: 'Your own colours',
      brandPreview: 'Preview', brandReset: 'Default look', brandInvalid: 'Colour must look like #1d4ed8.',
      brandBook: 'Book an appointment',
      brandThemes: 'Ready-made themes', brandBg: 'Background', brandInk: 'Text', brandAccent: 'Buttons',
      brandContrast: 'Text contrast', brandContrastOk: 'Comfortable to read',
      brandContrastLow: 'Text will be hard to read on this background. Darken the text or lighten the background.',
      brandThemeNames: {
        easyq: 'easyQ', paper: 'Paper', sand: 'Sand', mint: 'Mint',
        rose: 'Rose', midnight: 'Midnight', noir: 'Noir', forest: 'Forest',
      },
      myPassword: 'My password', myPasswordSub: 'Set a password only you know',
      changePassword: 'Change password', passwordChanged: 'Password changed',
      tempPasswordWarn: 'You are using a temporary password. Please set your own.',
      passwordShort: 'Password must be at least 8 characters.', passwordMismatch: 'Passwords do not match.',
    },
    tour: {
      next: 'Next', back: 'Back', skip: 'Skip', done: 'Get started!', goServices: 'Go to Services', replay: 'Take the tour', stepOf: '{n}/{total}',
      steps: [
        { title: 'Welcome to EasyQ CRM', body: 'Let’s take a one-minute tour of the essentials.' },
        { title: 'Your business', body: 'Your business name and type show here — pulled from your profile.' },
        { title: 'Schedule', body: 'All your bookings — by day, week and specialist.' },
        { title: 'Staff', body: 'Add your team and set each specialist’s working hours.' },
        { title: 'Services', body: 'Add your services, prices and durations — clients book these.' },
        { title: 'Settings', body: 'Your booking link, QR code and CRM login live here.' },
        { title: 'Language, theme & help', body: 'Switch language, toggle dark mode, and reopen this tour anytime with the “?” button.' },
        { title: 'All set!', body: 'Start by adding your first service.' },
      ],
    },
  },
};

export const CRM_M: Record<Lang, any> = {
  uz: {
    cancel: 'Bekor qilish',
    booking: { title: 'Yangi navbat', sub: 'Mijoz uchun navbatni qo‘lda qo‘shing', customer: 'Mijoz', service: 'Xizmat', staff: 'Usta', date: 'Sana', time: 'Vaqt', note: 'Izoh', notePh: 'Qo‘shimcha izoh…', submit: 'Navbat yaratish', pick: 'Tanlang', existing: 'Mavjud mijozlar', newClient: 'Yangi mijoz', visits: 'tashrif', clash: 'Bu vaqt allaqachon band — baribir qo‘shish mumkin.' },
    customer: { title: 'Mijoz qo‘shish', sub: 'Yangi mijoz ma’lumotlari', name: 'Ism-familiya', namePh: 'Masalan, Jasur Aliyev', phone: 'Telefon', tier: 'Toifa', source: 'Manba', note: 'Izoh', notePh: 'Eslatma…', submit: 'Mijozni qo‘shish' },
    service: { title: 'Xizmat qo‘shish', sub: 'Yangi xizmat ma’lumotlari', category: 'Turkum', categoryPh: 'Masalan, Soch', name: 'Xizmat nomi', namePh: 'Masalan, Soch olish', cat: 'Turkum', dur: 'Davomiyligi', price: 'Narx', min: 'daqiqa', submit: 'Xizmatni qo‘shish', staff: 'Ustalar' },
    staff: { title: 'Xodim qo‘shish', sub: 'Yangi xodim ma’lumotlari', name: 'Ism-familiya', namePh: 'Masalan, Sardor Karimov', role: 'Lavozim', rolePh: 'Masalan, Usta', phone: 'Telefon', access: 'CRM kirish', accessNone: 'Kirish yo‘q', accessHint: 'Bu odam CRM’da nima qila oladi', services: 'Ko‘rsatadigan xizmatlar', servicesHint: 'Bu usta bajaradigan xizmatlarni belgilang', selected: 'ta tanlandi', submit: 'Xodimni qo‘shish' },
    product: { title: 'Mahsulot qo‘shish', sub: 'Yangi ombor mahsuloti', name: 'Mahsulot nomi', namePh: 'Masalan, Pomada (gel)', cat: 'Turkum', stock: 'Boshlang‘ich qoldiq', min: 'Minimal zaxira', price: 'Narx', units: 'dona', submit: 'Mahsulotni qo‘shish', cats: { hair: 'Soch parvarishi', beard: 'Soqol', tools: 'Asboblar', retail: 'Sotuvga' } },
    rule: { title: 'Avtomatlashtirish qoidasi', sub: 'Yangi eslatma yoki kampaniya', name: 'Qoida nomi', namePh: 'Masalan, 24 soat oldin eslatma', trigger: 'Shart (trigger)', channel: 'Kanal', submit: 'Qoidani qo‘shish', triggers: { before24: 'Navbatdan 24 soat oldin', before2: 'Navbatdan 2 soat oldin', after: 'Tashrifdan keyin', inactive: '60 kun faolsizlik', birthday: 'Tug‘ilgan kun' } },
    tiers: { vip: 'VIP', reg: 'Doimiy', new: 'Yangi' },
    via: { telegram: 'Telegram', web: 'Veb', walkin: 'Tashrif', phone: 'Telefon' },
    cats: { hair: 'Soch', beard: 'Soqol' },
    roles: { barber: 'Sartarosh', stylist: 'Stilist' },
    saved: 'Saqlandi',
  },
  ru: {
    cancel: 'Отмена',
    booking: { title: 'Новая запись', sub: 'Добавьте запись для клиента вручную', customer: 'Клиент', service: 'Услуга', staff: 'Мастер', date: 'Дата', time: 'Время', note: 'Комментарий', notePh: 'Дополнительно…', submit: 'Создать запись', pick: 'Выберите', existing: 'Существующие клиенты', newClient: 'Новый клиент', visits: 'визит.', clash: 'Это время уже занято — запись всё равно можно создать.' },
    customer: { title: 'Добавить клиента', sub: 'Данные нового клиента', name: 'Имя и фамилия', namePh: 'Например, Жасур Алиев', phone: 'Телефон', tier: 'Категория', source: 'Источник', note: 'Заметка', notePh: 'Заметка…', submit: 'Добавить клиента' },
    service: { title: 'Добавить услугу', sub: 'Данные новой услуги', category: 'Категория', categoryPh: 'Например, Волосы', name: 'Название услуги', namePh: 'Например, Стрижка', cat: 'Категория', dur: 'Длительность', price: 'Цена', min: 'минут', submit: 'Добавить услугу', staff: 'Мастера' },
    staff: { title: 'Добавить сотрудника', sub: 'Данные нового сотрудника', name: 'Имя и фамилия', namePh: 'Например, Сардор Каримов', role: 'Должность', rolePh: 'Например, Мастер', phone: 'Телефон', access: 'Доступ в CRM', accessNone: 'Нет доступа', accessHint: 'Что этот человек может делать в CRM', services: 'Оказываемые услуги', servicesHint: 'Отметьте услуги, которые выполняет этот мастер', selected: 'выбрано', submit: 'Добавить сотрудника' },
    product: { title: 'Добавить товар', sub: 'Новый товар на складе', name: 'Название товара', namePh: 'Например, Помада (гель)', cat: 'Категория', stock: 'Начальный остаток', min: 'Мин. запас', price: 'Цена', units: 'шт', submit: 'Добавить товар', cats: { hair: 'Уход за волосами', beard: 'Борода', tools: 'Инструменты', retail: 'На продажу' } },
    rule: { title: 'Правило автоматизации', sub: 'Новое напоминание или кампания', name: 'Название правила', namePh: 'Например, Напоминание за 24 часа', trigger: 'Условие (триггер)', channel: 'Канал', submit: 'Добавить правило', triggers: { before24: 'За 24 часа до записи', before2: 'За 2 часа до записи', after: 'После визита', inactive: '60 дней без визита', birthday: 'День рождения' } },
    tiers: { vip: 'VIP', reg: 'Постоянный', new: 'Новый' },
    via: { telegram: 'Telegram', web: 'Сайт', walkin: 'Визит', phone: 'Телефон' },
    cats: { hair: 'Волосы', beard: 'Борода' },
    roles: { barber: 'Барбер', stylist: 'Стилист' },
    saved: 'Сохранено',
  },
  en: {
    cancel: 'Cancel',
    booking: { title: 'New booking', sub: 'Add a booking for a customer manually', customer: 'Customer', service: 'Service', staff: 'Specialist', date: 'Date', time: 'Time', note: 'Note', notePh: 'Additional note…', submit: 'Create booking', pick: 'Select', existing: 'Existing customers', newClient: 'New customer', visits: 'visits', clash: 'That time is already booked — you can still add it.' },
    customer: { title: 'Add customer', sub: 'New customer details', name: 'Full name', namePh: 'e.g. Jasur Aliyev', phone: 'Phone', tier: 'Tier', source: 'Source', note: 'Note', notePh: 'Note…', submit: 'Add customer' },
    service: { title: 'Add service', sub: 'New service details', category: 'Category', categoryPh: 'e.g. Hair', name: 'Service name', namePh: 'e.g. Haircut', cat: 'Category', dur: 'Duration', price: 'Price', min: 'minutes', submit: 'Add service', staff: 'Specialists' },
    staff: { title: 'Add staff', sub: 'New staff member details', name: 'Full name', namePh: 'e.g. Sardor Karimov', role: 'Position', rolePh: 'e.g. Barber', phone: 'Phone', access: 'CRM access', accessNone: 'No access', accessHint: 'What this person can do in the CRM', services: 'Services performed', servicesHint: 'Select the services this specialist provides', selected: 'selected', submit: 'Add staff member' },
    product: { title: 'Add product', sub: 'New inventory product', name: 'Product name', namePh: 'e.g. Pomade (gel)', cat: 'Category', stock: 'Starting stock', min: 'Min. stock', price: 'Price', units: 'pcs', submit: 'Add product', cats: { hair: 'Hair care', beard: 'Beard', tools: 'Tools', retail: 'Retail' } },
    rule: { title: 'Automation rule', sub: 'New reminder or campaign', name: 'Rule name', namePh: 'e.g. 24-hour reminder', trigger: 'Trigger', channel: 'Channel', submit: 'Add rule', triggers: { before24: '24h before appointment', before2: '2h before appointment', after: 'After a visit', inactive: '60 days inactive', birthday: 'Birthday' } },
    tiers: { vip: 'VIP', reg: 'Regular', new: 'New' },
    via: { telegram: 'Telegram', web: 'Web', walkin: 'Walk-in', phone: 'Phone' },
    cats: { hair: 'Hair', beard: 'Beard' },
    roles: { barber: 'Barber', stylist: 'Stylist' },
    saved: 'Saved',
  },
};

export type ModalState = { type: string; [key: string]: any } | null;

export type CRMContextValue = {
  lang: Lang;
  t: any;
  m: any;
  bizName: string;
  bizType: string;
  /**
   * Cache-busting token for `/api/business/photo`, or null when no logo is uploaded.
   * `payload.generatedAt`, so replacing the logo changes the URL and the browser refetches.
   */
  logoVersion: string | null;
  /** true only in the public landing embed (?embed=1) — gates all demo/mock UI. */
  demo: boolean;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (th: Theme) => void;
  openModal: (type: string, extra?: Record<string, any>) => void;
  notify: (msg?: string) => void;
  branch: number;
  setBranch: (b: number) => void;
  role: Role;
  staffName: string | null;
  /** This actor is still on an issued temporary password and should replace it. */
  isTemporaryPassword: boolean;
  /** Demo only. The real CRM's role comes from the signed session and is not settable. */
  setRole?: (r: Role) => void;
  allowed: string[] | null;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  logout: () => void;
  startTour: () => void;
};

export const CRMCtx = createContext<CRMContextValue | null>(null);

export function useCRM(): CRMContextValue {
  const v = useContext(CRMCtx);
  if (!v) throw new Error('useCRM must be used within CRMCtx provider');
  return v;
}
