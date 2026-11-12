/**
 * Подключение онлайн-сервера (Supabase). Если поля пустые, игра работает
 * локально: профили и таблица лидеров живут только на этом устройстве.
 * Чтобы включить общий рейтинг, выполните server/supabase.sql в своём проекте
 * Supabase и впишите сюда Project URL и публичный anon-ключ (он не секретный).
 */
export const ONLINE = {
  url: 'https://oompjaembanimeesdgav.supabase.co',
  anonKey: 'sb_publishable_zTFPGcG-blTkb1DVQ3kwjQ_MCAg47YI',
};
