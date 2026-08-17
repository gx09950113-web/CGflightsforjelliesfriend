/* =========================================================
   CG FLIGHT
   js/pages/game.js

   Game page controller.

   Responsibilities:
   - Initialize player/login state
   - Initialize each round
   - Manage betting window
   - Bind DOM controls
   - Render wallet
   - Render recent 10 results
   - Render game phases
   - Render multiplier / flight visuals
   - Coordinate betting UI
   - Coordinate Auto Cash Out UI
   - Coordinate manual Cash Out UI
   - Trigger normal settlement after Crash
   - Handle abnormal flight refunds
   - Render settlement result
   - Manage settings / audio UI
   - Handle leave confirmation
   - Start next round

   IMPORTANT:
   This file coordinates modules.

   It does NOT:
   - Generate Crash Point
   - Calculate multiplier growth
   - Debit / credit Wallet directly
   - Execute Auto Cash Out logic
   - Write History directly
   - Write Statistics directly
========================================================= */


/* =========================================================
   CORE IMPORTS
========================================================= */

import {
    getBalance,
    formatCoins
} from "../core/wallet.js";


import {
    processLogin
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
    playLoginReward,
    playWin
} from "../core/audio.js";


import {
    showElement,
    hideElement,
    setText,
    setDisabled,
    roundTo,
    formatMultiplier,
    formatSignedNumber
} from "../core/utils.js";


/* =========================================================
   GAME IMPORTS
========================================================= */

import {
    GAME_PHASES,
    BET_STATUS,
    ROUND_RESULT,

    createRound,
    getState,
    subscribeToState
} from "../game/state.js";


import {
    placeBet,
    cancelBet,
    previewBet
} from "../game/betting.js";


import {
    startCountdown,
    resetFlightRuntime,
    subscribeToFlight,
    FLIGHT_EVENT_TYPES
} from "../game/flight.js";


import {
    cashout,

    configureAutoCashout,
    disableAutoCashout,

    previewCashout,
    getAutoCashoutStatus,

    resetCashoutRuntime,

    subscribeToCashout,
    CASHOUT_EVENT_TYPES
} from "../game/cashout.js";


import {
    settleRound,
    refundRound,
    settleNoBetRound,

    resetSettlementRuntime,

    subscribeToSettlement,
    SETTLEMENT_EVENT_TYPES
} from "../game/settlement.js";


import {
    getRecentResults,
    subscribeToHistory
} from "../game/history.js";


/* =========================================================
   PAGE CONFIG
========================================================= */

const PAGE_CONFIG = Object.freeze({

    /*
     Time available to place a bet before the flight
     countdown starts.
    */
    BETTING_WINDOW_MS:
        5000,


    /*
     Bet +/- adjustment.
    */
    BET_STEP:
        100,


    /*
     Temporary Cash Out visual duration.
    */
    CASHOUT_EFFECT_MS:
        1800
});


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
        "./assets/icons/music-off.svg",

    trophy:
        "./assets/icons/trophy.svg",

    crash:
        "./assets/icons/crash.svg"
});


/* =========================================================
   DOM REFERENCES
========================================================= */

const elements = {

    /* -----------------------------------------------------
       Header
    ----------------------------------------------------- */

    backLobbyButton:
        document.getElementById(
            "backLobbyButton"
        ),

    walletBalance:
        document.getElementById(
            "walletBalance"
        ),

    roundStatus:
        document.getElementById(
            "roundStatus"
        ),

    roundStatusText:
        document.getElementById(
            "roundStatusText"
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
       Recent results
    ----------------------------------------------------- */

    recentResults:
        document.getElementById(
            "recentResults"
        ),


    /* -----------------------------------------------------
       Game stage
    ----------------------------------------------------- */

    gameStage:
        document.getElementById(
            "gameStage"
        ),

    phaseLabel:
        document.getElementById(
            "phaseLabel"
        ),

    multiplierDisplay:
        document.getElementById(
            "multiplierDisplay"
        ),

    multiplierSubtext:
        document.getElementById(
            "multiplierSubtext"
        ),

    countdownOverlay:
        document.getElementById(
            "countdownOverlay"
        ),

    countdownValue:
        document.getElementById(
            "countdownValue"
        ),

    planeImage:
        document.getElementById(
            "planeImage"
        ),

    planeGlow:
        document.getElementById(
            "planeGlow"
        ),

    planeTrail:
        document.getElementById(
            "planeTrail"
        ),

    planeCrashedImage:
        document.getElementById(
            "planeCrashedImage"
        ),

    explosionImage:
        document.getElementById(
            "explosionImage"
        ),

    smokeImage:
        document.getElementById(
            "smokeImage"
        ),

    sparkImage:
        document.getElementById(
            "sparkImage"
        ),

    crashDisplay:
        document.getElementById(
            "crashDisplay"
        ),

    crashMultiplierDisplay:
        document.getElementById(
            "crashMultiplierDisplay"
        ),

    cashoutEffect:
        document.getElementById(
            "cashoutEffect"
        ),

    cashoutEffectMultiplier:
        document.getElementById(
            "cashoutEffectMultiplier"
        ),

    cashoutEffectAmount:
        document.getElementById(
            "cashoutEffectAmount"
        ),

    roundIdDisplay:
        document.getElementById(
            "roundIdDisplay"
        ),


    /* -----------------------------------------------------
       Bet
    ----------------------------------------------------- */

    betPanel:
        document.getElementById(
            "betPanel"
        ),

    betStatusText:
        document.getElementById(
            "betStatusText"
        ),

    betAmountInput:
        document.getElementById(
            "betAmountInput"
        ),

    betMinusButton:
        document.getElementById(
            "betMinusButton"
        ),

    betPlusButton:
        document.getElementById(
            "betPlusButton"
        ),

    quickBetButtons:
        document.querySelectorAll(
            ".quick-bet-button"
        ),

    betButton:
        document.getElementById(
            "betButton"
        ),

    betButtonText:
        document.getElementById(
            "betButtonText"
        ),

    cancelBetButton:
        document.getElementById(
            "cancelBetButton"
        ),

    betMessage:
        document.getElementById(
            "betMessage"
        ),


    /* -----------------------------------------------------
       Auto Cash Out
    ----------------------------------------------------- */

    autoCashoutPanel:
        document.getElementById(
            "autoCashoutPanel"
        ),

    autoCashoutToggle:
        document.getElementById(
            "autoCashoutToggle"
        ),

    autoCashoutInput:
        document.getElementById(
            "autoCashoutInput"
        ),

    quickAutoButtons:
        document.querySelectorAll(
            ".quick-auto-button"
        ),

    autoCashoutStatusText:
        document.getElementById(
            "autoCashoutStatusText"
        ),

    autoCashoutMessage:
        document.getElementById(
            "autoCashoutMessage"
        ),


    /* -----------------------------------------------------
       Cash Out
    ----------------------------------------------------- */

    cashoutPanel:
        document.getElementById(
            "cashoutPanel"
        ),

    cashoutStatusText:
        document.getElementById(
            "cashoutStatusText"
        ),

    cashoutPreviewAmount:
        document.getElementById(
            "cashoutPreviewAmount"
        ),

    cashoutBetAmount:
        document.getElementById(
            "cashoutBetAmount"
        ),

    cashoutCurrentMultiplier:
        document.getElementById(
            "cashoutCurrentMultiplier"
        ),

    cashoutButton:
        document.getElementById(
            "cashoutButton"
        ),

    cashoutButtonText:
        document.getElementById(
            "cashoutButtonText"
        ),

    cashoutMessage:
        document.getElementById(
            "cashoutMessage"
        ),


    /* -----------------------------------------------------
       Round result
    ----------------------------------------------------- */

    roundResultPanel:
        document.getElementById(
            "roundResultPanel"
        ),

    roundResultIcon:
        document.getElementById(
            "roundResultIcon"
        ),

    roundResultLabel:
        document.getElementById(
            "roundResultLabel"
        ),

    roundResultTitle:
        document.getElementById(
            "roundResultTitle"
        ),

    resultBetAmount:
        document.getElementById(
            "resultBetAmount"
        ),

    resultCashoutMultiplier:
        document.getElementById(
            "resultCashoutMultiplier"
        ),

    resultCrashMultiplier:
        document.getElementById(
            "resultCrashMultiplier"
        ),

    resultProfit:
        document.getElementById(
            "resultProfit"
        ),

    nextRoundButton:
        document.getElementById(
            "nextRoundButton"
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
       Leave confirmation
    ----------------------------------------------------- */

    leaveConfirmModal:
        document.getElementById(
            "leaveConfirmModal"
        ),

    cancelLeaveButton:
        document.getElementById(
            "cancelLeaveButton"
        ),

    confirmLeaveButton:
        document.getElementById(
            "confirmLeaveButton"
        )
};


/* =========================================================
   PAGE RUNTIME
========================================================= */

const runtime = {

    bettingTimerId:
        null,

    bettingDeadline:
        null,

    cashoutEffectTimerId:
        null,

    roundStarting:
        false,

    settlementStarted:
        false,

    leavingConfirmed:
        false
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    preloadAudio();


    /*
     Protect direct navigation to game.html.

     If the player never visited index.html first,
     initialization and the daily login reward still work.
    */

    const loginResult =
        processLogin();


    if (
        loginResult.success &&
        loginResult.totalReward > 0
    ) {

        playLoginReward();
    }


    bindControls();

    bindModuleEvents();


    updateSettingsUI();

    renderWallet();

    renderRecentResults();


    resetVisualState();

    startNewRound();


    playBgm(
        "game"
    );
}


/* =========================================================
   BIND CONTROLS
========================================================= */

function bindControls() {

    /* -----------------------------------------------------
       Bet
    ----------------------------------------------------- */

    elements.betButton
        ?.addEventListener(
            "click",
            handlePlaceBet
        );


    elements.cancelBetButton
        ?.addEventListener(
            "click",
            handleCancelBet
        );


    elements.betMinusButton
        ?.addEventListener(
            "click",
            () => {

                adjustBetAmount(
                    -PAGE_CONFIG.BET_STEP
                );
            }
        );


    elements.betPlusButton
        ?.addEventListener(
            "click",
            () => {

                adjustBetAmount(
                    PAGE_CONFIG.BET_STEP
                );
            }
        );


    elements.betAmountInput
        ?.addEventListener(
            "input",
            renderBetPreview
        );


    elements.quickBetButtons
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        playClick();


                        const value =
                            Number(
                                button.dataset
                                    .betValue
                            );


                        if (
                            !Number.isFinite(
                                value
                            )
                        ) {
                            return;
                        }


                        if (
                            elements
                                .betAmountInput
                        ) {

                            elements
                                .betAmountInput
                                .value =
                                String(value);
                        }


                        renderBetPreview();
                    }
                );
            }
        );


    /* -----------------------------------------------------
       Auto Cash Out
    ----------------------------------------------------- */

    elements.autoCashoutToggle
        ?.addEventListener(
            "click",
            handleAutoCashoutToggle
        );


    elements.autoCashoutInput
        ?.addEventListener(
            "change",
            handleAutoCashoutInputChange
        );


    elements.quickAutoButtons
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        playClick();


                        const value =
                            Number(
                                button.dataset
                                    .autoValue
                            );


                        if (
                            !Number.isFinite(
                                value
                            )
                        ) {
                            return;
                        }


                        if (
                            elements
                                .autoCashoutInput
                        ) {

                            elements
                                .autoCashoutInput
                                .value =
                                value.toFixed(2);
                        }


                        if (
                            getAutoCashoutStatus()
                                .enabled
                        ) {

                            configureCurrentAutoCashout();
                        }
                    }
                );
            }
        );


    /* -----------------------------------------------------
       Manual Cash Out
    ----------------------------------------------------- */

    elements.cashoutButton
        ?.addEventListener(
            "click",
            handleManualCashout
        );


    /* -----------------------------------------------------
       Next Round
    ----------------------------------------------------- */

    elements.nextRoundButton
        ?.addEventListener(
            "click",
            () => {

                playClick();

                startNewRound();
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
       Leave Game
    ----------------------------------------------------- */

    elements.backLobbyButton
        ?.addEventListener(
            "click",
            handleBackLobbyClick
        );


    elements.cancelLeaveButton
        ?.addEventListener(
            "click",
            closeLeaveModal
        );


    elements.confirmLeaveButton
        ?.addEventListener(
            "click",
            handleConfirmLeave
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

    /* -----------------------------------------------------
       State

       IMPORTANT:
       flight.js updates state every animation frame through
       setCurrentMultiplier().

       Do NOT redraw the entire control interface for those
       high-frequency updates.
    ----------------------------------------------------- */

    subscribeToState(
        handleStateEvent
    );


    subscribeToFlight(
        handleFlightEvent
    );


    subscribeToCashout(
        handleCashoutEvent
    );


    subscribeToSettlement(
        handleSettlementEvent
    );


    subscribeToHistory(
        () => {

            renderRecentResults();
        }
    );


    subscribeToSettings(
        ({
            settings,
            changedKeys
        }) => {

            updateSettingsUI();


            /*
             audio.js handles Music OFF automatically.

             If Music is turned ON again while remaining
             on game.html, request Game BGM.
            */

            if (
                changedKeys.includes(
                    "musicEnabled"
                ) &&
                settings.musicEnabled
            ) {

                playBgm(
                    "game"
                );
            }
        }
    );
}


/* =========================================================
   STATE EVENT
========================================================= */

function handleStateEvent(
    event
) {

    /*
     Multiplier updates occur many times per second.

     Those are rendered directly through Flight events.
    */

    if (
        event.source ===
        "setCurrentMultiplier"
    ) {
        return;
    }


    renderStateControls();
}


/* =========================================================
   START NEW ROUND
========================================================= */

function startNewRound() {

    if (
        runtime.roundStarting
    ) {
        return;
    }


    runtime.roundStarting =
        true;


    try {

        clearBettingTimer();

        clearCashoutEffectTimer();


        resetFlightRuntime();

        resetCashoutRuntime();

        resetSettlementRuntime();


        runtime.settlementStarted =
            false;


        resetVisualState();


        const state =
            createRound();


        setText(
            elements.roundIdDisplay,
            state.roundId ??
            "—"
        );


        renderWallet();

        renderStateControls();

        renderBetPreview();


        startBettingWindow();

    } finally {

        runtime.roundStarting =
            false;
    }
}


/* =========================================================
   BETTING WINDOW
========================================================= */

function startBettingWindow() {

    clearBettingTimer();


    runtime.bettingDeadline =
        Date.now() +
        PAGE_CONFIG
            .BETTING_WINDOW_MS;


    renderPhase(
        GAME_PHASES.BETTING
    );


    setText(
        elements.multiplierSubtext,
        "PLACE YOUR BET"
    );


    runtime.bettingTimerId =
        window.setTimeout(
            () => {

                runtime.bettingTimerId =
                    null;


                runtime.bettingDeadline =
                    null;


                const result =
                    startCountdown();


                if (
                    !result.success
                ) {

                    console.error(
                        "[CG Flight] Countdown start failed:",
                        result
                    );


                    setControlMessage(
                        elements.betMessage,
                        "無法開始本局。",
                        "error"
                    );
                }
            },

            PAGE_CONFIG
                .BETTING_WINDOW_MS
        );
}


/* =========================================================
   CLEAR BETTING TIMER
========================================================= */

function clearBettingTimer() {

    if (
        runtime.bettingTimerId !==
        null
    ) {

        window.clearTimeout(
            runtime.bettingTimerId
        );


        runtime.bettingTimerId =
            null;
    }


    runtime.bettingDeadline =
        null;
}


/* =========================================================
   PLACE BET
========================================================= */

function handlePlaceBet() {

    /*
     Do NOT play generic click here.

     betting.js already plays bet.mp3 or
     insufficient-balance.mp3.
    */


    clearControlMessage(
        elements.betMessage
    );


    const amount =
        Number(
            elements
                .betAmountInput
                ?.value
        );


    const result =
        placeBet(
            amount
        );


    if (
        !result.success
    ) {

        switch (
            result.reason
        ) {

            case "INSUFFICIENT_BALANCE":

                setControlMessage(
                    elements.betMessage,
                    "代幣餘額不足。",
                    "error"
                );

                break;


            case "BETTING_CLOSED":

                setControlMessage(
                    elements.betMessage,
                    "本局下注已關閉。",
                    "warning"
                );

                break;


            case "BET_ALREADY_EXISTS":

                setControlMessage(
                    elements.betMessage,
                    "本局已經下注。",
                    "warning"
                );

                break;


            case "NO_ACTIVE_ROUND":

                setControlMessage(
                    elements.betMessage,
                    "目前沒有有效局次。",
                    "error"
                );

                break;


            default:

                setControlMessage(
                    elements.betMessage,
                    "下注金額無效。",
                    "error"
                );

                break;
        }


        renderStateControls();

        return;
    }


    setControlMessage(
        elements.betMessage,
        `已下注 ${formatCoins(
            result.amount
        )} 代幣。`,
        "success"
    );


    renderWallet();

    renderStateControls();

    renderCashoutPreview();
}


/* =========================================================
   CANCEL BET
========================================================= */

function handleCancelBet() {

    /*
     betting.js owns bet-cancel.mp3.
    */

    const result =
        cancelBet();


    if (
        !result.success
    ) {

        setControlMessage(
            elements.betMessage,
            "目前無法取消下注。",
            "warning"
        );


        return;
    }


    setControlMessage(
        elements.betMessage,
        `已退回 ${formatCoins(
            result.refunded
        )} 代幣。`,
        "success"
    );


    renderWallet();

    renderStateControls();

    renderCashoutPreview();
}


/* =========================================================
   BET +/- BUTTON
========================================================= */

function adjustBetAmount(
    delta
) {

    playClick();


    if (
        !elements.betAmountInput
    ) {
        return;
    }


    const current =
        Number(
            elements
                .betAmountInput
                .value
        ) || 0;


    let next =
        current +
        delta;


    next =
        Math.max(
            1,
            next
        );


    next =
        Math.min(
            1000000,
            next
        );


    elements.betAmountInput.value =
        String(
            roundTo(
                next,
                2
            )
        );


    renderBetPreview();
}


/* =========================================================
   BET PREVIEW
========================================================= */

function renderBetPreview() {

    if (
        !elements.betAmountInput
    ) {
        return;
    }


    const amount =
        Number(
            elements
                .betAmountInput
                .value
        );


    const result =
        previewBet(
            amount
        );


    elements.betAmountInput
        .classList.toggle(
            "is-invalid",
            !result.valid
        );
}


/* =========================================================
   AUTO CASHOUT TOGGLE
========================================================= */

function handleAutoCashoutToggle() {

    playClick();


    const status =
        getAutoCashoutStatus();


    if (
        status.locked
    ) {

        setControlMessage(
            elements.autoCashoutMessage,
            "飛行開始後不可修改 Auto Cash Out。",
            "warning"
        );


        return;
    }


    if (
        status.enabled
    ) {

        const result =
            disableAutoCashout();


        if (
            !result.success
        ) {

            setControlMessage(
                elements.autoCashoutMessage,
                "目前無法關閉 Auto Cash Out。",
                "error"
            );


            return;
        }


        clearControlMessage(
            elements.autoCashoutMessage
        );

    } else {

        configureCurrentAutoCashout();
    }


    renderAutoCashout();
}


/* =========================================================
   AUTO CASHOUT INPUT
========================================================= */

function handleAutoCashoutInputChange() {

    if (
        !getAutoCashoutStatus()
            .enabled
    ) {
        return;
    }


    configureCurrentAutoCashout();
}


/* =========================================================
   CONFIGURE AUTO CASHOUT
========================================================= */

function configureCurrentAutoCashout() {

    const value =
        Number(
            elements
                .autoCashoutInput
                ?.value
        );


    const result =
        configureAutoCashout(
            value
        );


    if (
        !result.success
    ) {

        if (
            result.reason ===
            "AUTO_CASHOUT_LOCKED"
        ) {

            setControlMessage(
                elements.autoCashoutMessage,
                "飛行開始後不可修改 Auto Cash Out。",
                "warning"
            );

        } else {

            setControlMessage(
                elements.autoCashoutMessage,
                "Auto Cash Out 倍率必須介於 1.01×～999.99×。",
                "error"
            );
        }


        renderAutoCashout();

        return false;
    }


    setControlMessage(
        elements.autoCashoutMessage,
        `將於 ${Number(
            result.targetMultiplier
        ).toFixed(2)}× 自動 Cash Out。`,
        "success"
    );


    renderAutoCashout();


    return true;
}


/* =========================================================
   MANUAL CASHOUT
========================================================= */

function handleManualCashout() {

    /*
     Do NOT play generic click here.

     cashout.js owns cashout.mp3.
    */

    const result =
        cashout();


    if (
        !result.success
    ) {

        if (
            result.reason ===
            "CRASH_POINT_REACHED"
        ) {

            setControlMessage(
                elements.cashoutMessage,
                "已抵達墜毀倍率。",
                "error"
            );

        } else {

            setControlMessage(
                elements.cashoutMessage,
                "目前無法 Cash Out。",
                "warning"
            );
        }


        return;
    }


    /*
     Manual success UI is normally rendered immediately.

     The Cash Out event also fires, but renderCashoutEvent()
     performs transaction-id deduplication.
    */

    renderSuccessfulCashout(
        result
    );
}


/* =========================================================
   CASHOUT EVENT
========================================================= */

let lastRenderedCashoutTransactionId =
    null;


function handleCashoutEvent(
    event
) {

    if (
        ![
            CASHOUT_EVENT_TYPES
                .MANUAL_CASHOUT,

            CASHOUT_EVENT_TYPES
                .AUTO_CASHOUT
        ].includes(
            event.type
        )
    ) {
        return;
    }


    if (
        !event.transactionId
    ) {
        return;
    }


    if (
        event.transactionId ===
        lastRenderedCashoutTransactionId
    ) {
        return;
    }


    renderSuccessfulCashout({

        automatic:
            event.automatic,

        multiplier:
            event.multiplier,

        returnedAmount:
            event.returnedAmount,

        amount:
            event.returnedAmount,

        profit:
            event.profit,

        transactionId:
            event.transactionId
    });
}


/* =========================================================
   SUCCESSFUL CASHOUT UI
========================================================= */

function renderSuccessfulCashout(
    result
) {

    if (
        result.transactionId &&
        result.transactionId ===
            lastRenderedCashoutTransactionId
    ) {
        return;
    }


    if (
        result.transactionId
    ) {

        lastRenderedCashoutTransactionId =
            result.transactionId;
    }


    const returnedAmount =
        Number(
            result.returnedAmount ??
            result.amount ??
            0
        );


    renderWallet();


    setControlMessage(
        elements.cashoutMessage,

        result.automatic
            ? `Auto Cash Out 成功：${formatCoins(
                returnedAmount
            )} 代幣。`
            : `成功 Cash Out：${formatCoins(
                returnedAmount
            )} 代幣。`,

        "success"
    );


    showCashoutEffect(
        result.multiplier,
        returnedAmount
    );


    renderStateControls();
}


/* =========================================================
   FLIGHT EVENTS
========================================================= */

function handleFlightEvent(
    event
) {

    switch (
        event.type
    ) {

        /* -------------------------------------------------
           COUNTDOWN START
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .COUNTDOWN_START:

            renderPhase(
                GAME_PHASES.COUNTDOWN
            );


            showElement(
                elements.countdownOverlay
            );


            break;


        /* -------------------------------------------------
           COUNTDOWN TICK
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .COUNTDOWN_TICK:

            setText(
                elements.countdownValue,

                event.remaining > 0
                    ? event.remaining
                    : "GO"
            );


            break;


        /* -------------------------------------------------
           COUNTDOWN END
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .COUNTDOWN_END:

            hideElement(
                elements.countdownOverlay
            );


            break;


        /* -------------------------------------------------
           FLIGHT START
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .FLIGHT_START:

            hideElement(
                elements.countdownOverlay
            );


            renderPhase(
                GAME_PHASES.FLYING
            );


            elements.gameStage
                ?.classList
                .add(
                    "is-flying"
                );


            setText(
                elements.multiplierSubtext,
                "CASH OUT BEFORE THE CRASH"
            );


            renderStateControls();


            break;


        /* -------------------------------------------------
           MULTIPLIER UPDATE

           IMPORTANT:
           Auto Cash Out is NOT handled here.

           cashout.js subscribes directly to Flight events.
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .MULTIPLIER_UPDATE:

            renderMultiplier(
                event.multiplier
            );


            renderCashoutPreview();


            break;


        /* -------------------------------------------------
           NORMAL CRASH
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .CRASH:

            handleNormalCrash(
                event
            );


            break;


        /* -------------------------------------------------
           TECHNICAL ABORT
        -------------------------------------------------- */

        case FLIGHT_EVENT_TYPES
            .FLIGHT_ABORTED:

            handleFlightAborted(
                event
            );


            break;


        default:
            break;
    }
}


/* =========================================================
   NORMAL CRASH

   This is the canonical normal settlement trigger.
========================================================= */

function handleNormalCrash(
    event
) {

    renderCrash(
        event.crashMultiplier
    );


    renderStateControls();


    /*
     Prevent duplicate settlement if a stale Flight callback
     somehow emits Crash twice.
    */

    if (
        runtime.settlementStarted
    ) {
        return;
    }


    runtime.settlementStarted =
        true;


    const result =
        settleRound();


    if (
        !result.success
    ) {

        runtime.settlementStarted =
            false;


        console.error(
            "[CG Flight] Round settlement failed:",
            result
        );


        setControlMessage(
            elements.cashoutMessage,
            "本局結算發生錯誤。",
            "error"
        );
    }
}


/* =========================================================
   FLIGHT ABORTED

   Technical failures must never become a normal LOSS.

   PLACED / ACTIVE Bet:
       refundRound()

   No Bet / Cancelled:
       settleNoBetRound()
========================================================= */

function handleFlightAborted(
    event
) {

    renderPhaseText(
        "FLIGHT ERROR"
    );


    setText(
        elements.phaseLabel,
        "ROUND INTERRUPTED"
    );


    if (
        runtime.settlementStarted
    ) {
        return;
    }


    runtime.settlementStarted =
        true;


    const state =
        getState();


    let result;


    if (
        state.bet.status ===
            BET_STATUS.PLACED ||
        state.bet.status ===
            BET_STATUS.ACTIVE
    ) {

        result =
            refundRound(
                event.reason ??
                "FLIGHT_ABORTED"
            );

    } else {

        result =
            settleNoBetRound(
                event.reason ??
                "FLIGHT_ABORTED_NO_BET"
            );
    }


    if (
        !result.success
    ) {

        runtime.settlementStarted =
            false;


        console.error(
            "[CG Flight] Abort settlement failed:",
            result
        );


        setControlMessage(
            elements.betMessage,
            "中止局退款／結算失敗。",
            "error"
        );
    }
}


/* =========================================================
   SETTLEMENT EVENTS
========================================================= */

function handleSettlementEvent(
    event
) {

    if (
        event.type !==
        SETTLEMENT_EVENT_TYPES
            .SETTLEMENT_COMPLETED
    ) {
        return;
    }


    renderWallet();

    renderRecentResults();


    /*
     New settlement.js returns the canonical History Record
     as event.record.
    */

    renderSettlement(
        event.record
    );


    renderPhase(
        GAME_PHASES.ENDED
    );


    renderStateControls();


    if (
        event.result ===
        ROUND_RESULT.WIN
    ) {

        playWin();
    }
}


/* =========================================================
   RENDER WALLET
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
   RENDER RECENT RESULTS
========================================================= */

function renderRecentResults() {

    if (
        !elements.recentResults
    ) {
        return;
    }


    const results =
        getRecentResults(
            10
        );


    elements.recentResults
        .replaceChildren();


    for (
        const result
        of results
    ) {

        const item =
            document.createElement(
                "span"
            );


        item.className =
            "recent-result";


        if (
            result.crashMultiplier ===
            null ||
            result.crashMultiplier ===
            undefined
        ) {

            item.textContent =
                "—";

        } else {

            item.textContent =
                formatMultiplier(
                    result.crashMultiplier
                );


            if (
                result.crashMultiplier <
                2
            ) {

                item.classList.add(
                    "is-low"
                );

            } else if (
                result.crashMultiplier <
                5
            ) {

                item.classList.add(
                    "is-mid"
                );

            } else {

                item.classList.add(
                    "is-high"
                );
            }
        }


        elements.recentResults
            .appendChild(
                item
            );
    }


    /* -----------------------------------------------------
       Always display ten slots.
    ----------------------------------------------------- */

    for (
        let i = results.length;
        i < 10;
        i += 1
    ) {

        const placeholder =
            document.createElement(
                "span"
            );


        placeholder.className =
            "recent-result-placeholder";


        placeholder.textContent =
            "—";


        elements.recentResults
            .appendChild(
                placeholder
            );
    }
}


/* =========================================================
   RENDER PHASE
========================================================= */

function renderPhase(
    phase
) {

    const status =
        elements.roundStatus;


    if (
        status
    ) {

        status.classList.remove(
            "is-betting",
            "is-countdown",
            "is-flying",
            "is-crashed",
            "is-ended"
        );
    }


    switch (
        phase
    ) {

        case GAME_PHASES.BETTING:

            renderPhaseText(
                "BETTING"
            );


            status?.classList.add(
                "is-betting"
            );


            setText(
                elements.phaseLabel,
                "BETTING OPEN"
            );


            break;


        case GAME_PHASES.COUNTDOWN:

            renderPhaseText(
                "COUNTDOWN"
            );


            status?.classList.add(
                "is-countdown"
            );


            setText(
                elements.phaseLabel,
                "PREPARE FOR TAKEOFF"
            );


            break;


        case GAME_PHASES.FLYING:

            renderPhaseText(
                "FLYING"
            );


            status?.classList.add(
                "is-flying"
            );


            setText(
                elements.phaseLabel,
                "IN FLIGHT"
            );


            break;


        case GAME_PHASES.CRASHED:

            renderPhaseText(
                "CRASHED"
            );


            status?.classList.add(
                "is-crashed"
            );


            setText(
                elements.phaseLabel,
                "FLIGHT TERMINATED"
            );


            break;


        case GAME_PHASES.SETTLING:

            renderPhaseText(
                "SETTLING"
            );


            setText(
                elements.phaseLabel,
                "CALCULATING RESULT"
            );


            break;


        case GAME_PHASES.ENDED:

            renderPhaseText(
                "ROUND COMPLETE"
            );


            status?.classList.add(
                "is-ended"
            );


            setText(
                elements.phaseLabel,
                "ROUND COMPLETE"
            );


            break;


        default:

            renderPhaseText(
                "WAITING"
            );


            setText(
                elements.phaseLabel,
                "WAITING"
            );


            break;
    }
}


/* =========================================================
   PHASE TEXT
========================================================= */

function renderPhaseText(
    text
) {

    setText(
        elements.roundStatusText,
        text
    );
}


/* =========================================================
   MULTIPLIER
========================================================= */

function renderMultiplier(
    multiplier
) {

    const value =
        Number(
            multiplier
        );


    if (
        !Number.isFinite(
            value
        )
    ) {
        return;
    }


    setText(
        elements.multiplierDisplay,
        formatMultiplier(
            value
        )
    );
}


/* =========================================================
   CRASH
========================================================= */

function renderCrash(
    multiplier
) {

    elements.gameStage
        ?.classList
        .remove(
            "is-flying"
        );


    elements.gameStage
        ?.classList
        .add(
            "is-crashed"
        );


    renderPhase(
        GAME_PHASES.CRASHED
    );


    renderMultiplier(
        multiplier
    );


    setText(
        elements.multiplierSubtext,
        "FLIGHT CRASHED"
    );


    setText(
        elements.crashMultiplierDisplay,
        formatMultiplier(
            multiplier
        )
    );


    hideElement(
        elements.planeImage
    );


    hideElement(
        elements.planeGlow
    );


    hideElement(
        elements.planeTrail
    );


    showElement(
        elements.planeCrashedImage
    );


    showElement(
        elements.explosionImage
    );


    showElement(
        elements.smokeImage
    );


    showElement(
        elements.sparkImage
    );


    showElement(
        elements.crashDisplay
    );
}


/* =========================================================
   CASHOUT EFFECT
========================================================= */

function showCashoutEffect(
    multiplier,
    amount
) {

    clearCashoutEffectTimer();


    setText(
        elements.cashoutEffectMultiplier,
        formatMultiplier(
            multiplier
        )
    );


    setText(
        elements.cashoutEffectAmount,
        `+${formatCoins(
            amount
        )}`
    );


    showElement(
        elements.cashoutEffect
    );


    runtime.cashoutEffectTimerId =
        window.setTimeout(
            () => {

                hideElement(
                    elements.cashoutEffect
                );


                runtime.cashoutEffectTimerId =
                    null;
            },

            PAGE_CONFIG
                .CASHOUT_EFFECT_MS
        );
}


/* =========================================================
   CLEAR CASHOUT EFFECT
========================================================= */

function clearCashoutEffectTimer() {

    if (
        runtime.cashoutEffectTimerId !==
        null
    ) {

        window.clearTimeout(
            runtime
                .cashoutEffectTimerId
        );


        runtime.cashoutEffectTimerId =
            null;
    }
}


/* =========================================================
   RENDER STATE CONTROLS
========================================================= */

function renderStateControls() {

    const state =
        getState();


    renderPhase(
        state.phase
    );


    renderBetControls(
        state
    );


    renderAutoCashout();


    renderCashoutControls(
        state
    );
}


/* =========================================================
   BET CONTROLS
========================================================= */

function renderBetControls(
    state
) {

    const phase =
        state.phase;


    const bet =
        state.bet;


    const bettingOpen =
        phase ===
        GAME_PHASES.BETTING;


    const inputEnabled =
        bettingOpen &&
        bet.status ===
            BET_STATUS.NONE;


    setDisabled(
        elements.betAmountInput,
        !inputEnabled
    );


    setDisabled(
        elements.betMinusButton,
        !inputEnabled
    );


    setDisabled(
        elements.betPlusButton,
        !inputEnabled
    );


    elements.quickBetButtons
        .forEach(
            (button) => {

                button.disabled =
                    !inputEnabled;
            }
        );


    setDisabled(
        elements.betButton,
        !inputEnabled
    );


    /* =====================================================
       NONE
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.NONE
    ) {

        setText(
            elements.betStatusText,
            bettingOpen
                ? "READY"
                : "CLOSED"
        );


        setText(
            elements.betButtonText,
            bettingOpen
                ? "PLACE BET"
                : "BETTING CLOSED"
        );


        hideElement(
            elements.cancelBetButton
        );


        elements.betPanel
            ?.classList
            .remove(
                "is-active"
            );


        return;
    }


    /* =====================================================
       PLACED
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.PLACED
    ) {

        setText(
            elements.betStatusText,
            "PLACED"
        );


        setText(
            elements.betButtonText,
            "BET PLACED"
        );


        showElement(
            elements.cancelBetButton
        );


        setDisabled(
            elements.cancelBetButton,

            !(
                phase ===
                    GAME_PHASES.BETTING ||
                phase ===
                    GAME_PHASES.COUNTDOWN
            )
        );


        elements.betPanel
            ?.classList
            .add(
                "is-active"
            );


        return;
    }


    hideElement(
        elements.cancelBetButton
    );


    /* =====================================================
       ACTIVE
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.ACTIVE
    ) {

        setText(
            elements.betStatusText,
            "ACTIVE"
        );


        setText(
            elements.betButtonText,
            "IN FLIGHT"
        );


        return;
    }


    /* =====================================================
       CASHED OUT
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.CASHED_OUT
    ) {

        setText(
            elements.betStatusText,
            "CASHED OUT"
        );


        setText(
            elements.betButtonText,
            "COMPLETE"
        );


        return;
    }


    /* =====================================================
       LOST
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.LOST
    ) {

        setText(
            elements.betStatusText,
            "LOST"
        );


        setText(
            elements.betButtonText,
            "ROUND LOST"
        );


        return;
    }


    /* =====================================================
       CANCELLED
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.CANCELLED
    ) {

        setText(
            elements.betStatusText,
            "CANCELLED"
        );


        setText(
            elements.betButtonText,
            "CANCELLED"
        );


        return;
    }


    /* =====================================================
       REFUNDED
    ====================================================== */

    if (
        bet.status ===
        BET_STATUS.REFUNDED
    ) {

        setText(
            elements.betStatusText,
            "REFUNDED"
        );


        setText(
            elements.betButtonText,
            "REFUNDED"
        );
    }
}


/* =========================================================
   AUTO CASHOUT RENDER
========================================================= */

function renderAutoCashout() {

    const status =
        getAutoCashoutStatus();


    const enabled =
        status.enabled;


    elements.autoCashoutToggle
        ?.setAttribute(
            "aria-pressed",
            String(
                enabled
            )
        );


    setText(
        elements.autoCashoutToggle,

        enabled
            ? "ON"
            : "OFF"
    );


    setText(
        elements.autoCashoutStatusText,

        enabled
            ? (
                status.targetMultiplier !==
                    null
                    ? `${Number(
                        status.targetMultiplier
                    ).toFixed(2)}×`
                    : "ENABLED"
            )
            : "DISABLED"
    );


    elements.autoCashoutPanel
        ?.classList
        .toggle(
            "is-enabled",
            enabled
        );


    const locked =
        status.locked;


    setDisabled(
        elements.autoCashoutInput,
        locked
    );


    setDisabled(
        elements.autoCashoutToggle,
        locked
    );


    elements.quickAutoButtons
        .forEach(
            (button) => {

                button.disabled =
                    locked;
            }
        );
}


/* =========================================================
   CASHOUT CONTROLS
========================================================= */

function renderCashoutControls(
    state
) {

    const active =
        state.phase ===
            GAME_PHASES.FLYING &&
        state.bet.status ===
            BET_STATUS.ACTIVE &&
        !state.cashout.completed;


    setDisabled(
        elements.cashoutButton,
        !active
    );


    elements.cashoutPanel
        ?.classList
        .toggle(
            "is-ready",
            active
        );


    if (
        active
    ) {

        setText(
            elements.cashoutStatusText,
            "READY"
        );


        setText(
            elements.cashoutButtonText,
            "CASH OUT"
        );

    } else if (
        state.cashout.completed
    ) {

        setText(
            elements.cashoutStatusText,
            "COMPLETE"
        );


        setText(
            elements.cashoutButtonText,
            "CASHED OUT"
        );

    } else {

        setText(
            elements.cashoutStatusText,
            "WAITING"
        );


        setText(
            elements.cashoutButtonText,
            "WAITING FOR FLIGHT"
        );
    }


    renderCashoutPreview();
}


/* =========================================================
   CASHOUT PREVIEW
========================================================= */

function renderCashoutPreview() {

    const preview =
        previewCashout();


    setText(
        elements.cashoutPreviewAmount,
        formatCoins(
            preview.amount
        )
    );


    setText(
        elements.cashoutBetAmount,
        formatCoins(
            preview.betAmount ??
            0
        )
    );


    setText(
        elements.cashoutCurrentMultiplier,
        Number(
            preview.multiplier ??
            1
        ).toFixed(2)
    );
}


/* =========================================================
   SETTLEMENT RESULT

   Receives canonical History Record from settlement.js.
========================================================= */

function renderSettlement(
    record
) {

    if (
        !record
    ) {
        return;
    }


    elements.roundResultPanel
        ?.classList
        .remove(
            "is-win",
            "is-loss"
        );


    const result =
        record.result;


    /* =====================================================
       WIN
    ====================================================== */

    if (
        result ===
        ROUND_RESULT.WIN
    ) {

        elements.roundResultPanel
            ?.classList
            .add(
                "is-win"
            );


        if (
            elements.roundResultIcon
        ) {

            elements.roundResultIcon.src =
                ICONS.trophy;
        }


        setText(
            elements.roundResultLabel,
            "SUCCESSFUL FLIGHT"
        );


        setText(
            elements.roundResultTitle,
            "CASH OUT SUCCESS"
        );

    }

    /* =====================================================
       LOSS
    ====================================================== */

    else if (
        result ===
        ROUND_RESULT.LOSS
    ) {

        elements.roundResultPanel
            ?.classList
            .add(
                "is-loss"
            );


        if (
            elements.roundResultIcon
        ) {

            elements.roundResultIcon.src =
                ICONS.crash;
        }


        setText(
            elements.roundResultLabel,
            "FLIGHT LOST"
        );


        setText(
            elements.roundResultTitle,
            "CRASHED BEFORE CASH OUT"
        );

    }

    /* =====================================================
       REFUND
    ====================================================== */

    else if (
        result ===
        ROUND_RESULT.REFUND
    ) {

        if (
            elements.roundResultIcon
        ) {

            elements.roundResultIcon.src =
                ICONS.trophy;
        }


        setText(
            elements.roundResultLabel,
            "BET REFUNDED"
        );


        setText(
            elements.roundResultTitle,
            "ROUND INTERRUPTED"
        );

    }

    /* =====================================================
       NO BET
    ====================================================== */

    else {

        if (
            elements.roundResultIcon
        ) {

            elements.roundResultIcon.src =
                ICONS.trophy;
        }


        setText(
            elements.roundResultLabel,
            "ROUND COMPLETE"
        );


        setText(
            elements.roundResultTitle,
            "NO BET"
        );
    }


    /* -----------------------------------------------------
       Bet
    ----------------------------------------------------- */

    setText(
        elements.resultBetAmount,
        formatCoins(
            record.financial
                ?.wagered ??
            record.wagered ??
            0
        )
    );


    /* -----------------------------------------------------
       Cash Out
    ----------------------------------------------------- */

    const cashoutMultiplier =
        record.cashout
            ?.multiplier ??
        record.cashoutMultiplier;


    setText(
        elements.resultCashoutMultiplier,

        cashoutMultiplier !==
            null &&
        cashoutMultiplier !==
            undefined
            ? formatMultiplier(
                cashoutMultiplier
            )
            : "—"
    );


    /* -----------------------------------------------------
       Crash

       Technical REFUND may have no legitimate Crash result.
    ----------------------------------------------------- */

    setText(
        elements.resultCrashMultiplier,

        record.crashMultiplier !==
            null &&
        record.crashMultiplier !==
            undefined
            ? formatMultiplier(
                record.crashMultiplier
            )
            : "—"
    );


    /* -----------------------------------------------------
       Profit
    ----------------------------------------------------- */

    setText(
        elements.resultProfit,
        formatSignedNumber(
            record.financial
                ?.profit ??
            record.profit ??
            0
        )
    );


    showElement(
        elements.roundResultPanel
    );
}


/* =========================================================
   RESET VISUAL STATE
========================================================= */

function resetVisualState() {

    lastRenderedCashoutTransactionId =
        null;


    elements.gameStage
        ?.classList
        .remove(
            "is-flying",
            "is-crashed"
        );


    renderMultiplier(
        1
    );


    setText(
        elements.phaseLabel,
        "PREPARING FLIGHT"
    );


    setText(
        elements.multiplierSubtext,
        "PLACE YOUR BET"
    );


    hideElement(
        elements.countdownOverlay
    );


    hideElement(
        elements.crashDisplay
    );


    hideElement(
        elements.cashoutEffect
    );


    showElement(
        elements.planeImage
    );


    showElement(
        elements.planeGlow
    );


    showElement(
        elements.planeTrail
    );


    hideElement(
        elements.planeCrashedImage
    );


    hideElement(
        elements.explosionImage
    );


    hideElement(
        elements.smokeImage
    );


    hideElement(
        elements.sparkImage
    );


    hideElement(
        elements.roundResultPanel
    );


    elements.roundResultPanel
        ?.classList
        .remove(
            "is-win",
            "is-loss"
        );


    clearControlMessage(
        elements.betMessage
    );


    clearControlMessage(
        elements.cashoutMessage
    );


    clearControlMessage(
        elements.autoCashoutMessage
    );


    setText(
        elements.cashoutPreviewAmount,
        "0"
    );


    setText(
        elements.cashoutBetAmount,
        "0"
    );


    setText(
        elements.cashoutCurrentMultiplier,
        "1.00"
    );
}


/* =========================================================
   SETTINGS UI
========================================================= */

function updateSettingsUI() {

    const settings =
        getSettings();


    /* -----------------------------------------------------
       Header Sound
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
       Header Music
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
       Settings Modal
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
   SETTINGS MODAL
========================================================= */

function openSettings() {

    playClick();


    showElement(
        elements.settingsModal
    );


    document.body.style.overflow =
        "hidden";
}


function closeSettings() {

    playClick();


    hideElement(
        elements.settingsModal
    );


    document.body.style.overflow =
        "";
}


/* =========================================================
   LEAVE GAME
========================================================= */

function handleBackLobbyClick(
    event
) {

    if (
        runtime.leavingConfirmed
    ) {
        return;
    }


    const state =
        getState();


    const dangerousToLeave =
        state.phase ===
            GAME_PHASES.COUNTDOWN ||
        state.phase ===
            GAME_PHASES.FLYING ||
        state.bet.status ===
            BET_STATUS.PLACED ||
        state.bet.status ===
            BET_STATUS.ACTIVE;


    if (
        !dangerousToLeave
    ) {

        playClick();

        return;
    }


    event.preventDefault();


    playClick();


    showElement(
        elements.leaveConfirmModal
    );


    document.body.style.overflow =
        "hidden";
}


/* =========================================================
   CONFIRM LEAVE
========================================================= */

function handleConfirmLeave(
    event
) {

    event?.preventDefault();


    runtime.leavingConfirmed =
        true;


    clearBettingTimer();

    clearCashoutEffectTimer();


    /*
     Do not refund an active wager simply because the player
     voluntarily leaves the page. Otherwise leaving during
     a bad flight becomes an exploitable refund mechanism.
    */


    window.location.href =
        "./index.html";
}


/* =========================================================
   CLOSE LEAVE MODAL
========================================================= */

function closeLeaveModal() {

    playClick();


    hideElement(
        elements.leaveConfirmModal
    );


    document.body.style.overflow =
        "";
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
        isElementOpen(
            elements.leaveConfirmModal
        )
    ) {

        closeLeaveModal();

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

    if (
        !element
    ) {
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
   CONTROL MESSAGE
========================================================= */

function setControlMessage(
    element,
    message,
    type = null
) {

    if (
        !element
    ) {
        return;
    }


    element.classList.remove(
        "is-error",
        "is-success",
        "is-warning"
    );


    if (
        type ===
        "error"
    ) {

        element.classList.add(
            "is-error"
        );
    }


    if (
        type ===
        "success"
    ) {

        element.classList.add(
            "is-success"
        );
    }


    if (
        type ===
        "warning"
    ) {

        element.classList.add(
            "is-warning"
        );
    }


    element.textContent =
        message;
}


/* =========================================================
   CLEAR CONTROL MESSAGE
========================================================= */

function clearControlMessage(
    element
) {

    if (
        !element
    ) {
        return;
    }


    element.classList.remove(
        "is-error",
        "is-success",
        "is-warning"
    );


    element.textContent =
        "";
}


/* =========================================================
   PAGE HIDE
========================================================= */

window.addEventListener(
    "pagehide",
    () => {

        clearBettingTimer();

        clearCashoutEffectTimer();


        /*
         Page teardown only.

         Do not turn a voluntary page close into REFUND.
        */

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
