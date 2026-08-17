/* =========================================================
   CG FLIGHT
   js/game/cashout.js

   Cashout domain layer.

   Responsibilities:
   - Validate manual cashout
   - Calculate returned amount
   - Calculate profit
   - Credit cashout amount to wallet
   - Mark round state as cashed out
   - Configure Auto Cash Out
   - Trigger Auto Cash Out during flight
   - Prevent cashout at / after crash point

   IMPORTANT:
   This module does NOT:
   - Generate crash multipliers
   - Drive flight animation
   - Mark losing bets after crash
   - Perform final round settlement
   - Write round history
========================================================= */

import {
    GAME_PHASES,
    BET_STATUS,

    getState,
    getPhase,
    getMultiplier,
    getCrashMultiplier,

    getBet,

    setAutoCashout,
    hasCashedOut,
    markCashedOut
} from "./state.js";

import {
    credit,
    WALLET_TRANSACTION_TYPES
} from "../core/wallet.js";

import {
    roundTo,
    isFiniteNumber
} from "../core/utils.js";

import {
    playCashout,
    playAutoCashout
} from "../core/audio.js";

import {
    subscribeToFlight
} from "./flight.js";


/* =========================================================
   CASHOUT CONFIG
========================================================= */

const CASHOUT_CONFIG = Object.freeze({

    /*
     Lowest valid cashout multiplier.

     Flight begins at 1.00×, but cashout must happen after
     takeoff and before the crash point.
    */
    MIN_MULTIPLIER: 1.00,

    /*
     Hard upper validation limit.
    */
    MAX_MULTIPLIER: 1000.00,

    /*
     Settlement precision.
    */
    DECIMALS: 2,

    /*
     Auto Cash Out target must be above 1.00×.
    */
    MIN_AUTO_CASHOUT: 1.01,

    MAX_AUTO_CASHOUT: 999.99
});


/* =========================================================
   INTERNAL AUTO CASHOUT STATE

   Used only to prevent duplicate triggers during rapid
   requestAnimationFrame updates.
========================================================= */

const runtime = {
    autoCashoutProcessing: false
};


/* =========================================================
   NORMALIZE MULTIPLIER
========================================================= */

function normalizeMultiplier(
    multiplier
) {
    const numeric =
        Number(multiplier);

    if (
        !isFiniteNumber(
            numeric
        )
    ) {
        return null;
    }

    const normalized =
        roundTo(
            numeric,
            CASHOUT_CONFIG.DECIMALS
        );

    if (
        normalized <
            CASHOUT_CONFIG.MIN_MULTIPLIER ||
        normalized >
            CASHOUT_CONFIG.MAX_MULTIPLIER
    ) {
        return null;
    }

    return normalized;
}


/* =========================================================
   NORMALIZE AUTO CASHOUT TARGET
========================================================= */

function normalizeAutoCashoutTarget(
    multiplier
) {
    const normalized =
        normalizeMultiplier(
            multiplier
        );

    if (
        normalized === null ||
        normalized <
            CASHOUT_CONFIG.MIN_AUTO_CASHOUT ||
        normalized >
            CASHOUT_CONFIG.MAX_AUTO_CASHOUT
    ) {
        return null;
    }

    return normalized;
}


/* =========================================================
   CALCULATE RETURNED AMOUNT

   Bet amount × cashout multiplier.

   Example:
       1000 × 2.37
       = 2370
========================================================= */

function calculateCashoutAmount(
    betAmount,
    multiplier
) {
    const bet =
        Number(betAmount);

    const rate =
        Number(multiplier);

    if (
        !isFiniteNumber(bet) ||
        bet <= 0 ||
        !isFiniteNumber(rate) ||
        rate < 1
    ) {
        return null;
    }

    return roundTo(
        bet * rate,
        CASHOUT_CONFIG.DECIMALS
    );
}


/* =========================================================
   CALCULATE PROFIT

   Returned amount - original bet.

   Example:
       Bet      = 1000
       Return   = 2370
       Profit   = 1370
========================================================= */

function calculateCashoutProfit(
    betAmount,
    returnedAmount
) {
    const bet =
        Number(betAmount);

    const returned =
        Number(returnedAmount);

    if (
        !isFiniteNumber(bet) ||
        bet < 0 ||
        !isFiniteNumber(returned) ||
        returned < 0
    ) {
        return null;
    }

    return roundTo(
        returned - bet,
        CASHOUT_CONFIG.DECIMALS
    );
}


/* =========================================================
   CHECK CASHOUT AVAILABILITY
========================================================= */

function canCashout(
    multiplier =
        getMultiplier()
) {
    const phase =
        getPhase();

    const bet =
        getBet();

    const crashMultiplier =
        getCrashMultiplier();


    /* -----------------------------------------------------
       Must currently be flying.
    ----------------------------------------------------- */

    if (
        phase !==
        GAME_PHASES.FLYING
    ) {
        return {
            allowed: false,

            reason:
                "NOT_FLYING",

            phase
        };
    }


    /* -----------------------------------------------------
       Must have an active bet.
    ----------------------------------------------------- */

    if (
        bet.status !==
        BET_STATUS.ACTIVE
    ) {
        return {
            allowed: false,

            reason:
                "NO_ACTIVE_BET",

            betStatus:
                bet.status
        };
    }


    /* -----------------------------------------------------
       Cannot cash out twice.
    ----------------------------------------------------- */

    if (hasCashedOut()) {
        return {
            allowed: false,

            reason:
                "ALREADY_CASHED_OUT"
        };
    }


    const normalized =
        normalizeMultiplier(
            multiplier
        );


    if (normalized === null) {
        return {
            allowed: false,

            reason:
                "INVALID_MULTIPLIER"
        };
    }


    /* -----------------------------------------------------
       Crash point is exclusive.

       crash = 2.00×
       cashout at 2.00× -> FAIL

       Player must cash out BEFORE 2.00×.
    ----------------------------------------------------- */

    if (
        isFiniteNumber(
            crashMultiplier
        ) &&
        normalized >=
            crashMultiplier
    ) {
        return {
            allowed: false,

            reason:
                "CRASH_POINT_REACHED",

            multiplier:
                normalized,

            crashMultiplier
        };
    }


    return {
        allowed: true,

        multiplier:
            normalized,

        bet,

        crashMultiplier
    };
}


/* =========================================================
   INTERNAL CASHOUT EXECUTION

   Used by both manual and automatic cashout.
========================================================= */

function executeCashout({
    multiplier =
        getMultiplier(),

    automatic = false
} = {}) {
    const validation =
        canCashout(
            multiplier
        );


    if (!validation.allowed) {
        return {
            success: false,
            ...validation
        };
    }


    const bet =
        validation.bet;

    const cashoutMultiplier =
        validation.multiplier;


    /* -----------------------------------------------------
       Calculate settlement.
    ----------------------------------------------------- */

    const returnedAmount =
        calculateCashoutAmount(
            bet.amount,
            cashoutMultiplier
        );


    if (returnedAmount === null) {
        return {
            success: false,

            reason:
                "CASHOUT_CALCULATION_FAILED"
        };
    }


    const profit =
        calculateCashoutProfit(
            bet.amount,
            returnedAmount
        );


    if (profit === null) {
        return {
            success: false,

            reason:
                "PROFIT_CALCULATION_FAILED"
        };
    }


    /* -----------------------------------------------------
       Credit wallet.

       Important:
       The original bet was already deducted by betting.js.

       Therefore the full returned amount is credited here,
       not just the profit.
    ----------------------------------------------------- */

    const walletResult =
        credit(
            returnedAmount,
            {
                type:
                    automatic
                        ? WALLET_TRANSACTION_TYPES
                            .AUTO_CASHOUT
                        : WALLET_TRANSACTION_TYPES
                            .CASHOUT,

                metadata: {
                    source:
                        automatic
                            ? "AUTO_CASHOUT"
                            : "MANUAL_CASHOUT",

                    roundId:
                        getState()
                            .roundId,

                    betAmount:
                        bet.amount,

                    multiplier:
                        cashoutMultiplier,

                    profit,

                    originalBetTransactionId:
                        bet.transactionId
                }
            }
        );


    if (!walletResult.success) {
        return {
            success: false,

            reason:
                walletResult.reason
        };
    }


    /* -----------------------------------------------------
       Mark state as cashed out.
    ----------------------------------------------------- */

    const stateResult =
        markCashedOut({
            multiplier:
                cashoutMultiplier,

            amount:
                returnedAmount,

            profit,

            automatic,

            transactionId:
                walletResult
                    .transaction
                    .id
        });


    if (!stateResult.success) {
        /*
         Wallet credit already succeeded.

         We intentionally do NOT automatically debit it again
         here. settlement.js will later be the authority for
         resolving exceptional inconsistent states.

         Automatic reversal could itself create a second
         financial error.
        */

        return {
            success: false,

            reason:
                "CASHOUT_STATE_WRITE_FAILED",

            stateReason:
                stateResult.reason,

            walletCreditCompleted:
                true,

            walletTransaction:
                walletResult.transaction
        };
    }


    /* -----------------------------------------------------
       Audio
    ----------------------------------------------------- */

    if (automatic) {
        playAutoCashout();
    } else {
        playCashout();
    }


    return {
        success: true,

        automatic:

            Boolean(automatic),

        betAmount:
            bet.amount,

        multiplier:
            cashoutMultiplier,

        returnedAmount,

        profit,

        balanceBefore:
            walletResult
                .balanceBefore,

        balanceAfter:
            walletResult
                .balanceAfter,

        transaction:
            walletResult
                .transaction,

        cashout:
            stateResult
                .cashout
    };
}


/* =========================================================
   MANUAL CASHOUT
========================================================= */

function cashout() {
    return executeCashout({
        multiplier:
            getMultiplier(),

        automatic:
            false
    });
}


/* =========================================================
   CASHOUT AT SPECIFIC MULTIPLIER

   Mainly useful for deterministic testing.

   Normal UI should call cashout() instead.
========================================================= */

function cashoutAt(
    multiplier
) {
    return executeCashout({
        multiplier,

        automatic:
            false
    });
}


/* =========================================================
   SET AUTO CASHOUT

   Can be configured during BETTING or COUNTDOWN.

   It may not be changed after flight begins.
========================================================= */

function configureAutoCashout(
    targetMultiplier
) {
    const phase =
        getPhase();


    if (
        phase !==
            GAME_PHASES.BETTING &&
        phase !==
            GAME_PHASES.COUNTDOWN
    ) {
        return {
            success: false,

            reason:
                "AUTO_CASHOUT_LOCKED",

            phase
        };
    }


    const target =
        normalizeAutoCashoutTarget(
            targetMultiplier
        );


    if (target === null) {
        return {
            success: false,

            reason:
                "INVALID_AUTO_CASHOUT_TARGET",

            min:
                CASHOUT_CONFIG
                    .MIN_AUTO_CASHOUT,

            max:
                CASHOUT_CONFIG
                    .MAX_AUTO_CASHOUT
        };
    }


    const result =
        setAutoCashout({
            enabled: true,

            targetMultiplier:
                target
        });


    if (!result.success) {
        return result;
    }


    return {
        success: true,

        enabled: true,

        targetMultiplier:
            target
    };
}


/* =========================================================
   DISABLE AUTO CASHOUT

   Can only be changed before flight begins.
========================================================= */

function disableAutoCashout() {
    const phase =
        getPhase();


    if (
        phase !==
            GAME_PHASES.BETTING &&
        phase !==
            GAME_PHASES.COUNTDOWN
    ) {
        return {
            success: false,

            reason:
                "AUTO_CASHOUT_LOCKED",

            phase
        };
    }


    const result =
        setAutoCashout({
            enabled: false,

            targetMultiplier:
                null
        });


    if (!result.success) {
        return result;
    }


    return {
        success: true,

        enabled: false,

        targetMultiplier:
            null
    };
}


/* =========================================================
   GET AUTO CASHOUT STATUS
========================================================= */

function getAutoCashoutStatus() {
    const state =
        getState();

    return {
        enabled:
            state.autoCashout
                .enabled,

        targetMultiplier:
            state.autoCashout
                .targetMultiplier,

        locked:
            state.phase ===
                GAME_PHASES.FLYING ||
            state.phase ===
                GAME_PHASES.CRASHED ||
            state.phase ===
                GAME_PHASES.SETTLING ||
            state.phase ===
                GAME_PHASES.ENDED
    };
}


/* =========================================================
   CHECK AUTO CASHOUT

   Called during multiplier updates.

   The target itself is used for settlement instead of the
   rendered current multiplier.

   Example:
       Target       = 2.00×
       Frame update = 2.01×

   Settlement still happens at exactly 2.00×,
   provided crash point is strictly above 2.00×.
========================================================= */

function processAutoCashout(
    currentMultiplier =
        getMultiplier()
) {
    if (
        runtime
            .autoCashoutProcessing
    ) {
        return {
            success: false,

            triggered: false,

            reason:
                "AUTO_CASHOUT_PROCESSING"
        };
    }


    const state =
        getState();

    const auto =
        state.autoCashout;


    if (!auto.enabled) {
        return {
            success: true,

            triggered: false,

            reason:
                "AUTO_CASHOUT_DISABLED"
        };
    }


    if (
        state.cashout.completed
    ) {
        return {
            success: true,

            triggered: false,

            reason:
                "ALREADY_CASHED_OUT"
        };
    }


    if (
        state.bet.status !==
        BET_STATUS.ACTIVE
    ) {
        return {
            success: true,

            triggered: false,

            reason:
                "NO_ACTIVE_BET"
        };
    }


    if (
        state.phase !==
        GAME_PHASES.FLYING
    ) {
        return {
            success: true,

            triggered: false,

            reason:
                "NOT_FLYING"
        };
    }


    const target =
        normalizeAutoCashoutTarget(
            auto.targetMultiplier
        );


    if (target === null) {
        return {
            success: false,

            triggered: false,

            reason:
                "INVALID_AUTO_CASHOUT_TARGET"
        };
    }


    const current =
        normalizeMultiplier(
            currentMultiplier
        );


    if (current === null) {
        return {
            success: false,

            triggered: false,

            reason:
                "INVALID_CURRENT_MULTIPLIER"
        };
    }


    /* -----------------------------------------------------
       Target has not been reached yet.
    ----------------------------------------------------- */

    if (current < target) {
        return {
            success: true,

            triggered: false,

            reason:
                "TARGET_NOT_REACHED",

            targetMultiplier:
                target,

            currentMultiplier:
                current
        };
    }


    const crashMultiplier =
        getCrashMultiplier();


    /* -----------------------------------------------------
       Auto Cash Out must be STRICTLY before crash point.

       Example:
       target = 2.00
       crash  = 2.00
       => LOSE

       target = 1.99
       crash  = 2.00
       => WIN
    ----------------------------------------------------- */

    if (
        !isFiniteNumber(
            crashMultiplier
        ) ||
        target >=
            crashMultiplier
    ) {
        return {
            success: true,

            triggered: false,

            reason:
                "CRASH_BEFORE_AUTO_CASHOUT",

            targetMultiplier:
                target,

            crashMultiplier
        };
    }


    runtime.autoCashoutProcessing =
        true;


    try {
        const result =
            executeCashout({
                multiplier:
                    target,

                automatic:
                    true
            });


        return {
            ...result,

            triggered:
                result.success
        };
    } finally {
        runtime.autoCashoutProcessing =
            false;
    }
}


/* =========================================================
   PREVIEW CASHOUT

   Does not modify wallet/state.

   Useful for displaying:

       CASH OUT
       2,370

   while multiplier rises.
========================================================= */

function previewCashout(
    multiplier =
        getMultiplier()
) {
    const bet =
        getBet();


    if (
        bet.status !==
            BET_STATUS.PLACED &&
        bet.status !==
            BET_STATUS.ACTIVE
    ) {
        return {
            available: false,

            amount: 0,

            profit: 0,

            multiplier:
                normalizeMultiplier(
                    multiplier
                ) ?? 1
        };
    }


    const normalized =
        normalizeMultiplier(
            multiplier
        );


    if (normalized === null) {
        return {
            available: false,

            amount: 0,

            profit: 0,

            multiplier: 1
        };
    }


    const amount =
        calculateCashoutAmount(
            bet.amount,
            normalized
        );


    const profit =
        calculateCashoutProfit(
            bet.amount,
            amount
        );


    return {
        available:
            getPhase() ===
                GAME_PHASES.FLYING &&
            bet.status ===
                BET_STATUS.ACTIVE &&
            !hasCashedOut(),

        betAmount:
            bet.amount,

        multiplier:
            normalized,

        amount:
            amount ?? 0,

        profit:
            profit ?? 0
    };
}


/* =========================================================
   FLIGHT EVENT INTEGRATION

   Auto Cash Out listens directly to multiplier updates.

   flight.js emits MULTIPLIER_UPDATE synchronously.

   processAutoCashout() still checks the hidden crash point,
   so reaching the exact crash multiplier cannot produce a
   successful Auto Cash Out.
========================================================= */

subscribeToFlight(
    (event) => {
        if (
            event.type !==
            "MULTIPLIER_UPDATE"
        ) {
            return;
        }


        processAutoCashout(
            event.multiplier
        );
    }
);


/* =========================================================
   RESET RUNTIME

   state.js resets auto cashout as part of a new round.
   This only clears the transient processing guard.
========================================================= */

function resetCashoutRuntime() {
    runtime.autoCashoutProcessing =
        false;

    return true;
}


/* =========================================================
   CASHOUT STATUS
========================================================= */

function getCashoutStatus() {
    const state =
        getState();

    return {
        phase:
            state.phase,

        betStatus:
            state.bet.status,

        multiplier:
            state.multiplier,

        crashMultiplier:
            state.crashMultiplier,

        canCashout:
            canCashout(
                state.multiplier
            ).allowed,

        cashout:
            state.cashout,

        autoCashout:
            state.autoCashout
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    CASHOUT_CONFIG,

    normalizeAutoCashoutTarget,

    calculateCashoutAmount,
    calculateCashoutProfit,

    canCashout,

    cashout,
    cashoutAt,

    configureAutoCashout,
    disableAutoCashout,
    getAutoCashoutStatus,
    processAutoCashout,

    previewCashout,

    resetCashoutRuntime,
    getCashoutStatus
};
