/* =========================================================
   CG FLIGHT
   js/pages/index.js

   Lobby page controller.

   Responsibilities:
   - Process player login
   - Render wallet
   - Render login reward status
   - Force README modal on every page load
   - Manage Settings modal
   - Manage Statistics modal
   - Manage Lobby audio
   - Bind Lobby navigation/UI controls

   IMPORTANT:
   README is shown on EVERY index.html load.

   The modal itself blocks Lobby interaction.
   We intentionally DO NOT apply additional pointer-events
   or disabled locks to the entire page.
========================================================= */


/* =========================================================
   CORE IMPORTS
========================================================= */

import {
    getBalance,
    formatCoins,
    subscribeToWallet
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
    setText,
    setAriaPressed
} from "../core/utils.js";


/* =========================================================
   GAME IMPORTS
========================================================= */

import {
    getStatisticsSummary,
    subscribeToStatistics
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
       Header
    ----------------------------------------------------- */

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
       Play
    ----------------------------------------------------- */

    playButton:
        document.getElementById(
            "playButton"
        ),


    /* -----------------------------------------------------
       Login Reward
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

    loginCycleDays:
        document.querySelectorAll(
            ".login-cycle-day"
        ),


    /* -----------------------------------------------------
       README
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
       Settings
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
       Statistics
    ----------------------------------------------------- */

    statisticsButton:
        document.getElementById(
            "statisticsButton"
        ),

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
   RUNTIME
========================================================= */

const runtime = {

    readmeAccepted:
        false,

    loginResult:
        null
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    /* -----------------------------------------------------
       Audio
    ----------------------------------------------------- */

    preloadAudio();


    /* -----------------------------------------------------
       Login

       First local login:
           +10,000 initial
           +1,000 Day 1
           = +11,000
    ----------------------------------------------------- */

    runtime.loginResult =
        processLogin();


    /* -----------------------------------------------------
       Render initial UI
    ----------------------------------------------------- */

    renderWallet();

    renderLoginReward();

    updateSettingsUI();


    /* -----------------------------------------------------
       Bind controls BEFORE showing README.

       This guarantees the Accept button has its listener
       before the player can interact with it.
    ----------------------------------------------------- */

    bindControls();

    bindModuleEvents();


    /* -----------------------------------------------------
       README

       Always force it open on every Lobby load.
    ----------------------------------------------------- */

    openReadme();


    /*
     Do NOT start Lobby BGM here.

     Starting it after Accept both satisfies browser autoplay
     restrictions and matches the intended README flow.
    */
}


/* =========================================================
   BIND CONTROLS
========================================================= */

function bindControls() {

    /* -----------------------------------------------------
       README Accept
    ----------------------------------------------------- */

    elements.acceptReadmeButton
        ?.addEventListener(
            "click",
            handleAcceptReadme
        );


    /* -----------------------------------------------------
       Play
    ----------------------------------------------------- */

    elements.playButton
        ?.addEventListener(
            "click",
            handlePlayClick
        );


    /* -----------------------------------------------------
       Header Sound
    ----------------------------------------------------- */

    elements.soundToggleButton
        ?.addEventListener(
            "click",
            () => {

                playClick();

                toggleSoundEnabled();
            }
        );


    /* -----------------------------------------------------
       Header Music
    ----------------------------------------------------- */

    elements.musicToggleButton
        ?.addEventListener(
            "click",
            () => {

                playClick();

                toggleMusicEnabled();
            }
        );


    /* -----------------------------------------------------
       Settings
    ----------------------------------------------------- */

    elements.settingsButton
        ?.addEventListener(
            "click",
            openSettings
        );


    elements.closeSettingsButton
        ?.addEventListener(
            "click",
            closeSettings
        );


    elements.settingsSoundToggle
        ?.addEventListener(
            "click",
            () => {

                playClick();

                toggleSoundEnabled();
            }
        );


    elements.settingsMusicToggle
        ?.addEventListener(
            "click",
            () => {

                playClick();

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

                    closeSettings();
                }
            }
        );


    /* -----------------------------------------------------
       Statistics
    ----------------------------------------------------- */

    elements.statisticsButton
        ?.addEventListener(
            "click",
            openStatistics
        );


    elements.closeStatisticsButton
        ?.addEventListener(
            "click",
            closeStatistics
        );


    elements.statisticsModal
        ?.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    elements.statisticsModal
                ) {

                    closeStatistics();
                }
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
   MODULE EVENTS
========================================================= */

function bindModuleEvents() {

    subscribeToWallet(
        () => {

            renderWallet();
        }
    );


    subscribeToSettings(
        ({
            settings,
            changedKeys
        }) => {

            updateSettingsUI();


            /*
             audio.js already pauses BGM automatically when
             musicEnabled becomes false.

             If music is enabled again while the README has
             already been accepted, request Lobby BGM.
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


    subscribeToStatistics(
        () => {

            /*
             If Statistics Modal is currently open, refresh
             its content immediately.
            */

            if (
                isElementOpen(
                    elements.statisticsModal
                )
            ) {

                renderStatistics();
            }
        }
    );
}


/* =========================================================
   README OPEN

   IMPORTANT:
   No page-wide pointer-events lock.

   .modal-overlay already covers the viewport and intercepts
   all pointer interaction.
========================================================= */

function openReadme() {

    runtime.readmeAccepted =
        false;


    showElement(
        elements.readmeModal
    );


    document.body.style.overflow =
        "hidden";


    /*
     Focus after current call stack so the modal is already
     visible.
    */

    window.setTimeout(
        () => {

            elements.acceptReadmeButton
                ?.focus();

        },
        0
    );
}


/* =========================================================
   ACCEPT README
========================================================= */

function handleAcceptReadme() {

    runtime.readmeAccepted =
        true;


    hideElement(
        elements.readmeModal
    );


    document.body.style.overflow =
        "";


    /*
     Play Login Reward only after a real user gesture.
     This avoids browser autoplay restrictions.
    */

    if (
        runtime.loginResult
            ?.success &&
        runtime.loginResult
            .totalReward > 0
    ) {

        playLoginReward();
    }


    /*
     Same user gesture also unlocks BGM playback.
    */

    const settings =
        getSettings();


    if (
        settings.musicEnabled
    ) {

        playBgm(
            "lobby"
        );
    }
}


/* =========================================================
   PLAY GAME
========================================================= */

function handlePlayClick(
    event
) {

    /*
     README should normally make this impossible because its
     overlay covers the Lobby.

     Keep this guard as a secondary safety layer.
    */

    if (
        !runtime.readmeAccepted
    ) {

        event.preventDefault();

        return;
    }


    playEnterRoom();


    /*
     Do not prevent navigation.

     playEnterRoom() uses an Audio clone, so the browser may
     navigate normally to game.html.
    */
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
   LOGIN REWARD
========================================================= */

function renderLoginReward() {

    const result =
        runtime.loginResult;


    const status =
        getLoginStatus();


    /* -----------------------------------------------------
       Cycle Day
    ----------------------------------------------------- */

    const cycleDay =
        Number(
            status.cycleDay
        ) || 1;


    setText(
        elements.loginStreak,
        cycleDay
    );


    /* -----------------------------------------------------
       Today's actually granted reward

       First login:
           +11,000

       Normal login:
           +1,000

       Day 7:
           +8,777

       Already claimed:
           +0
    ----------------------------------------------------- */

    const reward =
        (
            result?.success &&
            result?.claimed
        )
            ? Number(
                result.totalReward
            ) || 0
            : 0;


    setText(
        elements.todayLoginReward,
        `+${formatCoins(
            reward
        )}`
    );


    /* -----------------------------------------------------
       Highlight cycle
    ----------------------------------------------------- */

    elements.loginCycleDays
        .forEach(
            (element) => {

                const day =
                    Number(
                        element.dataset.day
                    );


                element.classList.toggle(
                    "is-current",
                    day === cycleDay
                );


                /*
                 is-claimed means already passed in the
                 CURRENT seven-day cycle.

                 On Day 1 only Day 1 is current.
                */

                element.classList.toggle(
                    "is-claimed",
                    day < cycleDay
                );
            }
        );


    /* -----------------------------------------------------
       Rewarded panel
    ----------------------------------------------------- */

    elements.loginRewardPanel
        ?.classList.toggle(
            "is-rewarded",
            reward > 0
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


    elements.soundToggleButton
        ?.setAttribute(
            "aria-label",

            settings.soundEnabled
                ? "關閉音效"
                : "開啟音效"
        );


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


    elements.musicToggleButton
        ?.setAttribute(
            "aria-label",

            settings.musicEnabled
                ? "關閉背景音樂"
                : "開啟背景音樂"
        );


    /* -----------------------------------------------------
       Settings buttons
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


    setAriaPressed(
        elements.settingsSoundToggle,
        settings.soundEnabled
    );


    setAriaPressed(
        elements.settingsMusicToggle,
        settings.musicEnabled
    );
}


/* =========================================================
   OPEN SETTINGS
========================================================= */

function openSettings() {

    playClick();


    showElement(
        elements.settingsModal
    );


    document.body.style.overflow =
        "hidden";
}


/* =========================================================
   CLOSE SETTINGS
========================================================= */

function closeSettings() {

    playClick();


    hideElement(
        elements.settingsModal
    );


    document.body.style.overflow =
        "";
}


/* =========================================================
   STATISTICS
========================================================= */

function openStatistics() {

    playClick();


    renderStatistics();


    showElement(
        elements.statisticsModal
    );


    document.body.style.overflow =
        "hidden";
}


/* =========================================================
   CLOSE STATISTICS
========================================================= */

function closeStatistics() {

    playClick();


    hideElement(
        elements.statisticsModal
    );


    document.body.style.overflow =
        "";
}


/* =========================================================
   RENDER STATISTICS
========================================================= */

function renderStatistics() {

    if (
        !elements.statisticsModalBody
    ) {
        return;
    }


    const statistics =
        getStatisticsSummary();


    const items = [

        {
            label:
                "TOTAL ROUNDS",

            value:
                formatCoins(
                    statistics.totalRounds
                )
        },

        {
            label:
                "VALID BETS",

            value:
                formatCoins(
                    statistics.validBets
                )
        },

        {
            label:
                "CASH OUTS",

            value:
                formatCoins(
                    statistics.wins
                )
        },

        {
            label:
                "CRASH LOSSES",

            value:
                formatCoins(
                    statistics.losses
                )
        },

        {
            label:
                "WIN RATE",

            value:
                `${Number(
                    statistics.winRate
                ).toFixed(2)}%`
        },

        {
            label:
                "TOTAL WAGERED",

            value:
                formatCoins(
                    statistics.totalWagered
                )
        },

        {
            label:
                "TOTAL RETURNED",

            value:
                formatCoins(
                    statistics.totalReturned
                )
        },

        {
            label:
                "NET PROFIT",

            value:
                formatSignedCoins(
                    statistics.netProfit
                )
        },

        {
            label:
                "HIGHEST CASH OUT",

            value:
                statistics
                    .highestCashoutMultiplier > 0
                    ? `${Number(
                        statistics
                            .highestCashoutMultiplier
                    ).toFixed(2)}×`
                    : "—"
        },

        {
            label:
                "HIGHEST CRASH",

            value:
                statistics
                    .highestCrashMultiplier > 0
                    ? `${Number(
                        statistics
                            .highestCrashMultiplier
                    ).toFixed(2)}×`
                    : "—"
        },

        {
            label:
                "HIGHEST SINGLE WIN",

            value:
                formatCoins(
                    statistics.highestSingleWin
                )
        },

        {
            label:
                "REALIZED RETURN",

            value:
                `${Number(
                    statistics
                        .experiencedReturnRate
                ).toFixed(2)}%`
        }
    ];


    const grid =
        document.createElement(
            "div"
        );


    grid.className =
        "statistics-grid";


    for (
        const item
        of items
    ) {

        const element =
            document.createElement(
                "div"
            );


        element.className =
            "statistics-item";


        const label =
            document.createElement(
                "span"
            );


        label.className =
            "statistics-item-label";


        label.textContent =
            item.label;


        const value =
            document.createElement(
                "strong"
            );


        value.className =
            "statistics-item-value";


        value.textContent =
            item.value;


        element.append(
            label,
            value
        );


        grid.appendChild(
            element
        );
    }


    elements.statisticsModalBody
        .replaceChildren(
            grid
        );
}


/* =========================================================
   SIGNED COINS
========================================================= */

function formatSignedCoins(
    value
) {

    const numeric =
        Number(value) || 0;


    if (
        numeric > 0
    ) {

        return `+${formatCoins(
            numeric
        )}`;
    }


    if (
        numeric < 0
    ) {

        return `-${formatCoins(
            Math.abs(
                numeric
            )
        )}`;
    }


    return "0";
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


    /*
     README intentionally cannot be closed with Escape.
    */

    if (
        !runtime.readmeAccepted
    ) {
        return;
    }


    if (
        isElementOpen(
            elements.statisticsModal
        )
    ) {

        closeStatistics();

        return;
    }


    if (
        isElementOpen(
            elements.settingsModal
        )
    ) {

        closeSettings();
    }
}


/* =========================================================
   ELEMENT OPEN CHECK
========================================================= */

function isElementOpen(
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
