/* =========================================================
   CG FLIGHT
   js/game/settlement.js

   Final round settlement controller.

   Responsibilities:
   - Determine final round result
   - Settle normal WIN / LOSS / NO_BET rounds
   - Refund unsettled bets when a round must be aborted
   - Build canonical round record
   - Complete state.js settlement
   - Persist History
   - Record Statistics
   - Prevent duplicate settlement
   - Publish settlement events

   IMPORTANT:
   Normal WIN money is already credited by cashout.js.

   settlement.js must NOT credit a successful Cash Out again.
========================================================= */


import {
    GAME_PHASES,
    BET_STATUS,
    ROUND_RESULT,

    getState,

    markBetRefunded,

    beginSettlement,
    completeSettlement
} from "./state.js";


import {
    creditSettlementRefund
} from "../core/wallet.js";


import {
    addHistoryEntry
} from "./history.js";


import {
    recordRoundStatistics
} from "./statistics.js";


import {
    clone,
    roundTo,
    createId
} from "../core/utils.js";


/* =========================================================
   SETTLEMENT CONFIG
========================================================= */

const SETTLEMENT_CONFIG = Object.freeze({

    DECIMALS:
        2
});


/* =========================================================
   SETTLEMENT EVENT TYPES
========================================================= */

const SETTLEMENT_EVENT_TYPES =
    Object.freeze({

        SETTLEMENT_STARTED:
            "SETTLEMENT_STARTED",

        SETTLEMENT_COMPLETED:
            "SETTLEMENT_COMPLETED",

        SETTLEMENT_REJECTED:
            "SETTLEMENT_REJECTED",

        ROUND_REFUNDED:
            "ROUND_REFUNDED"
    });


/* =========================================================
   RUNTIME
========================================================= */

const runtime = {

    processing:
        false,

    settledRoundIds:
        new Set()
};


/* =========================================================
   LISTENERS
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
   NOTIFY
========================================================= */

function notifySettlementListeners(
    event
) {

    const payload = {

        ...clone(event),

        timestamp:
            event.timestamp ??
            Date.now()
    };


    for (
        const listener
        of settlementListeners
    ) {

        try {

            listener(
                payload
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
   MONEY NORMALIZER
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
        SETTLEMENT_CONFIG
            .DECIMALS
    );
}


/* =========================================================
   DETERMINE NORMAL ROUND RESULT

   Normal round outcomes:

   CASHED_OUT
       -> WIN

   LOST
       -> LOSS

   NONE / CANCELLED
       -> NO_BET

   REFUNDED
       -> REFUND
========================================================= */

function determineRoundResult(
    state =
        getState()
) {

    switch (
        state.bet.status
    ) {

        case BET_STATUS.CASHED_OUT:

            return ROUND_RESULT.WIN;


        case BET_STATUS.LOST:

            return ROUND_RESULT.LOSS;


        case BET_STATUS.REFUNDED:

            return ROUND_RESULT.REFUND;


        case BET_STATUS.NONE:

        case BET_STATUS.CANCELLED:

            return ROUND_RESULT.NO_BET;


        default:

            return null;
    }
}


/* =========================================================
   CALCULATE FINANCIAL RESULT
========================================================= */

function calculateFinancialResult(
    state,
    result
) {

    const betAmount =
        normalizeMoney(
            state.bet.amount
        );


    switch (result) {

        /* -------------------------------------------------
           WIN

           Bet was already deducted when placed.
           Full return was already credited by cashout.js.
        -------------------------------------------------- */

        case ROUND_RESULT.WIN: {

            const returned =
                normalizeMoney(
                    state.cashout.amount
                );


            return {

                wagered:
                    betAmount,

                returned,

                profit:
                    normalizeMoney(
                        returned -
                        betAmount
                    )
            };
        }


        /* -------------------------------------------------
           LOSS

           Bet was deducted and never returned.
        -------------------------------------------------- */

        case ROUND_RESULT.LOSS:

            return {

                wagered:
                    betAmount,

                returned:
                    0,

                profit:
                    normalizeMoney(
                        -betAmount
                    )
            };


        /* -------------------------------------------------
           REFUND

           Original wager is returned in full.
           Profit is zero.
        -------------------------------------------------- */

        case ROUND_RESULT.REFUND:

            return {

                wagered:
                    betAmount,

                returned:
                    betAmount,

                profit:
                    0
            };


        /* -------------------------------------------------
           NO BET
        -------------------------------------------------- */

        case ROUND_RESULT.NO_BET:

        default:

            return {

                wagered:
                    0,

                returned:
                    0,

                profit:
                    0
            };
    }
}


/* =========================================================
   BUILD ROUND RECORD

   This is the canonical persisted History representation.
========================================================= */

function buildRoundRecord(
    state,
    {
        result,
        financial,
        recordId = null,
        recordedAt = null
    }
) {

    const finalRecordId =
        recordId ??
        createId(
            "record"
        );


    const finalRecordedAt =
        recordedAt ??
        new Date()
            .toISOString();


    return {

        /* -------------------------------------------------
           Identity
        -------------------------------------------------- */

        recordId:
            finalRecordId,

        roundId:
            state.roundId,

        recordedAt:
            finalRecordedAt,


        /* -------------------------------------------------
           Result
        -------------------------------------------------- */

        result,


        /* -------------------------------------------------
           Crash
        -------------------------------------------------- */

        crashMultiplier:
            state.flight
                .crashMultiplier !==
            null
                ? roundTo(
                    state.flight
                        .crashMultiplier,
                    2
                )
                : null,


        /* -------------------------------------------------
           Bet summary
        -------------------------------------------------- */

        betAmount:
            normalizeMoney(
                state.bet.amount
            ),

        hasBet:
            [
                BET_STATUS.ACTIVE,
                BET_STATUS.CASHED_OUT,
                BET_STATUS.LOST,
                BET_STATUS.REFUNDED
            ].includes(
                state.bet.status
            ),

        betStatus:
            state.bet.status,


        /* -------------------------------------------------
           Cash Out summary

           Fields here are intentionally flat because
           History table/filtering reads these frequently.
        -------------------------------------------------- */

        cashoutMultiplier:
            state.cashout.completed &&
            state.cashout.multiplier !==
                null
                ? roundTo(
                    state.cashout
                        .multiplier,
                    2
                )
                : null,

        automaticCashout:
            state.cashout.completed
                ? Boolean(
                    state.cashout
                        .automatic
                )
                : false,

        cashoutType:
            state.cashout.type,


        /* -------------------------------------------------
           Financial summary
        -------------------------------------------------- */

        wagered:
            financial.wagered,

        returned:
            financial.returned,

        profit:
            financial.profit,


        /* -------------------------------------------------
           Full detail

           Kept for getPlayerRoundDetail().
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

            refundedAt:
                state.bet.refundedAt,

            transactionId:
                state.bet
                    .transactionId,

            refundTransactionId:
                state.bet
                    .refundTransactionId
        },


        autoCashout: {

            enabled:
                Boolean(
                    state.autoCashout
                        .enabled
                ),

            targetMultiplier:
                state.autoCashout
                    .targetMultiplier !==
                null
                    ? roundTo(
                        state.autoCashout
                            .targetMultiplier,
                        2
                    )
                    : null
        },


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

            type:
                state.cashout.type,

            multiplier:
                state.cashout
                    .multiplier !==
                null
                    ? roundTo(
                        state.cashout
                            .multiplier,
                        2
                    )
                    : null,

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


        financial: {

            wagered:
                financial.wagered,

            returned:
                financial.returned,

            profit:
                financial.profit
        },


        timing: {

            roundCreatedAt:
                state.createdAt,

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
                ),

            settledAt:
                finalRecordedAt
        },


        /*
         statistics.js may add:

             statisticsRecorded
             statisticsRecordedAt

         storage.js intentionally preserves unknown History
         fields.
        */
        statisticsRecorded:
            false,

        statisticsRecordedAt:
            null
    };
}


/* =========================================================
   CAN NORMAL SETTLE
========================================================= */

function canSettleRound(
    state =
        getState()
) {

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
        state.settlement.completed
    ) {

        return {
            valid: false,

            reason:
                "ALREADY_SETTLED"
        };
    }


    if (
        runtime.processing
    ) {

        return {
            valid: false,

            reason:
                "SETTLEMENT_PROCESSING"
        };
    }


    if (
        runtime.settledRoundIds.has(
            state.roundId
        )
    ) {

        return {
            valid: false,

            reason:
                "ROUND_ALREADY_RECORDED"
        };
    }


    const result =
        determineRoundResult(
            state
        );


    if (!result) {

        return {
            valid: false,

            reason:
                "ROUND_NOT_SETTLEABLE",

            betStatus:
                state.bet.status
        };
    }


    /*
     A normal WIN or LOSS should occur only after Crash.

     NO_BET can also settle after Crash.

     REFUND may be finalized through the refund path.
    */

    if (
        [
            ROUND_RESULT.WIN,
            ROUND_RESULT.LOSS,
            ROUND_RESULT.NO_BET
        ].includes(
            result
        ) &&
        state.phase !==
            GAME_PHASES.CRASHED
    ) {

        return {
            valid: false,

            reason:
                "ROUND_NOT_CRASHED",

            phase:
                state.phase
        };
    }


    return {
        valid: true,

        result
    };
}


/* =========================================================
   PERSIST FINAL RECORD

   Common finalization path used by normal settlement and
   refund settlement.
========================================================= */

function persistFinalRecord({
    state,
    result,
    financial
}) {

    const record =
        buildRoundRecord(
            state,
            {
                result,
                financial
            }
        );


    /* -----------------------------------------------------
       History first.

       If History cannot persist, do not mark State ENDED.
    ----------------------------------------------------- */

    const historyResult =
        addHistoryEntry(
            record
        );


    if (
        !historyResult ||
        historyResult.success ===
            false
    ) {

        return {
            success: false,

            reason:
                "HISTORY_WRITE_FAILED",

            historyReason:
                historyResult
                    ?.reason ??
                null
        };
    }


    /* -----------------------------------------------------
       Statistics

       statistics.js should mark this History entry as
       statisticsRecorded to prevent double counting.
    ----------------------------------------------------- */

    const statisticsResult =
        recordRoundStatistics(
            record.roundId
        );


    if (
        !statisticsResult ||
        statisticsResult.success ===
            false
    ) {

        /*
         History already exists.

         Do not insert it again on retry.

         statistics.js should be idempotent by roundId and
         statisticsRecorded marker.
        */

        return {
            success: false,

            reason:
                "STATISTICS_RECORD_FAILED",

            statisticsReason:
                statisticsResult
                    ?.reason ??
                null,

            record
        };
    }


    /* -----------------------------------------------------
       Complete in-memory State last.
    ----------------------------------------------------- */

    const settlementResult =
        completeSettlement({

            result,

            wagered:
                financial.wagered,

            returned:
                financial.returned,

            profit:
                financial.profit,

            recordId:
                record.recordId,

            completedAt:
                record.recordedAt
        });


    if (
        !settlementResult.success
    ) {

        return {
            success: false,

            reason:
                "STATE_SETTLEMENT_FAILED",

            record
        };
    }


    runtime.settledRoundIds.add(
        record.roundId
    );


    return {
        success: true,

        record,

        statistics:
            statisticsResult,

        state:
            settlementResult.state
    };
}


/* =========================================================
   SETTLE ROUND

   Normal Crash-completed settlement.
========================================================= */

function settleRound() {

    const initialState =
        getState();


    const validation =
        canSettleRound(
            initialState
        );


    if (
        !validation.valid
    ) {

        notifySettlementListeners({

            type:
                SETTLEMENT_EVENT_TYPES
                    .SETTLEMENT_REJECTED,

            roundId:
                initialState.roundId,

            reason:
                validation.reason
        });


        return {
            success: false,

            reason:
                validation.reason
        };
    }


    runtime.processing =
        true;


    try {

        notifySettlementListeners({

            type:
                SETTLEMENT_EVENT_TYPES
                    .SETTLEMENT_STARTED,

            roundId:
                initialState.roundId,

            result:
                validation.result
        });


        beginSettlement();


        /*
         beginSettlement() changes phase to SETTLING, so read
         the latest State again for the canonical snapshot.
        */

        const state =
            getState();


        const result =
            validation.result;


        const financial =
            calculateFinancialResult(
                state,
                result
            );


        const persisted =
            persistFinalRecord({

                state,
                result,
                financial
            });


        if (
            !persisted.success
        ) {

            notifySettlementListeners({

                type:
                    SETTLEMENT_EVENT_TYPES
                        .SETTLEMENT_REJECTED,

                roundId:
                    state.roundId,

                reason:
                    persisted.reason
            });


            return persisted;
        }


        notifySettlementListeners({

            type:
                SETTLEMENT_EVENT_TYPES
                    .SETTLEMENT_COMPLETED,

            roundId:
                state.roundId,

            result,

            financial:
                clone(
                    financial
                ),

            record:
                clone(
                    persisted.record
                )
        });


        return {

            success: true,

            result,

            financial:
                clone(
                    financial
                ),

            record:
                clone(
                    persisted.record
                )
        };

    } finally {

        runtime.processing =
            false;
    }
}


/* =========================================================
   CAN REFUND CURRENT BET

   Refund is for abnormal round termination, not normal
   player cancellation.

   Eligible states:
   - PLACED
   - ACTIVE

   CASHED_OUT must never be refunded.
   LOST must never be refunded after legitimate Crash.
========================================================= */

function canRefundRound(
    state =
        getState()
) {

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
        state.settlement.completed
    ) {

        return {
            valid: false,

            reason:
                "ALREADY_SETTLED"
        };
    }


    if (
        runtime.processing
    ) {

        return {
            valid: false,

            reason:
                "SETTLEMENT_PROCESSING"
        };
    }


    if (
        ![
            BET_STATUS.PLACED,
            BET_STATUS.ACTIVE
        ].includes(
            state.bet.status
        )
    ) {

        return {
            valid: false,

            reason:
                "NO_REFUNDABLE_BET",

            betStatus:
                state.bet.status
        };
    }


    const amount =
        normalizeMoney(
            state.bet.amount
        );


    if (
        amount <= 0
    ) {

        return {
            valid: false,

            reason:
                "INVALID_BET_AMOUNT"
        };
    }


    return {
        valid: true,
        amount
    };
}


/* =========================================================
   REFUND ROUND

   Used when runtime must terminate a round without a valid
   Crash result.

   Example:
       flight.js emits FLIGHT_ABORTED
       ↓
       page/game coordinator calls refundRound()
========================================================= */

function refundRound(
    reason =
        "ROUND_ABORTED"
) {

    const initialState =
        getState();


    const validation =
        canRefundRound(
            initialState
        );


    if (
        !validation.valid
    ) {

        return {
            success: false,

            reason:
                validation.reason
        };
    }


    runtime.processing =
        true;


    try {

        const refundResult =
            creditSettlementRefund(
                validation.amount,
                {
                    roundId:
                        initialState
                            .roundId,

                    reason
                }
            );


        if (
            !refundResult.success
        ) {

            return {
                success: false,

                reason:
                    "REFUND_CREDIT_FAILED",

                walletReason:
                    refundResult.reason
            };
        }


        const refundedState =
            markBetRefunded({

                refundTransactionId:
                    refundResult
                        .transactionId
            });


        if (!refundedState) {

            return {
                success: false,

                reason:
                    "REFUND_STATE_UPDATE_FAILED",

                refunded:
                    validation.amount,

                transactionId:
                    refundResult
                        .transactionId
            };
        }


        beginSettlement();


        const state =
            getState();


        const result =
            ROUND_RESULT.REFUND;


        const financial =
            calculateFinancialResult(
                state,
                result
            );


        const persisted =
            persistFinalRecord({

                state,
                result,
                financial
            });


        if (
            !persisted.success
        ) {

            return persisted;
        }


        notifySettlementListeners({

            type:
                SETTLEMENT_EVENT_TYPES
                    .ROUND_REFUNDED,

            roundId:
                state.roundId,

            reason,

            amount:
                validation.amount,

            transactionId:
                refundResult
                    .transactionId,

            record:
                clone(
                    persisted.record
                )
        });


        notifySettlementListeners({

            type:
                SETTLEMENT_EVENT_TYPES
                    .SETTLEMENT_COMPLETED,

            roundId:
                state.roundId,

            result,

            financial:
                clone(
                    financial
                ),

            record:
                clone(
                    persisted.record
                )
        });


        return {

            success: true,

            result,

            refunded:
                validation.amount,

            financial:
                clone(
                    financial
                ),

            record:
                clone(
                    persisted.record
                )
        };

    } finally {

        runtime.processing =
            false;
    }
}


/* =========================================================
   SETTLE NO-BET ABORT

   If a round aborts but there was never an active wager,
   we can still save a NO_BET record if desired.

   This is optional for the page coordinator.
========================================================= */

function settleNoBetRound(
    reason =
        "ROUND_ABORTED_NO_BET"
) {

    const state =
        getState();


    if (
        !state.roundId
    ) {

        return {
            success: false,

            reason:
                "NO_ACTIVE_ROUND"
        };
    }


    if (
        state.settlement.completed
    ) {

        return {
            success: false,

            reason:
                "ALREADY_SETTLED"
        };
    }


    if (
        ![
            BET_STATUS.NONE,
            BET_STATUS.CANCELLED
        ].includes(
            state.bet.status
        )
    ) {

        return {
            success: false,

            reason:
                "ROUND_HAS_SETTLEABLE_BET"
        };
    }


    runtime.processing =
        true;


    try {

        beginSettlement();


        const latest =
            getState();


        const result =
            ROUND_RESULT.NO_BET;


        const financial =
            calculateFinancialResult(
                latest,
                result
            );


        const persisted =
            persistFinalRecord({

                state:
                    latest,

                result,

                financial
            });


        if (
            !persisted.success
        ) {
            return persisted;
        }


        notifySettlementListeners({

            type:
                SETTLEMENT_EVENT_TYPES
                    .SETTLEMENT_COMPLETED,

            roundId:
                latest.roundId,

            result,

            reason,

            financial:
                clone(
                    financial
                ),

            record:
                clone(
                    persisted.record
                )
        });


        return {

            success: true,

            result,

            financial:
                clone(
                    financial
                ),

            record:
                clone(
                    persisted.record
                )
        };

    } finally {

        runtime.processing =
            false;
    }
}


/* =========================================================
   GET SETTLEMENT PREVIEW
========================================================= */

function getSettlementPreview() {

    const state =
        getState();


    const result =
        determineRoundResult(
            state
        );


    if (!result) {

        return {

            settleable:
                false,

            result:
                null,

            reason:
                "ROUND_NOT_SETTLEABLE"
        };
    }


    const financial =
        calculateFinancialResult(
            state,
            result
        );


    return {

        settleable:
            true,

        result,

        financial:
            clone(
                financial
            )
    };
}


/* =========================================================
   GET SETTLEMENT STATUS
========================================================= */

function getSettlementStatus() {

    const state =
        getState();


    return {

        roundId:
            state.roundId,

        phase:
            state.phase,

        processing:
            runtime.processing,

        completed:
            state.settlement
                .completed,

        result:
            state.settlement.result,

        wagered:
            state.settlement
                .wagered,

        returned:
            state.settlement
                .returned,

        profit:
            state.settlement
                .profit,

        recordId:
            state.settlement
                .recordId,

        completedAt:
            state.settlement
                .completedAt
    };
}


/* =========================================================
   RESET SETTLEMENT RUNTIME

   Called before a fresh round.

   The Set is intentionally retained for the current page
   lifetime to protect against duplicate persistence if stale
   callbacks try to settle an old round again.
========================================================= */

function resetSettlementRuntime() {

    runtime.processing =
        false;


    return true;
}


/* =========================================================
   FULL DEVELOPMENT RESET
========================================================= */

function clearSettledRoundRuntimeCache() {

    runtime.processing =
        false;


    runtime.settledRoundIds.clear();


    return true;
}


/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

function settle() {

    return settleRound();
}


function refundSettlement(
    reason
) {

    return refundRound(
        reason
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    SETTLEMENT_CONFIG,
    SETTLEMENT_EVENT_TYPES,

    determineRoundResult,
    calculateFinancialResult,
    buildRoundRecord,

    canSettleRound,
    settleRound,

    canRefundRound,
    refundRound,

    settleNoBetRound,

    getSettlementPreview,
    getSettlementStatus,

    resetSettlementRuntime,
    clearSettledRoundRuntimeCache,

    subscribeToSettlement,

    /* Compatibility */
    settle,
    refundSettlement
};
