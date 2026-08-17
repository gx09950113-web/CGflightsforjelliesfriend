/* =========================================================
   CG FLIGHT
   js/game/cashout.js

   Cash Out controller.

   Responsibilities:
   - Validate manual Cash Out
   - Configure Auto Cash Out
   - Lock Auto Cash Out after flight begins
   - Detect Auto Cash Out from flight events
   - Enforce strict Crash Point boundary
   - Calculate returned amount / profit
   - Credit Wallet exactly once
   - Update current round state
   - Prevent duplicate Cash Out
   - Publish Cash Out events

   IMPORTANT:
   Successful Cash Out requires:

       cashoutMultiplier < crashMultiplier

   Equality is NOT valid.

   Example:
       Crash 2.00×
       Cash Out 1.99× -> WIN
       Cash Out 2.00× -> LOSS
========================================================= */


import {
    GAME_PHASES,
    BET_STATUS,

    getState,

    setAutoCashout,
    setAutoCashoutLocked,

    markCashedOut
} from "./state.js";


import {
    canCashoutBeforeCrash
} from "./crash.js";


import {
    subscribeToFlight,
    FLIGHT_EVENT_TYPES
} from "./flight.js";


import {
    creditCashout
} from "../core/wallet.js";


import {
    roundTo
} from "../core/utils.js";


import {
    playCashout,
    playAutoCashout
} from "../core/audio.js";


/* =========================================================
   CASHOUT CONFIG
========================================================= */

const CASHOUT_CONFIG = Object.freeze({

    MIN_AUTO_MULTIPLIER:
        1.01,

    MAX_AUTO_MULTIPLIER:
        999.99,

    DECIMALS:
        2
});


/* =========================================================
   CASHOUT EVENT TYPES
========================================================= */

const CASHOUT_EVENT_TYPES =
    Object.freeze({

        MANUAL_CASHOUT:
            "MANUAL_CASHOUT",

        AUTO_CASHOUT:
            "AUTO_CASHOUT",

        CASHOUT_REJECTED:
            "CASHOUT_REJECTED",

        AUTO_CONFIGURED:
            "AUTO_CONFIGURED",

        AUTO_DISABLED:
            "AUTO_DISABLED",

        AUTO_LOCKED:
            "AUTO_LOCKED"
    });


/* =========================================================
   RUNTIME
========================================================= */

const runtime = {

    /*
     Prevent two synchronous paths from entering the Wallet
     credit section at the same time.
    */
    processing:
        false,

    /*
     Used only to protect duplicate handling of the same
     completed Cash Out.
    */
    completedTransactionId:
        null
};


/* =========================================================
   LISTENERS
========================================================= */

const cashoutListeners =
    new Set();


function subscribeToCashout(
    listener
) {

    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Cashout listener must be a function."
        );
    }


    cashoutListeners.add(
        listener
    );


    return function unsubscribe() {

        cashoutListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY
========================================================= */

function notifyCashoutListeners(
    event
) {

    const payload = {

        ...event,

        timestamp:
            event.timestamp ??
            Date.now()
    };


    for (
        const listener
        of cashoutListeners
    ) {

        try {

            listener(
                payload
            );

        } catch (error) {

            console.error(
                "[CG Flight] Cashout listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   NORMALIZE AUTO MULTIPLIER
========================================================= */

function normalizeAutoCashoutMultiplier(
    multiplier
) {

    const numeric =
        Number(
            multiplier
        );


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return null;
    }


    const normalized =
        roundTo(
            numeric,
            CASHOUT_CONFIG
                .DECIMALS
        );


    if (
        normalized <
            CASHOUT_CONFIG
                .MIN_AUTO_MULTIPLIER ||
        normalized >
            CASHOUT_CONFIG
                .MAX_AUTO_MULTIPLIER
    ) {
        return null;
    }


    return normalized;
}


/* =========================================================
   CONFIGURE AUTO CASH OUT
========================================================= */

function configureAutoCashout(
    multiplier
) {

    const state =
        getState();


    if (
        state.autoCashout.locked ||
        state.phase ===
            GAME_PHASES.FLYING ||
        state.phase ===
            GAME_PHASES.CRASHED ||
        state.phase ===
            GAME_PHASES.SETTLING ||
        state.phase ===
            GAME_PHASES.ENDED
    ) {

        return {
            success: false,

            reason:
                "AUTO_CASHOUT_LOCKED"
        };
    }


    const normalized =
        normalizeAutoCashoutMultiplier(
            multiplier
        );


    if (
        normalized ===
        null
    ) {

        return {
            success: false,

            reason:
                "INVALID_AUTO_CASHOUT_MULTIPLIER"
        };
    }


    const updated =
        setAutoCashout({

            enabled:
                true,

            targetMultiplier:
                normalized
        });


    if (!updated) {

        return {
            success: false,

            reason:
                "STATE_UPDATE_FAILED"
        };
    }


    notifyCashoutListeners({

        type:
            CASHOUT_EVENT_TYPES
                .AUTO_CONFIGURED,

        roundId:
            state.roundId,

        targetMultiplier:
            normalized
    });


    return {
        success: true,

        enabled:
            true,

        targetMultiplier:
            normalized
    };
}


/* =========================================================
   DISABLE AUTO CASH OUT
========================================================= */

function disableAutoCashout() {

    const state =
        getState();


    if (
        state.autoCashout.locked ||
        state.phase ===
            GAME_PHASES.FLYING
    ) {

        return {
            success: false,

            reason:
                "AUTO_CASHOUT_LOCKED"
        };
    }


    const updated =
        setAutoCashout({

            enabled:
                false,

            targetMultiplier:
                null
        });


    if (!updated) {

        return {
            success: false,

            reason:
                "STATE_UPDATE_FAILED"
        };
    }


    notifyCashoutListeners({

        type:
            CASHOUT_EVENT_TYPES
                .AUTO_DISABLED,

        roundId:
            state.roundId
    });


    return {
        success: true,

        enabled:
            false,

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
            state.autoCashout.enabled,

        targetMultiplier:
            state.autoCashout
                .targetMultiplier,

        locked:
            state.autoCashout.locked,

        phase:
            state.phase
    };
}


/* =========================================================
   CAN CASH OUT
========================================================= */

function canCashout({
    multiplier = null
} = {}) {

    const state =
        getState();


    if (
        !state.roundId
    ) {

        return {
            valid: false,

            reason:
                "NO_ACTIVE_ROUND"
        };
    }


    if (
        state.phase !==
        GAME_PHASES.FLYING
    ) {

        return {
            valid: false,

            reason:
                "NOT_FLYING"
        };
    }


    if (
        state.bet.status !==
        BET_STATUS.ACTIVE
    ) {

        return {
            valid: false,

            reason:
                "NO_ACTIVE_BET"
        };
    }


    if (
        state.cashout.completed
    ) {

        return {
            valid: false,

            reason:
                "ALREADY_CASHED_OUT"
        };
    }


    if (
        runtime.processing
    ) {

        return {
            valid: false,

            reason:
                "CASHOUT_PROCESSING"
        };
    }


    const crashMultiplier =
        Number(
            state.flight
                .crashMultiplier
        );


    const requestedMultiplier =
        multiplier === null
            ? Number(
                state.flight
                    .currentMultiplier
            )
            : Number(
                multiplier
            );


    if (
        !Number.isFinite(
            requestedMultiplier
        ) ||
        !Number.isFinite(
            crashMultiplier
        )
    ) {

        return {
            valid: false,

            reason:
                "INVALID_MULTIPLIER"
        };
    }


    if (
        !canCashoutBeforeCrash(
            requestedMultiplier,
            crashMultiplier
        )
    ) {

        return {
            valid: false,

            reason:
                "CRASH_POINT_REACHED",

            multiplier:
                requestedMultiplier,

            crashMultiplier
        };
    }


    return {
        valid: true,

        reason:
            null,

        multiplier:
            requestedMultiplier,

        crashMultiplier,

        betAmount:
            state.bet.amount
    };
}


/* =========================================================
   CASH OUT PREVIEW
========================================================= */

function previewCashout(
    multiplier = null
) {

    const state =
        getState();


    const betAmount =
        Math.max(
            0,
            Number(
                state.bet.amount
            ) || 0
        );


    const selectedMultiplier =
        multiplier === null
            ? Number(
                state.flight
                    .currentMultiplier
            ) || 1
            : Number(
                multiplier
            ) || 1;


    const normalizedMultiplier =
        Math.max(
            1,
            roundTo(
                selectedMultiplier,
                CASHOUT_CONFIG
                    .DECIMALS
            )
        );


    const amount =
        roundTo(
            betAmount *
            normalizedMultiplier,
            CASHOUT_CONFIG
                .DECIMALS
        );


    const profit =
        roundTo(
            amount -
            betAmount,
            CASHOUT_CONFIG
                .DECIMALS
        );


    const validation =
        canCashout({
            multiplier:
                normalizedMultiplier
        });


    return {

        available:
            validation.valid,

        reason:
            validation.reason,

        betAmount,

        multiplier:
            normalizedMultiplier,

        amount,

        profit,

        crashMultiplier:
            state.flight
                .crashMultiplier
    };
}


/* =========================================================
   INTERNAL EXECUTE CASHOUT

   ALL Cash Outs pass through this function.

   This guarantees:
   - one Wallet credit path
   - one State update path
   - one duplicate protection mechanism
========================================================= */

function executeCashout({
    multiplier,
    automatic = false
}) {

    if (
        runtime.processing
    ) {

        return {
            success: false,

            reason:
                "CASHOUT_PROCESSING"
        };
    }


    const validation =
        canCashout({
            multiplier
        });


    if (
        !validation.valid
    ) {

        notifyCashoutListeners({

            type:
                CASHOUT_EVENT_TYPES
                    .CASHOUT_REJECTED,

            automatic,

            reason:
                validation.reason,

            multiplier:
                validation.multiplier ??
                multiplier,

            crashMultiplier:
                validation.crashMultiplier ??
                null
        });


        return {
            success: false,

            reason:
                validation.reason,

            crashMultiplier:
                validation.crashMultiplier ??
                null
        };
    }


    runtime.processing =
        true;


    try {

        /*
         Re-read immediately before money movement.

         This protects against another synchronous Cash Out
         path that may already have changed State.
        */

        const state =
            getState();


        if (
            state.cashout.completed ||
            state.bet.status !==
                BET_STATUS.ACTIVE ||
            state.phase !==
                GAME_PHASES.FLYING
        ) {

            return {
                success: false,

                reason:
                    "CASHOUT_NO_LONGER_AVAILABLE"
            };
        }


        const normalizedMultiplier =
            roundTo(
                Number(
                    multiplier
                ),
                CASHOUT_CONFIG
                    .DECIMALS
            );


        /*
         Recheck the strict Crash boundary from the newest
         State immediately before credit.
        */

        if (
            !canCashoutBeforeCrash(
                normalizedMultiplier,
                state.flight
                    .crashMultiplier
            )
        ) {

            return {
                success: false,

                reason:
                    "CRASH_POINT_REACHED"
            };
        }


        const betAmount =
            roundTo(
                state.bet.amount,
                CASHOUT_CONFIG
                    .DECIMALS
            );


        const returnedAmount =
            roundTo(
                betAmount *
                normalizedMultiplier,
                CASHOUT_CONFIG
                    .DECIMALS
            );


        const profit =
            roundTo(
                returnedAmount -
                betAmount,
                CASHOUT_CONFIG
                    .DECIMALS
            );


        /* -------------------------------------------------
           Wallet credit first.

           If Wallet fails, State remains ACTIVE.
        -------------------------------------------------- */

        const creditResult =
            creditCashout(
                returnedAmount,
                {
                    roundId:
                        state.roundId,

                    multiplier:
                        normalizedMultiplier,

                    automatic
                }
            );


        if (
            !creditResult.success
        ) {

            return {
                success: false,

                reason:
                    "CASHOUT_CREDIT_FAILED",

                walletReason:
                    creditResult.reason
            };
        }


        /* -------------------------------------------------
           Update round State.
        -------------------------------------------------- */

        const completedAt =
            new Date()
                .toISOString();


        const updated =
            markCashedOut({

                multiplier:
                    normalizedMultiplier,

                amount:
                    returnedAmount,

                profit,

                automatic,

                transactionId:
                    creditResult
                        .transactionId,

                completedAt
            });


        if (!updated) {

            /*
             Wallet has already been credited.

             Do NOT attempt to debit it back, because a
             rollback debit could create a second failure.

             Settlement can later detect this exceptional
             state if necessary.
            */

            return {
                success: false,

                reason:
                    "CASHOUT_STATE_UPDATE_FAILED_AFTER_CREDIT",

                returnedAmount,

                transactionId:
                    creditResult
                        .transactionId
            };
        }


        runtime.completedTransactionId =
            creditResult
                .transactionId;


        if (
            automatic
        ) {

            playAutoCashout();

        } else {

            playCashout();
        }


        const eventType =
            automatic
                ? CASHOUT_EVENT_TYPES
                    .AUTO_CASHOUT
                : CASHOUT_EVENT_TYPES
                    .MANUAL_CASHOUT;


        notifyCashoutListeners({

            type:
                eventType,

            roundId:
                state.roundId,

            automatic,

            multiplier:
                normalizedMultiplier,

            betAmount,

            returnedAmount,

            profit,

            transactionId:
                creditResult
                    .transactionId,

            completedAt
        });


        return {
            success: true,

            roundId:
                state.roundId,

            automatic,

            multiplier:
                normalizedMultiplier,

            betAmount,

            returnedAmount,

            amount:
                returnedAmount,

            profit,

            transactionId:
                creditResult
                    .transactionId,

            balance:
                creditResult.balance,

            completedAt
        };

    } finally {

        runtime.processing =
            false;
    }
}


/* =========================================================
   MANUAL CASH OUT
========================================================= */

function cashout() {

    const state =
        getState();


    /*
     Manual Cash Out uses the currently displayed/runtime
     multiplier.

     It must still be strictly below Crash Point.
    */

    const multiplier =
        roundTo(
            Number(
                state.flight
                    .currentMultiplier
            ) || 1,
            CASHOUT_CONFIG
                .DECIMALS
        );


    return executeCashout({

        multiplier,

        automatic:
            false
    });
}


/* =========================================================
   AUTO CASHOUT CHECK

   Auto Cash Out is evaluated on every normal
   MULTIPLIER_UPDATE event.

   IMPORTANT:
   flight.js checks Crash BEFORE it emits MULTIPLIER_UPDATE.

   Therefore:
       target === crash
   can never Auto Cash Out successfully.
========================================================= */

function handleMultiplierUpdate(
    event
) {

    const state =
        getState();


    if (
        state.phase !==
        GAME_PHASES.FLYING
    ) {
        return;
    }


    if (
        state.bet.status !==
        BET_STATUS.ACTIVE
    ) {
        return;
    }


    if (
        state.cashout.completed
    ) {
        return;
    }


    if (
        !state.autoCashout.enabled
    ) {
        return;
    }


    const target =
        Number(
            state.autoCashout
                .targetMultiplier
        );


    if (
        !Number.isFinite(
            target
        )
    ) {
        return;
    }


    /*
     Absolute safety rule:

       Auto Target MUST be strictly below Crash Point.

     This check is performed even though flight.js event
     ordering already protects equality.
    */

    if (
        !canCashoutBeforeCrash(
            target,
            state.flight
                .crashMultiplier
        )
    ) {
        return;
    }


    const currentRaw =
        Number(
            event.rawMultiplier ??
            event.multiplier
        );


    if (
        !Number.isFinite(
            currentRaw
        )
    ) {
        return;
    }


    /*
     Cross-frame trigger.

     Example:
         previous display: 1.99
         next raw frame:   2.013
         target:           2.00

     We Cash Out at exactly 2.00×.
    */

    if (
        currentRaw >=
        target
    ) {

        executeCashout({

            multiplier:
                target,

            automatic:
                true
        });
    }
}


/* =========================================================
   FLIGHT START

   state.js already locks Auto Cash Out in
   startFlightState(), but this keeps the behavior explicit.
========================================================= */

function handleFlightStart() {

    const state =
        getState();


    if (
        !state.autoCashout.locked
    ) {

        setAutoCashoutLocked(
            true
        );
    }


    notifyCashoutListeners({

        type:
            CASHOUT_EVENT_TYPES
                .AUTO_LOCKED,

        roundId:
            state.roundId,

        enabled:
            state.autoCashout.enabled,

        targetMultiplier:
            state.autoCashout
                .targetMultiplier
    });
}


/* =========================================================
   FLIGHT EVENT HANDLER
========================================================= */

function handleFlightEvent(
    event
) {

    switch (
        event.type
    ) {

        case FLIGHT_EVENT_TYPES
            .FLIGHT_START:

            handleFlightStart();

            break;


        case FLIGHT_EVENT_TYPES
            .MULTIPLIER_UPDATE:

            handleMultiplierUpdate(
                event
            );

            break;


        default:
            break;
    }
}


/* =========================================================
   SUBSCRIBE TO FLIGHT ENGINE

   Cashout owns its own Auto Cash Out detection.

   pages/game.js does NOT need to perform Auto logic.
========================================================= */

subscribeToFlight(
    handleFlightEvent
);


/* =========================================================
   RESET CASHOUT RUNTIME

   Called before a new round.

   State itself is reset by createRound().
========================================================= */

function resetCashoutRuntime() {

    runtime.processing =
        false;


    runtime.completedTransactionId =
        null;


    return true;
}


/* =========================================================
   GET CASHOUT STATUS
========================================================= */

function getCashoutStatus() {

    const state =
        getState();


    return {

        roundId:
            state.roundId,

        phase:
            state.phase,

        betStatus:
            state.bet.status,

        completed:
            state.cashout.completed,

        automatic:
            state.cashout.automatic,

        type:
            state.cashout.type,

        multiplier:
            state.cashout.multiplier,

        amount:
            state.cashout.amount,

        profit:
            state.cashout.profit,

        transactionId:
            state.cashout.transactionId,

        processing:
            runtime.processing
    };
}


/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

function performCashout() {

    return cashout();
}


function enableAutoCashout(
    multiplier
) {

    return configureAutoCashout(
        multiplier
    );
}


function clearAutoCashout() {

    return disableAutoCashout();
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    CASHOUT_CONFIG,
    CASHOUT_EVENT_TYPES,

    normalizeAutoCashoutMultiplier,

    configureAutoCashout,
    disableAutoCashout,

    getAutoCashoutStatus,

    canCashout,
    previewCashout,

    cashout,
    getCashoutStatus,

    resetCashoutRuntime,

    subscribeToCashout,

    /* Compatibility */
    performCashout,
    enableAutoCashout,
    clearAutoCashout
};
