/* =========================================================
   CG FLIGHT
   js/game/settlement.js

   Round settlement layer.

   Responsibilities:
   - Settle a round after crash
   - Mark active uncashout bets as losses
   - Handle cashed-out wins
   - Handle no-bet rounds
   - Handle cancelled/refunded bets
   - Transition CRASHED -> SETTLING -> ENDED
   - Produce normalized settlement summary
   - Prevent duplicate settlement

   IMPORTANT:
   This module does NOT:
   - Generate crash multipliers
   - Run flight animation
   - Place bets
   - Perform cashout
   - Persist history
   - Update statistics

   history.js and statistics.js will consume the settlement
   result later.
========================================================= */

import {
    GAME_PHASES,
    BET_STATUS,
    ROUND_RESULT,

    getState,
    getPhase,

    setPhase,

    markBetLost,
    markNoBetResult,
    markSettlementCompleted,

    getRoundSummary
} from "./state.js";

import {
    roundTo,
    clone
} from "../core/utils.js";

import {
    playWin
} from "../core/audio.js";

import {
    subscribeToFlight
} from "./flight.js";


/* =========================================================
   SETTLEMENT CONFIG
========================================================= */

const SETTLEMENT_CONFIG = Object.freeze({

    /*
     Numeric precision used in normalized settlement output.
    */
    DECIMALS: 2
});


/* =========================================================
   INTERNAL RUNTIME
========================================================= */

const runtime = {

    settling: false,

    lastSettlement: null
};


/* =========================================================
   SETTLEMENT LISTENERS
========================================================= */

const settlementListeners =
    new Set();


function subscribeToSettlement(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Settlement listener must be a function."
        );
    }

    settlementListeners.add(
        listener
    );

    return function unsubscribe() {
        settlementListeners.delete(
            listener
        );
    };
}


/* =========================================================
   EMIT SETTLEMENT EVENT
========================================================= */

function emitSettlementEvent(
    type,
    payload = {}
) {
    const event = {
        type,

        timestamp:
            Date.now(),

        ...payload
    };

    for (
        const listener
        of settlementListeners
    ) {
        try {
            listener(
                clone(event)
            );
        } catch (error) {
            console.error(
                "[CG Flight] Settlement listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   NUMBER NORMALIZATION
========================================================= */

function normalizeMoney(
    value
) {
    const numeric =
        Number(value);

    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return 0;
    }

    return roundTo(
        numeric,
        SETTLEMENT_CONFIG.DECIMALS
    );
}


function normalizeMultiplier(
    value
) {
    const numeric =
        Number(value);

    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric < 0
    ) {
        return 0;
    }

    return roundTo(
        numeric,
        2
    );
}


/* =========================================================
   DETERMINE OUTCOME

   Reads current round state and ensures the round has a
   final result.
========================================================= */

function determineRoundOutcome() {
    const state =
        getState();

    const bet =
        state.bet;


    /* -----------------------------------------------------
       Cashed out successfully.
    ----------------------------------------------------- */

    if (
        bet.status ===
            BET_STATUS.CASHED_OUT ||
        state.cashout.completed
    ) {
        return {
            success: true,

            result:
                ROUND_RESULT.WIN
        };
    }


    /* -----------------------------------------------------
       Active bet at crash = loss.
    ----------------------------------------------------- */

    if (
        bet.status ===
        BET_STATUS.ACTIVE
    ) {
        const result =
            markBetLost();

        if (!result.success) {
            return {
                success: false,

                reason:
                    result.reason
            };
        }

        return {
            success: true,

            result:
                ROUND_RESULT.LOSS
        };
    }


    /* -----------------------------------------------------
       No bet placed.
    ----------------------------------------------------- */

    if (
        bet.status ===
        BET_STATUS.NONE
    ) {
        const success =
            markNoBetResult();

        if (!success) {
            return {
                success: false,

                reason:
                    "NO_BET_RESULT_FAILED"
            };
        }

        return {
            success: true,

            result:
                ROUND_RESULT.NO_BET
        };
    }


    /* -----------------------------------------------------
       Cancelled bet.

       markBetCancelled() already sets result to REFUND.
    ----------------------------------------------------- */

    if (
        bet.status ===
        BET_STATUS.CANCELLED ||
        bet.status ===
        BET_STATUS.REFUNDED
    ) {
        return {
            success: true,

            result:
                ROUND_RESULT.REFUND
        };
    }


    /* -----------------------------------------------------
       PLACED bet should normally have been activated before
       flight starts.

       If it survives until settlement, treat this as an
       inconsistent state instead of silently charging the
       player as a loss.
    ----------------------------------------------------- */

    if (
        bet.status ===
        BET_STATUS.PLACED
    ) {
        return {
            success: false,

            reason:
                "UNACTIVATED_BET_AT_SETTLEMENT"
        };
    }


    return {
        success: false,

        reason:
            "UNKNOWN_BET_STATE",

        betStatus:
            bet.status
    };
}


/* =========================================================
   BUILD SETTLEMENT RECORD

   Produces a normalized object suitable for:
   - statistics.js
   - history.js
   - game UI
========================================================= */

function buildSettlementRecord(
    state = getState()
) {
    const wagered =
        normalizeMoney(
            state.result.wagered
        );

    const returned =
        normalizeMoney(
            state.result.returned
        );

    const profit =
        normalizeMoney(
            state.result.profit
        );


    return {

        roundId:
            state.roundId,

        result:
            state.result.status,

        phase:
            state.phase,

        crashMultiplier:
            normalizeMultiplier(
                state.crashMultiplier
            ),

        finalMultiplier:
            normalizeMultiplier(
                state.multiplier
            ),


        /* -------------------------------------------------
           Bet
        -------------------------------------------------- */

        bet: {
            status:
                state.bet.status,

            amount:
                normalizeMoney(
                    state.bet.amount
                ),

            placedAt:
                state.bet.placedAt,

            activatedAt:
                state.bet.activatedAt,

            cancelledAt:
                state.bet.cancelledAt,

            transactionId:
                state.bet.transactionId
        },


        /* -------------------------------------------------
           Auto Cash Out
        -------------------------------------------------- */

        autoCashout: {
            enabled:
                Boolean(
                    state.autoCashout
                        .enabled
                ),

            targetMultiplier:
                state.autoCashout
                    .targetMultiplier ===
                    null
                    ? null
                    : normalizeMultiplier(
                        state.autoCashout
                            .targetMultiplier
                    )
        },


        /* -------------------------------------------------
           Cash Out
        -------------------------------------------------- */

        cashout: {
            completed:
                Boolean(
                    state.cashout
                        .completed
                ),

            automatic:
                Boolean(
                    state.cashout
                        .automatic
                ),

            multiplier:
                state.cashout
                    .multiplier ===
                    null
                    ? null
                    : normalizeMultiplier(
                        state.cashout
                            .multiplier
                    ),

            amount:
                normalizeMoney(
                    state.cashout
                        .amount
                ),

            profit:
                normalizeMoney(
                    state.cashout
                        .profit
                ),

            completedAt:
                state.cashout
                    .completedAt,

            transactionId:
                state.cashout
                    .transactionId
        },


        /* -------------------------------------------------
           Financial result
        -------------------------------------------------- */

        financial: {
            wagered,
            returned,
            profit,

            won:
                profit > 0,

            lost:
                profit < 0,

            neutral:
                profit === 0
        },


        /* -------------------------------------------------
           Timing
        -------------------------------------------------- */

        timing: {
            countdownStartedAt:
                state.countdown
                    .startedAt,

            countdownEndsAt:
                state.countdown
                    .endsAt,

            flightStartedAt:
                state.flight
                    .startedAt,

            crashedAt:
                state.flight
                    .crashedAt,

            flightElapsedMs:
                Math.max(
                    0,
                    Number(
                        state.flight
                            .elapsedMs
                    ) || 0
                )
        },


        /* -------------------------------------------------
           Settlement
        -------------------------------------------------- */

        settlement: {
            completed:
                Boolean(
                    state.settlement
                        .completed
                ),

            completedAt:
                state.settlement
                    .completedAt
        },


        metadata:
            clone(
                state.metadata
            )
    };
}


/* =========================================================
   VALIDATE SETTLEMENT PHASE
========================================================= */

function canSettleRound() {
    const state =
        getState();


    if (
        runtime.settling
    ) {
        return {
            allowed: false,

            reason:
                "SETTLEMENT_IN_PROGRESS"
        };
    }


    if (
        state.settlement.completed
    ) {
        return {
            allowed: false,

            reason:
                "SETTLEMENT_ALREADY_COMPLETED"
        };
    }


    if (
        state.phase !==
        GAME_PHASES.CRASHED
    ) {
        return {
            allowed: false,

            reason:
                "ROUND_NOT_CRASHED",

            phase:
                state.phase
        };
    }


    return {
        allowed: true
    };
}


/* =========================================================
   SETTLE ROUND

   Main settlement entry point.
========================================================= */

function settleRound() {
    const validation =
        canSettleRound();


    if (!validation.allowed) {

        /*
         If already settled, return the cached settlement
         when available instead of creating another one.
        */

        if (
            validation.reason ===
                "SETTLEMENT_ALREADY_COMPLETED" &&
            runtime.lastSettlement
        ) {
            return {
                success: true,

                alreadySettled: true,

                settlement:
                    clone(
                        runtime.lastSettlement
                    )
            };
        }


        return {
            success: false,

            ...validation
        };
    }


    runtime.settling =
        true;


    emitSettlementEvent(
        "SETTLEMENT_START",
        {
            roundId:
                getState()
                    .roundId
        }
    );


    try {

        /* -------------------------------------------------
           CRASHED -> SETTLING
        -------------------------------------------------- */

        const phaseResult =
            setPhase(
                GAME_PHASES.SETTLING
            );


        if (!phaseResult.success) {
            return {
                success: false,

                reason:
                    phaseResult.reason
            };
        }


        /* -------------------------------------------------
           Determine final bet outcome.
        -------------------------------------------------- */

        const outcome =
            determineRoundOutcome();


        if (!outcome.success) {
            return {
                success: false,

                reason:
                    outcome.reason,

                betStatus:
                    outcome.betStatus
            };
        }


        /* -------------------------------------------------
           Mark settlement completed.
        -------------------------------------------------- */

        const completionResult =
            markSettlementCompleted();


        if (!completionResult.success) {
            return {
                success: false,

                reason:
                    completionResult.reason
            };
        }


        /* -------------------------------------------------
           SETTLING -> ENDED
        -------------------------------------------------- */

        const endPhaseResult =
            setPhase(
                GAME_PHASES.ENDED
            );


        if (!endPhaseResult.success) {
            return {
                success: false,

                reason:
                    endPhaseResult.reason
            };
        }


        /* -------------------------------------------------
           Build final normalized record.
        -------------------------------------------------- */

        const settlement =
            buildSettlementRecord(
                getState()
            );


        runtime.lastSettlement =
            clone(
                settlement
            );


        /* -------------------------------------------------
           Win sound.

           Cashout sound already played at the moment of
           cashout. This is the final success confirmation.
        -------------------------------------------------- */

        if (
            settlement.result ===
            ROUND_RESULT.WIN
        ) {
            playWin();
        }


        emitSettlementEvent(
            "SETTLEMENT_COMPLETE",
            {
                settlement:
                    clone(
                        settlement
                    )
            }
        );


        return {
            success: true,

            alreadySettled:
                false,

            settlement
        };

    } catch (error) {

        console.error(
            "[CG Flight] Settlement failed:",
            error
        );


        emitSettlementEvent(
            "SETTLEMENT_ERROR",
            {
                error,

                roundId:
                    getState()
                        .roundId
            }
        );


        return {
            success: false,

            reason:
                "SETTLEMENT_EXCEPTION",

            error
        };

    } finally {

        runtime.settling =
            false;
    }
}


/* =========================================================
   GET LAST SETTLEMENT
========================================================= */

function getLastSettlement() {
    return runtime.lastSettlement
        ? clone(
            runtime.lastSettlement
        )
        : null;
}


/* =========================================================
   GET CURRENT SETTLEMENT PREVIEW

   Does not change state.

   Useful before the final settlement call.
========================================================= */

function getSettlementPreview() {
    const state =
        getState();


    return {

        roundId:
            state.roundId,

        phase:
            state.phase,

        settlementCompleted:
            state.settlement
                .completed,

        betStatus:
            state.bet
                .status,

        resultStatus:
            state.result
                .status,

        wagered:
            normalizeMoney(
                state.result
                    .wagered
            ),

        returned:
            normalizeMoney(
                state.result
                    .returned
            ),

        profit:
            normalizeMoney(
                state.result
                    .profit
            ),

        crashMultiplier:
            normalizeMultiplier(
                state.crashMultiplier
            ),

        cashoutCompleted:
            state.cashout
                .completed,

        cashoutMultiplier:
            state.cashout
                .multiplier
    };
}


/* =========================================================
   RESET SETTLEMENT RUNTIME

   Call when beginning a new round.
========================================================= */

function resetSettlementRuntime() {
    runtime.settling =
        false;

    runtime.lastSettlement =
        null;

    return true;
}


/* =========================================================
   AUTO SETTLEMENT ON CRASH

   flight.js emits CRASH after state has transitioned to
   GAME_PHASES.CRASHED.

   Therefore settlement can begin immediately afterward.
========================================================= */

subscribeToFlight(
    (event) => {

        if (
            event.type !==
            "CRASH"
        ) {
            return;
        }


        const result =
            settleRound();


        if (!result.success) {
            console.error(
                "[CG Flight] Automatic settlement failed:",
                result
            );
        }
    }
);


/* =========================================================
   ROUND SUMMARY HELPER

   Exposes state.js summary for debugging alongside settlement.
========================================================= */

function getSettlementDebugState() {
    return {
        runtime: {
            settling:
                runtime.settling,

            hasLastSettlement:
                runtime.lastSettlement !==
                null
        },

        round:
            getRoundSummary(),

        settlement:
            getLastSettlement()
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    SETTLEMENT_CONFIG,

    canSettleRound,
    settleRound,

    buildSettlementRecord,

    getSettlementPreview,
    getLastSettlement,

    resetSettlementRuntime,

    subscribeToSettlement,

    getSettlementDebugState
};
