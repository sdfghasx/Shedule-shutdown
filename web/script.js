// ─────────────────────────────────────────────
// Глобальные переменные состояния
// ─────────────────────────────────────────────
let isRunning = false;
let currentMode = 'sleep';
let selectedMinutes = 30;
let endTimestamp = 0;
let totalSeconds = 30 * 60;
let countdownInterval = null;
let notificationsEnabled = false;

// Режим, который сейчас "спрятан" в меню
// По умолчанию: sleep и shutdown видны, lock в меню
let hiddenMode = 'lock';

const CIRCUMFERENCE = 2 * Math.PI * 75; // r=75 → ≈ 471.24
const MIN_MINUTES = 1;
const MAX_MINUTES = 480;

// Конфигурация режимов
const MODE_CONFIG = {
    sleep:    { label: 'Sleep',    icon: '😴', menuLabel: '😴 Sleep' },
    shutdown: { label: 'Shutdown', icon: '⏻',  menuLabel: '⏻ Shutdown' },
    lock:     { label: 'Lock',    icon: '🔒', menuLabel: '🔒 Lock Screen' }
};

// ─────────────────────────────────────────────
// DOM-элементы
// ─────────────────────────────────────────────
const progressRing = document.getElementById('progressRing');
const timerText = document.getElementById('timerText');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const leftModeBtn = document.getElementById('leftModeBtn');
const rightModeBtn = document.getElementById('rightModeBtn');
const timeSlider = document.getElementById('timeSlider');
const timeInput = document.getElementById('timeInput');
const notificationsToggle = document.getElementById('notificationsToggle');
const menuBtn = document.getElementById('menuBtn');
const dropdownMenu = document.getElementById('dropdownMenu');
const swapModeBtn = document.getElementById('swapModeBtn');
const plus15Btn = document.getElementById('plus15Btn');
const minus15Btn = document.getElementById('minus15Btn');
const presetBtns = document.querySelectorAll('.preset-btn');

// ─────────────────────────────────────────────
// Инициализация
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    progressRing.style.strokeDasharray = CIRCUMFERENCE;
    progressRing.style.strokeDashoffset = 0;

    updateModeButtons();

    try {
        const state = await eel.get_state()();
        if (state && state.timer_active) {
            isRunning = true;
            currentMode = state.current_mode;
            endTimestamp = state.end_timestamp * 1000;
            totalSeconds = state.total_seconds;

            ensureModeVisible(currentMode);
            setRunningUI();
            startCountdown();
        } else {
            updateTimerDisplay(selectedMinutes * 60);
        }
    } catch (e) {
        updateTimerDisplay(selectedMinutes * 60);
    }
});

// ─────────────────────────────────────────────
// Управление режимами (swap logic)
// ─────────────────────────────────────────────
function getVisibleModes() {
    // Возвращает два видимых режима (те, что не hidden)
    const all = ['sleep', 'shutdown', 'lock'];
    return all.filter(m => m !== hiddenMode);
}

function updateModeButtons() {
    const visible = getVisibleModes();

    leftModeBtn.dataset.mode = visible[0];
    leftModeBtn.textContent = MODE_CONFIG[visible[0]].label;

    rightModeBtn.dataset.mode = visible[1];
    rightModeBtn.textContent = MODE_CONFIG[visible[1]].label;

    // Обновляем активность
    if (currentMode === visible[0]) {
        leftModeBtn.classList.add('active');
        rightModeBtn.classList.remove('active');
    } else if (currentMode === visible[1]) {
        rightModeBtn.classList.add('active');
        leftModeBtn.classList.remove('active');
    }

    // Обновляем пункт меню
    swapModeBtn.textContent = MODE_CONFIG[hiddenMode].menuLabel;
}

function ensureModeVisible(mode) {
    // Если текущий режим спрятан в меню — поменять местами
    if (hiddenMode === mode) {
        // Прячем левую кнопку, показываем mode
        const visible = getVisibleModes();
        // Определяем какой режим заменить — тот что не active
        if (currentMode === visible[0]) {
            hiddenMode = visible[1];
        } else {
            hiddenMode = visible[0];
        }
    }
    updateModeButtons();
}

function swapWithHiddenMode() {
    const modeToShow = hiddenMode;

    // Прячем текущий активный left-mode
    const leftMode = leftModeBtn.dataset.mode;

    hiddenMode = leftMode;
    currentMode = modeToShow;

    // Ставим новый режим на место левой кнопки
    leftModeBtn.dataset.mode = modeToShow;
    leftModeBtn.textContent = MODE_CONFIG[modeToShow].label;

    leftModeBtn.classList.add('active');
    rightModeBtn.classList.remove('active');

    swapModeBtn.textContent = MODE_CONFIG[hiddenMode].menuLabel;
}

// ─────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────
function clampMinutes(val) {
    if (isNaN(val) || val < MIN_MINUTES) return MIN_MINUTES;
    if (val > MAX_MINUTES) return MAX_MINUTES;
    return Math.floor(val);
}

function formatTime(totalSec) {
    totalSec = Math.max(0, Math.floor(totalSec));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad = (n) => n.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}

function updateTimerDisplay(remainingSeconds) {
    timerText.textContent = formatTime(remainingSeconds);
}

function updateProgressRing(remainingSeconds) {
    const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
    const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));
    progressRing.style.strokeDashoffset = offset;

    const percent = progress * 100;

    if (percent > 20) {
        progressRing.style.stroke = 'var(--ring-green)';
        progressRing.classList.remove('pulsing');
    } else if (percent > 5) {
        progressRing.style.stroke = 'var(--ring-yellow)';
        progressRing.classList.remove('pulsing');
    } else {
        progressRing.style.stroke = 'var(--ring-red)';
        progressRing.classList.add('pulsing');
    }
}

function triggerBump() {
    timerText.classList.remove('bump');
    void timerText.offsetWidth;
    timerText.classList.add('bump');
}

// ─────────────────────────────────────────────
// Обратный отсчёт
// ─────────────────────────────────────────────
function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, (endTimestamp - now) / 1000);

        updateTimerDisplay(remaining);
        updateProgressRing(remaining);

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            timerFinished();
        }
    }, 100);
}

function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// ─────────────────────────────────────────────
// Завершение таймера
// ─────────────────────────────────────────────
eel.expose(timer_finished);
function timer_finished() {
    timerFinished();
}

function timerFinished() {
    isRunning = false;
    stopCountdown();
    setIdleUI();
    updateTimerDisplay(0);
    progressRing.style.strokeDashoffset = CIRCUMFERENCE;
    progressRing.style.stroke = 'var(--ring-green)';
    progressRing.classList.remove('pulsing');
}

// ─────────────────────────────────────────────
// Переключение UI
// ─────────────────────────────────────────────
function setRunningUI() {
    startBtn.textContent = 'Перезапустить';
    startBtn.classList.add('restart');

    cancelBtn.disabled = false;
    cancelBtn.classList.remove('disabled');

    timeSlider.disabled = true;
    timeInput.disabled = true;

    leftModeBtn.classList.add('disabled');
    rightModeBtn.classList.add('disabled');

    // Подсветить активный режим
    const leftMode = leftModeBtn.dataset.mode;
    const rightMode = rightModeBtn.dataset.mode;

    if (currentMode === leftMode) {
        leftModeBtn.classList.add('active');
        rightModeBtn.classList.remove('active');
    } else if (currentMode === rightMode) {
        rightModeBtn.classList.add('active');
        leftModeBtn.classList.remove('active');
    }
}

function setIdleUI() {
    startBtn.textContent = 'Начать';
    startBtn.classList.remove('restart');

    cancelBtn.disabled = true;
    cancelBtn.classList.add('disabled');

    timeSlider.disabled = false;
    timeInput.disabled = false;

    leftModeBtn.classList.remove('disabled');
    rightModeBtn.classList.remove('disabled');
}

// ─────────────────────────────────────────────
// Кнопка «Начать» / «Перезапустить»
// ─────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
    const minutes = clampMinutes(parseInt(timeInput.value) || 30);
    timeInput.value = minutes;
    timeSlider.value = minutes;

    try {
        const result = await eel.start_timer(currentMode, minutes)();
        if (result && result.status === 'ok') {
            endTimestamp = result.end_timestamp * 1000;
            totalSeconds = result.total_seconds;
            isRunning = true;
            setRunningUI();
            startCountdown();
        }
    } catch (e) {
        console.error('Ошибка запуска таймера:', e);
    }
});

// ─────────────────────────────────────────────
// Кнопка «Отменить»
// ─────────────────────────────────────────────
cancelBtn.addEventListener('click', async () => {
    if (!isRunning) return;

    try {
        await eel.cancel_timer()();
    } catch (e) {
        console.error('Ошибка отмены:', e);
    }

    isRunning = false;
    stopCountdown();
    setIdleUI();

    const minutes = clampMinutes(parseInt(timeInput.value) || 30);
    selectedMinutes = minutes;
    totalSeconds = minutes * 60;
    timeInput.value = minutes;
    timeSlider.value = minutes;
    updateTimerDisplay(totalSeconds);
    progressRing.style.strokeDashoffset = 0;
    progressRing.style.stroke = 'var(--ring-green)';
    progressRing.classList.remove('pulsing');
});

// ─────────────────────────────────────────────
// Переключение режима (toggle-кнопки)
// ─────────────────────────────────────────────
leftModeBtn.addEventListener('click', () => {
    if (isRunning) return;
    currentMode = leftModeBtn.dataset.mode;
    leftModeBtn.classList.add('active');
    rightModeBtn.classList.remove('active');
});

rightModeBtn.addEventListener('click', () => {
    if (isRunning) return;
    currentMode = rightModeBtn.dataset.mode;
    rightModeBtn.classList.add('active');
    leftModeBtn.classList.remove('active');
});

// ─────────────────────────────────────────────
// Кнопка swap в меню (Lock ↔ Sleep)
// ─────────────────────────────────────────────
swapModeBtn.addEventListener('click', () => {
    if (isRunning) return;
    dropdownMenu.classList.remove('show');
    swapWithHiddenMode();
});

// ─────────────────────────────────────────────
// Слайдер
// ─────────────────────────────────────────────
timeSlider.addEventListener('input', () => {
    const val = parseInt(timeSlider.value);
    timeInput.value = val;
    selectedMinutes = val;
    if (!isRunning) {
        totalSeconds = val * 60;
        updateTimerDisplay(totalSeconds);
        updateProgressRing(totalSeconds);
    }
});

// ─────────────────────────────────────────────
// Поле ввода
// ─────────────────────────────────────────────
timeInput.addEventListener('input', () => {
    timeInput.value = timeInput.value.replace(/[^0-9]/g, '');
});

timeInput.addEventListener('blur', () => {
    let val = parseInt(timeInput.value);
    if (isNaN(val) || val < MIN_MINUTES) val = MIN_MINUTES;
    val = clampMinutes(val);
    timeInput.value = val;
    timeSlider.value = val;
    selectedMinutes = val;
    if (!isRunning) {
        totalSeconds = val * 60;
        updateTimerDisplay(totalSeconds);
        updateProgressRing(totalSeconds);
    }
});

timeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        timeInput.blur();
    }
});

// ─────────────────────────────────────────────
// Кнопки +15 / −15
// ─────────────────────────────────────────────
plus15Btn.addEventListener('click', async () => {
    if (isRunning) {
        try {
            const result = await eel.add_time(15)();
            if (result && result.status === 'ok') {
                endTimestamp = result.end_timestamp * 1000;
                totalSeconds = result.total_seconds;
            }
        } catch (e) {
            console.error('Ошибка добавления времени:', e);
        }
    } else {
        let val = (parseInt(timeInput.value) || 0) + 15;
        val = clampMinutes(val);
        timeInput.value = val;
        timeSlider.value = val;
        selectedMinutes = val;
        totalSeconds = val * 60;
        updateTimerDisplay(totalSeconds);
        updateProgressRing(totalSeconds);
    }
    triggerBump();
});

minus15Btn.addEventListener('click', async () => {
    if (isRunning) {
        try {
            const result = await eel.add_time(-15)();
            if (result && result.status === 'ok') {
                endTimestamp = result.end_timestamp * 1000;
                totalSeconds = result.total_seconds;
            }
        } catch (e) {
            console.error('Ошибка вычитания времени:', e);
        }
    } else {
        let val = (parseInt(timeInput.value) || 0) - 15;
        val = clampMinutes(val);
        timeInput.value = val;
        timeSlider.value = val;
        selectedMinutes = val;
        totalSeconds = val * 60;
        updateTimerDisplay(totalSeconds);
        updateProgressRing(totalSeconds);
    }
    triggerBump();
});

// ─────────────────────────────────────────────
// Пресеты
// ─────────────────────────────────────────────
presetBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const minutes = parseInt(btn.dataset.minutes);

        if (isRunning) {
            try {
                const result = await eel.start_timer(currentMode, minutes)();
                if (result && result.status === 'ok') {
                    endTimestamp = result.end_timestamp * 1000;
                    totalSeconds = result.total_seconds;
                    startCountdown();
                }
            } catch (e) {
                console.error('Ошибка перезапуска:', e);
            }
        } else {
            timeInput.value = minutes;
            timeSlider.value = minutes;
            selectedMinutes = minutes;
            totalSeconds = minutes * 60;
            updateTimerDisplay(totalSeconds);
            updateProgressRing(totalSeconds);
        }

        triggerBump();
    });
});

// ─────────────────────────────────────────────
// Меню (три точки)
// ─────────────────────────────────────────────
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && e.target !== menuBtn) {
        dropdownMenu.classList.remove('show');
    }
});

// ─────────────────────────────────────────────
// Уведомления
// ─────────────────────────────────────────────
notificationsToggle.addEventListener('change', () => {
    notificationsEnabled = notificationsToggle.checked;
    try {
        eel.set_notifications(notificationsEnabled);
    } catch (e) {
        console.error('Ошибка настройки уведомлений:', e);
    }
});

// ─────────────────────────────────────────────
// Обработка закрытия окна
// ─────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    if (isRunning) {
        try {
            eel.on_close_request();
        } catch (e) {
            // Игнорируем
        }
    }
});