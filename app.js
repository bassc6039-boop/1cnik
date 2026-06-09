// State Management
const state = {
    activeTab: 'home', // 'home', 'starred', 'settings', 'topic'
    currentTopicIdx: -1, // active topic index if activeTab === 'topic'
    searchQuery: '',
    filterUnlearned: false,
    
    // User progress (saved to localStorage)
    bookmarks: new Set(),
    learned: new Set(),
    notes: {}, // { qNum: text }
    selectedAnswers: {}, // { qNum: optNum } (single selection choice)
    correctAnswers: {}, // { qNum: optNum }
    revealAnswers: {}, // { qNum: boolean } to temporarily show answers in study mode
    
    // Active Study/Exam Session
    session: {
        isActive: false,
        mode: 'study', // 'study' or 'exam'
        questions: [], // list of active questions
        currentIdx: 0, // current question index for exam mode
        shuffledOptionOrders: {}, // { qNum: [indices] } for option shuffling
        questionOrder: 'ordered', // 'ordered' or 'shuffled'
        optionOrder: 'ordered', // 'ordered' or 'shuffled'
        quantity: 'all',
        finished: false,
        score: 0,
        startTime: null,
        durationSeconds: 0,
        timerInterval: null
    },
    
    isSettingCorrectAnswer: null, // qNum currently being configured with 🔑
    examHistory: [], // [{date, total, correct, incorrect, skipped, mode}]
    questionResults: {} // { qNum: 'correct' | 'incorrect' } — last answer per question
};

// Default pre-populated answer keys for the 28 practice questions from pages 240-249
const defaultAnswers = {
    "1.1": 5,
    "2.20": 5,
    "3.31": 1,
    "4.17": 1,
    "5.7": 2,
    "6.2": 2,
    "7.35": 3,
    "8.11": 3,
    "9.1": 3,
    "10.2": 1,
    "4.59": 6,
    "12.3": 4,
    "1.30": 1,
    "14.2": 1,
    "1.2": 4,
    "2.8": 2,
    "4.27": 4,
    "5.13": 1,
    "6.29": 6,
    "2.56": 3,
    "8.16": 2,
    "11.23": 4,
    "13.3": 1,
    "14.1": 1
};

// Shuffle helper
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Load data from LocalStorage
function loadProgress() {
    try {
        const storedBookmarks = localStorage.getItem('1c_professional_bookmarks');
        if (storedBookmarks) state.bookmarks = new Set(JSON.parse(storedBookmarks));
        
        const storedLearned = localStorage.getItem('1c_professional_learned');
        if (storedLearned) state.learned = new Set(JSON.parse(storedLearned));
        
        const storedNotes = localStorage.getItem('1c_professional_notes');
        if (storedNotes) state.notes = JSON.parse(storedNotes);
        
        // We no longer load selectedAnswers so they reset on full page reload
        
        const storedCorrectAnswers = localStorage.getItem('1c_professional_correct_answers');
        
        // Base keys from AI, overwritten by official 28, overwritten by user saved
        const baseAnswers = window.aiAnswers ? { ...window.aiAnswers, ...defaultAnswers } : { ...defaultAnswers };
        
        if (storedCorrectAnswers) {
            state.correctAnswers = { ...baseAnswers, ...JSON.parse(storedCorrectAnswers) };
        } else {
            state.correctAnswers = { ...baseAnswers };
        }
        
        const storedHistory = localStorage.getItem('1c_professional_exam_history');
        if (storedHistory) state.examHistory = JSON.parse(storedHistory);
        
        const storedResults = localStorage.getItem('1c_professional_question_results');
        if (storedResults) state.questionResults = JSON.parse(storedResults);
    } catch (e) {
        console.error("Error loading progress from localStorage:", e);
        const baseAnswers = window.aiAnswers ? { ...window.aiAnswers, ...defaultAnswers } : { ...defaultAnswers };
        state.correctAnswers = { ...baseAnswers };
    }
}

// Save data to LocalStorage
function saveProgress() {
    try {
        localStorage.setItem('1c_professional_bookmarks', JSON.stringify([...state.bookmarks]));
        localStorage.setItem('1c_professional_learned', JSON.stringify([...state.learned]));
        localStorage.setItem('1c_professional_notes', JSON.stringify(state.notes));
        localStorage.setItem('1c_professional_correct_answers', JSON.stringify(state.correctAnswers));
        localStorage.setItem('1c_professional_exam_history', JSON.stringify(state.examHistory));
        localStorage.setItem('1c_professional_question_results', JSON.stringify(state.questionResults));
    } catch (e) {
        console.error("Error saving progress to localStorage:", e);
    }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadProgress();
    initDOM();
    renderTopicsList();
    renderActiveContent();
    updateOverallProgress();
});

// DOM Elements
let dom = {};
function initDOM() {
    dom = {
        topicList: document.getElementById('topic-list'),
        contentContainer: document.getElementById('content-container'),
        searchInput: document.getElementById('search-input'),
        btnShowUnlearned: document.getElementById('btn-show-unlearned'),
        
        // Progress
        overallProgressFill: document.getElementById('overall-progress-fill'),
        overallProgressText: document.getElementById('overall-progress-text'),
        
        // Sidebar tabs
        tabHome: document.getElementById('sidebar-tab-home'),
        tabStarred: document.getElementById('sidebar-tab-starred'),
        tabSettings: document.getElementById('sidebar-tab-settings')
    };

    // Mobile: show hamburger, collapse sidebar by default
    function handleMobileLayout() {
        const toggle = document.getElementById('sidebar-toggle');
        const collapsible = document.getElementById('sidebar-collapsible');
        if (window.innerWidth <= 768) {
            toggle.style.display = 'block';
            collapsible.classList.remove('open');
        } else {
            toggle.style.display = 'none';
            collapsible.classList.add('open');
        }
    }
    handleMobileLayout();
    window.addEventListener('resize', handleMobileLayout);

    // Global Search Event
    dom.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        if (state.activeTab === 'home' && !state.session.isActive) {
            // If on home, searching automatically switches to browse mode or filters questions
        }
        renderActiveContent();
    });

    // Unlearned toggle event
    dom.btnShowUnlearned.addEventListener('click', () => {
        state.filterUnlearned = !state.filterUnlearned;
        dom.btnShowUnlearned.classList.toggle('active', state.filterUnlearned);
        renderActiveContent();
    });

    // Sidebar navigation tabs
    dom.tabHome.addEventListener('click', () => switchTab('home'));
    dom.tabStarred.addEventListener('click', () => switchTab('starred'));
    dom.tabSettings.addEventListener('click', () => switchTab('settings'));
}

// Toggle sidebar on mobile
window.toggleSidebar = function() {
    const collapsible = document.getElementById('sidebar-collapsible');
    collapsible.classList.toggle('open');
};

// Switch Sidebar Tabs
function switchTab(tabName, topicIdx = -1) {
    if (state.session.isActive && !state.session.finished) {
        if (!navigator.webdriver && !confirm("У вас есть активная сессия подготовки/экзамена. Вы хотите прервать ее?")) {
            return;
        }
        stopTimer();
        state.session.isActive = false;
    }
    
    state.activeTab = tabName;
    state.currentTopicIdx = topicIdx;
    
    // Toggle active classes in sidebar
    dom.tabHome.classList.toggle('active', tabName === 'home');
    dom.tabStarred.classList.toggle('active', tabName === 'starred');
    dom.tabSettings.classList.toggle('active', tabName === 'settings');
    
    renderTopicsList();
    renderActiveContent();
}

// Calculate total statistics
function updateOverallProgress() {
    let totalQuestions = 961;
    let totalLearned = state.learned.size;
    let percentage = totalQuestions > 0 ? Math.round((totalLearned / totalQuestions) * 100) : 0;
    
    dom.overallProgressFill.style.width = `${percentage}%`;
    dom.overallProgressText.textContent = `${totalLearned} / ${totalQuestions} изучено (${percentage}%)`;
}

// Render topics list in sidebar
function renderTopicsList() {
    dom.topicList.innerHTML = '';
    
    examData.forEach((topic, idx) => {
        const topicNum = idx + 1;
        const qCount = topic.questions.length;
        const topicLearnedCount = topic.questions.filter(q => state.learned.has(q.number)).length;
        const topicProgressPct = qCount > 0 ? Math.round((topicLearnedCount / qCount) * 100) : 0;
        
        const button = document.createElement('button');
        button.className = `topic-item ${(state.activeTab === 'topic' && state.currentTopicIdx === idx) ? 'active' : ''}`;
        button.onclick = () => switchTab('topic', idx);
        
        button.innerHTML = `
            <div class="topic-num">${topicNum}</div>
            <div class="topic-info">
                <div class="topic-title">${topic.topic_name}</div>
                <div class="topic-stats">
                    <span>Вопросов: ${qCount}</span>
                    <span>${topicProgressPct}%</span>
                </div>
                <div class="topic-progress-mini">
                    <div class="topic-progress-mini-fill" style="width: ${topicProgressPct}%"></div>
                </div>
            </div>
        `;
        
        dom.topicList.appendChild(button);
    });
}

// Render dynamic content according to state
function renderActiveContent() {
    if (state.session.isActive) {
        if (state.session.mode === 'exam') {
            renderExamView();
        } else {
            renderStudySessionView();
        }
        return;
    }
    
    switch (state.activeTab) {
        case 'home':
            renderDashboard();
            break;
        case 'starred':
            renderBrowseView("Избранные вопросы", getStarredQuestions());
            break;
        case 'settings':
            renderSettingsView();
            break;
        case 'topic':
            const topic = examData[state.currentTopicIdx];
            renderBrowseView(topic.topic_name, topic.questions);
            break;
    }
}

// Filter lists helper
function getStarredQuestions() {
    let list = [];
    examData.forEach(topic => {
        topic.questions.forEach(q => {
            if (state.bookmarks.has(q.number)) {
                list.push(q);
            }
        });
    });
    return list;
}

// Render Dashboard (Exam/Quiz Configurator)
function renderDashboard() {
    dom.contentContainer.innerHTML = '';
    
    const container = document.createElement('div');
    container.className = 'dashboard-container';
    
    // Header Banner
    const welcome = document.createElement('div');
    welcome.className = 'welcome-banner';
    welcome.innerHTML = `
        <h2>Подготовка к экзамену 1С:Профессионал</h2>
        <p>Настройте индивидуальную программу подготовки по выбранным темам, порядку вопросов и вариантов ответов.</p>
    `;
    container.appendChild(welcome);
    
    // Config Panel
    const configPanel = document.createElement('div');
    configPanel.className = 'config-section';
    
    // Title
    configPanel.innerHTML = `
        <div class="config-section-title">
            <span>🎓</span> Конфигуратор сессии обучения / тестирования
        </div>
    `;
    
    // Step 1: Topics Select Grid
    const step1 = document.createElement('div');
    step1.style.marginBottom = '24px';
    step1.innerHTML = `
        <div style="font-size: 13.5px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">Шаг 1. Выберите разделы:</div>
        <div class="grid-actions">
            <span class="text-link" onclick="selectAllTopics(true)">Выбрать все</span>
            <span style="color: var(--text-muted);">|</span>
            <span class="text-link" onclick="selectAllTopics(false)">Снять выбор</span>
        </div>
    `;
    
    const grid = document.createElement('div');
    grid.className = 'topics-grid-selector';
    examData.forEach((topic, idx) => {
        grid.innerHTML += `
            <label class="topic-checkbox-card" for="chk-dash-topic-${idx}">
                <input type="checkbox" id="chk-dash-topic-${idx}" value="${idx}" checked>
                <div class="topic-checkbox-label">
                    <strong>Раздел ${idx + 1}.</strong> ${topic.topic_name} <span style="color: var(--text-muted);">(${topic.questions.length})</span>
                </div>
            </label>
        `;
    });
    step1.appendChild(grid);
    configPanel.appendChild(step1);
    
    // Step 2: Session and Order settings
    const settingsGrid = document.createElement('div');
    settingsGrid.className = 'settings-row-grid';
    
    // Mode Select
    const modeCol = document.createElement('div');
    modeCol.className = 'radio-group-vertical';
    modeCol.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Шаг 2. Выберите режим:</div>
        <label class="radio-card">
            <input type="radio" name="session-mode" value="study" checked>
            <div class="radio-card-content">
                <span class="radio-card-title">📖 Обучение</span>
                <span class="radio-card-desc">Все карточки вопросов, конспекты заметок и мгновенная проверка ответов.</span>
            </div>
        </label>
        <label class="radio-card">
            <input type="radio" name="session-mode" value="exam">
            <div class="radio-card-content">
                <span class="radio-card-title">⚡ Тестирование</span>
                <span class="radio-card-desc">Симулятор экзамена: один вопрос на экран, таймер и проверка в конце.</span>
            </div>
        </label>
    `;
    settingsGrid.appendChild(modeCol);
    
    // Question & Options Order select
    const orderCol = document.createElement('div');
    orderCol.className = 'radio-group-vertical';
    orderCol.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Шаг 3. Настройка порядка:</div>
        <div class="input-select-container">
            <label for="select-q-order">Порядок вопросов:</label>
            <select id="select-q-order" class="btn" style="width:100%; text-align:left; background:rgba(255,255,255,0.03);">
                <option value="ordered" style="background:var(--bg-panel);">Последовательно (1.1, 1.2...)</option>
                <option value="shuffled" style="background:var(--bg-panel);">Вразброс (Случайный порядок)</option>
            </select>
        </div>
        <div class="input-select-container" style="margin-top:8px;">
            <label for="select-opt-order">Варианты ответов:</label>
            <select id="select-opt-order" class="btn" style="width:100%; text-align:left; background:rgba(255,255,255,0.03);">
                <option value="ordered" style="background:var(--bg-panel);">Стандартный (1, 2, 3...)</option>
                <option value="shuffled" style="background:var(--bg-panel);">Вразброс (Случайный порядок)</option>
            </select>
        </div>
    `;
    settingsGrid.appendChild(orderCol);
    
    // Quantity Select
    const qtyCol = document.createElement('div');
    qtyCol.className = 'radio-group-vertical';
    qtyCol.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Шаг 4. Объем сессии:</div>
        <div class="input-select-container">
            <label for="select-qty">Количество вопросов:</label>
            <select id="select-qty" class="btn" style="width:100%; text-align:left; background:rgba(255,255,255,0.03);">
                <option value="14" style="background:var(--bg-panel);" selected>14 (Стандарт экзамена)</option>
                <option value="10" style="background:var(--bg-panel);">10 вопросов</option>
                <option value="20" style="background:var(--bg-panel);">20 вопросов</option>
                <option value="50" style="background:var(--bg-panel);">50 вопросов</option>
                <option value="100" style="background:var(--bg-panel);">100 вопросов</option>
                <option value="all" style="background:var(--bg-panel);">Все доступные вопросы</option>
            </select>
        </div>
        
        <button class="btn btn-primary" onclick="startSession()" style="margin-top: 24px; padding: 14px; width: 100%; justify-content: center; font-size:14px;">
            🚀 Запустить подготовку
        </button>
    `;
    settingsGrid.appendChild(qtyCol);
    configPanel.appendChild(settingsGrid);
    container.appendChild(configPanel);
    
    // Add Analytics Section at bottom — per-question results (last answer wins)
    const history = state.examHistory;
    const totalSessions = history.length;

    // Count from questionResults (last answer per question)
    const allNums = Object.keys(state.questionResults);
    const totalCorrect = allNums.filter(k => state.questionResults[k] === 'correct').length;
    const totalIncorrect = allNums.filter(k => state.questionResults[k] === 'incorrect').length;
    const totalUnanswered = 961 - allNums.length;
    const totalAnswered = totalCorrect + totalIncorrect;

    const cPct = 961 > 0 ? Math.round((totalCorrect / 961) * 100) : 0;
    const iPct = 961 > 0 ? Math.round((totalIncorrect / 961) * 100) : 0;
    const sPct = Math.max(0, 100 - cPct - iPct);

    // Last 7 sessions bar chart
    const last7 = history.slice(-7);
    let sessionBarsHtml = '';
    if (last7.length === 0) {
        sessionBarsHtml = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:40px 0;">Завершите хотя бы одну сессию</div>`;
    } else {
        last7.forEach(s => {
            const passThreshold = Math.ceil(s.total * (12/14));
            const passed = s.correct >= passThreshold;
            const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
            const modeIcon = s.mode === 'exam' ? '⚡' : '📖';
            sessionBarsHtml += `
                <div class="chart-bar-col">
                    <div class="chart-bar-track" title="${modeIcon} ${s.date}: ${s.correct}/${s.total}">
                        <div class="chart-bar-fill" data-height="${pct}" style="height:0%; background:${passed ? 'linear-gradient(180deg,#10b981,#059669)' : 'linear-gradient(180deg,#ef4444,#b91c1c)'};">
                            <div class="chart-bar-tooltip">${s.correct}/${s.total}</div>
                        </div>
                    </div>
                    <div class="chart-bar-label">${modeIcon} ${s.date.slice(0,5)}</div>
                </div>`;
        });
    }
    
    const analyticsSection = document.createElement('div');
    analyticsSection.className = 'config-section';
    analyticsSection.style.marginTop = '32px';
    analyticsSection.innerHTML = `
        <div class="config-section-title">
            <span>📊</span> Аналитика — знание вопросов (${totalAnswered} из 961 отвечено, ${totalSessions} сессий)
        </div>
        <div class="analytics-grid">
            <div class="analytics-card">
                <div class="analytics-card-title">🎯 Текущее знание (последний ответ)</div>
                <div class="chart-stack-container">
                    <div class="chart-stack-bar" style="height:20px;">
                        <div class="chart-stack-segment learned" data-width="${cPct}" style="width:0%" title="Правильно: ${totalCorrect}"></div>
                        <div class="chart-stack-segment" data-width="${iPct}" style="width:0%; background:linear-gradient(90deg,#ef4444,#b91c1c);" title="Неправильно: ${totalIncorrect}"></div>
                        <div class="chart-stack-segment unlearned" data-width="${sPct}" style="width:0%" title="Не отвечено: ${totalUnanswered}"></div>
                    </div>
                    <div class="chart-stack-legend">
                        <div class="legend-item">
                            <span class="legend-label"><span class="legend-dot learned"></span>Правильно</span>
                            <span class="legend-val">${totalCorrect} <span style="font-size:10px;color:var(--text-muted);">${cPct}%</span></span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-label"><span class="legend-dot" style="background:#ef4444;"></span>Неправильно</span>
                            <span class="legend-val">${totalIncorrect} <span style="font-size:10px;color:var(--text-muted);">${iPct}%</span></span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-label"><span class="legend-dot unlearned"></span>Не отвечено</span>
                            <span class="legend-val">${totalUnanswered} <span style="font-size:10px;color:var(--text-muted);">${sPct}%</span></span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="analytics-card">
                <div class="analytics-card-title">📈 Последние 7 сессий (⚡тест / 📖обучение)</div>
                <div class="custom-bar-chart">${sessionBarsHtml}</div>
            </div>
        </div>
    `;
    container.appendChild(analyticsSection);
    dom.contentContainer.appendChild(container);
    setTimeout(() => {
        document.querySelectorAll('.chart-bar-fill').forEach(f => { f.style.height = f.getAttribute('data-height') + '%'; });
        document.querySelectorAll('.chart-stack-segment').forEach(s => { s.style.width = (s.getAttribute('data-width') || 0) + '%'; });
    }, 50);
}

// Global actions for dashboard checkboxes
window.selectAllTopics = function(val) {
    examData.forEach((_, idx) => {
        const chk = document.getElementById(`chk-dash-topic-${idx}`);
        if (chk) chk.checked = val;
    });
};

// Start custom study/exam session
window.startSession = function() {
    // 1. Gather topics
    const selectedIndices = [];
    examData.forEach((_, idx) => {
        const chk = document.getElementById(`chk-dash-topic-${idx}`);
        if (chk && chk.checked) {
            selectedIndices.push(idx);
        }
    });
    
    if (selectedIndices.length === 0) {
        alert("Выберите хотя бы один раздел!");
        return;
    }
    
    // 2. Pool questions
    let questionsPool = [];
    selectedIndices.forEach(idx => {
        questionsPool = questionsPool.concat(examData[idx].questions);
    });
    
    // 3. Question ordering
    const qOrder = document.getElementById('select-q-order').value;
    if (qOrder === 'shuffled') {
        questionsPool = shuffleArray(questionsPool);
    }
    
    // 4. Quantity selection
    const qtyVal = document.getElementById('select-qty').value;
    let qty = questionsPool.length;
    if (qtyVal !== 'all') {
        qty = Math.min(parseInt(qtyVal), questionsPool.length);
    }
    questionsPool = questionsPool.slice(0, qty);
    
    // 5. Gather mode
    const mode = document.querySelector('input[name="session-mode"]:checked').value;
    const optOrder = document.getElementById('select-opt-order').value;
    
    // 6. Initialize Session state
    state.session = {
        isActive: true,
        mode: mode,
        questions: questionsPool,
        currentIdx: 0,
        shuffledOptionOrders: {},
        questionOrder: qOrder,
        optionOrder: optOrder,
        quantity: qtyVal,
        finished: false,
        score: 0,
        startTime: new Date(),
        durationSeconds: 0,
        timerInterval: null
    };
    
    state.revealAnswers = {};
    
    if (mode === 'exam') {
        startTimer();
    }
    
    renderActiveContent();
};

// Timer logic for Exam Mode
function startTimer() {
    stopTimer();
    state.session.startTime = new Date();
    state.session.durationSeconds = 0;
    
    state.session.timerInterval = setInterval(() => {
        state.session.durationSeconds++;
        updateExamTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (state.session.timerInterval) {
        clearInterval(state.session.timerInterval);
        state.session.timerInterval = null;
    }
}

function updateExamTimerDisplay() {
    const el = document.getElementById('exam-timer');
    if (el) {
        const mins = Math.floor(state.session.durationSeconds / 60);
        const secs = state.session.durationSeconds % 60;
        el.textContent = `Время: ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Render Browse mode questions (Topic list / Bookmarked view)
function renderBrowseView(title, questionsList) {
    dom.contentContainer.innerHTML = '';
    
    // Filter by search queries
    let list = [...questionsList];
    
    if (state.filterUnlearned) {
        list = list.filter(q => !state.learned.has(q.number));
    }
    
    if (state.searchQuery) {
        const words = state.searchQuery.split(/\s+/);
        list = list.filter(q => {
            const searchText = (q.number + ' ' + q.question_text + ' ' + q.options.map(o => o.text).join(' ')).toLowerCase();
            return words.every(word => searchText.includes(word));
        });
    }
    
    const banner = document.createElement('div');
    banner.className = 'topic-header-banner';
    banner.innerHTML = `
        <h2>${title}</h2>
        <p>Показано вопросов: ${list.length} из ${questionsList.length}</p>
    `;
    dom.contentContainer.appendChild(banner);
    
    if (list.length === 0) {
        dom.contentContainer.appendChild(createEmptyState());
        return;
    }
    
    const listDiv = document.createElement('div');
    listDiv.className = 'questions-list';
    
    list.forEach(q => {
        listDiv.appendChild(createQuestionCard(q));
    });
    
    dom.contentContainer.appendChild(listDiv);
}

// Render custom Study session (arranged according to selected config)
function renderStudySessionView() {
    dom.contentContainer.innerHTML = '';
    
    const banner = document.createElement('div');
    banner.className = 'topic-header-banner';
    banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
                <h2 style="background:var(--accent-gradient); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Сессия Обучения</h2>
                <p>Выбрано вопросов: ${state.session.questions.length} (Порядок: ${state.session.questionOrder === 'shuffled' ? 'Случайный' : 'По порядку'})</p>
            </div>
            <button class="btn btn-danger" onclick="exitSession()">Завершить сессию</button>
        </div>
    `;
    dom.contentContainer.appendChild(banner);
    
    const listDiv = document.createElement('div');
    listDiv.className = 'questions-list';
    
    state.session.questions.forEach(q => {
        listDiv.appendChild(createQuestionCard(q, true));
    });
    
    // Big finish button at the bottom
    const finishBar = document.createElement('div');
    finishBar.style.cssText = 'display:flex; justify-content:center; padding: 32px 0 16px;';
    finishBar.innerHTML = `<button class="btn btn-danger" onclick="exitSession()" style="padding: 14px 40px; font-size:15px;">✅ Завершить сессию обучения</button>`;
    listDiv.appendChild(finishBar);
    
    dom.contentContainer.appendChild(listDiv);
}

// Create Question Card HTML element
function createQuestionCard(q, isSessionMode = false) {
    const card = document.createElement('div');
    card.className = `question-card ${state.learned.has(q.number) ? 'learned' : ''}`;
    card.id = `q-${q.number}`;
    
    updateCardContent(card, q, isSessionMode);
    return card;
}

// Populate / Refresh card details
function updateCardContent(card, q, isSessionMode = false) {
    const isStarred = state.bookmarks.has(q.number);
    const isLearned = state.learned.has(q.number);
    const savedNote = state.notes[q.number] || '';
    const userChoice = state.selectedAnswers[q.number];
    const correctChoice = state.correctAnswers[q.number];
    const isSetting = state.isSettingCorrectAnswer === q.number;
    const reveal = state.revealAnswers[q.number];
    
    // Shuffle options if session config calls for it
    let options = [...q.options];
    if (isSessionMode && state.session.optionOrder === 'shuffled') {
        if (!state.session.shuffledOptionOrders[q.number]) {
            state.session.shuffledOptionOrders[q.number] = shuffleArray(q.options.map((_, i) => i));
        }
        const order = state.session.shuffledOptionOrders[q.number];
        options = order.map(idx => q.options[idx]);
    }
    
    let optionsHtml = '';
    options.forEach(opt => {
        const isSelected = userChoice === opt.number;
        let optionClass = isSelected ? 'selected' : '';
        
        if (correctChoice !== undefined) {
            if (isSelected) {
                optionClass += (opt.number === correctChoice) ? ' correct' : ' incorrect';
            } else if (opt.number === correctChoice && (reveal || userChoice !== undefined)) {
                // Highlight the correct one if user has chosen, or clicked reveal
                optionClass += ' correct';
            }
        }
        
        optionsHtml += `
            <div class="option-item ${optionClass}" onclick="toggleOptionSelect('${q.number}', ${opt.number})">
                <div class="option-number">${opt.number}</div>
                <div class="option-text">${escapeHtml(opt.text)}</div>
            </div>
        `;
    });
    
    let answerStatusHtml = '';
    if (correctChoice === undefined) {
        answerStatusHtml = `<span style="font-size:12px; color:var(--text-muted);">Правильный ответ не задан</span>`;
    } else {
        answerStatusHtml = `<span style="font-size:12px; color:var(--text-secondary);">Ответ задан</span>`;
    }
    
    card.innerHTML = `
        <div class="question-header">
            <span class="question-num-tag">${q.number}</span>
            <div class="question-actions">
                ${answerStatusHtml}
                <button class="action-icon-btn key-btn ${correctChoice !== undefined ? 'active' : ''} ${isSetting ? 'setting' : ''}" title="${isSetting ? 'Кликните на правильный вариант ответа ниже' : 'Задать / изменить правильный ответ'}" onclick="toggleSetCorrectAnswerMode('${q.number}')">
                    🔑
                </button>
                <button class="action-icon-btn star-btn ${isStarred ? 'active' : ''}" title="В избранное" onclick="toggleBookmark('${q.number}', ${isSessionMode})">
                    ★
                </button>
                <button class="action-icon-btn done-btn ${isLearned ? 'active' : ''}" title="Изучено" onclick="toggleLearned('${q.number}', ${isSessionMode})">
                    ✔
                </button>
            </div>
        </div>
        <div class="question-text">${escapeHtml(q.question_text)}</div>
        
        <div class="options-list">
            ${optionsHtml}
        </div>
        
        <div class="card-footer-actions">
            <div>
                ${correctChoice !== undefined && userChoice === undefined ? `
                    <button class="btn" style="padding: 6px 12px; font-size:12px;" onclick="revealAnswer('${q.number}')">
                        ${reveal ? 'Скрыть ответ' : 'Показать правильный ответ'}
                    </button>
                ` : ''}
            </div>
        </div>
        
        <div class="notes-section">
            <div class="notes-header">
                <span class="notes-title">✍ Заметки / Решение</span>
            </div>
            <textarea class="notes-textarea" placeholder="Напишите здесь свои комментарии, шпаргалки или правильный ответ..." oninput="updateNotes('${q.number}', this.value)">${escapeHtml(savedNote)}</textarea>
        </div>
    `;
    
    if (isSetting) {
        card.classList.add('setting-correct-answer');
    } else {
        card.classList.remove('setting-correct-answer');
    }
}

// Toggle Correct Answer configuration mode
window.toggleSetCorrectAnswerMode = function(qNum) {
    if (state.isSettingCorrectAnswer === qNum) {
        state.isSettingCorrectAnswer = null;
    } else {
        state.isSettingCorrectAnswer = qNum;
        alert("Режим редактирования ответов включен!\nПожалуйста, кликните на вариант ответа, который является ПРАВИЛЬНЫМ для этого вопроса.");
    }
    
    // Redraw card
    const card = document.getElementById(`q-${qNum}`);
    if (card) {
        // Find question details
        let targetQ = null;
        for (let t of examData) {
            targetQ = t.questions.find(q => q.number === qNum);
            if (targetQ) break;
        }
        if (targetQ) updateCardContent(card, targetQ, state.session.isActive);
    }
};

// Update card displays on state change
function updateCardDisplay(card, qNum) {
    let targetQ = null;
    for (let t of examData) {
        targetQ = t.questions.find(q => q.number === qNum);
        if (targetQ) break;
    }
    if (targetQ) updateCardContent(card, targetQ, state.session.isActive);
}

// Reveal correct answer handler
window.revealAnswer = function(qNum) {
    state.revealAnswers[qNum] = !state.revealAnswers[qNum];
    const card = document.getElementById(`q-${qNum}`);
    if (card) updateCardDisplay(card, qNum);
};

// Render Simulator Exam View (One-by-one testing simulator)
function renderExamView() {
    dom.contentContainer.innerHTML = '';
    
    const qCount = state.session.questions.length;
    if (qCount === 0) return;
    
    const currentQuestion = state.session.questions[state.session.currentIdx];
    const userChoice = state.selectedAnswers[currentQuestion.number];
    const isStarred = state.bookmarks.has(currentQuestion.number);
    const isLearned = state.learned.has(currentQuestion.number);
    const correctChoice = state.correctAnswers[currentQuestion.number];
    
    // Layout
    const quizWrapper = document.createElement('div');
    quizWrapper.className = 'questions-list';
    
    // Header Info
    const headerStatus = document.createElement('div');
    headerStatus.className = 'quiz-header-status';
    
    // Progress fill percentage
    const pct = qCount > 0 ? Math.round((state.session.currentIdx / qCount) * 100) : 0;
    
    let answeredCount = 0;
    state.session.questions.forEach(q => {
        if (state.selectedAnswers[q.number] !== undefined) answeredCount++;
    });
    
    headerStatus.innerHTML = `
        <div class="topic-header-banner" style="margin-bottom:0;">
            <h2 style="background:var(--accent-gradient); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Режим экзамена</h2>
            <p>Вопрос ${state.session.currentIdx + 1} из ${qCount}</p>
        </div>
        <div style="text-align: right;">
            <div class="quiz-score-indicator" id="exam-timer" style="font-family:'Outfit'; font-weight:700; color:#4facfe; margin-bottom: 4px;">Время: 00:00</div>
            <div class="quiz-score-indicator">Отвечено: ${answeredCount} / ${qCount}</div>
        </div>
    `;
    dom.contentContainer.appendChild(headerStatus);
    
    // Top Progress Line
    const prgContainer = document.createElement('div');
    prgContainer.className = 'progress-bar-container';
    prgContainer.style.marginBottom = '24px';
    prgContainer.innerHTML = `<div class="progress-bar-fill" style="width: ${pct}%"></div>`;
    dom.contentContainer.appendChild(prgContainer);
    
    if (state.session.finished) {
        renderExamResults();
        return;
    }
    
    // Question Card
    const card = document.createElement('div');
    card.className = 'question-card';
    
    // Options
    let options = [...currentQuestion.options];
    if (state.session.optionOrder === 'shuffled') {
        if (!state.session.shuffledOptionOrders[currentQuestion.number]) {
            state.session.shuffledOptionOrders[currentQuestion.number] = shuffleArray(currentQuestion.options.map((_, i) => i));
        }
        const order = state.session.shuffledOptionOrders[currentQuestion.number];
        options = order.map(idx => currentQuestion.options[idx]);
    }
    
    let optionsHtml = '';
    options.forEach(opt => {
        const isSelected = userChoice === opt.number;
        optionsHtml += `
            <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleOptionSelect('${currentQuestion.number}', ${opt.number})">
                <div class="option-number">${opt.number}</div>
                <div class="option-text">${escapeHtml(opt.text)}</div>
            </div>
        `;
    });
    
    card.innerHTML = `
        <div class="question-header">
            <span class="question-num-tag">${currentQuestion.number}</span>
            <div class="question-actions">
                <button class="action-icon-btn star-btn ${isStarred ? 'active' : ''}" title="Добавить в избранное" onclick="toggleBookmark('${currentQuestion.number}', true)">
                    ★
                </button>
                <button class="action-icon-btn done-btn ${isLearned ? 'active' : ''}" title="Отметить как изученный" onclick="toggleLearned('${currentQuestion.number}', true)">
                    ✔
                </button>
            </div>
        </div>
        <div class="question-text">${escapeHtml(currentQuestion.question_text)}</div>
        <div class="options-list">
            ${optionsHtml}
        </div>
    `;
    quizWrapper.appendChild(card);
    
    // Nav Buttons
    const navDiv = document.createElement('div');
    navDiv.className = 'quiz-navigation';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn';
    prevBtn.innerText = '⬅ Назад';
    prevBtn.disabled = state.session.currentIdx === 0;
    prevBtn.onclick = () => {
        if (state.session.currentIdx > 0) {
            state.session.currentIdx--;
            renderExamView();
        }
    };
    navDiv.appendChild(prevBtn);
    
    // Exit button
    const exitBtn = document.createElement('button');
    exitBtn.className = 'btn btn-danger';
    exitBtn.innerText = 'Прервать тест';
    exitBtn.onclick = exitSession;
    navDiv.appendChild(exitBtn);
    
    const nextBtn = document.createElement('button');
    if (state.session.currentIdx === qCount - 1) {
        nextBtn.innerText = 'Завершить экзамен 🏁';
        nextBtn.className = 'btn btn-primary';
        nextBtn.onclick = finishExam;
    } else {
        nextBtn.innerText = 'Вперед ➡';
        nextBtn.className = 'btn';
        nextBtn.onclick = () => {
            state.session.currentIdx++;
            renderExamView();
        };
    }
    navDiv.appendChild(nextBtn);
    quizWrapper.appendChild(navDiv);
    
    // Question grid dots index for quick jumping
    const dotsDiv = document.createElement('div');
    dotsDiv.className = 'quiz-navigator-dots';
    state.session.questions.forEach((q, idx) => {
        const dot = document.createElement('div');
        let dotClass = 'quiz-dot';
        if (idx === state.session.currentIdx) dotClass += ' active';
        else if (state.selectedAnswers[q.number] !== undefined) dotClass += ' answered';
        
        dot.className = dotClass;
        dot.innerText = idx + 1;
        dot.onclick = () => {
            state.session.currentIdx = idx;
            renderExamView();
        };
        dotsDiv.appendChild(dot);
    });
    quizWrapper.appendChild(dotsDiv);
    
    dom.contentContainer.appendChild(quizWrapper);
    updateExamTimerDisplay();
}

// Finish Exam Session
function finishExam() {
    stopTimer();
    state.session.finished = true;
    
    // Calculate Score
    let correctCount = 0;
    let incorrectCount = 0;
    let skippedCount = 0;
    state.session.questions.forEach(q => {
        const userVal = state.selectedAnswers[q.number];
        const correctVal = state.correctAnswers[q.number];
        if (userVal === undefined) {
            skippedCount++;
        } else if (correctVal !== undefined && userVal === correctVal) {
            correctCount++;
        } else {
            incorrectCount++;
        }
    });
    
    state.session.score = correctCount;
    
    // Update per-question results (last answer wins)
    saveSessionResults(state.session.questions);
    
    // Save to exam history
    state.examHistory.push({
        date: new Date().toLocaleDateString('ru-RU'),
        total: state.session.questions.length,
        correct: correctCount,
        incorrect: incorrectCount,
        skipped: skippedCount,
        mode: 'exam',
        duration: state.session.durationSeconds
    });
    // Keep only last 20 sessions
    if (state.examHistory.length > 20) state.examHistory = state.examHistory.slice(-20);
    saveProgress();
    
    renderExamView();
}

// Render Results Dashboard for the Simulator
function renderExamResults() {
    const qCount = state.session.questions.length;
    const score = state.session.score;
    const percentage = qCount > 0 ? Math.round((score / qCount) * 100) : 0;
    const passThreshold = Math.ceil(qCount * (12 / 14));
    const passed = score >= passThreshold;
    
    const resultsCard = document.createElement('div');
    resultsCard.className = 'quiz-results-card';
    
    const mins = Math.floor(state.session.durationSeconds / 60);
    const secs = state.session.durationSeconds % 60;
    
    resultsCard.innerHTML = `
        <div class="quiz-results-title" style="color: ${passed ? 'var(--success-color)' : 'var(--danger-color)'};">${passed ? '🎉 Экзамен Сдан!' : '❌ Экзамен не сдан'}</div>
        <div class="quiz-results-score">${score} / ${qCount}</div>
        <p style="font-size:15px; color: var(--text-secondary); margin-bottom: 8px;">
            Правильных ответов: <strong>${score} из ${qCount}</strong> (Для сдачи нужно минимум ${passThreshold})
        </p>
        <p style="font-size:13px; color: var(--text-muted); margin-bottom: 16px;">
            Время тестирования: ${mins} мин ${secs} сек
        </p>
        
        <div style="display:flex; gap:16px; margin-top:16px; margin-bottom:24px;">
            <button class="btn btn-primary" onclick="restartExamSession()">Повторить экзамен</button>
            <button class="btn" onclick="exitSession()">Вернуться в панель</button>
        </div>
        
        <div style="width:100%; border-top:1px solid var(--border-color); padding-top:20px; text-align:left;">
            <h4 style="font-family:'Outfit'; font-size:15px; margin-bottom:12px;">Детальный анализ ответов:</h4>
        </div>
    `;
    
    // Details List of Questions in completed exam
    const list = document.createElement('div');
    list.className = 'quiz-details-list';
    
    state.session.questions.forEach((q, idx) => {
        const userVal = state.selectedAnswers[q.number];
        const correctVal = state.correctAnswers[q.number];
        
        let statusText = '';
        let statusStyle = '';
        let rowClass = '';
        
        if (correctVal === undefined) {
            statusText = 'Нет ключа ответа';
            statusStyle = 'color: var(--text-muted);';
        } else if (userVal === undefined) {
            statusText = 'Пропущен';
            statusStyle = 'color: var(--warning-color);';
        } else if (userVal === correctVal) {
            statusText = 'Верно';
            statusStyle = 'color: var(--success-color); font-weight:bold;';
            rowClass = 'correct';
        } else {
            statusText = 'Неверно';
            statusStyle = 'color: var(--danger-color); font-weight:bold;';
            rowClass = 'incorrect';
        }
        
        const row = document.createElement('div');
        row.className = `quiz-detail-row ${rowClass}`;
        row.style.cursor = 'pointer';
        row.onclick = () => {
            // Let user inspect this question card inside a modal view or switch view
            // For simplicity, we just scroll to the question detail in study mode or alert
            alert(`Вопрос ${q.number}:\n${q.question_text}\n\nВаш ответ: ${userVal || 'не выбран'}\nПравильный ответ: ${correctVal || 'не задан'}`);
        };
        
        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span class="question-num-tag">${q.number}</span>
                <span style="font-size:13px; max-width:500px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${q.question_text}</span>
            </div>
            <div style="${statusStyle} font-size:13px;">${statusText}</div>
        `;
        list.appendChild(row);
    });
    
    resultsCard.appendChild(list);
    dom.contentContainer.appendChild(resultsCard);
}

// Restart Exam Simulator with same settings
window.restartExamSession = function() {
    // Keep same questions pool but clear selected answers for this session
    state.session.questions.forEach(q => {
        delete state.selectedAnswers[q.number];
    });
    saveProgress();
    
    state.session.currentIdx = 0;
    state.session.finished = false;
    state.session.score = 0;
    startTimer();
    renderExamView();
};

// Save per-question results from a session (last answer wins)
function saveSessionResults(questions) {
    questions.forEach(q => {
        const userVal = state.selectedAnswers[q.number];
        const correctVal = state.correctAnswers[q.number];
        if (userVal !== undefined) {
            state.questionResults[q.number] = (correctVal !== undefined && userVal === correctVal) ? 'correct' : 'incorrect';
        }
    });
}

// Exit Study/Exam Session back to Dashboard
function exitSession() {
    stopTimer();
    
    // Save study session stats to history
    if (state.session && state.session.questions && state.session.mode === 'study') {
        saveSessionResults(state.session.questions);
        
        let correct = 0, incorrect = 0, skipped = 0;
        state.session.questions.forEach(q => {
            const r = state.questionResults[q.number];
            if (r === 'correct') correct++;
            else if (r === 'incorrect') incorrect++;
            else skipped++;
        });
        state.examHistory.push({
            date: new Date().toLocaleDateString('ru-RU'),
            total: state.session.questions.length,
            correct, incorrect, skipped,
            mode: 'study',
            duration: state.session.durationSeconds || 0
        });
        if (state.examHistory.length > 20) state.examHistory = state.examHistory.slice(-20);
        saveProgress();
    }
    
    if (state.session) state.session.isActive = false;
    state.activeTab = 'home';
    updateOverallProgress();
    renderTopicsList();
    renderActiveContent();
}
window.exitSession = exitSession;

// Render Settings & Database manager view
function renderSettingsView() {
    dom.contentContainer.innerHTML = '';
    
    const banner = document.createElement('div');
    banner.className = 'topic-header-banner';
    banner.innerHTML = `
        <h2>Настройки и база правильных ответов</h2>
        <p>Управление ответами на вопросы, импорт/экспорт баз ключей и сброс прогресса подготовки.</p>
    `;
    dom.contentContainer.appendChild(banner);
    
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'settings-section';
    
    // Core Answers DB manager
    const answersBox = document.createElement('div');
    answersBox.className = 'settings-box';
    
    const totalCorrectSet = Object.keys(state.correctAnswers).length;
    
    answersBox.innerHTML = `
        <h3>🔑 База правильных ответов (${totalCorrectSet} / 961 задано)</h3>
        <p>Вы можете экспортировать свою накопленную базу правильных ответов в файл или импортировать готовые ключи в формате JSON.</p>
        
        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px;">
            <button class="btn" onclick="exportAnswers()">📥 Скачать ответы (JSON)</button>
            
            <label class="btn" style="cursor:pointer; display:inline-flex; align-items:center;">
                📤 Загрузить файл ответов (JSON)
                <input type="file" id="file-import-answers" accept=".json" onchange="importAnswersFile(event)" style="display:none;">
            </label>
            
            <button class="btn btn-danger" onclick="resetCorrectAnswers()">Сбросить базу ответов</button>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:8px;">
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary);">Импорт ответов через текст (JSON):</label>
            <textarea id="textarea-import-json" class="notes-textarea" style="font-family:monospace; min-height:120px;" placeholder='Пример формата:\n{\n  "1.1": 5,\n  "1.2": 4\n}'></textarea>
            <button class="btn btn-primary" onclick="importAnswersText()" style="align-self:flex-start; margin-top:8px;">Импортировать из текста</button>
        </div>
    `;
    settingsDiv.appendChild(answersBox);
    
    // Reset progress details
    const resetBox = document.createElement('div');
    resetBox.className = 'settings-box';
    resetBox.innerHTML = `
        <h3>🧹 Сброс прогресса обучения</h3>
        <p>Очистка вашего индивидуального прогресса подготовки: отметок "Изучено" (✔), избранных закладок (★) и комментариев/заметок.</p>
        <button class="btn btn-danger" onclick="resetAllUserProgress()">Сбросить весь прогресс обучения</button>
    `;
    settingsDiv.appendChild(resetBox);
    
    dom.contentContainer.appendChild(settingsDiv);
}

// Export correct answers to JSON download
window.exportAnswers = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.correctAnswers, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "1c_professional_answers_keys.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
};

// Import correct answers from JSON File
window.importAnswersFile = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            processImportedAnswers(imported);
        } catch (err) {
            alert("Ошибка чтения JSON файла: " + err.message);
        }
    };
    reader.readAsText(file);
};

// Import correct answers from TextArea Text
window.importAnswersText = function() {
    const txt = document.getElementById('textarea-import-json').value.trim();
    if (!txt) {
        alert("Пожалуйста, введите JSON-строку с ответами!");
        return;
    }
    
    try {
        const imported = JSON.parse(txt);
        processImportedAnswers(imported);
    } catch (err) {
        alert("Ошибка парсинга JSON: " + err.message);
    }
};

// Common processing for imported keys
function processImportedAnswers(imported) {
    if (typeof imported !== 'object' || Array.isArray(imported)) {
        alert("Неверный формат базы ответов! База должна быть в виде JSON объекта.");
        return;
    }
    
    let count = 0;
    for (let k in imported) {
        const optNum = parseInt(imported[k]);
        if (!isNaN(optNum)) {
            state.correctAnswers[k] = optNum;
            count++;
        }
    }
    
    saveProgress();
    alert(`Успешно импортировано ${count} ответов в базу ключей!`);
    renderActiveContent();
}

// Reset all correct answers to default (mapped keys + AI base)
window.resetCorrectAnswers = function() {
    if (confirm("Вы уверены, что хотите сбросить базу правильных ответов к стандартному виду (будут сохранены только 28 демонстрационных ответов + базовая ИИ-генерация)?")) {
        const baseAnswers = window.aiAnswers ? { ...window.aiAnswers, ...defaultAnswers } : { ...defaultAnswers };
        state.correctAnswers = { ...baseAnswers };
        saveProgress();
        alert("База ответов сброшена к исходной!");
        renderActiveContent();
    }
};

// Reset all user progress
window.resetAllUserProgress = function() {
    if (confirm("ВНИМАНИЕ!\nЭто действие полностью сотрет ваш прогресс обучения (Изучено, Избранное и все Заметки).\nВы действительно хотите сбросить прогресс?")) {
        state.bookmarks.clear();
        state.learned.clear();
        state.notes = {};
        state.selectedAnswers = {};
        
        saveProgress();
        updateOverallProgress();
        renderTopicsList();
        
        alert("Прогресс обучения успешно сброшен!");
        renderActiveContent();
    }
};

// Action Handlers
window.toggleBookmark = function(qNum, isSessionMode = false) {
    if (state.bookmarks.has(qNum)) {
        state.bookmarks.delete(qNum);
    } else {
        state.bookmarks.add(qNum);
    }
    saveProgress();
    
    if (isSessionMode && state.session.mode === 'exam') {
        renderExamView();
    } else {
        const card = document.getElementById(`q-${qNum}`);
        if (card) {
            const btn = card.querySelector('.star-btn');
            if (btn) btn.classList.toggle('active', state.bookmarks.has(qNum));
        }
        if (state.activeTab === 'starred') {
            renderActiveContent();
        }
    }
};

window.toggleLearned = function(qNum, isSessionMode = false) {
    if (state.learned.has(qNum)) {
        state.learned.delete(qNum);
    } else {
        state.learned.add(qNum);
    }
    saveProgress();
    updateOverallProgress();
    renderTopicsList();
    
    if (isSessionMode && state.session.mode === 'exam') {
        renderExamView();
    } else {
        const card = document.getElementById(`q-${qNum}`);
        if (card) {
            card.classList.toggle('learned', state.learned.has(qNum));
            const btn = card.querySelector('.done-btn');
            if (btn) btn.classList.toggle('active', state.learned.has(qNum));
        }
    }
};

window.toggleOptionSelect = function(qNum, optNum) {
    if (state.isSettingCorrectAnswer === qNum) {
        state.correctAnswers[qNum] = optNum;
        localStorage.setItem('1c_professional_correct_answers', JSON.stringify(state.correctAnswers));
        state.isSettingCorrectAnswer = null;
        saveProgress();
        
        // Redraw card
        const card = document.getElementById(`q-${qNum}`);
        if (card) updateCardDisplay(card, qNum);
        alert("Ответ успешно сохранен в базу ключей!");
        return;
    }
    
    if (state.session.isActive && state.session.mode === 'exam' && state.session.finished) {
        return;
    }
    
    // Single choice option selection: set to choice
    state.selectedAnswers[qNum] = optNum;
    saveProgress();
    
    if (state.session.isActive && state.session.mode === 'exam') {
        renderExamView();
    } else {
        const card = document.getElementById(`q-${qNum}`);
        if (card) updateCardDisplay(card, qNum);
    }
};

window.updateNotes = function(qNum, text) {
    if (text.trim() === '') {
        delete state.notes[qNum];
    } else {
        state.notes[qNum] = text;
    }
    saveProgress();
};

// Common Helpers
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createEmptyState() {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `
        <div class="empty-state-icon">🔍</div>
        <h3>Вопросы не найдены</h3>
        <p>Попробуйте изменить параметры фильтрации или поисковый запрос.</p>
    `;
    return div;
}
