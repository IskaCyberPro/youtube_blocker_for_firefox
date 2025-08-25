// YouTube Blocker for Firefox
console.log('YouTube Blocker for Firefox initialized');

let isBlocking = true;
let timerMinutes = 60;
let timeSpentOnYouTube = 0;
let maxTimeSeconds = 0;
let isOnYouTubeTab = false;
let checkInterval = null;
let unlockUntilEndOfDay = false;
let timerSetToday = false; // Флаг, что таймер уже устанавливали сегодня
let lastTimerSetDate = null; // Дата последней установки таймера

// Загрузка настроек
function loadSettings() {
    browser.storage.local.get(['isBlocking', 'timerMinutes', 'timeSpentOnYouTube', 'maxTimeSeconds', 'unlockUntilEndOfDay', 'timerSetToday', 'lastTimerSetDate']).then(data => {
        console.log('Настройки загружены:', data);
        
        isBlocking = data.isBlocking !== undefined ? data.isBlocking : true;
        timerMinutes = data.timerMinutes || 60;
        timeSpentOnYouTube = data.timeSpentOnYouTube || 0;
        maxTimeSeconds = data.maxTimeSeconds || (timerMinutes * 60);
        unlockUntilEndOfDay = data.unlockUntilEndOfDay || false;
        timerSetToday = data.timerSetToday || false;
        lastTimerSetDate = data.lastTimerSetDate ? new Date(data.lastTimerSetDate) : null;
        
        // Проверяем, не истекло ли время разблокировки до конца дня
        if (unlockUntilEndOfDay) {
            const now = new Date();
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            
            if (now > endOfDay) {
                // Текущий день закончился, сбрасываем разблокировку
                unlockUntilEndOfDay = false;
                console.log('⏰ Время разблокировки истекло (закончился день)');
            }
        }
        
        // Проверяем, нужно ли сбросить флаг timerSetToday
        if (timerSetToday && lastTimerSetDate) {
            const now = new Date();
            const lastSetDate = new Date(lastTimerSetDate);
            
            // Если последняя установка таймера была не сегодня, сбрасываем флаг
            if (now.toDateString() !== lastSetDate.toDateString()) {
                timerSetToday = false;
                console.log('🔄 Сброс флага timerSetToday (новый день)');
            }
        }
        
        saveSettings();
        updateIcon();
        startTabMonitoring();
        console.log('Текущее состояние:', { isBlocking, timerMinutes, timeSpentOnYouTube, maxTimeSeconds, unlockUntilEndOfDay, timerSetToday, lastTimerSetDate });
    }).catch(error => {
        console.error('Ошибка загрузки настроек:', error);
    });
}

// Проверка, можно ли установить таймер сегодня
function canSetTimerToday() {
    if (!timerSetToday) {
        return true;
    }
    
    // Проверяем, не устарела ли дата последней установки
    if (lastTimerSetDate) {
        const now = new Date();
        const lastSetDate = new Date(lastTimerSetDate);
        
        // Если последняя установка была не сегодня, можно устанавливать снова
        if (now.toDateString() !== lastSetDate.toDateString()) {
            timerSetToday = false;
            return true;
        }
    }
    
    return false;
}

// Разблокировка до конца дня
function unlockUntilEndOfDayFunction() {
    unlockUntilEndOfDay = true;
    
    console.log('📅 Разблокировано до конца дня');
    
    saveSettings();
    updateIcon();
    refreshYouTubeTabs();
    
    // Устанавливаем таймер для автоматического сброса в конце дня
    scheduleEndOfDayReset();
}

// Планирование сброса в конце дня
function scheduleEndOfDayReset() {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    const timeUntilEndOfDay = endOfDay - now;
    
    // Устанавливаем таймер на конец дня
    setTimeout(() => {
        if (unlockUntilEndOfDay) {
            unlockUntilEndOfDay = false;
            console.log('⏰ Автоматический сброс разблокировки (закончился день)');
            saveSettings();
            updateIcon();
            refreshYouTubeTabs();
        }
    }, timeUntilEndOfDay);
}

// Мониторинг активных вкладок
function startTabMonitoring() {
    // Очищаем предыдущий интервал если есть
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    
    // Проверяем активную вкладку каждую секунду
    checkInterval = setInterval(() => {
        browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
            if (tabs.length > 0) {
                const activeTab = tabs[0];
                const url = activeTab.url || '';
                const wasOnYouTube = isOnYouTubeTab;
                
                // Проверяем, является ли текущая вкладка YouTube
                isOnYouTubeTab = url.includes('youtube.com') || url.includes('youtu.be');
                
                // Если перешли на YouTube или ушли с YouTube
                if (isOnYouTubeTab !== wasOnYouTube) {
                    console.log(isOnYouTubeTab ? '📺 Перешли на YouTube' : '🚪 Ушли с YouTube');
                }
                
                // Добавляем секунду ТОЛЬКО если на активной вкладке YouTube и не разблокировано до конца дня
                if (isOnYouTubeTab && isBlocking && !unlockUntilEndOfDay) {
                    timeSpentOnYouTube++;
                    console.log('➕ Добавлена секунда на YouTube. Всего:', timeSpentOnYouTube, '/', maxTimeSeconds, 'сек');
                    
                    // Проверяем, превысили ли лимит времени
                    if (timeSpentOnYouTube >= maxTimeSeconds) {
                        console.log('⏰ Лимит времени исчерпан! Блокируем YouTube');
                        refreshYouTubeTabs();
                    }
                    
                    // Сохраняем каждые 10 секунд чтобы не нагружать хранилище
                    if (timeSpentOnYouTube % 10 === 0) {
                        saveSettings();
                    }
                    
                    // Обновляем иконку
                    updateIcon();
                }
            }
        }).catch(error => {
            console.error('Ошибка мониторинга вкладок:', error);
        });
    }, 1000);
}

// Сохранение настроек
function saveSettings() {
    const settings = {
        isBlocking: isBlocking,
        timerMinutes: timerMinutes,
        timeSpentOnYouTube: timeSpentOnYouTube,
        maxTimeSeconds: maxTimeSeconds,
        unlockUntilEndOfDay: unlockUntilEndOfDay,
        timerSetToday: timerSetToday,
        lastTimerSetDate: lastTimerSetDate ? lastTimerSetDate.toISOString() : null
    };
    
    browser.storage.local.set(settings).catch(error => {
        console.error('Ошибка сохранения настроек:', error);
    });
}

// Разблокировка на сегодня (старая функция для совместимости)
function unlockForToday() {
    unlockUntilEndOfDayFunction(); // Используем новую функцию
}

// Установка таймера
function setTimer(minutes) {
    if (minutes > 0) {
        // Проверяем, можно ли установить таймер сегодня
        if (!canSetTimerToday()) {
            console.log('🚫 Таймер уже устанавливался сегодня');
            return false;
        }
        
        timerMinutes = minutes;
        maxTimeSeconds = minutes * 60;
        timeSpentOnYouTube = 0; // Сбрасываем счетчик времени
        unlockUntilEndOfDay = false; // Сбрасываем разблокировку до конца дня
        timerSetToday = true; // Устанавливаем флаг, что таймер устанавливали сегодня
        lastTimerSetDate = new Date(); // Запоминаем дату установки
        
        saveSettings();
        updateIcon();
        refreshYouTubeTabs();
        console.log('✅ Таймер установлен. Максимальное время:', maxTimeSeconds, 'секунд');
        return true;
    }
    return false;
}

// Сброс флага установки таймера (для отладки или специальных случаев)
function resetTimerFlag() {
    timerSetToday = false;
    lastTimerSetDate = null;
    saveSettings();
    console.log('🔄 Флаг установки таймера сброшен');
}

// Обновление иконки
function updateIcon() {
    const iconPath = "icons/border-48.png";
    
    if (!isBlocking) {
        browser.browserAction.setIcon({path: iconPath});
        browser.browserAction.setBadgeText({text: ""});
        return;
    }

    if (unlockUntilEndOfDay) {
        // Показываем специальную иконку для разблокировки до конца дня
        browser.browserAction.setIcon({path: iconPath});
        browser.browserAction.setBadgeText({text: "∞"});
        browser.browserAction.setBadgeBackgroundColor({color: "#FFA500"});
        return;
    }

    if (maxTimeSeconds > 0) {
        const secondsLeft = Math.max(0, maxTimeSeconds - timeSpentOnYouTube);
        const minutesLeft = Math.floor(secondsLeft / 60);
        
        if (secondsLeft <= 0) {
            browser.browserAction.setIcon({path: iconPath});
            browser.browserAction.setBadgeText({text: "🔒"});
            browser.browserAction.setBadgeBackgroundColor({color: "#FF0000"});
        } else {
            const badgeText = minutesLeft > 0 ? minutesLeft + "" : "<1";
            browser.browserAction.setBadgeText({text: badgeText});
            browser.browserAction.setBadgeBackgroundColor({color: "#4CAF50"});
        }
    } else {
        browser.browserAction.setIcon({path: iconPath});
        browser.browserAction.setBadgeText({text: "∞"});
        browser.browserAction.setBadgeBackgroundColor({color: "#4CAF50"});
    }
}

// Проверка блокировки
function shouldBlockYouTube() {
    if (!isBlocking) {
        console.log('➡️ Блокировка отключена в настройках');
        return false;
    }
    
    if (unlockUntilEndOfDay) {
        console.log('➡️ Разблокировано до конца дня');
        return false;
    }
    
    if (maxTimeSeconds <= 0) {
        console.log('➡️ Нет активного таймера');
        return false;
    }
    
    const shouldBlock = timeSpentOnYouTube >= maxTimeSeconds;
    console.log('🔍 Проверка блокировки:', { 
        timeSpent: timeSpentOnYouTube, 
        maxTime: maxTimeSeconds,
        shouldBlock: shouldBlock
    });
    
    return shouldBlock;
}

// Функция для принудительного обновления YouTube вкладок
function refreshYouTubeTabs() {
    if (shouldBlockYouTube()) {
        browser.tabs.query({url: "*://*.youtube.com/*"}).then(tabs => {
            tabs.forEach(tab => {
                console.log('🔄 Обновляем вкладку YouTube:', tab.id, tab.url);
                browser.tabs.reload(tab.id);
            });
        }).catch(error => {
            console.error('Ошибка обновления вкладок:', error);
        });
    }
}

// Обработчик запросов
function handleRequest(details) {
    const url = details.url.toLowerCase();
    
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    
    if (!isYouTube) {
        return {cancel: false};
    }
    
    const isMainPage = 
        url === 'https://www.youtube.com/' ||
        url === 'http://www.youtube.com/' ||
        url === 'https://youtube.com/' ||
        url === 'http://youtube.com/' ||
        url.includes('/watch?') ||
        url.includes('/watch/') ||
        url.includes('/results?') ||
        url.includes('/shorts/') ||
        url.includes('/channel/') ||
        url.includes('/user/') ||
        url.includes('/c/');
    
    const isTechnicalRequest = 
        url.includes('/api/') ||
        url.includes('/youtubei/') ||
        url.includes('/stats/') ||
        url.includes('/embed/') ||
        url.includes('.ggpht.com') ||
        url.includes('i.ytimg.com') ||
        url.includes('googlevideo.com') ||
        url.includes('gstatic.com') ||
        url.includes('accounts.youtube.com');
    
    if (isTechnicalRequest) {
        return {cancel: false};
    }
    
    const shouldBlock = shouldBlockYouTube();
    
    if (isMainPage && shouldBlock) {
        console.log('🎯 БЛОКИРУЕМ YouTube (таймер истек)');
        const redirectUrl = browser.runtime.getURL("stop.html");
        return {redirectUrl: redirectUrl};
    }
    
    return {cancel: false};
}

// Обработчик сообщений
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Получено сообщение:', message);
    
    const processMessage = async () => {
        try {
            if (message.action === "toggleBlocking") {
                isBlocking = message.value;
                await saveSettings();
                updateIcon();
                refreshYouTubeTabs();
                return {success: true};
            }
            else if (message.action === "setTimer") {
                const success = setTimer(parseInt(message.minutes));
                return {success: success, timerSetToday: timerSetToday};
            }
            else if (message.action === "disableForToday") {
                unlockForToday();
                return {success: true};
            }
            else if (message.action === "getStatus") {
                const secondsLeft = Math.max(0, maxTimeSeconds - timeSpentOnYouTube);
                const minutesLeft = Math.floor(secondsLeft / 60);
                
                // Рассчитываем время до конца дня
                let timeUntilEndOfDay = null;
                if (unlockUntilEndOfDay) {
                    const now = new Date();
                    const endOfDay = new Date();
                    endOfDay.setHours(23, 59, 59, 999);
                    timeUntilEndOfDay = Math.floor((endOfDay - now) / 1000); // в секундах
                }
                
                return {
                    isBlocking: isBlocking,
                    timerMinutes: timerMinutes,
                    timeSpentOnYouTube: timeSpentOnYouTube,
                    maxTimeSeconds: maxTimeSeconds,
                    secondsLeft: secondsLeft,
                    minutesLeft: minutesLeft,
                    isOnYouTube: isOnYouTubeTab,
                    isBlocked: shouldBlockYouTube(),
                    unlockUntilEndOfDay: unlockUntilEndOfDay,
                    timeUntilEndOfDay: timeUntilEndOfDay,
                    timerSetToday: timerSetToday,
                    canSetTimer: canSetTimerToday()
                };
            }
            else if (message.action === "unlockForToday") {
                unlockForToday();
                return {success: true};
            }
            else if (message.action === "unlockUntilEndOfDay") {
                unlockUntilEndOfDayFunction();
                return {success: true};
            }
            else if (message.action === "resetTimer") {
                timeSpentOnYouTube = 0;
                unlockUntilEndOfDay = false;
                saveSettings();
                updateIcon();
                return {success: true};
            }
            else if (message.action === "resetTimerFlag") {
                resetTimerFlag();
                return {success: true};
            }
        } catch (error) {
            console.error('Ошибка:', error);
            return {success: false, error: error.message};
        }
    };
    
    // Возвращаем true для асинхронного ответа
    processMessage().then(sendResponse);
    return true;
});

// Регистрируем обработчик запросов
browser.webRequest.onBeforeRequest.addListener(
    handleRequest,
    {urls: ["<all_urls>"]},
    ["blocking"]
);

// Инициализация
loadSettings();