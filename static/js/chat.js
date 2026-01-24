// Todo o JavaScript virá aqui
// console.log("Chat.js carregado!");

function initializeChatComponent() {


    const socket = io();

    const myUsername = window.myUsername;
    const myUserId = window.myUserId;
    const chatId = window.chatId;

    // console.log(`Usuário atual: ${myUsername} (ID: ${myUserId}) no chat ${chatId}`);

    // Elementos da UI
    const userList = document.getElementById('user-list');
    const chatTabsList = document.getElementById('chat-tabs-list');
    const chatTabsContent = document.getElementById('chat-tabs-content');
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('myMessage');

    // Estado para controlar as conversas privadas abertas
    let openPrivateChats = new Set();

    // --- FUNÇÕES PRINCIPAIS ---

    /**
     * Cria e abre uma nova aba de chat privado
     * @param {string} userId - O ID do usuário com quem conversar
     * @param {string} recive_username - O nome do usuário
     */
    function openPrivateChat(sender_username, target_username) {

        // console.log(`Abrindo chat privado com ${target_username} (ID: ${userId})`);
        // console.log(`Usuário atual: ${myUsername} (ID: ${myUserId})`);
        // console.log(userId == myUserId && target_username == myUsername);
        // Não abrir uma aba para se mesmo

        console.log(`bloqueando abrir novo chat: `, myUsername == target_username);
        console.log(`abrindo chat privado com ${target_username} (meu username: ${myUsername})`);

        if (target_username == myUsername || openPrivateChats.has(target_username)) {
            console.warn("Chat já aberto ou tentativa de abrir consigo mesmo. Ignorando.");
            return;
        }

        console.log("oiiii");
        // console.log(`Abrindo chat privado com ${target_username} meu username: ${myUsername}`);
        // 1. Criar o botão da aba (com ícone de fechar)
        const tabButton = document.createElement('li');
        tabButton.className = 'nav-item';
        tabButton.innerHTML = `
            <button class="nav-link"  id="tab-btn-${target_username}" data-bs-toggle="tab" data-bs-target="#tab-pane-${target_username}" type="button" role="tab" aria-controls="tab-pane-${target_username}" aria-selected="false">
                ${target_username}
                <span class="btn-close btn-close-sm ms-2" data-user-id="${target_username}" aria-label="Close"></span>
            </button>
        `;
        chatTabsList.appendChild(tabButton);

        // 2. Criar o painel de conteúdo da aba
        const tabPane = document.createElement('div');
        tabPane.className = 'tab-pane fade';
        tabPane.id = `tab-pane-${target_username}`;
        tabPane.role = 'tabpanel';
        tabPane.innerHTML = `<ul class="list-unstyled overflow-auto chat-messages" style="height: 60vh;"></ul>`; // Área para mensagens
        chatTabsContent.appendChild(tabPane);
        chatTabsContent.scrollTop = chatTabsContent.scrollHeight;

        // 3. Adicionar ao estado e ativar a nova aba

        openPrivateChats.add(target_username);
        const newTab = new bootstrap.Tab(tabButton.querySelector('button'));
        newTab.show();

        // 4. Pedir ao servidor o histórico de mensagens desta conversa privada
        socket.emit('load_private_messages', {
            myUsername: sender_username,
            target_username: target_username,
            // with_user_id: userId,
            chat_id: chatId
        });
    }

    /**
     * Adiciona uma mensagem de texto a um painel de chat específico
     * @param {string} paneId - ID do painel de conteúdo (ex: 'tab-pane-geral' ou 'tab-pane-123')
     * @param {object} message - Objeto da mensagem {username, content}
     */
    function addMessageToPane(paneId, message) {
        // console.log(`Adicionando mensagem ao painel ${paneId}: >>> `, message);

        const pane = document.getElementById(paneId);
        if (!pane) return;
        // console.log('3 - oii >> ', pane);

        const messagesUl = pane.querySelector('.chat-messages');
        // console.log(messagesUl);
        const item = document.createElement('li');

        // console.log(item);

        if (message.content == null || message.content == undefined) {
            console.log(message.content, chatId);
            console.warn("Mensagem sem conteúdo. Ignorando.");
            return;
        }

        if (message.content.includes("aviso -")) {
            item.className = `d-flex flex-column my-2 item-warning align-items-center green`;
            item.innerHTML = message.content.replace("aviso - ", "");

        } else {
            item.className = `d-flex flex-column my-2 ${message.username === myUsername ? 'align-items-end' : 'align-items-start'}`;

            item.innerHTML = `
            <div class="m-3 message ${message.username === myUsername ? 'my-message' : 'other-message'}">
            <span class="username">${message.username}</span>
            <span>${message.content}</span>
            </div>
            `;
        }

        messagesUl.appendChild(item);
        messagesUl.scrollTop = messagesUl.scrollHeight; // Auto-scroll
    }

    // --- MANIPULADORES DE EVENTOS (EVENT LISTENERS) ---

    // Lidar com cliques na lista de usuários para abrir chats
    userList.addEventListener('click', function (e) {
        const userItem = e.target.closest('[data-user-id]');
        if (userItem) {
            const receiveUserId = userItem.dataset.userId;
            const receiveUserName = userItem.dataset.userName;
            console.log(`Clicou no usuário: ${receiveUserName} (ID: ${receiveUserId})`);

            if (openPrivateChats.has(receiveUserName)) {
                console.warn(`Aba Já aberta!`);
            } else {
                openPrivateChat(myUsername, receiveUserName);
            }
        }
    });

    // Lidar com o fechamento de uma aba
    chatTabsList.addEventListener('click', function (e) {
        if (e.target.classList.contains('btn-close')) {
            e.stopPropagation(); // Impede que o clique ative a aba antes de fechar

            const targetUsername = e.target.dataset.userId;
            console.log(`targetUsername: ${targetUsername}`);

            // Remove o botão e o painel
            const tabButton = document.querySelector(`#tab-btn-${targetUsername}`).parentElement;
            const tabPane = document.querySelector(`#tab-pane-${targetUsername}`);
            tabButton.remove();
            tabPane.remove();

            // Remove do estado
            openPrivateChats.delete(targetUsername);

            // Ativa a aba "Geral" por padrão
            const generalTab = new bootstrap.Tab(document.querySelector('#tab-btn-geral'));
            generalTab.show();
        }
    });

    // Lidar com o envio de mensagem
    chatForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message === "") return;

        // Descobrir qual aba está ativa
        const activeTab = document.querySelector('#chat-tabs-list .nav-link.active');
        const activeTabUsername = activeTab.id; // ex: 'tab-btn-geral' ou 'tab-btn-usename'
        // console.log(">>>>>  ", activeTab)

        if (activeTabUsername === 'tab-btn-geral') {
            socket.emit('general_message', {
                username: myUsername,
                chat_id: chatId,
                content: message
            });
        } else {
            const targetUsername = activeTabUsername.replace('tab-btn-', '');
            // const targetUserName = 
            // console.log(activeTab);
            // console.log(`Enviando mensagem privada para o usuário: ${targetUsername}`);
            // console.log("1 - oiiii");
            socket.emit('private_message', {
                username: myUsername,
                target_username: targetUsername,
                content: message,
                chat_id: chatId
            });
            // Adiciona a mensagem à sua própria tela imediatamente
            // addMessageToPane(`tab-pane-${targetUserId}`, { username: myUsername, content: message });
        }

        messageInput.value = "";
    });


    // --- SOCKET.IO LISTENERS ---

    socket.on('connect', function () {
        console.log('Conectado ao servidor!');
        socket.emit('join', { chat_id: chatId });
    });

    socket.on('new_private_message', function (message) {
        const sender_username = message.username;
        const target_username = message.target_username;

        if (myUsername !== sender_username && myUsername !== target_username) {
            return;
        }

        const isSender = myUsername === sender_username;
        const otherUsername = isSender ? target_username : sender_username;
        const paneId = `tab-pane-${otherUsername}`;

        // Abrir o chat com o outro usuário (remetente ou destinatário)
        openPrivateChat(myUsername, otherUsername);

        // Adicionar a mensagem à aba correta
        addMessageToPane(paneId, message);
    });


    socket.on('update_user_list', function (userListDataString) {
        console.log("Atualizando lista de usuários...");
        console.log("Dados recebidos (string):", userListDataString);

        // 2. Usamos JSON.parse() para transformar a string em um array de objetos JavaScript.
        const parsedUsers = JSON.parse(userListDataString);
        console.log("Dados convertidos (array):", parsedUsers);

        // 3. Limpamos o CONTEÚDO do elemento <ul>.
        userList.innerHTML = '';

        // 4. Agora, iteramos sobre o ARRAY 'parsedUsers', que é um array de verdade.
        parsedUsers.forEach(user => {
            console.log("Adicionando usuário:", user);
            // Não mostra você mesmo na lista para iniciar chat
            // Certifique-se que 'myUserId' está definido e é um número ou string consistente com 'user.id'
            if (user.username == myUsername && user.id == myUserId) return;

            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action';
            item.dataset.userId = user.id;
            item.dataset.userName = user.username;

            // Adiciona o tipo de usuário (Estudante/Professor) para ficar mais claro
            item.textContent = `${user.username} (${user.type})`;

            // 5. Adicionamos o novo elemento <a> ao elemento <ul> da página.
            userList.appendChild(item);
        });
    });

    socket.on('general_message', function (message) {
        addMessageToPane('tab-pane-geral', message);
    });

    function showUserJoinedToChat(msg) {
        socket.emit('general_message', {
            username: myUsername,
            chat_id: chatId,
            content: msg
        });
    }

    socket.on('new_general_message', function (message) {
        // Adiciona a mensagem à aba "Geral"
        addMessageToPane('tab-pane-geral', message);
    });

    // socket.on('private_message', function (message) {
    //     // A mensagem vem de 'sender_id'. O outro participante é você.
    //     const otherUserId = message.sender_id;
    //     // console.log(">>>>>>>>>>>>>>>>>>>>>>> ")
    //     // Abre a aba se não estiver aberta
    //     console.log("oiiii")
    //     openPrivateChat(otherUserId, message.username);
    //     // Adiciona a mensagem
    //     addMessageToPane(`tab-pane-${otherUserId}`, message);
    // });

    socket.on('general_messages_history', function (messages) {
        console.log('Carregando histórico de mensagens gerais...');
        console.log(messages);
        const pane = document.getElementById('tab-pane-geral');
        const messagesUl = pane.querySelector('.chat-messages');
        messagesUl.innerHTML = ''; // Limpa antes de carregar
        messages['messages'].forEach(msg => addMessageToPane('tab-pane-geral', msg));

        // Notifica os outros na sala que um novo usuário entrou
        showUserJoinedToChat(`aviso - ${myUsername} entrou na sala geral.`)
        // console.log(`${myUsername} entrou na sala geral.`);
    });

    socket.on('private_messages_history', function (data) {
        const paneId = `tab-pane-${data.target_username}`;
        const pane = document.getElementById(paneId);
        if (!pane) return;

        const messagesUl = pane.querySelector('.chat-messages');
        messagesUl.innerHTML = ''; // Limpa antes de carregar
        // console.log(">>> ", data)
        data.messages.forEach(msg => addMessageToPane(paneId, msg));
    });

    // --- INICIALIZAÇÃO ---
    function initializeChat() {
        // Cria a aba "Geral"
        chatTabsList.innerHTML = `
            <li class="nav-item">
                <button class="nav-link active" id="tab-btn-geral" data-bs-toggle="tab" data-bs-target="#tab-pane-geral" type="button" role="tab" aria-controls="tab-pane-geral" aria-selected="true">Geral</button>
            </li>`;
        chatTabsContent.innerHTML = `
            <div class="tab-pane fade show active" id="tab-pane-geral" role="tabpanel">
                <ul class="list-unstyled overflow-auto chat-messages" style="height: 60vh;"></ul>
            </div>`;

        // Solicita o histórico geral ao se conectar
        socket.emit('load_general_messages', { chat_id: chatId });
    }

    initializeChat();
};