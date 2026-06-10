// ──────────────────────────────────────────────────────────────────────
// Интеграция с Telegram Mini App
// ──────────────────────────────────────────────────────────────────────
// Делает игру «родной» внутри Telegram:
// 1. Применяет тему Telegram (цвета фона/текста — поверх наших CSS-переменных).
// 2. Растягивает на весь экран (expand) и просит расширенную область (request_fullscreen).
// 3. Парсит start_param из tg.initDataUnsafe (Telegram передаёт код комнаты так,
//    когда ссылка имеет вид https://t.me/BOT/APP?startapp=CODE).
// 4. Заменяет ссылку-приглашение на t.me/BOT/APP?startapp=CODE для нативного шеринга.
// 5. Подключает haptic feedback: вибрация при ходах/выигрыше.
// 6. BackButton Telegram — выход в меню.
// 7. MainButton Telegram — «Поделиться ссылкой» когда ссылка показана.
// ──────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) {
    // Не внутри Telegram — ничего не делаем, игра работает как обычное веб-приложение
    window.TG = { isInside: false, getInviteLink: (code) => location.origin + location.pathname + '?room=' + code };
    return;
  }

  // ── Базовая инициализация ───────────────────────────────────────────
  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}
  try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}

  // Имя бота и Mini App (захардкожены для нашего бота)
  const TG_BOT = 'KletkiOnlineBot';
  const TG_APP = 'play';

  // ── Тема Telegram ───────────────────────────────────────────────────
  // Мы не подменяем нашу золото-деревянную палитру (она у нас фирменная),
  // но цвет верхней панели Telegram согласуем с темой игры.
  try {
    tg.setHeaderColor('#2C1608');
    tg.setBackgroundColor('#2C1608');
  } catch (e) {}

  // ── Чтение start_param ──────────────────────────────────────────────
  // Telegram передаёт параметр из ?startapp=CODE сюда: tg.initDataUnsafe.start_param
  // Подкладываем его в location.search как ?room=CODE, чтобы online.js подхватил
  // штатным путём.
  try {
    const startParam = tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (startParam && /^[a-z0-9]{4,20}$/i.test(startParam)) {
      const params = new URLSearchParams(location.search);
      if (!params.get('room')) {
        params.set('room', startParam);
        history.replaceState({}, '', location.pathname + '?' + params.toString());
      }
    }
  } catch (e) {}

  // ── Глобальный TG API для остального кода ───────────────────────────
  window.TG = {
    isInside: true,
    raw: tg,

    // Возвращает ссылку, которой нужно делиться. Внутри Telegram — t.me/Bot/App?startapp=CODE
    getInviteLink: function (code) {
      return 'https://t.me/' + TG_BOT + '/' + TG_APP + '?startapp=' + encodeURIComponent(code);
    },

    // Нативный шеринг через Telegram
    shareLink: function (link, text) {
      try {
        const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) +
                    '&text=' + encodeURIComponent(text || 'Сыграем в Клетки?');
        tg.openTelegramLink(url);
      } catch (e) {
        // fallback — копируем в буфер
        try { navigator.clipboard.writeText(link); } catch (_) {}
      }
    },

    // Haptic feedback
    haptic: function (type) {
      try {
        if (!tg.HapticFeedback) return;
        if (type === 'success' || type === 'error' || type === 'warning') {
          tg.HapticFeedback.notificationOccurred(type);
        } else if (type === 'heavy' || type === 'medium' || type === 'light') {
          tg.HapticFeedback.impactOccurred(type);
        } else if (type === 'selection') {
          tg.HapticFeedback.selectionChanged();
        }
      } catch (e) {}
    },

    // BackButton Telegram
    showBackButton: function (onClick) {
      try {
        tg.BackButton.onClick(onClick);
        tg.BackButton.show();
      } catch (e) {}
    },
    hideBackButton: function () {
      try { tg.BackButton.hide(); } catch (e) {}
    },

    // MainButton — большая кнопка снизу
    showMainButton: function (text, onClick) {
      try {
        tg.MainButton.setText(text);
        tg.MainButton.onClick(onClick);
        tg.MainButton.show();
      } catch (e) {}
    },
    hideMainButton: function () {
      try { tg.MainButton.hide(); } catch (e) {}
    },

    // Подтверждение закрытия — чтобы не закрыть Mini App случайным свайпом во время партии
    enableClosingConfirmation: function () {
      try { tg.enableClosingConfirmation(); } catch (e) {}
    },
    disableClosingConfirmation: function () {
      try { tg.disableClosingConfirmation(); } catch (e) {}
    },
  };

  // ── Адаптация под безопасные зоны Telegram ──────────────────────────
  // На iPhone снизу есть «домашний бар», сверху — статус-бар.
  // viewport-fit=cover в meta уже стоит, добавляем env(safe-area-inset-*) к body.
  const style = document.createElement('style');
  style.textContent = `
    body {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    /* Скрываем подсказку «Подсказка», которая на мобильном занимает много места — её
       можно открыть тапом по заголовку, если захочется */
    @media (max-width: 720px) {
      .legend { font-size: 13px; }
    }
  `;
  document.head.appendChild(style);

  console.log('[TG] Mini App initialized. start_param =', tg.initDataUnsafe && tg.initDataUnsafe.start_param);
})();
