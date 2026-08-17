/* =========================================================
   CG FLIGHT
   js/pages/index.js

   Lobby page controller.

   Responsibilities:
   - Process player login
   - Display wallet balance
   - Display daily login reward result
   - Enforce README modal every page load
   - Manage persistent sound/music settings
   - Manage Lobby BGM / SFX
   - Render player statistics
   - Open / close page modals

   IMPORTANT:
   Game rules and persistence are handled by core/game
   modules. This file only coordinates the Lobby UI.
========================================================= */


/* =========================================================
   CORE IMPORTS
========================================================= */

import {
    getBalance,
    formatCoins
} from "../core/wallet.js";

import {
    processLogin,
    getLoginStatus
} from "../core/login.js";

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
    playEnterRoom,
    playLoginReward
} from "../core/audio.js";

import {
    showElement,
    hideElement,
    setText
} from "../core/utils.js";


/* =========================================================
   GAME IMPORTS
========================================================= */

import {
    getStatisticsSummary
} from "../game/statistics.js";


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
       Wallet
    ----------------------------------------------------- */

    walletBalance:
        document.getElementById(
            "walletBalance"
        ),


    /* -----------------------------------------------------
       Login reward
    ----------------------------------------------------- */

    loginRewardPanel:
        document.getElementById(
            "loginRewardPanel"
        ),

    loginStreak:
        document.getElementById(
            "loginStreak"
        ),

    todayLoginReward:
        document.getElementById(
            "todayLoginReward"
        ),


    /* -----------------------------------------------------
       Header controls
    ----------------------------------------------------- */

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
       Lobby actions
    ----------------------------------------------------- */

    playButton:
        document.getElementById(
            "playButton"
        ),

    statisticsButton:
        document.getElementById(
            "statisticsButton"
        ),


    /* -----------------------------------------------------
       README modal
    ----------------------------------------------------- */

    readmeModal:
        document.getElementById(
            "readmeModal"
        ),

    acceptReadmeButton:
        document.getElementById(
            "acceptReadmeButton"
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
        ),


    /* -----------------------------------------------------
       Statistics modal
    ----------------------------------------------------- */

    statisticsModal:
        document.getElementById(
            "statisticsModal"
        ),

    closeStatisticsButton:
        document.getElementById(
            "closeStatisticsButton"
        ),

    statisticsModalBody:
        document.querySelector(
            ".statistics-modal-body"
        )
};


/* =========================================================
   PAGE RUNTIME
========================================================= */

const runtime = {

    readmeAccepted: false,

    loginResult: null
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    preloadAudio();


    /*
     IMPORTANT:
     README is shown BEFORE normal Lobby interaction is
     unlocked.
    */

    lockPageForReadme();


    /*
     Process login once for this page load.

     login.js prevents duplicate same-day rewards, so coming
     back from game.html will not issue another daily bonus.
    */

    runtime.loginResult =
        processLogin();


    renderWallet();

    renderLoginReward();

    updateSettingsUI();

    renderStatistics();


    bindReadmeEvents();

    bindSettingsEvents();

    bindStatisticsEvents();

    bindAudioEvents();

    bindLobbyEvents();

    bindGlobalEvents();
}


/* =========================================================
   README MODAL

   Rules:
   - Always appears whenever index.html loads
   - Never stored as "already read"
   - Cannot close by backdrop
   - Cannot close with Escape
   - Lobby remains locked until accepted
========================================================= */

function lockPageForReadme() {

    runtime.readmeAccepted =
        false;


    showElement(
        elements.readmeModal
    );


    document.body.style.overflow =
        "hidden";


    if (
        elements.acceptReadmeButton
    ) {
        requestAnimationFrame(
            () => {

                elements
                    .acceptReadmeButton
                    .focus();
            }
        );
    }
}


/* =========================================================
   README EVENTS
========================================================= */

function bindReadmeEvents() {

    elements.acceptReadmeButton
        ?.addEventListener(
            "click",
            handleReadmeAccepted
        );
}


/* =========================================================
   ACCEPT README
========================================================= */

function handleReadmeAccepted() {

    if (
        runtime.readmeAccepted
    ) {
        return;
    }


    runtime.readmeAccepted =
        true;


    playClick();


    hideElement(
        elements.readmeModal
    );


    document.body.style.overflow =
        "";


    /*
     First meaningful user interaction has occurred,
     therefore Lobby BGM has a much better chance of passing
     browser autoplay restrictions.
    */

    playBgm(
        "lobby"
    );


    /*
     Reward sound only plays when this page load actually
     granted something.
    */

    if (
        runtime.loginResult?.success &&
        runtime.loginResult.totalReward > 0
    ) {
        playLoginReward();
    }
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
   LOGIN REWARD UI
========================================================= */

function renderLoginReward() {

    const result =
        runtime.loginResult;


    const status =
        getLoginStatus();


    /*
     Display current cycle day rather than unbounded streak.

     login.js currently keeps:
       streak   = real consecutive days
       cycleDay = 1–7 reward cycle
    */

    setText(
        elements.loginStreak,
        status.cycleDay || 0
    );


    if (
        !result ||
        !result.success
    ) {

        setText(
            elements.todayLoginReward,
            "+0"
        );


        return;
    }


    /*
     Newly granted reward on THIS page load.
    */

    if (
        result.totalReward > 0
    ) {

        setText(
            elements.todayLoginReward,
            `+${formatCoins(result.totalReward)}`
        );


        elements.loginRewardPanel
            ?.classList
            .add(
                "is-rewarded"
            );


        return;
    }


    /*
     Same day reopened:
     reward has already been claimed.

     Show today's normal reward value rather than pretending
     another reward was just granted.
    */

    const dailyAmount =
        status.cycleDay === 7
            ? 8777
            : 1000;


    setText(
        elements.todayLoginReward,
        `+${formatCoins(dailyAmount)}`
    );


    elements.loginRewardPanel
        ?.classList
        .remove(
            "is-rewarded"
        );
}


/* =========================================================
   SETTINGS EVENTS
========================================================= */

function bindSettingsEvents() {

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
}


/* =========================================================
   HEADER AUDIO EVENTS
========================================================= */

function bindAudioEvents() {

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


    subscribeToSettings(
        ({
            settings,
            changedKeys
        }) => {

            updateSettingsUI();


            /*
             settings.js / audio.js already handle pausing
             current BGM when music becomes false.

             When music becomes true, explicitly request the
             Lobby track.
            */

            if (
                changedKeys.includes(
                    "musicEnabled"
                ) &&
                settings.musicEnabled &&
                runtime.readmeAccepted
            ) {
                playBgm(
                    "lobby"
                );
            }
        }
    );
}


/* =========================================================
   SETTINGS UI
========================================================= */

function updateSettingsUI() {

    const settings =
        getSettings();


    /* -----------------------------------------------------
       Header sound
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
       Header music
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
   OPEN SETTINGS
========================================================= */

function openSettingsModal() {

    if (
        !runtime.readmeAccepted
    ) {
        return;
    }


    playClick();


    showElement(
        elements.settingsModal
    );


    requestAnimationFrame(
        () => {

            elements
                .closeSettingsButton
                ?.focus();
        }
    );
}


/* =========================================================
   CLOSE SETTINGS
========================================================= */

function closeSettingsModal() {

    playClick();


    hideElement(
        elements.settingsModal
    );


    elements.settingsButton
        ?.focus();
}


/* =========================================================
   STATISTICS EVENTS
========================================================= */

function bindStatisticsEvents() {

    elements.statisticsButton
        ?.addEventListener(
            "click",
            openStatisticsModal
        );


    elements.closeStatisticsButton
        ?.addEventListener(
            "click",
            closeStatisticsModal
        );


    elements.statisticsModal
        ?.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    elements.statisticsModal
                ) {
                    closeStatisticsModal();
                }
            }
        );
}


/* =========================================================
   OPEN STATISTICS
========================================================= */

function openStatisticsModal() {

    if (
        !runtime.readmeAccepted
    ) {
        return;
    }


    playClick();


    /*
     Refresh data every time the modal opens because Game
     rounds may have changed the statistics since the Lobby
     was first loaded.
    */

    renderStatistics();


    showElement(
        elements.statisticsModal
    );


    requestAnimationFrame(
        () => {

            elements
                .closeStatisticsButton
                ?.focus();
        }
    );
}


/* =========================================================
   CLOSE STATISTICS
========================================================= */

function closeStatisticsModal() {

    playClick();


    hideElement(
        elements.statisticsModal
    );


    elements.statisticsButton
        ?.focus();
}


/* =========================================================
   STATISTICS RENDER

   This does not require fixed IDs inside the statistics
   modal. It builds the content dynamically.
========================================================= */

function renderStatistics() {

    if (
        !elements.statisticsModalBody
    ) {
        return;
    }


    const stats =
        getStatisticsSummary();


    const rows = [

        [
            "Completed Rounds",
            formatCoins(
                stats.totalRounds
            )
        ],

        [
            "Valid Bets",
            formatCoins(
                stats.totalBets
            )
        ],

        [
            "Successful Cash Outs",
            formatCoins(
                stats.cashoutCount
            )
        ],

        [
            "Crash Losses",
            formatCoins(
                stats.crashLossCount
            )
        ],

        [
            "Win Rate",
            `${stats.winRate.toFixed(2)}%`
        ],

        [
            "Total Wagered",
            formatCoins(
                stats.totalWagered
            )
        ],

        [
            "Total Returned",
            formatCoins(
                stats.totalReturned
            )
        ],

        [
            "Net Profit",
            formatSignedCoins(
                stats.netProfit
            )
        ],

        [
            "Experienced Return Rate",
            `${stats.returnRate.toFixed(2)}%`
        ],

        [
            "Highest Cash Out",
            `${stats.highestCashoutMultiplier.toFixed(2)}×`
        ],

        [
            "Highest Crash",
            `${stats.highestCrashMultiplier.toFixed(2)}×`
        ],

        [
            "Highest Single Win",
            formatCoins(
                stats.highestSingleWin
            )
        ]
    ];


    const fragment =
        document.createDocumentFragment();


    const container =
        document.createElement(
            "div"
        );


    container.className =
        "statistics-grid";


    for (
        const [
            label,
            value
        ]
        of rows
    ) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "statistics-item";


        const labelElement =
            document.createElement(
                "span"
            );


        labelElement.className =
            "statistics-item-label";


        labelElement.textContent =
            label;


        const valueElement =
            document.createElement(
                "strong"
            );


        valueElement.className =
            "statistics-item-value";


        valueElement.textContent =
            value;


        item.append(
            labelElement,
            valueElement
        );


        container.appendChild(
            item
        );
    }


    fragment.appendChild(
        container
    );


    elements.statisticsModalBody
        .replaceChildren(
            fragment
        );
}


/* =========================================================
   SIGNED COINS
========================================================= */

function formatSignedCoins(
    value
) {

    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return "0";
    }


    if (
        numeric > 0
    ) {
        return (
            `+${formatCoins(numeric)}`
        );
    }


    if (
        numeric < 0
    ) {
        return (
            `-${formatCoins(
                Math.abs(
                    numeric
                )
            )}`
        );
    }


    return "0";
}


/* =========================================================
   LOBBY EVENTS
========================================================= */

function bindLobbyEvents() {

    /*
     START FLIGHT is normally an <a href="./game.html">.

     We only add audio here.
    */

    elements.playButton
        ?.addEventListener(
            "click",
            (event) => {

                if (
                    !runtime.readmeAccepted
                ) {
                    event.preventDefault();

                    return;
                }


                playEnterRoom();
            }
        );


    /*
     Give navigation cards click feedback.
    */

    const navigationLinks =
        document.querySelectorAll(
            "a.navigation-card"
        );


    navigationLinks.forEach(
        (link) => {

            link.addEventListener(
                "click",
                (event) => {

                    if (
                        !runtime.readmeAccepted
                    ) {
                        event.preventDefault();

                        return;
                    }


                    playClick();
                }
            );
        }
    );
}


/* =========================================================
   GLOBAL EVENTS
========================================================= */

function bindGlobalEvents() {

    document.addEventListener(
        "keydown",
        handleGlobalKeydown
    );


    /*
     Capture all clicks while README remains mandatory.

     This is redundant with the overlay visually blocking the
     page, but also protects keyboard/programmatic link
     activation.
    */

    document.addEventListener(
        "click",
        preventInteractionBeforeReadme,
        true
    );


    window.addEventListener(
        "pagehide",
        () => {

            pauseBgm();
        }
    );
}


/* =========================================================
   PREVENT PRE-README INTERACTION
========================================================= */

function preventInteractionBeforeReadme(
    event
) {

    if (
        runtime.readmeAccepted
    ) {
        return;
    }


    if (
        elements.readmeModal &&
        elements.readmeModal.contains(
            event.target
        )
    ) {
        return;
    }


    event.preventDefault();

    event.stopPropagation();
}


/* =========================================================
   KEYBOARD
========================================================= */

function handleGlobalKeydown(
    event
) {

    /*
     README deliberately ignores Escape.
    */

    if (
        !runtime.readmeAccepted
    ) {
        return;
    }


    if (
        event.key !==
        "Escape"
    ) {
        return;
    }


    if (
        isElementVisible(
            elements.settingsModal
        )
    ) {

        closeSettingsModal();

        return;
    }


    if (
        isElementVisible(
            elements.statisticsModal
        )
    ) {

        closeStatisticsModal();
    }
}


/* =========================================================
   VISIBLE HELPER
========================================================= */

function isElementVisible(
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
