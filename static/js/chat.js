// --- ChatService: Gerencia a conexão Socket.IO (Singleton) ---
class ChatService {
    constructor() {
        if (ChatService.instance) {
            return ChatService.instance;
        }

        console.log("[ChatService] Inicializando serviço...");
        this.socket = null;
        this.listeners = new Map(); // Map<EventName, Set<Callback>>
        this.chatId = null;
        this.isConnected = false;

        ChatService.instance = this;
    }

    connect(chatId) {
        this.chatId = chatId;

        // Se já existe socket, verificar estado
        if (this.socket) {
            if (this.socket.connected) {
                console.log("[ChatService] Socket já conectado. Reutilizando.");
                this.joinRoom(); // Garante que estamos na sala certa
                return;
            } else {
                console.log("[ChatService] Socket desconectado. Reconectando...");
                this.socket.connect();
                return;
            }
        }

        console.log("[ChatService] Criando nova conexão Socket.IO...");
        // forceNew: true garante uma conexão limpa se houve problemas anteriores,
        // mas como gerenciamos o singleton, podemos usar padrão ou forceNew.
        // Vamos usar padrão para evitar overhead, já que gerenciamos o objeto.
        this.socket = io({
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this._setupInternalListeners();
    }

    disconnect() {
        if (this.socket) {
            console.log("[ChatService] Desconectando socket...");
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }

    _setupInternalListeners() {
        this.socket.on('connect', () => {
            console.log("[ChatService] Conectado!");
            this.isConnected = true;
            this.joinRoom();
        });

        this.socket.on('disconnect', () => {
            console.log("[ChatService] Desconectado.");
            this.isConnected = false;
        });

        // Eventos de Negócio
        this.socket.on('new_general_message', (msg) => this.notify('general_message', msg));
        this.socket.on('new_private_message', (msg) => this.notify('private_message', msg));

        // Histórico
        this.socket.on('general_messages_history', (data) => this.notify('history_general', data));
        this.socket.on('private_messages_history', (data) => this.notify('history_private', data));

        // Lista de Usuários
        this.socket.on('update_user_list', (data) => this.notify('user_list_update', data));
    }

    joinRoom() {
        if (!this.socket || !this.chatId) return;
        console.log(`[ChatService] Entrando na sala ${this.chatId}...`);
        this.socket.emit('join', { chat_id: this.chatId });
        this.loadGeneralHistory();
    }

    loadGeneralHistory() {
        if (this.socket && this.chatId) {
            console.log("[ChatService] Solicitando histórico geral...");
            this.socket.emit('load_general_messages', { chat_id: this.chatId });
        }
    }

    loadPrivateHistory(targetUsername) {
        if (this.socket && this.chatId) {
            const myUsername = window.myUsername;
            this.socket.emit('load_private_messages', {
                myUsername: myUsername,
                target_username: targetUsername,
                chat_id: this.chatId
            });
        }
    }

    sendGeneralMessage(content) {
        if (!this.socket) return;
        const myUsername = window.myUsername;
        this.socket.emit('general_message', {
            username: myUsername,
            chat_id: this.chatId,
            content: content
        });
    }

    sendPrivateMessage(targetUsername, content) {
        if (!this.socket) return;
        const myUsername = window.myUsername;
        this.socket.emit('private_message', {
            username: myUsername,
            target_username: targetUsername,
            content: content,
            chat_id: this.chatId
        });
    }

    // --- Sistema de Pub/Sub para a UI ---
    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    unsubscribe(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    notify(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }
}

// --- ChatUI: Gerencia o DOM e Interação (View) ---
class ChatUI {
    constructor() {
        this.service = new ChatService(); // Pega o singleton
        this.myUsername = window.myUsername;
        this.myUserId = window.myUserId;
        this.openPrivateChats = new Set();

        // Elementos DOM (assumindo que o HTML já foi injetado)
        this.dom = {
            userList: document.getElementById('user-list'),
            tabsList: document.getElementById('chat-tabs-list'),
            tabsContent: document.getElementById('chat-tabs-content'),
            form: document.getElementById('chatForm'),
            input: document.getElementById('myMessage')
        };

        // Bindings para não perder o 'this'
        this.handleUserClick = this.handleUserClick.bind(this);
        this.handleTabClose = this.handleTabClose.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);

        // Callbacks do Service
        this.onGeneralMessage = this.onGeneralMessage.bind(this);
        this.onPrivateMessage = this.onPrivateMessage.bind(this);
        this.onHistoryGeneral = this.onHistoryGeneral.bind(this);
        this.onHistoryPrivate = this.onHistoryPrivate.bind(this);
        this.onUserListUpdate = this.onUserListUpdate.bind(this);
    }

    init() {
        if (!this.dom.tabsList || !this.dom.tabsContent) {
            console.error("[ChatUI] Elementos DOM não encontrados!");
            return;
        }

        console.log("[ChatUI] Inicializando UI...");
        this.buildInitialLayout();
        this.attachDOMListeners();
        this.subscribeToService();
    }

    destroy() {
        console.log("[ChatUI] Destruindo UI e limpando listeners...");
        this.detachDOMListeners();
        this.unsubscribeFromService();
        // Não desconectamos o service, pois ele pode manter a conexão viva se desejado,
        // ou o show_session.js pode chamar service.disconnect() explicitamente.
    }

    buildInitialLayout() {
        // Aba Geral Padrão
        this.dom.tabsList.innerHTML = `
            <li class="nav-item">
                <button class="nav-link active" id="tab-btn-geral" data-bs-toggle="tab" data-bs-target="#tab-pane-geral" type="button" role="tab">Geral</button>
            </li>`;
        this.dom.tabsContent.innerHTML = `
            <div class="tab-pane fade show active" id="tab-pane-geral" role="tabpanel">
                <ul class="list-unstyled overflow-auto chat-messages" style="height: 60vh;"></ul>
            </div>`;
    }

    attachDOMListeners() {
        this.dom.userList.addEventListener('click', this.handleUserClick);
        this.dom.tabsList.addEventListener('click', this.handleTabClose);
        this.dom.form.addEventListener('submit', this.handleSubmit);
    }

    detachDOMListeners() {
        if (this.dom.userList) this.dom.userList.removeEventListener('click', this.handleUserClick);
        if (this.dom.tabsList) this.dom.tabsList.removeEventListener('click', this.handleTabClose);
        if (this.dom.form) this.dom.form.removeEventListener('submit', this.handleSubmit);
    }

    subscribeToService() {
        this.service.subscribe('general_message', this.onGeneralMessage);
        this.service.subscribe('private_message', this.onPrivateMessage);
        this.service.subscribe('history_general', this.onHistoryGeneral);
        this.service.subscribe('history_private', this.onHistoryPrivate);
        this.service.subscribe('user_list_update', this.onUserListUpdate);
    }

    unsubscribeFromService() {
        this.service.unsubscribe('general_message', this.onGeneralMessage);
        this.service.unsubscribe('private_message', this.onPrivateMessage);
        this.service.unsubscribe('history_general', this.onHistoryGeneral);
        this.service.unsubscribe('history_private', this.onHistoryPrivate);
        this.service.unsubscribe('user_list_update', this.onUserListUpdate);
    }

    // --- Lógica de UI ---

    handleUserClick(e) {
        const userItem = e.target.closest('[data-user-id]');
        if (userItem) {
            const targetUsername = userItem.dataset.userName;
            this.openPrivateChatTab(targetUsername);
        }
    }

    handleTabClose(e) {
        if (e.target.classList.contains('btn-close')) {
            e.stopPropagation();
            const targetUsername = e.target.dataset.userId; // Dataset armazena o username no HTML gerado
            this.closePrivateChatTab(targetUsername);
        }
    }

    handleSubmit(e) {
        e.preventDefault();
        const msg = this.dom.input.value.trim();
        if (!msg) return;

        const activeTab = this.dom.tabsList.querySelector('.nav-link.active');
        if (!activeTab) return;

        if (activeTab.id === 'tab-btn-geral') {
            this.service.sendGeneralMessage(msg);
        } else {
            const targetUsername = activeTab.textContent.trim(); // Simplificado, ou pegar do ID
            // O ID do botão é tab-btn-{username}
            const targetUserFromId = activeTab.id.replace('tab-btn-', '');
            this.service.sendPrivateMessage(targetUserFromId, msg);
        }
        this.dom.input.value = "";
    }

    openPrivateChatTab(targetUsername) {
        if (targetUsername === this.myUsername || this.openPrivateChats.has(targetUsername)) {
            // Foca na aba existente se já aberta
            const existingBtn = document.getElementById(`tab-btn-${targetUsername}`);
            if (existingBtn) {
                const tab = new bootstrap.Tab(existingBtn);
                tab.show();
            }
            return;
        }

        console.log(`[ChatUI] Abrindo aba privada para: ${targetUsername}`);

        // Botão da Aba
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `
            <button class="nav-link" id="tab-btn-${targetUsername}" data-bs-toggle="tab" data-bs-target="#tab-pane-${targetUsername}" type="button" role="tab">
                ${targetUsername}
                <span class="btn-close btn-close-sm ms-2" data-user-id="${targetUsername}"></span>
            </button>
        `;
        this.dom.tabsList.appendChild(li);

        // Conteúdo da Aba
        const div = document.createElement('div');
        div.className = 'tab-pane fade';
        div.id = `tab-pane-${targetUsername}`;
        div.role = 'tabpanel';
        div.innerHTML = `<ul class="list-unstyled overflow-auto chat-messages" style="height: 60vh;"></ul>`;
        this.dom.tabsContent.appendChild(div);

        this.openPrivateChats.add(targetUsername);

        // Ativar a nova aba
        const newTab = new bootstrap.Tab(li.querySelector('button'));
        newTab.show();

        // Carregar histórico
        this.service.loadPrivateHistory(targetUsername);
    }

    closePrivateChatTab(targetUsername) {
        console.log(`[ChatUI] Fechando aba de: ${targetUsername}`);
        const btn = document.getElementById(`tab-btn-${targetUsername}`);
        const pane = document.getElementById(`tab-pane-${targetUsername}`);

        if (btn) btn.parentElement.remove();
        if (pane) pane.remove();

        this.openPrivateChats.delete(targetUsername);

        // Voltar para Geral
        const geralBtn = document.getElementById('tab-btn-geral');
        if (geralBtn) {
            const tab = new bootstrap.Tab(geralBtn);
            tab.show();
        }
    }

    addMessageToPane(paneId, message) {
        const pane = document.getElementById(paneId);
        if (!pane) return; // UI não pronta ou aba fechada

        const ul = pane.querySelector('.chat-messages');
        if (!ul) return;

        const li = document.createElement('li');
        const isMyMessage = message.username === this.myUsername;

        if (message.content && message.content.includes("aviso -")) {
            li.className = `d-flex flex-column my-2 item-warning align-items-center green`;
            li.innerHTML = `<span class="badge bg-info text-dark">${message.content.replace("aviso - ", "")}</span>`;
        } else {
            li.className = `d-flex flex-column my-2 ${isMyMessage ? 'align-items-end' : 'align-items-start'}`;
            li.innerHTML = `
                <div class="m-2 p-2 rounded message ${isMyMessage ? 'bg-primary text-white' : 'bg-light border'}">
                    <strong class="d-block small ${isMyMessage ? 'text-white-50' : 'text-muted'}">${message.username}</strong>
                    <span>${message.content}</span>
                </div>
            `;
        }
        ul.appendChild(li);
        ul.scrollTop = ul.scrollHeight;
    }

    // --- Handlers de Eventos do Service ---

    onGeneralMessage(msg) {
        this.addMessageToPane('tab-pane-geral', msg);
    }

    onPrivateMessage(msg) {
        // Lógica: se recebi mensagem de X, abro a aba de X se não existir
        const sender = msg.username;
        const target = msg.target_username;

        let chatPartner = (sender === this.myUsername) ? target : sender;

        // Se a aba não existe, abre
        if (!this.openPrivateChats.has(chatPartner)) {
            this.openPrivateChatTab(chatPartner);
        }

        this.addMessageToPane(`tab-pane-${chatPartner}`, msg);
    }

    onHistoryGeneral(data) {
        console.log("[ChatUI] Histórico geral recebido.", data);
        const pane = document.getElementById('tab-pane-geral');
        if (pane) {
            const ul = pane.querySelector('.chat-messages');
            if (ul) {
                ul.innerHTML = ''; // Limpa
                if (data.messages) {
                    data.messages.forEach(msg => this.addMessageToPane('tab-pane-geral', msg));
                }
            }
        }
    }

    onHistoryPrivate(data) {
        // data = { target_username, with_user_id, messages: [] }
        const partner = data.target_username; // Quem eu estou conversando
        // Verifica se é o histórico correto para a aba aberta?
        // O backend envia 'target_username' no payload para ajudar

        const paneId = `tab-pane-${partner}`;
        const pane = document.getElementById(paneId);
        if (pane) {
            const ul = pane.querySelector('.chat-messages');
            if (ul) {
                ul.innerHTML = '';
                if (data.messages) {
                    data.messages.forEach(msg => this.addMessageToPane(paneId, msg));
                }
            }
        }
    }

    onUserListUpdate(userListDataString) {
        try {
            const users = JSON.parse(userListDataString);
            this.dom.userList.innerHTML = '';

            users.forEach(user => {
                if (user.username === this.myUsername) return; // Não mostrar a si mesmo

                const a = document.createElement('a');
                a.href = '#';
                a.className = 'list-group-item list-group-item-action';
                a.dataset.userId = user.id;
                a.dataset.userName = user.username;
                a.textContent = `${user.username} (${user.type})`;

                this.dom.userList.appendChild(a);
            });
        } catch (e) {
            console.error("Erro ao processar lista de usuários:", e);
        }
    }
}

// --- Função Global de Inicialização ---
// Esta função é chamada pelo show_session.js quando o fragmento é carregado.
// Retorna a instância da UI para que o chamador possa destruí-la depois.

function initializeChatComponent() {
    // 1. Inicializa o Singleton do Service (se não existir) e conecta
    const service = new ChatService();
    service.connect(window.chatId);

    // 2. Inicializa a UI
    const ui = new ChatUI();
    ui.init();

    // 3. Retorna o objeto UI para controle de lifecycle externo
    return ui;
}
