/* =========================================================
   CG FLIGHT
   js/game/statistics.js

   Persistent statistics layer.

   Responsibilities:
   - Consume completed settlement records
   - Update persistent player statistics
   - Count completed rounds
   - Count valid bets
   - Track wagered / returned coins
   - Track gross profit / gross loss
   - Track cashout / crash-loss counts
   - Track highest multipliers
   - Track highest single-round win
   - Produce derived statistics
   - Automatically record completed settlements

   IMPORTANT:
   This module does NOT:
   - Perform settlement
   - Modify wallet balance
   - Write round history
   - Generate crash results
========================================================= */

import {
    getData,
    updateData
} from "../core/storage.js";

import {
    ROUND_RESULT
} from "./state.js";

import {
    subscribeToSettlement
} from "./settlement.js";

import {
    roundTo,
    clone,
    isFiniteNumber
} from "../core/utils.js";


/* =========================================================
   STATISTICS CONFIG
========================================================= */

const STATISTICS_CONFIG = Object.freeze({

    DECIMALS: 2
});


/* =========================================================
   DEFAULT STATISTICS

   Must remain compatible with storage.js.
========================================================= */

const DEFAULT_STATISTICS = Object.freeze({

    totalRounds: 0,

    totalBets: 0,

    totalWagered: 0,

    totalReturned: 0,

    /*
     Gross positive profit from winning rounds.
    */
    totalProfit: 0,

    /*
     Gross loss stored as a positive number.

     Example:
     Lose 1000 coins
     totalLoss += 1000
    */
    totalLoss: 0,

    cashoutCount: 0,

    crashLossCount: 0,

    highestCashoutMultiplier: 0,

    highestCrashMultiplier: 0,

    /*
     Highest net profit from one winning round.

     Example:
     Bet 1000
     Return 3500
     Profit 2500

     highestSingleWin = 2500
    */
    highestSingleWin: 0
});


/* =========================================================
   SESSION DUPLICATE GUARD

   settlement.js itself prevents normal duplicate settlement,
   but statistics.js also keeps a session-level Round ID set
   so accidental repeated calls cannot immediately count the
   same settlement twice.

   Persistent round deduplication will later also be covered
   by history.js.
========================================================= */

const processedRoundIds =
    new Set();


/* =========================================================
   STATISTICS LISTENERS
========================================================= */

const statisticsListeners =
    new Set();


function subscribeToStatistics(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Statistics listener must be a function."
        );
    }

    statisticsListeners.add(
        listener
    );

    return function unsubscribe() {
        statisticsListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY LISTENERS
========================================================= */

function notifyStatisticsListeners(
    previous,
    statistics,
    settlement = null
) {
    const payload = {

        previous:
            clone(previous),

        statistics:
            clone(statistics),

        settlement:
            settlement
                ? clone(settlement)
                : null
    };


    for (
        const listener
        of statisticsListeners
    ) {
        try {
            listener(
                payload
            );
        } catch (error) {
            console.error(
                "[CG Flight] Statistics listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function normalizeNumber(
    value,
    fallback = 0
) {
    const numeric =
        Number(value);

    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return fallback;
    }

    return roundTo(
        numeric,
        STATISTICS_CONFIG.DECIMALS
    );
}


function normalizeNonNegativeNumber(
    value,
    fallback = 0
) {
    return Math.max(
        0,
        normalizeNumber(
            value,
            fallback
        )
    );
}


function normalizeNonNegativeInteger(
    value,
    fallback = 0
) {
    const numeric =
        Number(value);

    if (
        !Number.isInteger(
            numeric
        ) ||
        numeric < 0
    ) {
        return fallback;
    }

    return numeric;
}


/* =========================================================
   SANITIZE STATISTICS
========================================================= */

function sanitizeStatistics(
    statistics
) {
    const source =
        statistics &&
        typeof statistics === "object" &&
        !Array.isArray(statistics)
            ? statistics
            : {};


    return {

        totalRounds:
            normalizeNonNegativeInteger(
                source.totalRounds
            ),

        totalBets:
            normalizeNonNegativeInteger(
                source.totalBets
            ),

        totalWagered:
            normalizeNonNegativeNumber(
                source.totalWagered
            ),

        totalReturned:
            normalizeNonNegativeNumber(
                source.totalReturned
            ),

        totalProfit:
            normalizeNonNegativeNumber(
                source.totalProfit
            ),

        totalLoss:
            normalizeNonNegativeNumber(
                source.totalLoss
            ),

        cashoutCount:
            normalizeNonNegativeInteger(
                source.cashoutCount
            ),

        crashLossCount:
            normalizeNonNegativeInteger(
                source.crashLossCount
            ),

        highestCashoutMultiplier:
            normalizeNonNegativeNumber(
                source.highestCashoutMultiplier
            ),

        highestCrashMultiplier:
            normalizeNonNegativeNumber(
                source.highestCrashMultiplier
            ),

        highestSingleWin:
            normalizeNonNegativeNumber(
                source.highestSingleWin
            )
    };
}


/* =========================================================
   GET STATISTICS
========================================================= */

function getStatistics() {
    const data =
        getData();

    return sanitizeStatistics(
        data.statistics
    );
}


/* =========================================================
   VALIDATE SETTLEMENT RECORD
========================================================= */

function validateSettlement(
    settlement
) {
    if (
        !settlement ||
        typeof settlement !== "object" ||
        Array.isArray(settlement)
    ) {
        return {
            valid: false,

            reason:
                "INVALID_SETTLEMENT"
        };
    }


    if (
        typeof settlement.roundId !==
            "string" ||
        settlement.roundId.length === 0
    ) {
        return {
            valid: false,

            reason:
                "INVALID_ROUND_ID"
        };
    }


    const validResults =
        Object.values(
            ROUND_RESULT
        );


    if (
        !validResults.includes(
            settlement.result
        ) ||
        settlement.result ===
            ROUND_RESULT.NONE
    ) {
        return {
            valid: false,

            reason:
                "INVALID_RESULT"
        };
    }


    if (
        !settlement.financial ||
        typeof settlement.financial !==
            "object"
    ) {
        return {
            valid: false,

            reason:
                "MISSING_FINANCIAL_DATA"
        };
    }


    const financialValues = [
        settlement.financial.wagered,
        settlement.financial.returned,
        settlement.financial.profit
    ];


    if (
        financialValues.some(
            (value) =>
                !isFiniteNumber(
                    Number(value)
                )
        )
    ) {
        return {
            valid: false,

            reason:
                "INVALID_FINANCIAL_DATA"
        };
    }


    return {
        valid: true
    };
}


/* =========================================================
   IS VALID BET RESULT

   WIN and LOSS represent completed risk-bearing bets.

   REFUND is excluded from totalBets because the stake was
   returned before the flight result became effective.

   NO_BET is also excluded.
========================================================= */

function isValidBetResult(
    result
) {
    return (
        result ===
            ROUND_RESULT.WIN ||
        result ===
            ROUND_RESULT.LOSS
    );
}


/* =========================================================
   RECORD SETTLEMENT

   Main statistics write operation.
========================================================= */

function recordSettlement(
    settlement
) {
    const validation =
        validateSettlement(
            settlement
        );


    if (!validation.valid) {
        return {
            success: false,

            reason:
                validation.reason
        };
    }


    const roundId =
        settlement.roundId;


    /* -----------------------------------------------------
       Session duplicate prevention
    ----------------------------------------------------- */

    if (
        processedRoundIds.has(
            roundId
        )
    ) {
        return {
            success: true,

            recorded: false,

            reason:
                "ROUND_ALREADY_RECORDED",

            statistics:
                getStatistics()
        };
    }


    let result = null;


    const savedData =
        updateData(
            (data) => {

                const previous =
                    sanitizeStatistics(
                        data.statistics
                    );


                const next = {
                    ...previous
                };


                /* -----------------------------------------
                   Every completed round counts.
                ------------------------------------------ */

                next.totalRounds += 1;


                /* -----------------------------------------
                   Highest crash multiplier

                   Includes no-bet and refunded rounds,
                   because it describes game outcomes,
                   not player wagering behavior.
                ------------------------------------------ */

                const crashMultiplier =
                    normalizeNonNegativeNumber(
                        settlement
                            .crashMultiplier
                    );


                next.highestCrashMultiplier =
                    Math.max(
                        next
                            .highestCrashMultiplier,

                        crashMultiplier
                    );


                /* -----------------------------------------
                   Valid bet statistics
                ------------------------------------------ */

                if (
                    isValidBetResult(
                        settlement.result
                    )
                ) {

                    const wagered =
                        normalizeNonNegativeNumber(
                            settlement
                                .financial
                                .wagered
                        );


                    const returned =
                        normalizeNonNegativeNumber(
                            settlement
                                .financial
                                .returned
                        );


                    const profit =
                        normalizeNumber(
                            settlement
                                .financial
                                .profit
                        );


                    next.totalBets += 1;


                    next.totalWagered =
                        roundTo(
                            next.totalWagered +
                            wagered,

                            STATISTICS_CONFIG
                                .DECIMALS
                        );


                    next.totalReturned =
                        roundTo(
                            next.totalReturned +
                            returned,

                            STATISTICS_CONFIG
                                .DECIMALS
                        );


                    /* -------------------------------------
                       WIN
                    -------------------------------------- */

                    if (
                        settlement.result ===
                        ROUND_RESULT.WIN
                    ) {

                        next.cashoutCount += 1;


                        if (profit > 0) {
                            next.totalProfit =
                                roundTo(
                                    next.totalProfit +
                                    profit,

                                    STATISTICS_CONFIG
                                        .DECIMALS
                                );


                            next.highestSingleWin =
                                Math.max(
                                    next
                                        .highestSingleWin,

                                    profit
                                );
                        }


                        const cashoutMultiplier =
                            normalizeNonNegativeNumber(
                                settlement
                                    .cashout
                                    ?.multiplier
                            );


                        next.highestCashoutMultiplier =
                            Math.max(
                                next
                                    .highestCashoutMultiplier,

                                cashoutMultiplier
                            );
                    }


                    /* -------------------------------------
                       LOSS
                    -------------------------------------- */

                    if (
                        settlement.result ===
                        ROUND_RESULT.LOSS
                    ) {

                        next.crashLossCount += 1;


                        if (profit < 0) {
                            next.totalLoss =
                                roundTo(
                                    next.totalLoss +
                                    Math.abs(
                                        profit
                                    ),

                                    STATISTICS_CONFIG
                                        .DECIMALS
                                );
                        }
                    }
                }


                data.statistics =
                    sanitizeStatistics(
                        next
                    );


                result = {

                    success: true,

                    recorded: true,

                    roundId,

                    previous,

                    statistics:
                        clone(
                            data.statistics
                        )
                };
            }
        );


    if (!savedData) {
        return {
            success: false,

            recorded: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    processedRoundIds.add(
        roundId
    );


    if (
        result &&
        result.recorded
    ) {
        notifyStatisticsListeners(
            result.previous,
            result.statistics,
            settlement
        );
    }


    return result;
}


/* =========================================================
   DERIVED STATISTICS

   These values are calculated from the persistent raw
   counters and do not need to be saved separately.
========================================================= */

function calculateDerivedStatistics(
    statistics =
        getStatistics()
) {
    const stats =
        sanitizeStatistics(
            statistics
        );


    /* -----------------------------------------------------
       Net profit

       gross profit - gross loss
    ----------------------------------------------------- */

    const netProfit =
        roundTo(
            stats.totalProfit -
            stats.totalLoss,

            STATISTICS_CONFIG
                .DECIMALS
        );


    /* -----------------------------------------------------
       Win / loss rate
    ----------------------------------------------------- */

    const winRate =
        stats.totalBets > 0
            ? (
                stats.cashoutCount /
                stats.totalBets
            ) * 100
            : 0;


    const lossRate =
        stats.totalBets > 0
            ? (
                stats.crashLossCount /
                stats.totalBets
            ) * 100
            : 0;


    /* -----------------------------------------------------
       Participation rate

       Percentage of completed rounds in which the player
       actually had a valid bet.
    ----------------------------------------------------- */

    const participationRate =
        stats.totalRounds > 0
            ? (
                stats.totalBets /
                stats.totalRounds
            ) * 100
            : 0;


    /* -----------------------------------------------------
       Average bet
    ----------------------------------------------------- */

    const averageBet =
        stats.totalBets > 0
            ? (
                stats.totalWagered /
                stats.totalBets
            )
            : 0;


    /* -----------------------------------------------------
       Average returned amount per valid bet
    ----------------------------------------------------- */

    const averageReturn =
        stats.totalBets > 0
            ? (
                stats.totalReturned /
                stats.totalBets
            )
            : 0;


    /* -----------------------------------------------------
       Average net result per bet
    ----------------------------------------------------- */

    const averageProfitPerBet =
        stats.totalBets > 0
            ? (
                netProfit /
                stats.totalBets
            )
            : 0;


    /* -----------------------------------------------------
       Return ratio

       totalReturned / totalWagered

       Expressed as percentage.
    ----------------------------------------------------- */

    const returnRate =
        stats.totalWagered > 0
            ? (
                stats.totalReturned /
                stats.totalWagered
            ) * 100
            : 0;


    return {

        netProfit:
            roundTo(
                netProfit,
                2
            ),

        winRate:
            roundTo(
                winRate,
                2
            ),

        lossRate:
            roundTo(
                lossRate,
                2
            ),

        participationRate:
            roundTo(
                participationRate,
                2
            ),

        averageBet:
            roundTo(
                averageBet,
                2
            ),

        averageReturn:
            roundTo(
                averageReturn,
                2
            ),

        averageProfitPerBet:
            roundTo(
                averageProfitPerBet,
                2
            ),

        returnRate:
            roundTo(
                returnRate,
                2
            )
    };
}


/* =========================================================
   STATISTICS SUMMARY

   Combines stored counters and derived values.

   Ideal for UI consumption.
========================================================= */

function getStatisticsSummary() {
    const statistics =
        getStatistics();


    const derived =
        calculateDerivedStatistics(
            statistics
        );


    return {
        ...statistics,
        ...derived
    };
}


/* =========================================================
   RESET STATISTICS

   Intended for development or a future explicit reset
   function.

   Does NOT:
   - reset wallet
   - reset login
   - delete history
========================================================= */

function resetStatistics() {
    const previous =
        getStatistics();


    let result = null;


    const savedData =
        updateData(
            (data) => {

                data.statistics = {
                    ...DEFAULT_STATISTICS
                };


                result = {
                    success: true,

                    previous,

                    statistics:
                        clone(
                            data.statistics
                        )
                };
            }
        );


    if (!savedData) {
        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    processedRoundIds.clear();


    notifyStatisticsListeners(
        previous,
        result.statistics,
        null
    );


    return result;
}


/* =========================================================
   GET PLAYER PERFORMANCE CATEGORY

   Purely descriptive UI helper.

   This is not used for gameplay decisions.
========================================================= */

function getPerformanceCategory(
    statistics =
        getStatistics()
) {
    const derived =
        calculateDerivedStatistics(
            statistics
        );


    if (
        statistics.totalBets === 0
    ) {
        return "NO_DATA";
    }


    if (
        derived.netProfit > 0
    ) {
        return "PROFIT";
    }


    if (
        derived.netProfit < 0
    ) {
        return "LOSS";
    }


    return "EVEN";
}


/* =========================================================
   GET WIN/LOSS COUNTS
========================================================= */

function getWinLossSummary() {
    const statistics =
        getStatistics();


    return {

        wins:
            statistics
                .cashoutCount,

        losses:
            statistics
                .crashLossCount,

        total:
            statistics
                .totalBets
    };
}


/* =========================================================
   AUTO RECORD SETTLEMENT

   settlement.js emits SETTLEMENT_COMPLETE after the final
   round state has been normalized.

   Statistics are therefore updated automatically.
========================================================= */

subscribeToSettlement(
    (event) => {

        if (
            event.type !==
            "SETTLEMENT_COMPLETE"
        ) {
            return;
        }


        const settlement =
            event.settlement;


        const result =
            recordSettlement(
                settlement
            );


        if (!result.success) {
            console.error(
                "[CG Flight] Statistics update failed:",
                result
            );
        }
    }
);


/* =========================================================
   EXPORTS
========================================================= */

export {
    STATISTICS_CONFIG,
    DEFAULT_STATISTICS,

    getStatistics,
    getStatisticsSummary,

    calculateDerivedStatistics,

    recordSettlement,

    getWinLossSummary,
    getPerformanceCategory,

    resetStatistics,

    subscribeToStatistics
};
