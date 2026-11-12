/** Правила для ников: формат, запрещённые слова, ключ уникальности. */

export const NICK_MIN = 3;
export const NICK_MAX = 16;

/** Похожие символы приводим к одной латинской букве, чтобы «n1gger» и «хуй/xyй» не проходили. */
const LOOKALIKE: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'b', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i',
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
};

/** Транслитерация кириллицы, чтобы ловить «blyad», «pizda» и т. п. тем же списком. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'u', я: 'ya',
};

/** Корни запрещённых слов (латиница — после транслитерации). */
const BANNED_LATIN = [
  // расизм и ненависть
  'nigg', 'niger', 'nigr', 'negr', 'black', 'chink', 'kike', 'spic', 'nazi', 'hitler', 'gitler', 'zhid', 'hach', 'churk', 'faggot', 'fagot',
  // английская брань
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'asshole', 'bastard', 'rape', 'porn',
  // русская брань в транслите
  'hui', 'huy', 'hue', 'huya', 'xui', 'xuy', 'pizd', 'pisd', 'blya', 'blia', 'bliad', 'ebl', 'eba', 'ebu', 'eby', 'ebi', 'yob', 'eban',
  'suka', 'suchk', 'mudak', 'mudil', 'pidor', 'pidar', 'pidr', 'pedik', 'gandon', 'govn', 'zalup', 'shluh', 'droch', 'manda', 'dolboeb', 'dolbaeb',
];
const BANNED_CYR = [
  'хуй', 'хуе', 'хуё', 'хуя', 'хуи', 'пизд', 'бля', 'ебл', 'еба', 'ебу', 'ебы', 'еби', 'ёб', 'ебан', 'сука', 'сучк', 'мудак', 'мудил',
  'пидор', 'пидар', 'пидр', 'педик', 'гандон', 'говн', 'залуп', 'шлюх', 'дроч', 'манда', 'долбоеб', 'долбаеб',
  'ниггер', 'нигер', 'негр', 'жид', 'хач', 'чурк', 'нацист', 'гитлер',
];

const squeeze = (s: string): string => s.replace(/(.)\1+/g, '$1');

/** Варианты строки для проверки: как есть, без повторов, транслит, «похожие символы». */
function variants(nick: string): string[] {
  const low = nick.toLowerCase().replace(/[_\-.\s]/g, '');
  const translit = [...low].map((ch) => TRANSLIT[ch] ?? LOOKALIKE[ch] ?? ch).join('');
  const look = [...low].map((ch) => LOOKALIKE[ch] ?? ch).join('');
  const out = [low, translit, look];
  return [...new Set([...out, ...out.map(squeeze)])];
}

export function hasBannedWord(nick: string): boolean {
  const vs = variants(nick);
  const banned = [...BANNED_LATIN, ...BANNED_CYR];
  // те же корни, но записанные «похожими» буквами (хуй → xyi)
  const lookBanned = BANNED_CYR.map((w) => [...w].map((ch) => LOOKALIKE[ch] ?? ch).join(''));
  return vs.some((v) => banned.some((w) => v.includes(w)) || lookBanned.some((w) => v.includes(w)) || banned.some((w) => v.includes(squeeze(w))));
}

/** Ключ уникальности: регистр и оформление не различаются. */
export function nickKey(nick: string): string {
  return nick.trim().toLowerCase();
}

/** Возвращает текст ошибки или null, если ник допустим по формату и содержанию. */
export function nickError(raw: string): string | null {
  const nick = raw.trim();
  if (nick.length < NICK_MIN) return `Минимум ${NICK_MIN} символа`;
  if (nick.length > NICK_MAX) return `Максимум ${NICK_MAX} символов`;
  if (!/^[A-Za-zА-Яа-яЁё0-9_-]+$/.test(nick)) return 'Только буквы, цифры, «_» и «-»';
  if (!/[A-Za-zА-Яа-яЁё]/.test(nick)) return 'Нужна хотя бы одна буква';
  if (/^(guest|гость|admin|админ|moder|модер)/i.test(nick)) return 'Этот ник зарезервирован';
  if (hasBannedWord(nick)) return 'Ник содержит недопустимое слово';
  return null;
}
