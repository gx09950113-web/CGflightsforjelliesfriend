/* =========================================================
   CG FLIGHT
   js/pages/index.js

   Lobby page controller.

   Responsibilities:
   - README modal interaction
   - Settings modal interaction
   - Statistics modal interaction
   - Basic UI button events
   - Temporary UI initialization

   Player data, wallet logic, login rewards and statistics
   will be connected later through core/game modules.
========================================================= */


/* =========================================================
   DOM REFERENCES
========================================================= */

const elements = {
    /* Wallet */
    walletBalance: document.getElementById("walletBalance"),

    /* Login reward */
    loginRewardPanel: document.getElementById("loginRewardPanel"),
    loginStreak: document.getElementById("loginStreak"),
    todayLoginReward: document.getElementById("todayLoginReward"),

    /* Header buttons */
    soundToggleButton: document.getElementById("soundToggleButton"),
    soundToggleIcon: document.getElementById("soundToggleIcon"),

    musicToggleButton: document.getElementById("musicToggleButton"),
    musicToggleIcon: document.getElementById("musicToggleIcon"),

    settingsButton: document.getElementById("settingsButton"),

    /* Lobby */
    playButton: document.getElementById("playButton"),
    statisticsButton: document.getElementById("statisticsButton"),

    /* README modal */
    readmeModal: document.getElementById("readmeModal"),
    acceptReadmeButton: document.getElementById("acceptReadmeButton"),

    /* Settings modal */
    settingsModal: document.getElementById("settingsModal"),
    closeSettingsButton: document.getElementById("closeSettingsButton"),
    settingsSoundToggle: document.getElementById("settingsSoundToggle"),
    settingsMusicToggle: document.getElementById("settingsMusicToggle"),

    /* Statistics modal */
    statisticsModal: document.getElementById("statisticsModal"),
    closeStatisticsButton: document.getElementById(
        "closeStatisticsButton"
    ),

    /* Audio */
    lobbyBgm: document.getElementById("lobbyBgm"),
    clickSound: document.getElementById("clickSound"),
    loginRewardSound: document.getElementById("loginRewardSound")
};


/* =========================================================
   TEMPORARY PAGE STATE

   These values are UI-only placeholders.
   They will later be replaced by settings.js / audio.js.
========================================================= */

const pageState = {
    soundEnabled: true,
    musicEnabled: true,
    readmeAccepted: false
};


/* =========================================================
   ASSET PATHS
========================================================= */

const ICONS = {
    soundOn: "./assets/icons/sound-on.svg",
    soundOff: "./assets/icons/sound-off.svg",

    musicOn: "./assets/icons/music-on.svg",
    musicOff: "./assets/icons/music-off.svg"
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {
    validateRequiredElements();

    initializeTemporaryDisplay();

    bindReadmeEvents();
    bindSettingsEvents();
    bindStatisticsEvents();
    bindAudioControlEvents();
    bindGeneralButtonSounds();

    lockPageForReadme();
}


/* =========================================================
   DOM VALIDATION
========================================================= */

function validateRequiredElements() {
    const required = [
        "walletBalance",
        "loginStreak",
        "todayLoginReward",

        "soundToggleButton",
        "soundToggleIcon",

        "musicToggleButton",
        "musicToggleIcon",

        "settingsButton",

        "statisticsButton",

        "readmeModal",
        "acceptReadmeButton",

        "settingsModal",
        "closeSettingsButton",

        "statisticsModal",
        "closeStatisticsButton"
    ];

    for (const key of required) {
        if (!elements[key]) {
            console.warn(
                `[CG Flight] Missing DOM element: ${key}`
            );
        }
    }
}


/* =========================================================
   TEMPORARY DISPLAY

   Do NOT create player data here.
   Real values will later come from storage.js / wallet.js.
========================================================= */

function initializeTemporaryDisplay() {
    if (elements.walletBalance) {
        elements.walletBalance.textContent = "0";
    }

    if (elements.loginStreak) {
        elements.loginStreak.textContent = "0";
    }

    if (elements.todayLoginReward) {
        elements.todayLoginReward.textContent = "+0";
    }

    updateSoundUI();
    updateMusicUI();
}


/* =========================================================
   README MODAL

   Important:
   - Always visible when index.html loads.
   - No localStorage "accepted" flag.
   - Cannot close by backdrop.
   - Cannot close with Escape.
========================================================= */

function bindReadmeEvents() {
    if (!elements.acceptReadmeButton) {
        return;
    }

    elements.acceptReadmeButton.addEventListener(
        "click",
        handleReadmeAccepted
    );
}


function handleReadmeAccepted() {
    if (pageState.readmeAccepted) {
        return;
    }

    pageState.readmeAccepted = true;

    playClickSound();

    hideModal(elements.readmeModal);

    unlockPageAfterReadme();

    attemptStartLobbyMusic();
}


/* =========================================================
   README PAGE LOCK
========================================================= */

function lockPageForReadme() {
    if (!elements.readmeModal) {
        return;
    }

    showModal(elements.readmeModal);

    document.body.style.overflow = "hidden";

    if (elements.acceptReadmeButton) {
        requestAnimationFrame(() => {
            elements.acceptReadmeButton.focus();
        });
    }
}


function unlockPageAfterReadme() {
    document.body.style.overflow = "";
}


/* =========================================================
   SETTINGS MODAL
========================================================= */

function bindSettingsEvents() {
    if (elements.settingsButton) {
        elements.settingsButton.addEventListener(
            "click",
            openSettingsModal
        );
    }

    if (elements.closeSettingsButton) {
        elements.closeSettingsButton.addEventListener(
            "click",
            closeSettingsModal
        );
    }

    if (elements.settingsModal) {
        elements.settingsModal.addEventListener(
            "click",
            handleSettingsBackdropClick
        );
    }

    if (elements.settingsSoundToggle) {
        elements.settingsSoundToggle.addEventListener(
            "click",
            toggleSound
        );
    }

    if (elements.settingsMusicToggle) {
        elements.settingsMusicToggle.addEventListener(
            "click",
            toggleMusic
        );
    }
}


function openSettingsModal() {
    if (!pageState.readmeAccepted) {
        return;
    }

    playClickSound();

    showModal(elements.settingsModal);

    if (elements.closeSettingsButton) {
        requestAnimationFrame(() => {
            elements.closeSettingsButton.focus();
        });
    }
}


function closeSettingsModal() {
    playClickSound();

    hideModal(elements.settingsModal);

    if (elements.settingsButton) {
        elements.settingsButton.focus();
    }
}


function handleSettingsBackdropClick(event) {
    if (event.target !== elements.settingsModal) {
        return;
    }

    closeSettingsModal();
}


/* =========================================================
   STATISTICS MODAL
========================================================= */

function bindStatisticsEvents() {
    if (elements.statisticsButton) {
        elements.statisticsButton.addEventListener(
            "click",
            openStatisticsModal
        );
    }

    if (elements.closeStatisticsButton) {
        elements.closeStatisticsButton.addEventListener(
            "click",
            closeStatisticsModal
        );
    }

    if (elements.statisticsModal) {
        elements.statisticsModal.addEventListener(
            "click",
            handleStatisticsBackdropClick
        );
    }
}


function openStatisticsModal() {
    if (!pageState.readmeAccepted) {
        return;
    }

    playClickSound();

    showModal(elements.statisticsModal);

    if (elements.closeStatisticsButton) {
        requestAnimationFrame(() => {
            elements.closeStatisticsButton.focus();
        });
    }
}


function closeStatisticsModal() {
    playClickSound();

    hideModal(elements.statisticsModal);

    if (elements.statisticsButton) {
        elements.statisticsButton.focus();
    }
}


function handleStatisticsBackdropClick(event) {
    if (event.target !== elements.statisticsModal) {
        return;
    }

    closeStatisticsModal();
}


/* =========================================================
   MODAL HELPERS
========================================================= */

function showModal(modal) {
    if (!modal) {
        return;
    }

    modal.hidden = false;
    modal.classList.remove("is-hidden");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );
}


function hideModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.add("is-hidden");

    modal.hidden = true;

    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* =========================================================
   AUDIO CONTROL EVENTS

   Temporary page-level behavior only.
   Later moved to audio.js + settings.js.
========================================================= */

function bindAudioControlEvents() {
    if (elements.soundToggleButton) {
        elements.soundToggleButton.addEventListener(
            "click",
            toggleSound
        );
    }

    if (elements.musicToggleButton) {
        elements.musicToggleButton.addEventListener(
            "click",
            toggleMusic
        );
    }
}


/* =========================================================
   SOUND TOGGLE
========================================================= */

function toggleSound() {
    pageState.soundEnabled = !pageState.soundEnabled;

    updateSoundUI();

    if (pageState.soundEnabled) {
        playClickSound();
    }
}


function updateSoundUI() {
    if (elements.soundToggleIcon) {
        elements.soundToggleIcon.src =
            pageState.soundEnabled
                ? ICONS.soundOn
                : ICONS.soundOff;
    }

    if (elements.soundToggleButton) {
        elements.soundToggleButton.setAttribute(
            "aria-label",
            pageState.soundEnabled
                ? "關閉音效"
                : "開啟音效"
        );

        elements.soundToggleButton.title =
            pageState.soundEnabled
                ? "關閉音效"
                : "開啟音效";
    }

    if (elements.settingsSoundToggle) {
        elements.settingsSoundToggle.textContent =
            pageState.soundEnabled
                ? "ON"
                : "OFF";

        elements.settingsSoundToggle.setAttribute(
            "aria-pressed",
            String(pageState.soundEnabled)
        );
    }
}


/* =========================================================
   MUSIC TOGGLE
========================================================= */

function toggleMusic() {
    pageState.musicEnabled = !pageState.musicEnabled;

    updateMusicUI();

    if (pageState.musicEnabled) {
        attemptStartLobbyMusic();
    } else {
        pauseLobbyMusic();
    }

    playClickSound();
}


function updateMusicUI() {
    if (elements.musicToggleIcon) {
        elements.musicToggleIcon.src =
            pageState.musicEnabled
                ? ICONS.musicOn
                : ICONS.musicOff;
    }

    if (elements.musicToggleButton) {
        elements.musicToggleButton.setAttribute(
            "aria-label",
            pageState.musicEnabled
                ? "關閉背景音樂"
                : "開啟背景音樂"
        );

        elements.musicToggleButton.title =
            pageState.musicEnabled
                ? "關閉背景音樂"
                : "開啟背景音樂";
    }

    if (elements.settingsMusicToggle) {
        elements.settingsMusicToggle.textContent =
            pageState.musicEnabled
                ? "ON"
                : "OFF";

        elements.settingsMusicToggle.setAttribute(
            "aria-pressed",
            String(pageState.musicEnabled)
        );
    }
}


/* =========================================================
   LOBBY MUSIC
========================================================= */

async function attemptStartLobbyMusic() {
    if (
        !pageState.musicEnabled ||
        !elements.lobbyBgm
    ) {
        return;
    }

    try {
        elements.lobbyBgm.volume = 0.45;

        await elements.lobbyBgm.play();
    } catch (error) {
        /*
         Browser autoplay policies may reject playback.

         This is normal. Once the user interacts with the page,
         music can be started again through the music toggle.
        */

        console.debug(
            "[CG Flight] Lobby BGM could not start:",
            error
        );
    }
}


function pauseLobbyMusic() {
    if (!elements.lobbyBgm) {
        return;
    }

    elements.lobbyBgm.pause();
}


/* =========================================================
   CLICK SOUND
========================================================= */

function playClickSound() {
    if (
        !pageState.soundEnabled ||
        !elements.clickSound
    ) {
        return;
    }

    try {
        elements.clickSound.pause();

        elements.clickSound.currentTime = 0;
        elements.clickSound.volume = 0.6;

        const playPromise =
            elements.clickSound.play();

        if (
            playPromise &&
            typeof playPromise.catch === "function"
        ) {
            playPromise.catch(() => {
                /* Ignore audio policy errors. */
            });
        }
    } catch (error) {
        console.debug(
            "[CG Flight] Click sound error:",
            error
        );
    }
}


/* =========================================================
   GENERAL BUTTON SOUNDS
========================================================= */

function bindGeneralButtonSounds() {
    const clickableLinks = document.querySelectorAll(
        "a.play-button, a.navigation-card"
    );

    clickableLinks.forEach((element) => {
        element.addEventListener(
            "click",
            () => {
                if (!pageState.readmeAccepted) {
                    return;
                }

                playClickSound();
            }
        );
    });
}


/* =========================================================
   KEYBOARD EVENTS
========================================================= */

document.addEventListener(
    "keydown",
    handleGlobalKeydown
);


function handleGlobalKeydown(event) {
    /*
     README cannot be closed with Escape.
    */
    if (!pageState.readmeAccepted) {
        return;
    }

    if (event.key !== "Escape") {
        return;
    }

    if (isModalOpen(elements.settingsModal)) {
        closeSettingsModal();
        return;
    }

    if (isModalOpen(elements.statisticsModal)) {
        closeStatisticsModal();
    }
}


function isModalOpen(modal) {
    if (!modal) {
        return false;
    }

    return (
        !modal.hidden &&
        !modal.classList.contains("is-hidden")
    );
}


/* =========================================================
   PREVENT LOBBY INTERACTION BEFORE README ACCEPTANCE

   The README overlay already blocks pointer input visually,
   but this also protects keyboard-triggered navigation.
========================================================= */

document.addEventListener(
    "click",
    preventInteractionBeforeReadme,
    true
);


function preventInteractionBeforeReadme(event) {
    if (pageState.readmeAccepted) {
        return;
    }

    if (
        elements.readmeModal &&
        elements.readmeModal.contains(event.target)
    ) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
}


/* =========================================================
   PAGE VISIBILITY
========================================================= */

document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
);


function handleVisibilityChange() {
    if (document.hidden) {
        pauseLobbyMusic();
        return;
    }

    if (
        pageState.readmeAccepted &&
        pageState.musicEnabled
    ) {
        attemptStartLobbyMusic();
    }
}


/* =========================================================
   PAGE UNLOAD
========================================================= */

window.addEventListener(
    "pagehide",
    () => {
        pauseLobbyMusic();
    }
);


/* =========================================================
   START
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init,
        { once: true }
    );
} else {
    init();
}
