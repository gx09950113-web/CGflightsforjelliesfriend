/* =========================================================
   CG FLIGHT
   js/pages/rules.js

   Rules page controller.

   Responsibilities:
   - Render wallet balance
   - Render sound/music settings
   - Manage settings modal
   - Play page BGM / click SFX
   - Handle navigation feedback

   IMPORTANT:
   This page is informational only.

   It does NOT:
   - Modify game state
   - Place bets
   - Perform cashout
   - Modify history
   - Modify statistics
========================================================= */


/* =========================================================
   CORE IMPORTS
========================================================= */

import {
    getBalance,
    formatCoins
} from "../core/wallet.js";

import {
    getSettings,
    toggleSoundEnabled,
    toggleMusicEnabled,
    subscribeToSettings
} from "../core/settings.js";

import {
    preloadAudio,
    playBgm,
    pauseBgm,
    playClick,
    playEnterRoom
} from "../core/audio.js";

import {
    showElement,
    hideElement,
    setText
} from "../core/utils.js";


/* =========================================================
   ICON PATHS
========================================================= */

const ICONS = Object.freeze({

    soundOn:
        "./assets/icons/sound-on.svg",

    soundOff:
        "./assets/icons/sound-off.svg",

    musicOn:
        "./assets/icons/music-on.svg",

    musicOff:
        "./assets/icons/music-off.svg"
});


/* =========================================================
   DOM REFERENCES
========================================================= */

const elements = {

    /* -----------------------------------------------------
       Header
    ----------------------------------------------------- */

    backButton:
        document.getElementById(
            "backButton"
        ),

    walletBalance:
        document.getElementById(
            "walletBalance"
        ),

    soundToggleButton:
        document.getElementById(
            "soundToggleButton"
        ),

    soundToggleIcon:
        document.getElementById(
            "soundToggleIcon"
        ),

    musicToggleButton:
        document.getElementById(
            "musicToggleButton"
        ),

    musicToggleIcon:
        document.getElementById(
            "musicToggleIcon"
        ),

    settingsButton:
        document.getElementById(
            "settingsButton"
        ),


    /* -----------------------------------------------------
       Settings modal
    ----------------------------------------------------- */

    settingsModal:
        document.getElementById(
            "settingsModal"
        ),

    closeSettingsButton:
        document.getElementById(
            "closeSettingsButton"
        ),

    settingsSoundToggle:
        document.getElementById(
            "settingsSoundToggle"
        ),

    settingsMusicToggle:
        document.getElementById(
            "settingsMusicToggle"
        )
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    preloadAudio();

    bindControls();

    bindSettingsEvents();

    renderWallet();

    updateSettingsUI();

    playBgm(
        "lobby"
    );
}


/* =========================================================
   BIND CONTROLS
========================================================= */

function bindControls() {

    /* -----------------------------------------------------
       Header audio
    ----------------------------------------------------- */

    elements.soundToggleButton
        ?.addEventListener(
            "click",
            () => {

                toggleSoundEnabled();
            }
        );


    elements.musicToggleButton
        ?.addEventListener(
            "click",
            () => {

                toggleMusicEnabled();
            }
        );


    /* -----------------------------------------------------
       Settings modal
    ----------------------------------------------------- */

    elements.settingsButton
        ?.addEventListener(
            "click",
            openSettingsModal
        );


    elements.closeSettingsButton
        ?.addEventListener(
            "click",
            closeSettingsModal
        );


    elements.settingsSoundToggle
        ?.addEventListener(
            "click",
            () => {

                toggleSoundEnabled();
            }
        );


    elements.settingsMusicToggle
        ?.addEventListener(
            "click",
            () => {

                toggleMusicEnabled();
            }
        );


    elements.settingsModal
        ?.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    elements.settingsModal
                ) {
                    closeSettingsModal();
                }
            }
        );


    /* -----------------------------------------------------
       Navigation
    ----------------------------------------------------- */

    elements.backButton
        ?.addEventListener(
            "click",
            () => {

                playClick();
            }
        );


    const flightLinks =
        document.querySelectorAll(
            'a[href="./game.html"]'
        );


    flightLinks.forEach(
        (link) => {

            link.addEventListener(
                "click",
                () => {

                    playEnterRoom();
                }
            );
        }
    );


    const normalNavigationLinks =
        document.querySelectorAll(
            'a[href="./history.html"], a[href="./index.html"]'
        );


    normalNavigationLinks.forEach(
        (link) => {

            if (
                link ===
                elements.backButton
            ) {
                return;
            }


            link.addEventListener(
                "click",
                () => {

                    playClick();
                }
            );
        }
    );


    /* -----------------------------------------------------
       Keyboard
    ----------------------------------------------------- */

    document.addEventListener(
        "keydown",
        handleKeydown
    );
}


/* =========================================================
   SETTINGS EVENTS
========================================================= */

function bindSettingsEvents() {

    subscribeToSettings(
        ({
            settings,
            changedKeys
        }) => {

            updateSettingsUI();


            /*
             If music was switched back ON while staying on
             the Rules page, explicitly request Lobby BGM.
            */

            if (
                changedKeys.includes(
                    "musicEnabled"
                ) &&
                settings.musicEnabled
            ) {
                playBgm(
                    "lobby"
                );
            }
        }
    );
}


/* =========================================================
   WALLET
========================================================= */

function renderWallet() {

    setText(
        elements.walletBalance,
        formatCoins(
            getBalance()
        )
    );
}


/* =========================================================
   SETTINGS UI
========================================================= */

function updateSettingsUI() {

    const settings =
        getSettings();


    /* -----------------------------------------------------
       Sound icon
    ----------------------------------------------------- */

    if (
        elements.soundToggleIcon
    ) {
        elements.soundToggleIcon.src =
            settings.soundEnabled
                ? ICONS.soundOn
                : ICONS.soundOff;
    }


    if (
        elements.soundToggleButton
    ) {

        elements.soundToggleButton
            .setAttribute(
                "aria-label",

                settings.soundEnabled
                    ? "關閉音效"
                    : "開啟音效"
            );


        elements.soundToggleButton.title =
            settings.soundEnabled
                ? "關閉音效"
                : "開啟音效";
    }


    /* -----------------------------------------------------
       Music icon
    ----------------------------------------------------- */

    if (
        elements.musicToggleIcon
    ) {
        elements.musicToggleIcon.src =
            settings.musicEnabled
                ? ICONS.musicOn
                : ICONS.musicOff;
    }


    if (
        elements.musicToggleButton
    ) {

        elements.musicToggleButton
            .setAttribute(
                "aria-label",

                settings.musicEnabled
                    ? "關閉背景音樂"
                    : "開啟背景音樂"
            );


        elements.musicToggleButton.title =
            settings.musicEnabled
                ? "關閉背景音樂"
                : "開啟背景音樂";
    }


    /* -----------------------------------------------------
       Settings modal
    ----------------------------------------------------- */

    setText(
        elements.settingsSoundToggle,

        settings.soundEnabled
            ? "ON"
            : "OFF"
    );


    setText(
        elements.settingsMusicToggle,

        settings.musicEnabled
            ? "ON"
            : "OFF"
    );


    elements.settingsSoundToggle
        ?.setAttribute(
            "aria-pressed",
            String(
                settings.soundEnabled
            )
        );


    elements.settingsMusicToggle
        ?.setAttribute(
            "aria-pressed",
            String(
                settings.musicEnabled
            )
        );
}


/* =========================================================
   OPEN SETTINGS MODAL
========================================================= */

function openSettingsModal() {

    playClick();


    showElement(
        elements.settingsModal
    );


    document.body.style.overflow =
        "hidden";


    requestAnimationFrame(
        () => {

            elements
                .closeSettingsButton
                ?.focus();
        }
    );
}


/* =========================================================
   CLOSE SETTINGS MODAL
========================================================= */

function closeSettingsModal() {

    playClick();


    hideElement(
        elements.settingsModal
    );


    document.body.style.overflow =
        "";


    elements.settingsButton
        ?.focus();
}


/* =========================================================
   KEYBOARD
========================================================= */

function handleKeydown(
    event
) {

    if (
        event.key !==
        "Escape"
    ) {
        return;
    }


    if (
        !isVisible(
            elements.settingsModal
        )
    ) {
        return;
    }


    closeSettingsModal();
}


/* =========================================================
   VISIBLE CHECK
========================================================= */

function isVisible(
    element
) {

    if (!element) {
        return false;
    }


    return (
        !element.hidden &&
        !element.classList.contains(
            "is-hidden"
        )
    );
}


/* =========================================================
   PAGE HIDE
========================================================= */

window.addEventListener(
    "pagehide",
    () => {

        pauseBgm();
    }
);


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        init,
        {
            once: true
        }
    );

} else {

    init();
}
