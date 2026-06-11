import type { Lang } from './i18n';

export type StaffItem = { id: number; name: string; roleKey: string; color: string; av: string; bookings: number; revenue: string; rating: number; load: number };
export type ServiceItem = { id: number; key: string; catKey: string; dur: number; price: string; bookings: number; color: string };
export type CustomerItem = { id: number; name: string; phone: string; visits: number; spent: string; last: string; tier: string; via: string; av: string; staff: number };
export type InventoryItem = { id: number; key: string; catKey: string; stock: number; min: number; price: string; color: string };

export const STAFF: StaffItem[] = [
  { id: 1, name: 'Sardor Karimov', roleKey: 'barber', color: '#84A92E', av: '#CBA988', bookings: 142, revenue: '12.4M', rating: 4.9, load: 92 },
  { id: 2, name: 'Bekzod Tursunov', roleKey: 'barber', color: '#3B82F6', av: '#7BB7E8', bookings: 118, revenue: '9.8M', rating: 4.8, load: 81 },
  { id: 3, name: 'Aziz Komilov', roleKey: 'barber', color: '#8B5CF6', av: '#C9A6E8', bookings: 96, revenue: '7.6M', rating: 4.7, load: 74 },
  { id: 4, name: 'Jahongir N.', roleKey: 'stylist', color: '#F59E0B', av: '#E8B57B', bookings: 64, revenue: '5.1M', rating: 4.9, load: 58 },
];

export const ROLE: Record<Lang, Record<string, string>> = {
  uz: { barber: 'Sartarosh', stylist: 'Stilist' },
  ru: { barber: 'Барбер', stylist: 'Стилист' },
  en: { barber: 'Barber', stylist: 'Stylist' },
};

export const SERVICES: ServiceItem[] = [
  { id: 1, key: 'haircut', catKey: 'hair', dur: 45, price: '80 000', bookings: 312, color: '#84A92E' },
  { id: 2, key: 'beard', catKey: 'beard', dur: 20, price: '40 000', bookings: 208, color: '#3B82F6' },
  { id: 3, key: 'combo', catKey: 'hair', dur: 60, price: '110 000', bookings: 261, color: '#8B5CF6' },
  { id: 4, key: 'kids', catKey: 'hair', dur: 30, price: '55 000', bookings: 96, color: '#F59E0B' },
  { id: 5, key: 'shave', catKey: 'beard', dur: 30, price: '60 000', bookings: 74, color: '#14B8A6' },
  { id: 6, key: 'style', catKey: 'hair', dur: 40, price: '70 000', bookings: 53, color: '#F43F5E' },
];

export const SERV_NAME: Record<Lang, Record<string, string>> = {
  uz: { haircut: 'Soch olish', beard: 'Soqol olish', combo: 'Soch + soqol', kids: 'Bolalar', shave: 'Ustara bilan olish', style: 'Soch turmagi' },
  ru: { haircut: 'Стрижка', beard: 'Борода', combo: 'Стрижка + борода', kids: 'Детская', shave: 'Бритьё', style: 'Укладка' },
  en: { haircut: 'Haircut', beard: 'Beard trim', combo: 'Haircut + beard', kids: 'Kids cut', shave: 'Razor shave', style: 'Styling' },
};

export const CAT_NAME: Record<Lang, Record<string, string>> = {
  uz: { hair: 'Soch', beard: 'Soqol' },
  ru: { hair: 'Волосы', beard: 'Борода' },
  en: { hair: 'Hair', beard: 'Beard' },
};

export const CUSTOMERS: CustomerItem[] = [
  { id: 1, name: 'Jasur Aliyev', phone: '+998 90 123 45 67', visits: 24, spent: '2.6M', last: '2d', tier: 'vip', via: 'telegram', av: '#CBA988', staff: 1 },
  { id: 2, name: 'Dilnoza Rashidova', phone: '+998 91 234 56 78', visits: 12, spent: '1.4M', last: '5d', tier: 'reg', via: 'telegram', av: '#D2A99e', staff: 4 },
  { id: 3, name: 'Otabek Mirzayev', phone: '+998 93 345 67 89', visits: 31, spent: '3.2M', last: '1d', tier: 'vip', via: 'web', av: '#7BB7E8', staff: 1 },
  { id: 4, name: 'Nodira Saidova', phone: '+998 94 456 78 90', visits: 3, spent: '240K', last: '12d', tier: 'new', via: 'telegram', av: '#C9A6E8', staff: 2 },
  { id: 5, name: 'Aziz Karimov', phone: '+998 97 567 89 01', visits: 18, spent: '1.9M', last: '3d', tier: 'reg', via: 'walkin', av: '#E8B57B', staff: 3 },
  { id: 6, name: 'Madina Yusupova', phone: '+998 99 678 90 12', visits: 8, spent: '920K', last: '7d', tier: 'reg', via: 'telegram', av: '#9CC6A0', staff: 4 },
  { id: 7, name: 'Bobur Toshev', phone: '+998 90 789 01 23', visits: 2, spent: '160K', last: '20d', tier: 'new', via: 'phone', av: '#A8B0BE', staff: 2 },
  { id: 8, name: 'Kamola Ismoilova', phone: '+998 91 890 12 34', visits: 15, spent: '1.7M', last: '4d', tier: 'vip', via: 'telegram', av: '#E0A8C0', staff: 1 },
];

export const INVENTORY: InventoryItem[] = [
  { id: 1, key: 'pomade', catKey: 'hair', stock: 3, min: 8, price: '65 000', color: '#84A92E' },
  { id: 2, key: 'shampoo', catKey: 'hair', stock: 24, min: 10, price: '45 000', color: '#3B82F6' },
  { id: 3, key: 'beardoil', catKey: 'beard', stock: 6, min: 6, price: '85 000', color: '#F59E0B' },
  { id: 4, key: 'razor', catKey: 'tools', stock: 18, min: 5, price: '120 000', color: '#8B5CF6' },
  { id: 5, key: 'wax', catKey: 'hair', stock: 2, min: 8, price: '55 000', color: '#14B8A6' },
  { id: 6, key: 'aftershave', catKey: 'beard', stock: 14, min: 6, price: '70 000', color: '#F43F5E' },
  { id: 7, key: 'blades', catKey: 'tools', stock: 0, min: 12, price: '30 000', color: '#64748B' },
  { id: 8, key: 'comb', catKey: 'retail', stock: 32, min: 8, price: '25 000', color: '#84A92E' },
];

export const INV_NAME: Record<Lang, Record<string, string>> = {
  uz: { pomade: 'Pomada (gel)', shampoo: 'Shampun', beardoil: 'Soqol moyi', razor: 'Ustara', wax: 'Vosk', aftershave: 'Aftersheyv', blades: 'Tig‘lar (10x)', comb: 'Taroq' },
  ru: { pomade: 'Помада (гель)', shampoo: 'Шампунь', beardoil: 'Масло для бороды', razor: 'Бритва', wax: 'Воск', aftershave: 'Афтершейв', blades: 'Лезвия (10x)', comb: 'Расчёска' },
  en: { pomade: 'Pomade (gel)', shampoo: 'Shampoo', beardoil: 'Beard oil', razor: 'Razor', wax: 'Wax', aftershave: 'Aftershave', blades: 'Blades (10x)', comb: 'Comb' },
};

export const SERVICE_COLORS = ['#84A92E', '#3B82F6', '#8B5CF6', '#F59E0B', '#14B8A6', '#F43F5E'];
export const AVATAR_COLORS = ['#CBA988', '#7BB7E8', '#C9A6E8', '#E8B57B', '#9CC6A0', '#A8B0BE', '#E0A8C0', '#D2A99e'];
