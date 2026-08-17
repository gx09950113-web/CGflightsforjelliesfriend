/* =========================================================
   CG FLIGHT
   js/game/state.js

   In-memory round state manager.

   Responsibilities:
   - Store current round state
   - Manage game phase transitions
   - Store current multiplier
   - Store crash point
   - Store bet state
   - Store cashout state
   - Store timing information
   - Provide subscription mechanism
   - Reset round state safely

   IMPORTANT:
   This module does NOT:
   - Write localStorage
   - Deduct wallet balance
   - Generate crash multipliers
   - Calculate flight curves
   - Perform settlement
========================================================= */

import {
    clone,
    createId,
    isFiniteNumber,
    isPositiveNumber
} from "../core/utils.js";


/* =========================================================
   GAME PHASES
========================================================= */

const GAME_PHASES = Object.freeze({
    IDLE: "IDLE",

    BETTING: "BETTING",

    COUNTDOWN: "COUNTDOWN",

    FLYING: "FLYING",

    CRASHED: "CRASHED",

    SETTLING: "SETTLING",

    ENDED: "ENDED"
});


/* =========================================================
   BET STATUS
========================================================= */

const BET_STATUS = Object.freeze({
    NONE: "NONE",

    PLACED: "PLACED",

    CANCELLED: "CANCELLED",

    ACTIVE: "ACTIVE",

    CASHED_OUT: "CASHED_OUT",

    LOST: "LOST",

    REFUNDED: "REFUNDED"
});


/* =========================================================
   ROUND RESULT STATUS
========================================================= */

const ROUND_RESULT = Object.freeze({
    NONE: "NONE",

    WIN: "WIN",

    LOSS: "LOSS",

    NO_BET: "NO_BET",

    REFUND: "REFUND"
});


/* =========================================================
   DEFAULT ROUND STATE FACTORY
========================================================= */

function createDefaultRoundState() {
    return {
        roundId: null,

        phase:
            GAME_PHASES.IDLE,

        multiplier: 1,

        crashMultiplier: null,

        countdown: {
            remaining: 0,

            startedAt: null,

            endsAt: null
        },

        flight: {
            startedAt: null,

            crashedAt: null,

            elapsedMs: 0
        },

        bet: {
            status:
                BET_STATUS.NONE,

            amount: 0,

            placedAt: null,

            cancelledAt: null,

            activatedAt: null,

            transactionId: null
        },

        autoCashout: {
            enabled: false,

            targetMultiplier: null
        },

        cashout: {
            completed: false,

            automatic: false,

            multiplier: null,

            amount: 0,

            profit: 0,

            completedAt: null,

            transactionId: null
        },

        result: {
            status:
                ROUND_RESULT.NONE,

            wagered: 0,

            returned: 0,

            profit: 0
        },

        settlement: {
            completed: false,

            completedAt: null
        },

        metadata: {}
    };
}


/* =========================================================
   INTERNAL STATE
========================================================= */

let roundState =
    createDefaultRoundState();


/* =========================================================
   STATE LISTENERS
========================================================= */

const stateListeners =
    new Set();


/* =========================================================
   STATE SNAPSHOT
========================================================= */

function getState() {
    return clone(
        roundState
    );
}


/* =========================================================
   INTERNAL NOTIFY
========================================================= */

function notifyStateListeners(
    previousState,
    nextState,
    changedKeys = []
) {
    const payload = {
        previous:
            clone(previousState),

        state:
            clone(nextState),

        changedKeys:
            [...changedKeys]
    };

    for (
        const listener
        of stateListeners
    ) {
        try {
            listener(payload);
        } catch (error) {
            console.error(
                "[CG Flight] State listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   SUBSCRIBE
========================================================= */

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
   UPDATE STATE
========================================================= */

function updateState(
    updater,
    changedKeys = []
) {
    if (
        typeof updater !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] updateState requires a function."
        );
    }

    const previousState =
        clone(roundState);

    const workingCopy =
        clone(roundState);

    const result =
        updater(workingCopy);

    const nextState =
        result === undefined
            ? workingCopy
            : result;

    if (
        !nextState ||
        typeof nextState !== "object" ||
        Array.isArray(nextState)
    ) {
        throw new TypeError(
            "[CG Flight] updateState callback must return an object or undefined."
        );
    }

    roundState =
        nextState;

    notifyStateListeners(
        previousState,
        roundState,
        changedKeys
    );

    return getState();
}


/* =========================================================
   ROUND CREATION
========================================================= */

function createRound() {
    const previousState =
        clone(roundState);

    roundState =
        createDefaultRoundState();

    roundState.roundId =
        createId("round");

    roundState.phase =
        GAME_PHASES.BETTING;

    notifyStateListeners(
        previousState,
        roundState,
        [
            "roundId",
            "phase"
        ]
    );

    return getState();
}


/* =========================================================
   RESET ROUND
========================================================= */

function resetRound() {
    const previousState =
        clone(roundState);

    roundState =
        createDefaultRoundState();

    notifyStateListeners(
        previousState,
        roundState,
        ["*"]
    );

    return getState();
}


/* =========================================================
   PHASE
========================================================= */

function getPhase() {
    return roundState.phase;
}


function isPhase(phase) {
    return (
        roundState.phase === phase
    );
}


/* =========================================================
   ALLOWED PHASE TRANSITIONS
========================================================= */

const PHASE_TRANSITIONS = Object.freeze({

    [GAME_PHASES.IDLE]: [
        GAME_PHASES.BETTING
    ],

    [GAME_PHASES.BETTING]: [
        GAME_PHASES.COUNTDOWN,
        GAME_PHASES.ENDED
    ],

    [GAME_PHASES.COUNTDOWN]: [
        GAME_PHASES.FLYING,
        GAME_PHASES.ENDED
    ],

    [GAME_PHASES.FLYING]: [
        GAME_PHASES.CRASHED
    ],

    [GAME_PHASES.CRASHED]: [
        GAME_PHASES.SETTLING
    ],

    [GAME_PHASES.SETTLING]: [
        GAME_PHASES.ENDED
    ],

    [GAME_PHASES.ENDED]: [
        GAME_PHASES.BETTING,
        GAME_PHASES.IDLE
    ]
});


/* =========================================================
   CHECK PHASE TRANSITION
========================================================= */

function canTransitionTo(
    nextPhase
) {
    if (
        !Object.values(
            GAME_PHASES
        ).includes(nextPhase)
    ) {
        return false;
    }

    const allowed =
        PHASE_TRANSITIONS[
            roundState.phase
        ] ?? [];

    return allowed.includes(
        nextPhase
    );
}


/* =========================================================
   SET PHASE
========================================================= */

function setPhase(
    nextPhase,
    {
        force = false
    } = {}
) {
    if (
        !Object.values(
            GAME_PHASES
        ).includes(nextPhase)
    ) {
        return {
            success: false,
            reason: "INVALID_PHASE"
        };
    }

    if (
        !force &&
        !canTransitionTo(
            nextPhase
        )
    ) {
        return {
            success: false,
            reason:
                "INVALID_PHASE_TRANSITION",

            currentPhase:
                roundState.phase,

            requestedPhase:
                nextPhase
        };
    }

    const previousPhase =
        roundState.phase;

    updateState(
        (state) => {
            state.phase =
                nextPhase;
        },
        ["phase"]
    );

    return {
        success: true,

        previousPhase,

        phase:
            nextPhase
    };
}


/* =========================================================
   MULTIPLIER
========================================================= */

function getMultiplier() {
    return roundState.multiplier;
}


function setMultiplier(
    multiplier
) {
    if (
        !isFiniteNumber(
            multiplier
        ) ||
        multiplier < 1
    ) {
        return {
            success: false,
            reason:
                "INVALID_MULTIPLIER"
        };
    }

    updateState(
        (state) => {
            state.multiplier =
                multiplier;
        },
        ["multiplier"]
    );

    return {
        success: true,
        multiplier
    };
}


/* =========================================================
   CRASH MULTIPLIER
========================================================= */

function getCrashMultiplier() {
    return (
        roundState
            .crashMultiplier
    );
}


function setCrashMultiplier(
    multiplier
) {
    if (
        !isFiniteNumber(
            multiplier
        ) ||
        multiplier < 1
    ) {
        return {
            success: false,
            reason:
                "INVALID_CRASH_MULTIPLIER"
        };
    }

    updateState(
        (state) => {
            state.crashMultiplier =
                multiplier;
        },
        ["crashMultiplier"]
    );

    return {
        success: true,
        crashMultiplier:
            multiplier
    };
}


/* =========================================================
   COUNTDOWN
========================================================= */

function setCountdown({
    remaining,
    startedAt = null,
    endsAt = null
}) {
    if (
        !isFiniteNumber(
            remaining
        ) ||
        remaining < 0
    ) {
        return {
            success: false,
            reason:
                "INVALID_COUNTDOWN"
        };
    }

    updateState(
        (state) => {
            state.countdown = {
                remaining,

                startedAt,

                endsAt
            };
        },
        ["countdown"]
    );

    return {
        success: true
    };
}


/* =========================================================
   FLIGHT TIMING
========================================================= */

function markFlightStarted(
    timestamp =
        Date.now()
) {
    updateState(
        (state) => {
            state.flight.startedAt =
                timestamp;

            state.flight.crashedAt =
                null;

            state.flight.elapsedMs =
                0;
        },
        ["flight"]
    );

    return getState().flight;
}


function updateFlightElapsed(
    elapsedMs
) {
    if (
        !isFiniteNumber(
            elapsedMs
        ) ||
        elapsedMs < 0
    ) {
        return false;
    }

    updateState(
        (state) => {
            state.flight.elapsedMs =
                elapsedMs;
        },
        ["flight.elapsedMs"]
    );

    return true;
}


function markFlightCrashed(
    timestamp =
        Date.now()
) {
    updateState(
        (state) => {
            state.flight.crashedAt =
                timestamp;

            if (
                state.flight.startedAt !==
                null
            ) {
                state.flight.elapsedMs =
                    Math.max(
                        0,
                        timestamp -
                        state.flight.startedAt
                    );
            }
        },
        ["flight"]
    );

    return getState().flight;
}


/* =========================================================
   BET
========================================================= */

function getBet() {
    return clone(
        roundState.bet
    );
}


function hasBet() {
    return (
        roundState.bet.status !==
        BET_STATUS.NONE
    );
}


function hasActiveBet() {
    return (
        roundState.bet.status ===
        BET_STATUS.PLACED ||
        roundState.bet.status ===
        BET_STATUS.ACTIVE
    );
}


/* =========================================================
   SET BET
========================================================= */

function setBet({
    amount,
    transactionId = null,
    placedAt =
        new Date().toISOString()
}) {
    if (
        !isPositiveNumber(
            amount
        )
    ) {
        return {
            success: false,
            reason:
                "INVALID_BET_AMOUNT"
        };
    }

    if (
        roundState.bet.status !==
        BET_STATUS.NONE
    ) {
        return {
            success: false,
            reason:
                "BET_ALREADY_EXISTS"
        };
    }

    updateState(
        (state) => {
            state.bet = {
                status:
                    BET_STATUS.PLACED,

                amount,

                placedAt,

                cancelledAt: null,

                activatedAt: null,

                transactionId
            };

            state.result.wagered =
                amount;
        },
        [
            "bet",
            "result.wagered"
        ]
    );

    return {
        success: true,
        bet:
            getBet()
    };
}


/* =========================================================
   ACTIVATE BET
========================================================= */

function activateBet(
    activatedAt =
        new Date().toISOString()
) {
    if (
        roundState.bet.status !==
        BET_STATUS.PLACED
    ) {
        return {
            success: false,
            reason:
                "BET_NOT_PLACED"
        };
    }

    updateState(
        (state) => {
            state.bet.status =
                BET_STATUS.ACTIVE;

            state.bet.activatedAt =
                activatedAt;
        },
        ["bet"]
    );

    return {
        success: true,
        bet:
            getBet()
    };
}


/* =========================================================
   CANCEL BET
========================================================= */

function markBetCancelled({
    transactionId = null,
    cancelledAt =
        new Date().toISOString()
} = {}) {
    if (
        roundState.bet.status !==
        BET_STATUS.PLACED
    ) {
        return {
            success: false,
            reason:
                "BET_NOT_CANCELLABLE"
        };
    }

    updateState(
        (state) => {
            state.bet.status =
                BET_STATUS.CANCELLED;

            state.bet.cancelledAt =
                cancelledAt;

            if (transactionId) {
                state.bet.transactionId =
                    transactionId;
            }

            state.result.status =
                ROUND_RESULT.REFUND;

            state.result.returned =
                state.bet.amount;

            state.result.profit =
                0;
        },
        [
            "bet",
            "result"
        ]
    );

    return {
        success: true
    };
}


/* =========================================================
   AUTO CASHOUT
========================================================= */

function setAutoCashout({
    enabled,
    targetMultiplier = null
}) {
    if (
        typeof enabled !==
        "boolean"
    ) {
        return {
            success: false,
            reason:
                "INVALID_AUTO_CASHOUT_STATE"
        };
    }

    if (
        enabled &&
        (
            !isFiniteNumber(
                targetMultiplier
            ) ||
            targetMultiplier <= 1
        )
    ) {
        return {
            success: false,
            reason:
                "INVALID_AUTO_CASHOUT_TARGET"
        };
    }

    updateState(
        (state) => {
            state.autoCashout = {
                enabled,

                targetMultiplier:
                    enabled
                        ? targetMultiplier
                        : null
            };
        },
        ["autoCashout"]
    );

    return {
        success: true,

        autoCashout:
            clone(
                roundState.autoCashout
            )
    };
}


/* =========================================================
   CASHOUT
========================================================= */

function hasCashedOut() {
    return (
        roundState
            .cashout
            .completed
    );
}


function markCashedOut({
    multiplier,
    amount,
    profit,
    automatic = false,
    transactionId = null,
    completedAt =
        new Date().toISOString()
}) {
    if (
        roundState.cashout.completed
    ) {
        return {
            success: false,
            reason:
                "ALREADY_CASHED_OUT"
        };
    }

    if (
        roundState.bet.status !==
        BET_STATUS.ACTIVE
    ) {
        return {
            success: false,
            reason:
                "NO_ACTIVE_BET"
        };
    }

    if (
        !isFiniteNumber(
            multiplier
        ) ||
        multiplier < 1
    ) {
        return {
            success: false,
            reason:
                "INVALID_CASHOUT_MULTIPLIER"
        };
    }

    if (
        !isNonNegativeFinite(
            amount
        ) ||
        !isFiniteNumber(
            profit
        )
    ) {
        return {
            success: false,
            reason:
                "INVALID_CASHOUT_VALUES"
        };
    }

    updateState(
        (state) => {
            state.bet.status =
                BET_STATUS.CASHED_OUT;

            state.cashout = {
                completed: true,

                automatic:
                    Boolean(automatic),

                multiplier,

                amount,

                profit,

                completedAt,

                transactionId
            };

            state.result.status =
                ROUND_RESULT.WIN;

            state.result.returned =
                amount;

            state.result.profit =
                profit;
        },
        [
            "bet",
            "cashout",
            "result"
        ]
    );

    return {
        success: true,

        cashout:
            clone(
                roundState.cashout
            )
    };
}


/* =========================================================
   BET LOSS
========================================================= */

function markBetLost() {
    if (
        roundState.bet.status !==
        BET_STATUS.ACTIVE
    ) {
        return {
            success: false,
            reason:
                "NO_ACTIVE_BET"
        };
    }

    if (
        roundState.cashout.completed
    ) {
        return {
            success: false,
            reason:
                "BET_ALREADY_CASHED_OUT"
        };
    }

    updateState(
        (state) => {
            state.bet.status =
                BET_STATUS.LOST;

            state.result.status =
                ROUND_RESULT.LOSS;

            state.result.returned =
                0;

            state.result.profit =
                -state.bet.amount;
        },
        [
            "bet",
            "result"
        ]
    );

    return {
        success: true
    };
}


/* =========================================================
   NO BET RESULT
========================================================= */

function markNoBetResult() {
    if (
        roundState.bet.status !==
        BET_STATUS.NONE
    ) {
        return false;
    }

    updateState(
        (state) => {
            state.result.status =
                ROUND_RESULT.NO_BET;

            state.result.wagered =
                0;

            state.result.returned =
                0;

            state.result.profit =
                0;
        },
        ["result"]
    );

    return true;
}


/* =========================================================
   SETTLEMENT
========================================================= */

function markSettlementCompleted(
    completedAt =
        new Date().toISOString()
) {
    if (
        roundState
            .settlement
            .completed
    ) {
        return {
            success: false,
            reason:
                "SETTLEMENT_ALREADY_COMPLETED"
        };
    }

    updateState(
        (state) => {
            state.settlement = {
                completed: true,
                completedAt
            };
        },
        ["settlement"]
    );

    return {
        success: true
    };
}


/* =========================================================
   METADATA
========================================================= */

function setMetadata(
    key,
    value
) {
    if (
        typeof key !== "string" ||
        key.length === 0
    ) {
        return false;
    }

    updateState(
        (state) => {
            state.metadata[key] =
                cloneSafe(value);
        },
        ["metadata"]
    );

    return true;
}


function getMetadata(
    key = null
) {
    if (key === null) {
        return clone(
            roundState.metadata
        );
    }

    return cloneSafe(
        roundState.metadata[key]
    );
}


/* =========================================================
   ROUND SUMMARY
========================================================= */

function getRoundSummary() {
    return {
        roundId:
            roundState.roundId,

        phase:
            roundState.phase,

        multiplier:
            roundState.multiplier,

        crashMultiplier:
            roundState.crashMultiplier,

        bet:
            clone(
                roundState.bet
            ),

        autoCashout:
            clone(
                roundState.autoCashout
            ),

        cashout:
            clone(
                roundState.cashout
            ),

        result:
            clone(
                roundState.result
            ),

        settlement:
            clone(
                roundState.settlement
            )
    };
}


/* =========================================================
   INTERNAL HELPERS
========================================================= */

function isNonNegativeFinite(
    value
) {
    return (
        isFiniteNumber(value) &&
        value >= 0
    );
}


function cloneSafe(
    value
) {
    if (
        value === undefined
    ) {
        return undefined;
    }

    if (
        value === null
    ) {
        return null;
    }

    try {
        return clone(value);
    } catch {
        return value;
    }
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    GAME_PHASES,
    BET_STATUS,
    ROUND_RESULT,

    createDefaultRoundState,

    getState,
    updateState,
    subscribeToState,

    createRound,
    resetRound,

    getPhase,
    isPhase,
    canTransitionTo,
    setPhase,

    getMultiplier,
    setMultiplier,

    getCrashMultiplier,
    setCrashMultiplier,

    setCountdown,

    markFlightStarted,
    updateFlightElapsed,
    markFlightCrashed,

    getBet,
    hasBet,
    hasActiveBet,

    setBet,
    activateBet,
    markBetCancelled,

    setAutoCashout,

    hasCashedOut,
    markCashedOut,
    markBetLost,
    markNoBetResult,

    markSettlementCompleted,

    setMetadata,
    getMetadata,

    getRoundSummary
};
