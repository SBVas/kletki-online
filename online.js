/* =====================================================================
   Клетки — онлайн-слой (Supabase Realtime Broadcast)
   ===================================================================== */

(function() {
  const SB = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 20 } },
  });

  // ── Состояние онлайн-сессии ──────────────────────────────────────────
  let channel = null;
  let roomCode = null;
  let myColor = null;          // WHITE | BLACK
  let opponentJoined = false;
  let myClientId = 'c' + Math.random().toString(36).slice(2, 10);
  let pendingFirstTurn = null; // согласованный первый ход
  let rematchMyVote = false;
  let rematchOppVote = false;

  // ── Утилиты UI ──────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function showMenu() {
    $('menuScreen').style.display = '';
    $('gameScreen').style.display = 'none';
    $('overlay').classList.add('hidden');
  }
  function showGame() {
    $('menuScreen').style.display = 'none';
    $('gameScreen').style.display = 'flex';
  }
  function setStatusPill(state, text) {
    const pill = $('connPill');
    pill.classList.remove('online', 'waiting', 'offline');
    if (state) pill.classList.add(state);
    $('connText').textContent = text;
  }
  function setInviteStatus(text, cls) {
    const el = $('inviteStatus');
    el.textContent = text || '';
    el.classList.remove('ok', 'err');
    if (cls) el.classList.add(cls);
  }

  // Карточка «Ссылка для друга» на игровом экране — показываем беломуигроку
  // от момента создания комнаты до первого броска кубиков.
  function showGameInvite(link) {
    const card = $('gameInviteCard');
    if (!card) return;
    $('gameInviteLink').value = link;
    card.style.display = '';
    setGameInviteStatus('Отправьте ссылку другу и ждите подключения.', '');
  }
  function setGameInviteStatus(text, cls) {
    const el = $('gameInviteStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('ok', 'err');
    if (cls) el.classList.add(cls);
  }
  function hideGameInvite() {
    const card = $('gameInviteCard');
    if (card) card.style.display = 'none';
  }

  // Доску НЕ поворачиваем — оба игрока видят одинаковую картинку.
  // Чёрный играет «вверх» (как ИИ в одиночном режиме). Меняем только подписи.
  function applyBoardOrientation() {
    const barTop = $('barTop');
    const barBottom = $('barBottom');
    if (myColor === BLACK) {
      barTop.dataset.label = 'Ваш бар';
      barBottom.dataset.label = 'Бар соперника';
      $('scoreLblW').textContent = 'Белые (соперник)';
      $('scoreLblB').textContent = 'Чёрные (вы)';
    } else {
      barTop.dataset.label = 'Бар соперника';
      barBottom.dataset.label = 'Ваш бар';
      $('scoreLblW').textContent = 'Белые (вы)';
      $('scoreLblB').textContent = 'Чёрные (соперник)';
    }
  }

  // ── Создание/подключение комнаты ─────────────────────────────────────
  function genCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // без похожих символов
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  async function createRoom() {
    setInviteStatus('Создаём комнату…');
    const code = genCode();
    const { error } = await SB.from('rooms').insert({
      id: code,
      state: { status: 'waiting' },
      white_id: myClientId,
      status: 'waiting',
    });
    if (error) {
      setInviteStatus('Ошибка: ' + error.message, 'err');
      return;
    }
    roomCode = code;
    myColor = WHITE;
    const link = location.origin + location.pathname + '?room=' + code;
    $('inviteLink').value = link;
    $('inviteBox').style.display = 'flex';
    setInviteStatus('Комната готова. Отправьте ссылку другу и ждите подключения.', 'ok');
    $('createRoomBtn').disabled = true;
    // Дублируем ссылку на игровом экране, чтобы она оставалась видной после перехода.
    showGameInvite(link);

    // Подключаемся к каналу и ждём оппонента
    await joinChannel(code);
  }

  async function joinRoom(code) {
    setInviteStatus('Подключаемся к комнате…');
    const { data, error } = await SB.from('rooms').select('*').eq('id', code).maybeSingle();
    if (error || !data) {
      setInviteStatus('Комната не найдена.', 'err');
      return;
    }
    if (data.black_id && data.black_id !== myClientId) {
      setInviteStatus('Комната уже занята.', 'err');
      return;
    }
    // Если уже мы там как чёрные (вернулись по ссылке) — используем тот же id
    if (!data.black_id) {
      const { error: updErr } = await SB.from('rooms')
        .update({ black_id: myClientId, status: 'playing' })
        .eq('id', code);
      if (updErr) {
        setInviteStatus('Ошибка подключения: ' + updErr.message, 'err');
        return;
      }
    }
    roomCode = code;
    myColor = BLACK;
    await joinChannel(code);
  }

  async function joinChannel(code) {
    $('roomCodeBadge').textContent = 'Код: ' + code;
    $('connCard').style.display = '';
    $('chatCard').style.display = '';
    setStatusPill('waiting', myColor === WHITE ? 'ждём соперника…' : 'подключение…');

    channel = SB.channel('room:' + code, {
      config: { broadcast: { self: false, ack: false } }
    });

    channel
      .on('broadcast', { event: 'hello' }, ({ payload }) => {
        // Получили hello от соперника
        if (payload.from === myClientId) return;
        opponentJoined = true;
        setStatusPill('online', 'соперник в игре');
        appendChat({ system: true, text: 'Соперник подключился' });
        // Не прячем ссылку — просто обновляем текст. Исчезнет после первого броска.
        setGameInviteStatus('Соперник подключился. Ссылка исчезнет после первого броска кубиков.', 'ok');

        // Белый инициирует первый бросок: выбирает кто ходит первым
        if (myColor === WHITE && !window.G) {
          const firstTurn = Math.random() < 0.5 ? WHITE : BLACK;
          pendingFirstTurn = firstTurn;
          channel.send({ type: 'broadcast', event: 'start', payload: { firstTurn } });
          startOnlineGame(firstTurn);
        }
      })
      .on('broadcast', { event: 'start' }, ({ payload }) => {
        // Чёрный получает старт
        if (window.G) return;
        opponentJoined = true;
        setStatusPill('online', 'соперник в игре');
        startOnlineGame(payload.firstTurn);
      })
      .on('broadcast', { event: 'dice' }, ({ payload }) => {
        // Принимаем бросок соперника
        hideGameInvite();
        rollDice(payload.values);
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        // Применяем ход соперника
        hideGameInvite();
        makeMove(payload.mv, true);
      })
      .on('broadcast', { event: 'pass' }, () => {
        passTurn(true);
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        appendChat({ nick: 'Соперник', text: payload.text });
      })
      .on('broadcast', { event: 'rematch' }, ({ payload }) => {
        rematchOppVote = true;
        updateRematchStatus();
        tryStartRematch();
      })
      .on('broadcast', { event: 'leave' }, () => {
        appendChat({ system: true, text: 'Соперник вышел из игры' });
        setStatusPill('offline', 'соперник отключился');
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Объявляем о своём присутствии
          channel.send({ type: 'broadcast', event: 'hello', payload: { from: myClientId, color: myColor } });
          showGame();
          if (myColor === BLACK) {
            // Сразу подаём знак ждать стартового сообщения от белого
            setStatusPill('waiting', 'ожидаем старта…');
          }
        }
      });
  }

  function startOnlineGame(firstTurn) {
    setOnline({
      myColor,
      sendMove: (mv) => { hideGameInvite(); channel && channel.send({ type: 'broadcast', event: 'move', payload: { mv } }); },
      sendDice: (values) => { hideGameInvite(); channel && channel.send({ type: 'broadcast', event: 'dice', payload: { values } }); },
      sendPass: () => channel && channel.send({ type: 'broadcast', event: 'pass', payload: {} }),
    });
    applyBoardOrientation();
    newGame({ firstTurn });
    setStatusPill('online', 'соперник в игре');
    appendChat({ system: true, text: 'Игра началась. Вы играете за ' + (myColor === WHITE ? 'белых' : 'чёрных') });
  }

  // ── Чат ─────────────────────────────────────────────────────────────
  function appendChat({ nick, text, system }) {
    const log = $('chatLog');
    const p = document.createElement('div');
    p.className = 'chat-msg' + (system ? ' system' : '');
    if (system) {
      p.textContent = text;
    } else {
      const n = document.createElement('span');
      n.className = 'nick';
      n.textContent = nick + ':';
      p.appendChild(n);
      p.appendChild(document.createTextNode(' ' + text));
    }
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }
  function sendChat() {
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text || !channel) return;
    appendChat({ nick: 'Вы', text });
    channel.send({ type: 'broadcast', event: 'chat', payload: { text } });
    input.value = '';
  }

  // ── Реванш ──────────────────────────────────────────────────────────
  function updateRematchStatus() {
    const el = $('rematchStatus');
    if (rematchMyVote && rematchOppVote) {
      el.textContent = 'Старт…';
    } else if (rematchMyVote) {
      el.textContent = 'Ждём согласия соперника…';
    } else if (rematchOppVote) {
      el.textContent = 'Соперник предлагает реванш';
    } else {
      el.textContent = '';
    }
  }
  function tryStartRematch() {
    if (rematchMyVote && rematchOppVote) {
      rematchMyVote = false;
      rematchOppVote = false;
      $('overlay').classList.add('hidden');
      // Белый снова выбирает первый ход
      if (myColor === WHITE) {
        const firstTurn = Math.random() < 0.5 ? WHITE : BLACK;
        channel.send({ type: 'broadcast', event: 'start', payload: { firstTurn } });
        startOnlineGame(firstTurn);
      } else {
        // Чёрный получит 'start' от белого; пока ждём
        setStatusPill('waiting', 'ожидаем старта…');
      }
    }
  }
  function clickRematch() {
    rematchMyVote = true;
    updateRematchStatus();
    channel && channel.send({ type: 'broadcast', event: 'rematch', payload: {} });
    tryStartRematch();
  }

  // ── Выход в меню ────────────────────────────────────────────────────
  window.leaveOnline = function() {
    if (channel) {
      channel.send({ type: 'broadcast', event: 'leave', payload: {} });
      SB.removeChannel(channel);
      channel = null;
    }
    setOnline(null);
    roomCode = null;
    myColor = null;
    opponentJoined = false;
    rematchMyVote = rematchOppVote = false;
    // Чистим URL
    if (location.search) {
      history.replaceState({}, '', location.pathname);
    }
    $('createRoomBtn').disabled = false;
    $('inviteBox').style.display = 'none';
    setInviteStatus('');
    hideGameInvite();
    $('chatLog').innerHTML = '';
    showMenu();
  };

  // ── Bootstrap ───────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    // Если в URL есть ?room=XXX — сразу подключаемся как чёрный
    const params = new URLSearchParams(location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      // Сразу подключаемся
      joinRoom(roomFromUrl).catch(e => setInviteStatus('Ошибка: ' + e.message, 'err'));
    } else {
      showMenu();
    }

    // Кнопки меню
    $('playAiBtn').addEventListener('click', () => {
      // Локальная игра против ИИ
      setOnline(null);
      showGame();
      $('connCard').style.display = 'none';
      $('chatCard').style.display = 'none';
      $('scoreLblW').textContent = 'Игрок (белые)';
      $('scoreLblB').textContent = 'ИИ (чёрные)';
      newGame();
    });
    $('createRoomBtn').addEventListener('click', () => {
      createRoom().catch(e => setInviteStatus('Ошибка: ' + e.message, 'err'));
    });
    function bindCopy(btnId, inputId) {
      const btn = $(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const inp = $(inputId);
        inp.select();
        try {
          navigator.clipboard.writeText(inp.value);
          btn.textContent = 'Скопировано';
          setTimeout(() => { btn.textContent = 'Копировать'; }, 1600);
        } catch (e) {
          document.execCommand('copy');
        }
      });
    }
    bindCopy('copyLinkBtn', 'inviteLink');
    bindCopy('gameCopyLinkBtn', 'gameInviteLink');
    $('backToMenuBtn').addEventListener('click', () => {
      if (ONLINE) leaveOnline();
      else showMenu();
    });

    // Чат
    $('chatSendBtn').addEventListener('click', sendChat);
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    // Реванш
    $('rematchBtn').addEventListener('click', clickRematch);
  });
})();
