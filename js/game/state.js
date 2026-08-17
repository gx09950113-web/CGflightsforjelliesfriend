/* =========================================================
   CG FLIGHT
   js/game/state.js

   In-memory round state manager.

   Responsibilities:
   - Define game phases
   - Define bet/result enums
   - Create/reset rounds
   - Store current round runtime state
   - Provide controlled synchronous mutations
   - Publish state change events
   - Protect state from accidental outside mutation

   IMPORTANT:
   state.js manages the CURRENT ROUND only.

   It does NOT:
   - Persist History
   - Persist Statistics
   - Modify Wallet
   - Generate Crash Point
   - Perform Cash Out calculation
========================================================= */


import {
    clone,
    createId,
    roundTo,
    isPlainObject
} from "../core/utils.js";


/* =========================================================
   GAME PHASES
========================================================= */

const GAME_PHASES = Object.freeze({

    IDLE:
        "IDLE",

    BETTING:
        "BETTING",

    COUNTDOWN:
        "COUNTDOWN",

    FLYING:
        "FLYING",

    CRASHED:
        "CRASHED",

    SETTLING:
        "SETTLING",

    ENDED:
        "ENDED"
});


/* =========================================================
   BET STATUS
========================================================= */

const BET_STATUS = Object.freeze({

    NONE:
        "NONE",

    PLACED:
        "PLACED",

    ACTIVE:
        "ACTIVE",

    CASHED_OUT:
        "CASHED_OUT",

    LOST:
        "LOST",

    CANCELLED:
        "CANCELLED",

    REFUNDED:
        "REFUNDED"
});


/* =========================================================
   ROUND RESULT
========================================================= */

const ROUND_RESULT = Object.freeze({

    WIN:
        "WIN",

    LOSS:
        "LOSS",

    REFUND:
        "REFUND",

    NO_BET:
        "NO_BET"
});


/* =========================================================
   CASHOUT TYPES
========================================================= */

const CASHOUT_TYPES = Object.freeze({

    NONE:
        "NONE",

    MANUAL:
        "MANUAL",

    AUTO:
        "AUTO"
});


/* =========================================================
   STATE EVENT TYPES
========================================================= */

const STATE_EVENT_TYPES = Object.freeze({

    ROUND_CREATED:
        "ROUND_CREATED",

    STATE_UPDATED:
        "STATE_UPDATED",

    PHASE_CHANGED:
        "PHASE_CHANGED",

    ROUND_RESET:
        "ROUND_RESET"
});


/* =========================================================
   CREATE EMPTY ROUND STATE
========================================================= */

function createEmptyState() {

    return {

        /* -------------------------------------------------
           Round
        -------------------------------------------------- */

        roundId:
            null,

        phase:
            GAME_PHASES.IDLE,

        createdAt:
            null,

        endedAt:
            null,


        /* -------------------------------------------------
           Bet
        -------------------------------------------------- */

        bet: {

            status:
                BET_STATUS.NONE,

            amount:
                0,

            placedAt:
                null,

            activatedAt:
                null,

            cancelledAt:
                null,

            refundedAt:
                null,

            transactionId:
                null,

            refundTransactionId:
                null
        },


        /* -------------------------------------------------
           Flight
        -------------------------------------------------- */

        flight: {

            startedAt:
                null,

            crashedAt:
                null,

            elapsedMs:
                0,

            currentMultiplier:
                1,

            crashMultiplier:
                null
        },


        /* -------------------------------------------------
           Auto Cash Out
        -------------------------------------------------- */

        autoCashout: {

            enabled:
                false,

            targetMultiplier:
                null,

            locked:
                false
        },


        /* -------------------------------------------------
           Cash Out
        -------------------------------------------------- */

        cashout: {

            completed:
                false,

            automatic:
                false,

            type:
                CASHOUT_TYPES.NONE,

            multiplier:
                null,

            amount:
                0,

            profit:
                0,

            completedAt:
                null,

            transactionId:
                null
        },


        /* -------------------------------------------------
           Settlement
        -------------------------------------------------- */

        settlement: {

            completed:
                false,

            result:
                null,

            wagered:
                0,

            returned:
                0,

            profit:
                0,

            completedAt:
                null,

            recordId:
                null
        }
    };
}


/* =========================================================
   RUNTIME STATE
========================================================= */

let currentState =
    createEmptyState();


/* =========================================================
   LISTENERS
========================================================= */

const stateListeners =
    new Set();


function subscribeToState(
    listener
) {

    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] State listener must be a function."
        );
    }


    stateListeners.add(
        listener
    );


    return function unsubscribe() {

        stateListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY
========================================================= */

function notifyStateListeners(
    event
) {

    const payload = {

        ...clone(event),

        state:
            clone(
                currentState
            ),

        timestamp:
            event.timestamp ??
            Date.now()
    };


    for (
        const listener
        of stateListeners
    ) {

        try {

            listener(
                payload
            );

        } catch (error) {

            console.error(
                "[CG Flight] State listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   GET STATE
========================================================= */

function getState() {

    return clone(
        currentState
    );
}


/* =========================================================
   GET PHASE
========================================================= */

function getPhase() {

    return currentState.phase;
}


/* =========================================================
   GET ROUND ID
========================================================= */

function getRoundId() {

    return currentState.roundId;
}


/* =========================================================
   CHECK PHASE
========================================================= */

function isPhase(
    ...phases
) {

    return phases.includes(
        currentState.phase
    );
}


/* =========================================================
   VALID PHASE
========================================================= */

function isValidPhase(
    phase
) {

    return Object.values(
        GAME_PHASES
    ).includes(
        phase
    );
}


/* =========================================================
   NORMALIZE STATE

   Used after every update to prevent obviously invalid
   runtime values.
========================================================= */

function normalizeState(
    state
) {

    if (
        !isPlainObject(
            state
        )
    ) {
        return createEmptyState();
    }


    /* -----------------------------------------------------
       Phase
    ----------------------------------------------------- */

    if (
        !isValidPhase(
            state.phase
        )
    ) {
        state.phase =
            GAME_PHASES.IDLE;
    }


    /* -----------------------------------------------------
       Bet
    ----------------------------------------------------- */

    if (
        !isPlainObject(
            state.bet
        )
    ) {
        state.bet =
            createEmptyState().bet;
    }


    state.bet.amount =
        Math.max(
            0,
            roundTo(
                Number(
                    state.bet.amount
                ) || 0,
                2
            )
        );


    /* -----------------------------------------------------
       Flight
    ----------------------------------------------------- */

    if (
        !isPlainObject(
            state.flight
        )
    ) {
        state.flight =
            createEmptyState().flight;
    }


    state.flight.currentMultiplier =
        Math.max(
            1,
            roundTo(
                Number(
                    state.flight
                        .currentMultiplier
                ) || 1,
                2
            )
        );


    if (
        state.flight.crashMultiplier !==
        null
    ) {

        const crash =
            Number(
                state.flight
                    .crashMultiplier
            );


        state.flight.crashMultiplier =
            Number.isFinite(
                crash
            )
                ? Math.max(
                    1,
                    roundTo(
                        crash,
                        2
                    )
                )
                : null;
    }


    state.flight.elapsedMs =
        Math.max(
            0,
            Number(
                state.flight.elapsedMs
            ) || 0
        );


    /* -----------------------------------------------------
       Auto Cash Out
    ----------------------------------------------------- */

    if (
        !isPlainObject(
            state.autoCashout
        )
    ) {
        state.autoCashout =
            createEmptyState()
                .autoCashout;
    }


    state.autoCashout.enabled =
        Boolean(
            state.autoCashout.enabled
        );


    state.autoCashout.locked =
        Boolean(
            state.autoCashout.locked
        );


    if (
        state.autoCashout
            .targetMultiplier !==
        null
    ) {

        const target =
            Number(
                state.autoCashout
                    .targetMultiplier
            );


        state.autoCashout
            .targetMultiplier =
            Number.isFinite(
                target
            )
                ? roundTo(
                    target,
                    2
                )
                : null;
    }


    /* -----------------------------------------------------
       Cash Out
    ----------------------------------------------------- */

    if (
        !isPlainObject(
            state.cashout
        )
    ) {
        state.cashout =
            createEmptyState()
                .cashout;
    }


    state.cashout.completed =
        Boolean(
            state.cashout.completed
        );


    state.cashout.automatic =
        Boolean(
            state.cashout.automatic
        );


    state.cashout.amount =
        Math.max(
            0,
            roundTo(
                Number(
                    state.cashout.amount
                ) || 0,
                2
            )
        );


    state.cashout.profit =
        roundTo(
            Number(
                state.cashout.profit
            ) || 0,
            2
        );


    /* -----------------------------------------------------
       Settlement
    ----------------------------------------------------- */

    if (
        !isPlainObject(
            state.settlement
        )
    ) {
        state.settlement =
            createEmptyState()
                .settlement;
    }


    state.settlement.completed =
        Boolean(
            state.settlement
                .completed
        );


    state.settlement.wagered =
        Math.max(
            0,
            roundTo(
                Number(
                    state.settlement
                        .wagered
                ) || 0,
                2
            )
        );


    state.settlement.returned =
        Math.max(
            0,
            roundTo(
                Number(
                    state.settlement
                        .returned
                ) || 0,
                2
            )
        );


    state.settlement.profit =
        roundTo(
            Number(
                state.settlement
                    .profit
            ) || 0,
            2
        );


    return state;
}


/* =========================================================
   UPDATE STATE

   Canonical mutation path for game modules.

   Example:

   updateState((state) => {
       state.bet.status = BET_STATUS.PLACED;
       state.bet.amount = 1000;
   });
========================================================= */

function updateState(
    mutator,
    {
        type =
            STATE_EVENT_TYPES
                .STATE_UPDATED,

        source =
            null
    } = {}
) {

    if (
        typeof mutator !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] updateState() requires a mutator function."
        );
    }


    const previous =
        clone(
            currentState
        );


    const working =
        clone(
            currentState
        );


    try {

        const returned =
            mutator(
                working
            );


        if (
            returned &&
            typeof returned.then ===
                "function"
        ) {
            throw new TypeError(
                "[CG Flight] updateState() mutator must be synchronous."
            );
        }

    } catch (error) {

        console.error(
            "[CG Flight] State update failed:",
            error
        );


        return null;
    }


    currentState =
        normalizeState(
            working
        );


    notifyStateListeners({

        type,

        source,

        previous
    });


    return getState();
}


/* =========================================================
   SET PHASE
========================================================= */

function setPhase(
    phase,
    {
        source =
            null
    } = {}
) {

    if (
        !isValidPhase(
            phase
        )
    ) {

        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase:
                currentState.phase
        };
    }


    if (
        currentState.phase ===
        phase
    ) {

        return {
            success: true,

            changed:
                false,

            phase
        };
    }


    const previousPhase =
        currentState.phase;


    const updated =
        updateState(
            (state) => {

                state.phase =
                    phase;
            },
            {
                type:
                    STATE_EVENT_TYPES
                        .PHASE_CHANGED,

                source
            }
        );


    if (!updated) {

        return {
            success: false,

            reason:
                "STATE_UPDATE_FAILED",

            phase:
                previousPhase
        };
    }


    return {

        success: true,

        changed:
            true,

        previousPhase,

        phase
    };
}


/* =========================================================
   CREATE ROUND

   Creates a fresh BETTING round.

   Does NOT generate Crash Point.
   crash.js / flight.js own that responsibility.
========================================================= */

function createRound(
    {
        roundId =
            null
    } = {}
) {

    const timestamp =
        new Date()
            .toISOString();


    const previous =
        clone(
            currentState
        );


    currentState =
        createEmptyState();


    currentState.roundId =
        roundId ||
        createId(
            "round"
        );


    currentState.phase =
        GAME_PHASES.BETTING;


    currentState.createdAt =
        timestamp;


    notifyStateListeners({

        type:
            STATE_EVENT_TYPES
                .ROUND_CREATED,

        previous,

        source:
            "createRound"
    });


    return getState();
}


/* =========================================================
   RESET ROUND

   Returns runtime to IDLE.

   createRound() should normally be called immediately after
   when starting another game.
========================================================= */

function resetRound() {

    const previous =
        clone(
            currentState
        );


    currentState =
        createEmptyState();


    notifyStateListeners({

        type:
            STATE_EVENT_TYPES
                .ROUND_RESET,

        previous,

        source:
            "resetRound"
    });


    return getState();
}


/* =========================================================
   BET HELPERS
========================================================= */

function setBetPlaced(
    {
        amount,
        transactionId = null,
        placedAt = null
    }
) {

    return updateState(
        (state) => {

            state.bet.status =
                BET_STATUS.PLACED;


            state.bet.amount =
                amount;


            state.bet.transactionId =
                transactionId;


            state.bet.placedAt =
                placedAt ??
                new Date()
                    .toISOString();
        },
        {
            source:
                "setBetPlaced"
        }
    );
}


function setBetCancelled(
    {
        refundTransactionId = null,
        cancelledAt = null
    } = {}
) {

    return updateState(
        (state) => {

            state.bet.status =
                BET_STATUS.CANCELLED;


            state.bet
                .refundTransactionId =
                refundTransactionId;


            state.bet.cancelledAt =
                cancelledAt ??
                new Date()
                    .toISOString();
        },
        {
            source:
                "setBetCancelled"
        }
    );
}


function activateBet(
    activatedAt = null
) {

    return updateState(
        (state) => {

            if (
                state.bet.status ===
                BET_STATUS.PLACED
            ) {

                state.bet.status =
                    BET_STATUS.ACTIVE;


                state.bet.activatedAt =
                    activatedAt ??
                    new Date()
                        .toISOString();
            }
        },
        {
            source:
                "activateBet"
        }
    );
}


function markBetLost() {

    return updateState(
        (state) => {

            if (
                state.bet.status ===
                BET_STATUS.ACTIVE
            ) {

                state.bet.status =
                    BET_STATUS.LOST;
            }
        },
        {
            source:
                "markBetLost"
        }
    );
}


function markBetRefunded(
    {
        refundTransactionId = null
    } = {}
) {

    return updateState(
        (state) => {

            state.bet.status =
                BET_STATUS.REFUNDED;


            state.bet.refundTransactionId =
                refundTransactionId;


            state.bet.refundedAt =
                new Date()
                    .toISOString();
        },
        {
            source:
                "markBetRefunded"
        }
    );
}


/* =========================================================
   FLIGHT HELPERS
========================================================= */

function setCrashMultiplier(
    multiplier
) {

    const numeric =
        Number(multiplier);


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric < 1
    ) {

        return {
            success: false,

            reason:
                "INVALID_CRASH_MULTIPLIER"
        };
    }


    updateState(
        (state) => {

            state.flight.crashMultiplier =
                roundTo(
                    numeric,
                    2
                );
        },
        {
            source:
                "setCrashMultiplier"
        }
    );


    return {
        success: true,

        crashMultiplier:
            roundTo(
                numeric,
                2
            )
    };
}


function startFlightState() {

    const timestamp =
        new Date()
            .toISOString();


    const updated =
        updateState(
            (state) => {

                state.phase =
                    GAME_PHASES.FLYING;


                state.flight.startedAt =
                    timestamp;


                state.flight.currentMultiplier =
                    1;


                state.flight.elapsedMs =
                    0;


                state.autoCashout.locked =
                    true;


                if (
                    state.bet.status ===
                    BET_STATUS.PLACED
                ) {

                    state.bet.status =
                        BET_STATUS.ACTIVE;


                    state.bet.activatedAt =
                        timestamp;
                }
            },
            {
                type:
                    STATE_EVENT_TYPES
                        .PHASE_CHANGED,

                source:
                    "startFlightState"
            }
        );


    return Boolean(
        updated
    );
}


function setCurrentMultiplier(
    multiplier,
    elapsedMs = null
) {

    const numeric =
        Number(multiplier);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return false;
    }


    return Boolean(
        updateState(
            (state) => {

                state.flight
                    .currentMultiplier =
                    Math.max(
                        1,
                        roundTo(
                            numeric,
                            2
                        )
                    );


                if (
                    elapsedMs !==
                    null
                ) {

                    state.flight.elapsedMs =
                        Math.max(
                            0,
                            Number(
                                elapsedMs
                            ) || 0
                        );
                }
            },
            {
                source:
                    "setCurrentMultiplier"
            }
        )
    );
}


function markFlightCrashed(
    crashMultiplier = null
) {

    const timestamp =
        new Date()
            .toISOString();


    return updateState(
        (state) => {

            if (
                crashMultiplier !==
                null
            ) {

                state.flight
                    .crashMultiplier =
                    roundTo(
                        Number(
                            crashMultiplier
                        ) || 1,
                        2
                    );
            }


            if (
                state.flight
                    .crashMultiplier !==
                null
            ) {

                state.flight
                    .currentMultiplier =
                    state.flight
                        .crashMultiplier;
            }


            state.flight.crashedAt =
                timestamp;


            state.phase =
                GAME_PHASES.CRASHED;


            if (
                state.bet.status ===
                BET_STATUS.ACTIVE
            ) {

                state.bet.status =
                    BET_STATUS.LOST;
            }
        },
        {
            type:
                STATE_EVENT_TYPES
                    .PHASE_CHANGED,

            source:
                "markFlightCrashed"
        }
    );
}


/* =========================================================
   AUTO CASHOUT HELPERS
========================================================= */

function setAutoCashout(
    {
        enabled,
        targetMultiplier = null
    }
) {

    return updateState(
        (state) => {

            state.autoCashout.enabled =
                Boolean(
                    enabled
                );


            state.autoCashout
                .targetMultiplier =
                enabled
                    ? roundTo(
                        Number(
                            targetMultiplier
                        ) || 0,
                        2
                    )
                    : null;
        },
        {
            source:
                "setAutoCashout"
        }
    );
}


function setAutoCashoutLocked(
    locked
) {

    return updateState(
        (state) => {

            state.autoCashout.locked =
                Boolean(
                    locked
                );
        },
        {
            source:
                "setAutoCashoutLocked"
        }
    );
}


/* =========================================================
   CASHOUT STATE
========================================================= */

function markCashedOut({
    multiplier,
    amount,
    profit = null,
    automatic = false,
    transactionId = null,
    completedAt = null
}) {

    const cashoutMultiplier =
        roundTo(
            Number(multiplier) || 0,
            2
        );


    const returnedAmount =
        roundTo(
            Number(amount) || 0,
            2
        );


    const calculatedProfit =
        profit !== null
            ? roundTo(
                Number(profit) || 0,
                2
            )
            : roundTo(
                returnedAmount -
                currentState.bet.amount,
                2
            );


    return updateState(
        (state) => {

            state.cashout.completed =
                true;


            state.cashout.automatic =
                Boolean(
                    automatic
                );


            state.cashout.type =
                automatic
                    ? CASHOUT_TYPES.AUTO
                    : CASHOUT_TYPES.MANUAL;


            state.cashout.multiplier =
                cashoutMultiplier;


            state.cashout.amount =
                returnedAmount;


            state.cashout.profit =
                calculatedProfit;


            state.cashout.completedAt =
                completedAt ??
                new Date()
                    .toISOString();


            state.cashout.transactionId =
                transactionId;


            state.bet.status =
                BET_STATUS.CASHED_OUT;
        },
        {
            source:
                "markCashedOut"
        }
    );
}


/* =========================================================
   SETTLEMENT STATE
========================================================= */

function beginSettlement() {

    return setPhase(
        GAME_PHASES.SETTLING,
        {
            source:
                "beginSettlement"
        }
    );
}


function completeSettlement({
    result,
    wagered = 0,
    returned = 0,
    profit = 0,
    recordId = null,
    completedAt = null
}) {

    const validResult =
        Object.values(
            ROUND_RESULT
        ).includes(
            result
        );


    if (
        !validResult
    ) {

        return {
            success: false,

            reason:
                "INVALID_ROUND_RESULT"
        };
    }


    const updated =
        updateState(
            (state) => {

                state.settlement.completed =
                    true;


                state.settlement.result =
                    result;


                state.settlement.wagered =
                    wagered;


                state.settlement.returned =
                    returned;


                state.settlement.profit =
                    profit;


                state.settlement.recordId =
                    recordId;


                state.settlement.completedAt =
                    completedAt ??
                    new Date()
                        .toISOString();


                state.endedAt =
                    state.settlement
                        .completedAt;


                state.phase =
                    GAME_PHASES.ENDED;
            },
            {
                type:
                    STATE_EVENT_TYPES
                        .PHASE_CHANGED,

                source:
                    "completeSettlement"
            }
        );


    if (!updated) {

        return {
            success: false,

            reason:
                "STATE_UPDATE_FAILED"
        };
    }


    return {

        success: true,

        state:
            updated
    };
}


/* =========================================================
   ROUND STATUS HELPERS
========================================================= */

function hasPlacedBet() {

    return currentState.bet.status !==
        BET_STATUS.NONE;
}


function hasActiveBet() {

    return currentState.bet.status ===
        BET_STATUS.ACTIVE;
}


function hasCompletedCashout() {

    return currentState.cashout.completed ===
        true;
}


function isRoundComplete() {

    return (
        currentState.phase ===
            GAME_PHASES.ENDED &&
        currentState.settlement
            .completed ===
            true
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    GAME_PHASES,
    BET_STATUS,
    ROUND_RESULT,
    CASHOUT_TYPES,
    STATE_EVENT_TYPES,

    createRound,
    resetRound,

    getState,
    getPhase,
    getRoundId,

    isPhase,
    isRoundComplete,

    updateState,
    setPhase,

    setBetPlaced,
    setBetCancelled,
    activateBet,
    markBetLost,
    markBetRefunded,

    setCrashMultiplier,
    startFlightState,
    setCurrentMultiplier,
    markFlightCrashed,

    setAutoCashout,
    setAutoCashoutLocked,

    markCashedOut,

    beginSettlement,
    completeSettlement,

    hasPlacedBet,
    hasActiveBet,
    hasCompletedCashout,

    subscribeToState
};
