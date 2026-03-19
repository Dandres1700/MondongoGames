// Función autoejecutable que encapsula toda la lógica de mensajes, amigos y notificaciones
// para evitar contaminar el ámbito global y mantener organizado el script.
(function(){
  // Atajo para obtener elementos del DOM por id de forma más rápida.
  const $ = (id) => document.getElementById(id);

  
  // Referencias a los botones principales de la barra de navegación
// y a los badges que muestran cantidades pendientes.
  const btnMessages = $("btnOpenContacts");
  const btnFriends = $("btnFriends");
  const friendsBadge = $("mgFriendsBadge");
  const requestsTabBadge = $("mgRequestsTabBadge");

  // Referencias a los paneles flotantes de la interfaz,
// sus botones de cierre, el backdrop y la pestaña dock de vista juego.
  const messagesPanel = $("messagesPanel");
  const friendsPanel  = $("friendsPanel");
  const backdrop      = $("mgBackdrop");
  const btnCloseMessages = $("btnCloseMessages");
  const btnCloseFriends  = $("btnCloseFriends");
  const dockTab = $("mgDockTab");
  const isGameView = document.body.classList.contains("game-view");

  // Elementos visuales del módulo de mensajería:
// lista de conversaciones, chat activo, formulario de envío y buscador.
  const threadsList = $("mgThreadsList");
  const chatEmpty   = $("mgChatEmpty");
  const chatWrap    = $("mgChat");
  const chatBody    = $("mgChatBody");
  const chatForm    = $("mgChatForm");
  const chatInput   = $("mgChatInput");
  const sendBtn     = $("mgSendBtn");
  const chatName    = $("mgChatName");
  const chatAvatar  = $("mgChatAvatar");
  const searchThreads = $("mgSearchThreads");
  const btnOpenFriendsFromMessages = $("btnOpenFriendsFromMessages");

  // Elementos visuales del módulo de amistades:
// listado de amigos, solicitudes y acciones relacionadas.
  const friendsList = $("mgFriendsList");
  const requestsBox = $("mgRequests");
  const incomingBox = $("mgIncoming");
  const outgoingBox = $("mgOutgoing");
  const btnOpenAddFriend = $("btnOpenAddFriend");

  // Elementos del panel de notificaciones y su badge de avisos no leídos.
  const btnNotifications = $("btnNotifications");
  const notificationsPanel = $("notificationsPanel");
  const btnCloseNotifications = $("btnCloseNotifications");
  const notificationsList = $("mgNotificationsList");
  const notificationsBadge = $("mgNotificationsBadge");

  // Elementos del modal para buscar usuarios y enviar solicitudes de amistad.
  const addFriendModal = $("mgAddFriendModal");
  const addFriendForm  = $("mgAddFriendForm");
  const addFriendInput = $("mgAddFriendInput");
  const addFriendStatus = $("mgAddFriendStatus");
  const closeAddFriend = $("mgCloseAddFriend");
  const unreadBadge = $("mgUnreadBadge");

  // Consulta la cantidad de mensajes no leídos y actualiza el badge correspondiente.
async function refreshUnread(){
  try{
    const r = await api('/api/messages/unread-count/');
    const n = Number(r.count || 0);

    if(unreadBadge){
      unreadBadge.textContent = n > 99 ? "99+" : String(n);
      unreadBadge.hidden = (n === 0);
    }
  }catch(e){
    // si falla, oculto el badge para no mostrar 0 falso
    if(unreadBadge) unreadBadge.hidden = true;
  }
}

// Refresco automático de badges para mantener sincronizada la interfaz con el servidor.
setInterval(refreshUnread, 2000);
refreshUnread();
// También se actualizan periódicamente notificaciones y solicitudes de amistad.
setInterval(refreshNotificationsBadge, 2000);
refreshNotificationsBadge();

setInterval(refreshFriendRequestsBadge, 2000);
refreshFriendRequestsBadge();

// Estado global del módulo:
// activeChatUserId guarda el usuario del chat activo,
// threadsCache almacena los hilos cargados,
// y mgPollTimer controla la actualización automática del chat abierto.
  let activeChatUserId = null;
  let threadsCache = [];
  let mgPollTimer = null;
// Estado temporal usado para arrastrar el panel de mensajes en la vista de juego.
  let dragState = {
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0
  };
  // ✅ al inicio: no hay chat seleccionado, deshabilitar envío
if (chatInput) chatInput.disabled = true;
if (sendBtn) sendBtn.disabled = true;

// Obtiene el valor de una cookie del navegador, usado aquí para recuperar el CSRF token.
  function getCookie(name){
    const v = `; ${document.cookie}`;
    const parts = v.split(`; ${name}=`);
    if(parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }
  const csrftoken = getCookie('csrftoken');

  // Función auxiliar para centralizar peticiones al backend,
// agregar headers, credenciales y manejo de errores.
  async function api(url, opts={}){
    const options = {
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      },
      credentials: 'same-origin',
      ...opts,
    };
    if(options.method && options.method.toUpperCase() !== 'GET'){
      options.headers['X-CSRFToken'] = csrftoken;
    }
    const r = await fetch(url, options);
    let j = null;
    try{ j = await r.json(); }catch(e){}
    if(!r.ok){
      const msg = (j && j.error) ? j.error : `Error ${r.status}`;
      throw new Error(msg);
    }
    return j;
  }

  // Ajusta la posición del panel de amigos para evitar superposición con otros paneles.
      function updateFriendsPanelPosition(){
    if(!friendsPanel || !messagesPanel) return;

    // ✅ En vista juego, amigos siempre se abre en posición normal
    if(isGameView){
      friendsPanel.classList.remove('mg-panel--stacked');
      return;
    }

    // ✅ Fuera de juego, si ambos están abiertos, amigos se corre a la izquierda
    if(messagesPanel.classList.contains('open') && friendsPanel.classList.contains('open')){
      friendsPanel.classList.add('mg-panel--stacked');
    }else{
      friendsPanel.classList.remove('mg-panel--stacked');
    }
  }
// Controla la pestaña dock que permite restaurar el panel de mensajes minimizado en vista juego.
  function showDockTab(){
    if(!dockTab || !isGameView) return;
    dockTab.classList.add("show");
  }
  // Oculta la pestaña dock cuando el panel de mensajes vuelve a estar visible.
  function hideDockTab(){
    if(!dockTab || !isGameView) return;
    dockTab.classList.remove("show");
  }

  // Verifica si el panel de mensajes se encuentra minimizado.
  function isMessagesMinimized(){
    return !!(messagesPanel && messagesPanel.classList.contains("mg-panel--minimized"));
  }

  // Minimiza el panel de mensajes y muestra la pestaña dock para recuperarlo después.
  function minimizeMessagesPanel(){
    if(!messagesPanel) return;
    messagesPanel.classList.add("mg-panel--minimized");
    messagesPanel.setAttribute("aria-hidden", "true");
    showDockTab();
  }
// Restaura el panel de mensajes minimizado.
// En vista juego, cierra otros paneles para dejar visible solo uno.
  function restoreMessagesPanel(){
  if(!messagesPanel) return;

  if(isGameView){
    friendsPanel?.classList.remove("open");
    friendsPanel?.setAttribute("aria-hidden", "true");

    notificationsPanel?.classList.remove("open");
    notificationsPanel?.setAttribute("aria-hidden", "true");
  }

  messagesPanel.classList.remove("mg-panel--minimized");
  messagesPanel.classList.add("open");
  messagesPanel.setAttribute("aria-hidden", "false");
  hideDockTab();

  updateFriendsPanelPosition();
  updateNotificationsPanelPosition();
}
// Mantiene el panel de mensajes dentro del área visible de la ventana.
  function clampMessagesPanelToViewport(){
    if(!isGameView || !messagesPanel) return;

    const rect = messagesPanel.getBoundingClientRect();
    const margin = 10;

    let left = rect.left;
    let top = rect.top;

    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop  = window.innerHeight - rect.height - margin;

    if(left < margin) left = margin;
    if(top < 78) top = 78;
    if(left > maxLeft) left = maxLeft;
    if(top > maxTop) top = maxTop;

    messagesPanel.style.left = `${left}px`;
    messagesPanel.style.top = `${top}px`;
    messagesPanel.style.right = "auto";
  }
  // Consulta las solicitudes pendientes y actualiza sus indicadores visuales.
async function refreshFriendRequestsBadge(){
  try{
    const r = await api('/api/friends/requests/');
    const incoming = r.incoming || [];
    const count = incoming.length;

    if(friendsBadge){
      friendsBadge.textContent = String(count);
      friendsBadge.classList.toggle('bump', count > 0);
    }

    if(requestsTabBadge){
      requestsTabBadge.textContent = String(count);
      requestsTabBadge.classList.toggle('is-zero', count === 0);
    }

    const requestsTab = document.querySelector('.mg-tab--requests');
    if(requestsTab){
      requestsTab.classList.toggle('has-pending', count > 0);
    }
  }catch(e){
    if(friendsBadge) friendsBadge.textContent = '0';
    if(requestsTabBadge){
      requestsTabBadge.textContent = '0';
      requestsTabBadge.classList.add('is-zero');
    }
    const requestsTab = document.querySelector('.mg-tab--requests');
    if(requestsTab){
      requestsTab.classList.remove('has-pending');
    }
  }
}

// Habilita el arrastre manual del panel de mensajes en vista juego.
  function enableMessagesDragging(){
    if(!isGameView || !messagesPanel) return;

    const dragHandle = messagesPanel.querySelector(".mg-panel__head");
    if(!dragHandle) return;

    dragHandle.addEventListener("pointerdown", (e) => {
      const isCloseBtn = e.target.closest(".mg-panel__close");
      const isInput = e.target.closest("input, textarea, button");
      if(isCloseBtn || isInput) return;

      const rect = messagesPanel.getBoundingClientRect();

      dragState.active = true;
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      dragState.startLeft = rect.left;
      dragState.startTop = rect.top;

      messagesPanel.classList.add("mg-dragging");
      messagesPanel.style.left = `${rect.left}px`;
      messagesPanel.style.top = `${rect.top}px`;
      messagesPanel.style.right = "auto";

      if (dragHandle.setPointerCapture) {
        try { dragHandle.setPointerCapture(e.pointerId); } catch(err){}
      }

      e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
      if(!dragState.active) return;

      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      let newLeft = dragState.startLeft + dx;
      let newTop = dragState.startTop + dy;

      const rect = messagesPanel.getBoundingClientRect();
      const margin = 10;
      const maxLeft = window.innerWidth - rect.width - margin;
      const maxTop  = window.innerHeight - rect.height - margin;

      if(newLeft < margin) newLeft = margin;
      if(newTop < 78) newTop = 78;
      if(newLeft > maxLeft) newLeft = maxLeft;
      if(newTop > maxTop) newTop = maxTop;

      messagesPanel.style.left = `${newLeft}px`;
      messagesPanel.style.top = `${newTop}px`;
      messagesPanel.style.right = "auto";
    });

    const finishDrag = () => {
      if(!dragState.active) return;
      dragState.active = false;
      messagesPanel.classList.remove("mg-dragging");
    };

    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    window.addEventListener("resize", clampMessagesPanelToViewport);
  }

  // Abre un panel según el contexto actual.
// En vista juego solo se muestra un panel a la vez.
    function openPanel(panel){
  if(!panel) return;

  // ✅ En vista juego: solo un panel abierto a la vez
  if(isGameView){
    if(panel !== messagesPanel){
      messagesPanel.classList.remove('open', 'mg-panel--minimized');
      messagesPanel.setAttribute('aria-hidden', 'true');
      showDockTab();
    }

    if(panel !== friendsPanel){
      friendsPanel.classList.remove('open');
      friendsPanel.setAttribute('aria-hidden', 'true');
    }

    if(panel !== notificationsPanel){
      notificationsPanel.classList.remove('open');
      notificationsPanel.setAttribute('aria-hidden', 'true');
    }

    panel.classList.remove('mg-panel--minimized');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');

    if(panel === messagesPanel){
      hideDockTab();
    }else{
      showDockTab();
    }

    updateFriendsPanelPosition();
    updateNotificationsPanelPosition();
    return;
  }

  // ✅ Modo normal fuera de juegos
  if(!backdrop) return;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden','false');
  backdrop.classList.add('show');
  updateFriendsPanelPosition();
  updateNotificationsPanelPosition();
}

// Cierra un panel específico.
// En vista juego, el panel de mensajes se minimiza en lugar de desaparecer.
    function closePanel(panel){
  if(!panel) return;

  if(isGameView){
    if(panel === messagesPanel){
      minimizeMessagesPanel();

      if (mgPollTimer) {
        clearInterval(mgPollTimer);
        mgPollTimer = null;
      }
    }else{
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden','true');
      showDockTab();
    }

    updateFriendsPanelPosition();
    updateNotificationsPanelPosition();
    return;
  }

  if(!backdrop) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden','true');
  updateFriendsPanelPosition();
  updateNotificationsPanelPosition();

  if(
    !messagesPanel.classList.contains('open') &&
    !friendsPanel.classList.contains('open') &&
    !notificationsPanel.classList.contains('open')
  ){
    backdrop.classList.remove('show');
  }
}
// Cierra o minimiza todos los paneles visibles y detiene el polling del chat.
    function closeAll(){
  if(isGameView){
    messagesPanel.classList.remove('open');
    messagesPanel.classList.add('mg-panel--minimized');
    messagesPanel.setAttribute('aria-hidden','true');

    friendsPanel.classList.remove('open');
    friendsPanel.setAttribute('aria-hidden','true');

    notificationsPanel.classList.remove('open');
    notificationsPanel.setAttribute('aria-hidden','true');

    showDockTab();
    updateFriendsPanelPosition();
    updateNotificationsPanelPosition();
  }else{
    closePanel(messagesPanel);
    closePanel(friendsPanel);
    closePanel(notificationsPanel);
  }

  if (mgPollTimer) {
    clearInterval(mgPollTimer);
    mgPollTimer = null;
  }
}
  // Eventos principales para abrir, cerrar y restaurar paneles desde la interfaz.
  if(backdrop) backdrop.addEventListener('click', closeAll);
  if(btnCloseMessages) btnCloseMessages.addEventListener('click', () => closePanel(messagesPanel));
  if(btnCloseFriends) btnCloseFriends.addEventListener('click', () => closePanel(friendsPanel));
  if(dockTab) dockTab.addEventListener('click', () => restoreMessagesPanel());

  if(btnMessages){
    btnMessages.addEventListener('click', async () => {
      openPanel(messagesPanel);
      await loadThreads();
    });
  }
    if(btnFriends){
    btnFriends.addEventListener('click', async () => {
      if(isGameView && messagesPanel.classList.contains('open') && !isMessagesMinimized()){
        minimizeMessagesPanel();
      }
      openPanel(friendsPanel);
      await loadFriends();
    });
  }
  if(btnOpenFriendsFromMessages){
    btnOpenFriendsFromMessages.addEventListener('click', async () => {
      if(isGameView && messagesPanel.classList.contains('open') && !isMessagesMinimized()){
        minimizeMessagesPanel();
      }
      openPanel(friendsPanel);
      await loadFriends();
    });
  }

  // Controla el cambio entre la pestaña de amigos y la pestaña de solicitudes.
  document.querySelectorAll('[data-friendtab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('[data-friendtab]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const tab = btn.getAttribute('data-friendtab');
      if(tab === 'friends'){
        friendsList.hidden = false;
        requestsBox.hidden = true;
        await loadFriends();
      }else{
        friendsList.hidden = true;
        requestsBox.hidden = false;
        await loadRequests();
      }
    });
  });

  if(btnOpenAddFriend) btnOpenAddFriend.addEventListener('click', openAddFriendModal);

  // Abre el modal para agregar amigos, limpia el estado previo y enfoca el input.
  function openAddFriendModal(){
    if(!addFriendModal) return;
    addFriendStatus.textContent = '';
    addFriendInput.value = '';
    addFriendModal.classList.add('open');
    addFriendModal.setAttribute('aria-hidden','false');
    setTimeout(() => addFriendInput.focus(), 50);
  }
  // Cierra el modal de agregar amigo.
  function closeAddFriendModal(){
    if(!addFriendModal) return;
    addFriendModal.classList.remove('open');
    addFriendModal.setAttribute('aria-hidden','true');
  }
  if(closeAddFriend) closeAddFriend.addEventListener('click', closeAddFriendModal);
  // Permite cerrar el modal al hacer clic fuera de su contenido principal.
  if(addFriendModal){
    addFriendModal.addEventListener('click', (e) => {
      if(e.target === addFriendModal) closeAddFriendModal();
    });
  }
  // Envía una solicitud de amistad al backend y refresca la interfaz si el envío fue exitoso.
  if(addFriendForm){
    addFriendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = (addFriendInput.value || '').trim();
      if(!q){ addFriendStatus.textContent = 'Escribe un username o correo.'; return; }
      addFriendStatus.textContent = 'Enviando...';
      try{
        const r = await api('/api/friends/request/send/', {method:'POST', body: JSON.stringify({q})});
        addFriendStatus.textContent = r.auto_accepted ? '✅ Solicitud aceptada automáticamente. Ya son amigos.' : '✅ Solicitud enviada.';
        await loadRequests();
        await loadFriends();
        await refreshFriendRequestsBadge();
      }catch(err){
        addFriendStatus.textContent = '❌ ' + err.message;
      }
    });
  }
  // Carga desde el backend la lista de conversaciones disponibles.
  async function loadThreads(){
    if(!threadsList) return;
    threadsList.innerHTML = `<div class="mg-empty">Cargando...</div>`;
    try{
      const r = await api('/api/messages/threads/');
      threadsCache = r.threads || [];
      renderThreads(threadsCache);
    }catch(err){
      threadsList.innerHTML = `<div class="mg-empty">❌ ${err.message}</div>`;
    }
  }

  // Renderiza visualmente la lista de conversaciones y permite abrir cada chat.
  function renderThreads(list){
    if(!list || list.length === 0){
      threadsList.innerHTML = `<div class="mg-empty">No hay amigos añadidos. Agrega amigos para chatear.</div>`;
      sendBtn.disabled = true;
      chatInput.disabled = true;
      return;
    }
    threadsList.innerHTML = '';
    list.forEach(t => {
      const u = t.user;
      const last = t.last_message ? t.last_message.body : 'Sin mensajes aún';
      const div = document.createElement('div');
      div.className = 'mg-item' + (activeChatUserId === u.id ? ' is-active' : '');
      div.innerHTML = `
        <img class="mg-avatar" src="${u.avatar || '/static/games/img/default_user.png'}" alt="">
        <div class="mg-item__meta">
          <div class="mg-item__name">${escapeHtml(u.username)}</div>
          <div class="mg-item__last">${escapeHtml(last)}</div>
        </div>
      `;
      div.addEventListener('click', () => openChat(u.id));
      threadsList.appendChild(div);
    });
  }

  // Filtra localmente las conversaciones según el texto ingresado en el buscador.
  if(searchThreads){
    searchThreads.addEventListener('input', () => {
      const q = (searchThreads.value || '').toLowerCase().trim();
      if(!q){ renderThreads(threadsCache); return; }
      const filtered = threadsCache.filter(t => (t.user.username || '').toLowerCase().includes(q));
      renderThreads(filtered);
    });
  }

  // Abre una conversación específica, carga sus mensajes y activa su actualización automática.
async function openChat(userId){
  activeChatUserId = userId;
    // ✅ habilita composer al abrir chat
  chatInput.disabled = false;
  sendBtn.disabled = false;
  chatEmpty.hidden = true;
  chatWrap.hidden = false;
  chatBody.innerHTML = `<div class="mg-empty">Cargando conversación...</div>`;

  try{
    const r = await api(`/api/messages/thread/${userId}/`);
    const other = r.other;
    chatName.textContent = other.username;
    chatAvatar.src = other.avatar || '/static/games/img/default_user.png';

    renderMessages(r.messages || []);
    chatBody.scrollTop = chatBody.scrollHeight;

    // ✅ al abrir chat, se marcan como leídos -> baja badge
    await refreshUnread();

    // ✅ polling SIEMPRE (tipo Messenger)
    if (mgPollTimer) clearInterval(mgPollTimer);
    mgPollTimer = setInterval(async () => {
      try{
        const shouldStickToBottom =
          chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 80;
    
        const rr = await api(`/api/messages/thread/${userId}/`);
        renderMessages(rr.messages || []);
    
        if (shouldStickToBottom) {
          chatBody.scrollTop = chatBody.scrollHeight;
        }
    
        await refreshUnread();
      }catch(e){}
    }, 1500);

  }catch(err){
    chatBody.innerHTML = `<div class="mg-empty">❌ ${err.message}</div>`;
  }
}

// Dibuja en pantalla los mensajes del chat actual, separando enviados y recibidos.
  function renderMessages(msgs){
    chatBody.innerHTML = '';
    if(!msgs.length){
      chatBody.innerHTML = `<div class="mg-empty">Aún no hay mensajes. ¡Escribe el primero!</div>`;
      return;
    }
    msgs.forEach(m => {
      const b = document.createElement('div');
      b.className = 'mg-bubble ' + (m.from_me ? 'me' : 'them');
      b.textContent = m.body;
      chatBody.appendChild(b);
    });
  }

  // Envía un mensaje al usuario activo y actualiza visualmente la conversación.
  if(chatForm){
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(!activeChatUserId) return;
      const body = (chatInput.value || '').trim();
      if(!body) return;
      chatInput.value = '';
      try{
        const r = await api(`/api/messages/thread/${activeChatUserId}/send/`, {method:'POST', body: JSON.stringify({body})});
        const m = r.message;
        const b = document.createElement('div');
        b.className = 'mg-bubble me';
        b.textContent = m.body;
        chatBody.appendChild(b);
        chatBody.scrollTop = chatBody.scrollHeight;
        await loadThreads();
        await refreshUnread();
      }catch(err){
        alert('No se pudo enviar: ' + err.message);
      }
    });
  }
// Carga la lista de amigos confirmados y la muestra en el panel de amistades.
  async function loadFriends(){
    if(!friendsList) return;
    friendsList.innerHTML = `<div class="mg-empty">Cargando...</div>`;
    try{
      const r = await api('/api/friends/');
      const list = r.friends || [];
      if(list.length === 0){
        friendsList.innerHTML = `<div class="mg-empty">No hay amigos.</div>`;
        return;
      }
      friendsList.innerHTML = '';
      list.forEach(u => {
        const div = document.createElement('div');
        div.className = 'mg-item';
        div.innerHTML = `
          <img class="mg-avatar" src="${u.avatar || '/static/games/img/default_user.png'}" alt="">
          <div class="mg-item__meta">
            <div class="mg-item__name">${escapeHtml(u.username)}</div>
            <div class="mg-item__last">${escapeHtml(u.email || '')}</div>
          </div>
        `;
        // Al seleccionar un amigo, se abre directamente la conversación con ese usuario.
           div.addEventListener('click', async () => {
          closePanel(friendsPanel);   // cierra amigos
          openPanel(messagesPanel);   // abre chat en su lugar normal
          await loadThreads();
          await openChat(u.id);
        });
        friendsList.appendChild(div);
      });
    }catch(err){
      friendsList.innerHTML = `<div class="mg-empty">❌ ${err.message}</div>`;
    }
  }

  // Carga y muestra las solicitudes de amistad recibidas y enviadas.
  async function loadRequests(){
    if(!incomingBox || !outgoingBox) return;
    incomingBox.innerHTML = `<div class="mg-empty">Cargando...</div>`;
    outgoingBox.innerHTML = `<div class="mg-empty">Cargando...</div>`;
    try{
      const r = await api('/api/friends/requests/');

      if(!r.incoming || r.incoming.length === 0){
        incomingBox.innerHTML = `<div class="mg-empty">No tienes solicitudes.</div>`;
      }else{
        incomingBox.innerHTML = '';
        // Renderiza las solicitudes recibidas con opciones para aceptar o rechazar.
        r.incoming.forEach(item => {
          const u = item.from_user;
          const row = document.createElement('div');
          row.className = 'mg-request';
          row.innerHTML = `
            <div class="mg-request__left">
              <img class="mg-avatar" src="${u.avatar || '/static/games/img/default_user.png'}" alt="">
              <div class="mg-item__meta">
                <div class="mg-item__name">${escapeHtml(u.username)}</div>
                <div class="mg-item__last">quiere agregarte</div>
              </div>
            </div>
            <div class="mg-request__actions">
              <button class="mg-btn mg-btn--ok" type="button">Aceptar</button>
              <button class="mg-btn mg-btn--no" type="button">Rechazar</button>
            </div>
          `;
          const [okBtn, noBtn] = row.querySelectorAll('button');
          okBtn.addEventListener('click', async () => {
            try{
  await api(`/api/friends/request/${item.id}/accept/`, {method:'POST', body:'{}'});
  await loadRequests();
  await loadFriends();
  await refreshFriendRequestsBadge();
}catch(e){ alert(e.message); }
          });
          noBtn.addEventListener('click', async () => {
            try{
  await api(`/api/friends/request/${item.id}/decline/`, {method:'POST', body:'{}'});
  await loadRequests();
  await refreshFriendRequestsBadge();
}catch(e){ alert(e.message); }
          });
          incomingBox.appendChild(row);
        });
      }

      if(!r.outgoing || r.outgoing.length === 0){
        outgoingBox.innerHTML = `<div class="mg-empty">No has enviado solicitudes.</div>`;
      }else{
        outgoingBox.innerHTML = '';
        r.outgoing.forEach(item => {
          const u = item.to_user;
          const row = document.createElement('div');
          row.className = 'mg-request';
          row.innerHTML = `
            <div class="mg-request__left">
              <img class="mg-avatar" src="${u.avatar || '/static/games/img/default_user.png'}" alt="">
              <div class="mg-item__meta">
                <div class="mg-item__name">${escapeHtml(u.username)}</div>
                <div class="mg-item__last">pendiente</div>
              </div>
            </div>
          `;
          outgoingBox.appendChild(row);
        });
      }
      await refreshFriendRequestsBadge();

    }catch(err){
      incomingBox.innerHTML = `<div class="mg-empty">❌ ${err.message}</div>`;
      outgoingBox.innerHTML = `<div class="mg-empty">❌ ${err.message}</div>`;
    }
  }
  // Escapa caracteres especiales antes de insertarlos en HTML.
  function escapeHtml(str){
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
      
  }

  if(isGameView){
    enableMessagesDragging();
    showDockTab();
  }
// Permite enviar el mensaje al presionar Enter, con compatibilidad para navegadores antiguos.
if (chatInput && chatForm) {
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (typeof chatForm.requestSubmit === "function") {
        chatForm.requestSubmit();
      } else {
        // fallback viejo
        chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }
  });
}

// Ajusta la posición del panel de notificaciones cuando coincide con otros paneles abiertos.
  function updateNotificationsPanelPosition(){
    if(!notificationsPanel || !messagesPanel || !friendsPanel) return;

    notificationsPanel.classList.remove('mg-panel--stacked');

    const messagesOpen = messagesPanel.classList.contains('open');
    const friendsOpen = friendsPanel.classList.contains('open');
    const notificationsOpen = notificationsPanel.classList.contains('open');

    if(!notificationsOpen) return;

    if(messagesOpen || friendsOpen){
      notificationsPanel.classList.add('mg-panel--stacked');
    }
  }

  if(btnCloseNotifications) btnCloseNotifications.addEventListener('click', () => closePanel(notificationsPanel));

  if(btnNotifications){
    btnNotifications.addEventListener('click', async () => {
      openPanel(notificationsPanel);

      try{
      await api('/api/notifications/mark-all-read/', {
        method:'POST',
        body:'{}'
      });
      }catch(e){}

      await loadNotifications();
      await refreshNotificationsBadge();

    });
  }
  // Consulta la cantidad de notificaciones no leídas y actualiza su badge visual.
    async function refreshNotificationsBadge(){
    try{
      const r = await api('/api/notifications/unread-count/');
      const n = Number(r.count || 0);

      if(notificationsBadge){
        notificationsBadge.textContent = n > 99 ? "99+" : String(n);
        notificationsBadge.hidden = (n === 0);
      }
    }catch(e){
      if(notificationsBadge) notificationsBadge.hidden = true;
    }
  }

  // Carga la lista de notificaciones y define la acción que ejecutará cada una al hacer clic.
  async function loadNotifications(){
    if(!notificationsList) return;
    notificationsList.innerHTML = `<div class="mg-empty">Cargando...</div>`;

    try{
      const r = await api('/api/notifications/');
      const list = r.notifications || [];

      if(!list.length){
        notificationsList.innerHTML = `
          <div class="mg-empty">
          No tienes notificaciones.
            <div style="margin-top:8px; font-size:11px; color:rgba(255,255,255,.42);">
              Cuando recibas mensajes, solicitudes o avisos, aparecerán aquí.
            </div>
          </div>
        `;
        return;
      }

      notificationsList.innerHTML = '';
      // Construye cada notificación según su tipo, contenido y destino.
      list.forEach(n => {
  const div = document.createElement('div');

  const typeClass = n.type ? ` mg-notification--${n.type}` : '';
  div.className = 'mg-notification' + typeClass + (n.is_read ? '' : ' is-unread');

  let icon = '🔔';
  if (n.type === 'message') icon = '💬';
  if (n.type === 'friend_request') icon = '👥';
  if (n.type === 'friend_accepted') icon = '✅';
  if (n.type === 'support') icon = '🛠️';

  div.innerHTML = `
    <div class="mg-notification__top">
      <div class="mg-notification__icon">${icon}</div>
      <div class="mg-notification__content">
        <div class="mg-notification__title">${escapeHtml(n.title || 'Notificación')}</div>
        <div class="mg-notification__text">${escapeHtml(n.text || '')}</div>
        <div class="mg-notification__time">${escapeHtml(formatNotificationDate(n.created_at))}</div>
      </div>
    </div>
  `;

  div.addEventListener('click', async () => {
    closePanel(notificationsPanel);

    if (n.action === 'messages') {
      openPanel(messagesPanel);
      await loadThreads();
    } else if (n.action === 'requests') {
      openPanel(friendsPanel);

      friendsList.hidden = true;
      requestsBox.hidden = false;

      document.querySelectorAll('[data-friendtab]').forEach(b => b.classList.remove('is-active'));
      const requestsTab = document.querySelector('[data-friendtab="requests"]');
      if (requestsTab) requestsTab.classList.add('is-active');

      await loadRequests();
    } else if (n.action === 'friends') {
      openPanel(friendsPanel);

      friendsList.hidden = false;
      requestsBox.hidden = true;

      document.querySelectorAll('[data-friendtab]').forEach(b => b.classList.remove('is-active'));
      const friendsTab = document.querySelector('[data-friendtab="friends"]');
      if (friendsTab) friendsTab.classList.add('is-active');

      await loadFriends();
    }
  });

  notificationsList.appendChild(div);
});
    }catch(err){
      notificationsList.innerHTML = `<div class="mg-empty">❌ ${err.message}</div>`;
    }
  }
  // Convierte la fecha de la notificación a un formato legible para el usuario.
  function formatNotificationDate(dateStr){
    if(!dateStr) return '';
    const d = new Date(dateStr);
    if(isNaN(d)) return '';
    return d.toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  })();