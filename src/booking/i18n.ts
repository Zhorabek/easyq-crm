// Copy for the public booking page.
//
// Separate from src/crm/i18n.tsx on purpose: that dictionary is written for the owner
// ("Собрано за день", "Утилизация"), and a client should never see admin vocabulary.

export type BookingLang = "uz" | "ru" | "en";

export const BOOKING_LANGS: BookingLang[] = ["uz", "ru", "en"];
export const LANG_LABEL: Record<BookingLang, string> = { uz: "O‘z", ru: "Рус", en: "Eng" };

/**
 * A client arrives with no stored preference, so guess from the browser and let them
 * override. Uzbek is the fallback rather than English — this is an Uzbekistan product,
 * and `ru` covers the large Russian-reading population.
 */
export function detectLang(): BookingLang {
  try {
    const stored = localStorage.getItem("easyq_booking_lang");
    if (stored === "uz" || stored === "ru" || stored === "en") return stored;
  } catch {
    // Private-mode browsers throw on localStorage; fall through to detection.
  }

  const tags = typeof navigator === "undefined" ? [] : [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    const code = String(tag ?? "").slice(0, 2).toLowerCase();
    if (code === "ru") return "ru";
    if (code === "uz") return "uz";
    if (code === "en") return "en";
  }
  return "uz";
}

export function rememberLang(lang: BookingLang) {
  try {
    localStorage.setItem("easyq_booking_lang", lang);
  } catch {
    // Not worth surfacing — the choice simply will not persist.
  }
}

type Copy = {
  book: string;
  service: string;
  specialist: string;
  date: string;
  time: string;
  yourDetails: string;
  name: string;
  namePh: string;
  phone: string;
  notes: string;
  notesPh: string;
  confirm: string;
  submitting: string;
  anySpecialist: string;
  minutes: string;
  today: string;
  tomorrow: string;
  noSlots: string;
  noSlotsHint: string;
  pickServiceForTimes: string;
  pickServiceForTimesHint: string;
  pickStaffForTimes: string;
  pickStaffForTimesHint: string;
  noServices: string;
  loading: string;
  back: string;
  /** Confirmation screen */
  doneTitle: string;
  doneSub: string;
  addAnother: string;
  /** Errors, keyed to the API's `code` */
  errSlotTaken: string;
  errRateLimited: string;
  errName: string;
  errPhone: string;
  errGeneric: string;
  weekdays: string[];
  months: string[];
  /** Entry menu — the customer chooses which step to start from. */
  chooseStaff: string;
  chooseDate: string;
  chooseService: string;
  /** Step screens */
  detailsTitle: string;
  nearest: string;
  partDay: string;
  partEvening: string;
  partMorning: string;
  total: string;
  done: string;
  change: string;
  email: string;
  emailPh: string;
  notChosen: string;
  allCategories: string;
  searchPh: string;
  servicesCount: string;
  hours: string;
  otherTime: string;
  busyAt: string;
};

export const T: Record<BookingLang, Copy> = {
  uz: {
    book: "Navbatga yozilish",
    service: "Xizmatni tanlang",
    specialist: "Ustani tanlang",
    date: "Kunni tanlang",
    time: "Vaqtni tanlang",
    yourDetails: "Ma’lumotlaringiz",
    name: "Ism-familiya",
    namePh: "Masalan, Jasur Aliyev",
    phone: "Telefon raqami",
    notes: "Izoh",
    notesPh: "Qo‘shimcha ma’lumot (majburiy emas)",
    confirm: "Navbatni tasdiqlash",
    submitting: "Yuborilmoqda…",
    anySpecialist: "Farqi yo‘q",
    minutes: "daq",
    today: "Bugun",
    tomorrow: "Ertaga",
    noSlots: "Bu kunga bo‘sh vaqt yo‘q",
    noSlotsHint: "Boshqa kunni yoki ustani tanlab ko‘ring.",
    pickServiceForTimes: "Avval xizmatni tanlang",
    pickServiceForTimesHint: "Bo‘sh vaqtlar xizmat davomiyligiga qarab ko‘rsatiladi.",
    pickStaffForTimes: "Endi ustani tanlang",
    pickStaffForTimesHint: "Har bir ustaning o‘z ish vaqti bor.",
    noServices: "Hozircha xizmatlar qo‘shilmagan.",
    loading: "Yuklanmoqda…",
    back: "Orqaga",
    doneTitle: "Navbat band qilindi",
    doneSub: "Tez orada siz bilan bog‘lanamiz.",
    addAnother: "Yana navbat olish",
    errSlotTaken: "Bu vaqtni allaqachon band qilishdi. Boshqa vaqtni tanlang.",
    errRateLimited: "Bu raqamdan bugunga juda ko‘p navbat olindi.",
    errName: "Ism-familiyani kiriting.",
    errPhone: "To‘g‘ri telefon raqamini kiriting.",
    errGeneric: "Navbatni saqlab bo‘lmadi. Qaytadan urinib ko‘ring.",
    weekdays: ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"],
    months: ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"],
    chooseStaff: "Ustani tanlash",
    chooseDate: "Sana va vaqtni tanlash",
    chooseService: "Xizmatlarni tanlash",
    detailsTitle: "Navbat tafsilotlari",
    nearest: "Eng yaqin bo‘sh vaqt",
    partMorning: "Ertalab",
    partDay: "Kunduzi",
    partEvening: "Kechqurun",
    total: "Jami",
    done: "Tayyor",
    change: "O‘zgartirish",
    email: "Email",
    emailPh: "Majburiy emas",
    notChosen: "Tanlanmagan",
    allCategories: "Barchasi",
    searchPh: "Qidirish",
    servicesCount: "xizmat",
    hours: "soat",
    otherTime: "Boshqa vaqtga",
    busyAt: "Bu vaqtda band",
  },
  ru: {
    book: "Записаться",
    service: "Выберите услугу",
    specialist: "Выберите мастера",
    date: "Выберите день",
    time: "Выберите время",
    yourDetails: "Ваши данные",
    name: "Имя и фамилия",
    namePh: "Например, Жасур Алиев",
    phone: "Номер телефона",
    notes: "Комментарий",
    notesPh: "Дополнительно (необязательно)",
    confirm: "Подтвердить запись",
    submitting: "Отправляем…",
    anySpecialist: "Любой мастер",
    minutes: "мин",
    today: "Сегодня",
    tomorrow: "Завтра",
    noSlots: "На этот день нет свободного времени",
    noSlotsHint: "Попробуйте другой день или мастера.",
    pickServiceForTimes: "Сначала выберите услугу",
    pickServiceForTimesHint: "Свободное время зависит от длительности услуги.",
    pickStaffForTimes: "Теперь выберите мастера",
    pickStaffForTimesHint: "У каждого мастера своё расписание.",
    noServices: "Услуги пока не добавлены.",
    loading: "Загрузка…",
    back: "Назад",
    doneTitle: "Вы записаны",
    doneSub: "Мы свяжемся с вами в ближайшее время.",
    addAnother: "Записаться ещё раз",
    errSlotTaken: "Это время уже заняли. Выберите другое.",
    errRateLimited: "С этого номера уже слишком много записей на сегодня.",
    errName: "Укажите имя и фамилию.",
    errPhone: "Укажите корректный номер телефона.",
    errGeneric: "Не удалось сохранить запись. Попробуйте снова.",
    weekdays: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    chooseStaff: "Выбрать специалиста",
    chooseDate: "Выбрать дату и время",
    chooseService: "Выбрать услуги",
    detailsTitle: "Детали записи",
    nearest: "Ближайшее время для записи",
    partMorning: "Утро",
    partDay: "День",
    partEvening: "Вечер",
    total: "Итого",
    done: "Готово",
    change: "Изменить",
    email: "Email",
    emailPh: "Необязательно",
    notChosen: "Не выбрано",
    allCategories: "Все",
    searchPh: "Найти",
    servicesCount: "услуги",
    hours: "ч",
    otherTime: "На другое время",
    busyAt: "Занят в это время",
  },
  en: {
    book: "Book an appointment",
    service: "Choose a service",
    specialist: "Choose a specialist",
    date: "Choose a day",
    time: "Choose a time",
    yourDetails: "Your details",
    name: "Full name",
    namePh: "e.g. Jasur Aliyev",
    phone: "Phone number",
    notes: "Notes",
    notesPh: "Anything else (optional)",
    confirm: "Confirm booking",
    submitting: "Sending…",
    anySpecialist: "Any specialist",
    minutes: "min",
    today: "Today",
    tomorrow: "Tomorrow",
    noSlots: "No free times on this day",
    noSlotsHint: "Try another day or specialist.",
    pickServiceForTimes: "Choose a service first",
    pickServiceForTimesHint: "Available times depend on how long the service takes.",
    pickStaffForTimes: "Now choose a specialist",
    pickStaffForTimesHint: "Each specialist keeps their own hours.",
    noServices: "No services have been added yet.",
    loading: "Loading…",
    back: "Back",
    doneTitle: "You're booked",
    doneSub: "We'll be in touch shortly.",
    addAnother: "Book again",
    errSlotTaken: "That time was just taken. Please pick another.",
    errRateLimited: "Too many bookings from this number for today.",
    errName: "Please enter your name.",
    errPhone: "Please enter a valid phone number.",
    errGeneric: "Could not save the booking. Please try again.",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    chooseStaff: "Choose a specialist",
    chooseDate: "Choose date and time",
    chooseService: "Choose services",
    detailsTitle: "Booking details",
    nearest: "Next available",
    partMorning: "Morning",
    partDay: "Afternoon",
    partEvening: "Evening",
    total: "Total",
    done: "Done",
    change: "Change",
    email: "Email",
    emailPh: "Optional",
    notChosen: "Not chosen",
    allCategories: "All",
    searchPh: "Search",
    servicesCount: "services",
    hours: "h",
    otherTime: "Another time",
    busyAt: "Busy at this time",
  },
};

/** Maps the API's error `code` onto copy, falling back to the generic message. */
export function errorCopy(copy: Copy, code: string | undefined) {
  switch (code) {
    case "slot_taken":
      return copy.errSlotTaken;
    case "rate_limited":
      return copy.errRateLimited;
    case "invalid_name":
      return copy.errName;
    case "invalid_phone":
      return copy.errPhone;
    default:
      return copy.errGeneric;
  }
}
