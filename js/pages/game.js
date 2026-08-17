/* =========================================================
   CG FLIGHT
   js/pages/game.js

   Game page controller.

   Responsibilities:
   - Initialize player/login state
   - Initialize round
   - Manage betting window
   - Bind DOM controls
   - Render wallet
   - Render recent 10 results
   - Render game phases
   - Render multiplier / flight visuals
   - Handle betting
   - Handle Auto Cash Out
   - Handle manual Cash Out
   - Render settlement result
   - Manage settings / audio UI
   - Handle leave confirmation
   - Start next round

   IMPORTANT:
   This file coordinates modules.
   It does NOT reimplement game rules.
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
    playClick,
    playLoginReward
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
    getPhase,
    subscribeToState
} from "../game/state.js";

import {
    placeBet,
    cancelBet,
    previewBet,
    getBettingStatus
} from "../game/betting.js";

import {
    startCountdown,
    resetFlightRuntime,
    subscribeToFlight
} from "../game/flight.js";

import {
    cashout,
    configureAutoCashout,
    disableAutoCashout,
    previewCashout,
    getAutoCashoutStatus,
    resetCashoutRuntime
} from "../game/cashout.js";

import {
    resetSettlementRuntime,
    subscribeToSettlement
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
     Time available for placing a new bet before the
     three-second flight countdown begins.
    */
    BETTING_WINDOW_MS: 5000,

    /*
     Bet +/- button step.
    */
    BET_STEP: 100,

    /*
     Delay used only for temporary Cash Out visual effect.
    */
    CASHOUT_EFFECT_MS: 1800
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
       Leave modal
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

    bettingTimerId: null,

    bettingDeadline: null,

    cashoutEffectTimerId: null,

    roundStarting: false,

    leavingConfirmed: false
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    preloadAudio();


    /*
     This also protects direct access to game.html.

     If the player never visited index.html first,
     player initialization and login rewards still happen.
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


    /*
     User interaction has now occurred after clicking through
     from Lobby in the normal flow, so BGM will normally play.

     If autoplay is blocked, audio.js handles the failure.
    */

    playBgm("game");
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
                            Number.isFinite(
                                value
                            )
                        ) {
                            elements
                                .betAmountInput
                                .value =
                                String(value);


                            renderBetPreview();
                        }
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


                        elements
                            .autoCashoutInput
                            .value =
                            value.toFixed(2);


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
       Cash Out
    ----------------------------------------------------- */

    elements.cashoutButton
        ?.addEventListener(
            "click",
            handleManualCashout
        );


    /* -----------------------------------------------------
       Next round
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
       Leave game
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
            () => {

                runtime.leavingConfirmed =
                    true;
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

    subscribeToState(
        () => {
            renderStateControls();
        }
    );


    subscribeToFlight(
        handleFlightEvent
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
        () => {

            updateSettingsUI();

            playBgm("game");
        }
    );
}


/* =========================================================
   NEW ROUND
========================================================= */

function startNewRound() {

    if (runtime.roundStarting) {
        return;
    }


    runtime.roundStarting =
        true;


    clearBettingTimer();

    clearCashoutEffectTimer();


    resetFlightRuntime();

    resetCashoutRuntime();

    resetSettlementRuntime();


    resetVisualState();


    const state =
        createRound();


    setText(
        elements.roundIdDisplay,
        state.roundId ?? "—"
    );


    renderWallet();

    renderStateControls();

    renderBetPreview();

    startBettingWindow();


    runtime.roundStarting =
        false;
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


                if (!result.success) {

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

    playClick();


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


    if (!result.success) {

        if (
            result.reason ===
            "INSUFFICIENT_BALANCE"
        ) {
            setControlMessage(
                elements.betMessage,
                "代幣餘額不足。",
                "error"
            );
        } else if (
            result.reason ===
            "BETTING_CLOSED"
        ) {
            setControlMessage(
                elements.betMessage,
                "本局下注已關閉。",
                "warning"
            );
        } else if (
            result.reason ===
            "BET_ALREADY_EXISTS"
        ) {
            setControlMessage(
                elements.betMessage,
                "本局已經下注。",
                "warning"
            );
        } else {
            setControlMessage(
                elements.betMessage,
                "下注金額無效。",
                "error"
            );
        }


        renderStateControls();

        return;
    }


    setControlMessage(
        elements.betMessage,
        `已下注 ${formatCoins(result.amount)} 代幣。`,
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

    playClick();


    const result =
        cancelBet();


    if (!result.success) {

        setControlMessage(
            elements.betMessage,
            "目前無法取消下注。",
            "warning"
        );


        return;
    }


    setControlMessage(
        elements.betMessage,
        `已退回 ${formatCoins(result.refunded)} 代幣。`,
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


    const current =
        Number(
            elements
                .betAmountInput
                ?.value
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


    if (status.locked) {

        setControlMessage(
            elements.autoCashoutMessage,
            "飛行開始後不可修改 Auto Cash Out。",
            "warning"
        );


        return;
    }


    if (status.enabled) {

        const result =
            disableAutoCashout();


        if (!result.success) {

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


    if (!result.success) {

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
        `將於 ${result.targetMultiplier.toFixed(2)}× 自動 Cash Out。`,
        "success"
    );


    renderAutoCashout();


    return true;
}


/* =========================================================
   MANUAL CASHOUT
========================================================= */

function handleManualCashout() {

    playClick();


    const result =
        cashout();


    if (!result.success) {

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


    handleSuccessfulCashout(
        result
    );
}


/* =========================================================
   SUCCESSFUL CASHOUT UI
========================================================= */

function handleSuccessfulCashout(
    result
) {

    renderWallet();


    setControlMessage(
        elements.cashoutMessage,
        `成功 Cash Out：${formatCoins(result.returnedAmount)} 代幣。`,
        "success"
    );


    showCashoutEffect(
        result.multiplier,
        result.returnedAmount
    );


    renderStateControls();
}


/* =========================================================
   FLIGHT EVENTS
========================================================= */

function handleFlightEvent(
    event
) {

    switch (event.type) {

        case "COUNTDOWN_START":

            renderPhase(
                GAME_PHASES.COUNTDOWN
            );


            showElement(
                elements.countdownOverlay
            );


            break;


        case "COUNTDOWN_TICK":

            if (
                event.remaining > 0
            ) {
                setText(
                    elements.countdownValue,
                    event.remaining
                );
            } else {
                setText(
                    elements.countdownValue,
                    "GO"
                );
            }


            break;


        case "COUNTDOWN_END":

            hideElement(
                elements.countdownOverlay
            );


            break;


        case "FLIGHT_START":

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


        case "MULTIPLIER_UPDATE":

            renderMultiplier(
                event.multiplier
            );


            renderCashoutPreview();


            /*
             Auto Cash Out is performed internally by
             cashout.js.

             Detect completed cashout state after the
             multiplier event to render its effect.
            */

            detectAutomaticCashout();


            break;


        case "CRASH":

            renderCrash(
                event.crashMultiplier
            );


            renderStateControls();


            break;


        case "FLIGHT_ABORTED":

            renderPhaseText(
                "FLIGHT ERROR"
            );


            break;


        default:
            break;
    }
}


/* =========================================================
   DETECT AUTO CASHOUT
========================================================= */

let lastRenderedCashoutTransactionId =
    null;


function detectAutomaticCashout() {

    const state =
        getState();


    if (
        !state.cashout.completed ||
        !state.cashout.automatic
    ) {
        return;
    }


    if (
        !state.cashout.transactionId ||
        state.cashout.transactionId ===
        lastRenderedCashoutTransactionId
    ) {
        return;
    }


    lastRenderedCashoutTransactionId =
        state.cashout
            .transactionId;


    renderWallet();


    setControlMessage(
        elements.cashoutMessage,
        `Auto Cash Out 成功：${formatCoins(state.cashout.amount)} 代幣。`,
        "success"
    );


    showCashoutEffect(
        state.cashout.multiplier,
        state.cashout.amount
    );


    renderStateControls();
}


/* =========================================================
   SETTLEMENT EVENTS
========================================================= */

function handleSettlementEvent(
    event
) {

    if (
        event.type !==
        "SETTLEMENT_COMPLETE"
    ) {
        return;
    }


    renderWallet();

    renderRecentResults();

    renderSettlement(
        event.settlement
    );


    renderPhase(
        GAME_PHASES.ENDED
    );


    renderStateControls();
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


    if (
        results.length === 0
    ) {

        for (
            let i = 0;
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


        return;
    }


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


        elements.recentResults
            .appendChild(
                item
            );
    }


    /*
     Fill remaining spaces until ten results exist.
    */

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


    if (status) {

        status.classList.remove(
            "is-betting",
            "is-countdown",
            "is-flying",
            "is-crashed",
            "is-ended"
        );
    }


    switch (phase) {

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


            break;


        case GAME_PHASES.ENDED:

            renderPhaseText(
                "ROUND COMPLETE"
            );


            status?.classList.add(
                "is-ended"
            );


            break;


        default:

            renderPhaseText(
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
        Number(multiplier);


    if (
        !Number.isFinite(
            value
        )
    ) {
        return;
    }


    setText(
        elements.multiplierDisplay,
        `${value.toFixed(2)}×`
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
        `+${formatCoins(amount)}`
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


        /*
         betting.js allows cancellation during both
         BETTING and COUNTDOWN while status is PLACED.
        */

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

    } else if (
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

    } else if (
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

    } else if (
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
            String(enabled)
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
                status.targetMultiplier
                    ? `${Number(status.targetMultiplier).toFixed(2)}×`
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


    if (active) {

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
            preview.betAmount ?? 0
        )
    );


    setText(
        elements.cashoutCurrentMultiplier,
        Number(
            preview.multiplier ?? 1
        ).toFixed(2)
    );
}


/* =========================================================
   SETTLEMENT RESULT
========================================================= */

function renderSettlement(
    settlement
) {

    if (!settlement) {
        return;
    }


    elements.roundResultPanel
        ?.classList
        .remove(
            "is-win",
            "is-loss"
        );


    const result =
        settlement.result;


    if (
        result ===
        ROUND_RESULT.WIN
    ) {

        elements.roundResultPanel
            ?.classList
            .add(
                "is-win"
            );


        elements.roundResultIcon.src =
            ICONS.trophy;


        setText(
            elements.roundResultLabel,
            "SUCCESSFUL FLIGHT"
        );


        setText(
            elements.roundResultTitle,
            "CASH OUT SUCCESS"
        );

    } else if (
        result ===
        ROUND_RESULT.LOSS
    ) {

        elements.roundResultPanel
            ?.classList
            .add(
                "is-loss"
            );


        elements.roundResultIcon.src =
            ICONS.crash;


        setText(
            elements.roundResultLabel,
            "FLIGHT LOST"
        );


        setText(
            elements.roundResultTitle,
            "CRASHED BEFORE CASH OUT"
        );

    } else if (
        result ===
        ROUND_RESULT.REFUND
    ) {

        elements.roundResultIcon.src =
            ICONS.trophy;


        setText(
            elements.roundResultLabel,
            "BET REFUNDED"
        );


        setText(
            elements.roundResultTitle,
            "NO RESULT"
        );

    } else {

        elements.roundResultIcon.src =
            ICONS.trophy;


        setText(
            elements.roundResultLabel,
            "ROUND COMPLETE"
        );


        setText(
            elements.roundResultTitle,
            "NO BET"
        );
    }


    setText(
        elements.resultBetAmount,
        formatCoins(
            settlement
                .financial
                .wagered
        )
    );


    setText(
        elements.resultCashoutMultiplier,

        settlement
            .cashout
            .completed
            ? formatMultiplier(
                settlement
                    .cashout
                    .multiplier
            )
            : "—"
    );


    setText(
        elements.resultCrashMultiplier,
        formatMultiplier(
            settlement
                .crashMultiplier
        )
    );


    setText(
        elements.resultProfit,
        formatSignedNumber(
            settlement
                .financial
                .profit
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


    if (
        elements.soundToggleIcon
    ) {
        elements.soundToggleIcon.src =
            settings.soundEnabled
                ? ICONS.soundOn
                : ICONS.soundOff;
    }


    if (
        elements.musicToggleIcon
    ) {
        elements.musicToggleIcon.src =
            settings.musicEnabled
                ? ICONS.musicOn
                : ICONS.musicOff;
    }


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
}


function closeSettings() {

    playClick();


    hideElement(
        elements.settingsModal
    );
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


    if (!dangerousToLeave) {
        return;
    }


    event.preventDefault();


    playClick();


    showElement(
        elements.leaveConfirmModal
    );
}


/* =========================================================
   CLOSE LEAVE MODAL
========================================================= */

function closeLeaveModal() {

    playClick();


    hideElement(
        elements.leaveConfirmModal
    );
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
        !elements.leaveConfirmModal
            ?.hidden
    ) {

        closeLeaveModal();

        return;
    }


    if (
        !elements.settingsModal
            ?.hidden
    ) {

        closeSettings();
    }
}


/* =========================================================
   CONTROL MESSAGE
========================================================= */

function setControlMessage(
    element,
    message,
    type = null
) {

    if (!element) {
        return;
    }


    element.classList.remove(
        "is-error",
        "is-success",
        "is-warning"
    );


    if (
        type === "error"
    ) {
        element.classList.add(
            "is-error"
        );
    }


    if (
        type === "success"
    ) {
        element.classList.add(
            "is-success"
        );
    }


    if (
        type === "warning"
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

    if (!element) {
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
