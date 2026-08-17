/* =========================================================
   CG FLIGHT
   js/game/statistics.js

   Persistent statistics layer.

   Responsibilities:
   - Consume completed settlement records
   - Update persistent player statistics
   - Prevent duplicate statistics across page reloads
   - Count completed rounds
   - Count valid bets
   - Track wagered / returned coins
   - Track gross profit / gross loss
   - Track cashout / crash-loss counts
   - Track highest multipliers
   - Track highest single-round win
   - Produce derived statistics
   - Automatically record completed settlements

   Persistent duplicate strategy:
   - Every history entry may contain:
         statisticsRecorded: true
   - Statistics and this marker are written atomically
     through the same updateData() operation.

   IMPORTANT:
   This module does NOT:
   - Perform settlement
   - Modify wallet balance
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
    recordHistory
} from "./history.js";

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

    /*
     Only completed WIN / LOSS bets.

     REFUND and NO_BET are excluded.
    */
    totalBets: 0,

    totalWagered: 0,

    totalReturned: 0,

    /*
     Gross positive net profit from winning rounds.
    */
    totalProfit: 0,

    /*
     Gross player losses stored as a positive value.

     Example:
         LOSS profit = -1000

         totalLoss += 1000
    */
    totalLoss: 0,

    cashoutCount: 0,

    crashLossCount: 0,

    highestCashoutMultiplier: 0,

    highestCrashMultiplier: 0,

    /*
     Highest NET profit from one winning round.

     Example:
         Bet      1000
         Return   3500
         Profit   2500

         highestSingleWin = 2500
    */
    highestSingleWin: 0
});


/* =========================================================
   SESSION CACHE

   This is now only a performance optimization.

   It is NOT the authoritative duplicate guard.

   Persistent duplicate protection comes from:
       history[].statisticsRecorded
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


    const wagered =
        Number(
            settlement
                .financial
                .wagered
        );


    const returned =
        Number(
            settlement
                .financial
                .returned
        );


    const profit =
        Number(
            settlement
                .financial
                .profit
        );


    if (
        !isFiniteNumber(
            wagered
        ) ||
        !isFiniteNumber(
            returned
        ) ||
        !isFiniteNumber(
            profit
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
   VALID BET RESULT

   WIN / LOSS:
       counted as totalBets

   REFUND:
       stake returned before final risk result,
       therefore excluded

   NO_BET:
       no player wager,
       therefore excluded
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
   ENSURE HISTORY ENTRY EXISTS

   Persistent statistics deduplication depends on History.

   Even if recordSettlement() is manually called outside the
   normal event chain, ensure the settlement has a history
   entry first.

   recordHistory() itself is duplicate-safe.
========================================================= */

function ensureHistoryEntry(
    settlement
) {
    const result =
        recordHistory(
            settlement
        );


    if (!result.success) {
        return {
            success: false,

            reason:
                result.reason
        };
    }


    return {
        success: true,

        recorded:
            result.recorded,

        entry:
            result.entry
    };
}


/* =========================================================
   FIND HISTORY ENTRY INDEX
========================================================= */

function findHistoryEntryIndex(
    history,
    roundId
) {
    if (
        !Array.isArray(
            history
        )
    ) {
        return -1;
    }


    return history.findIndex(
        (entry) =>
            entry &&
            entry.roundId ===
                roundId
    );
}


/* =========================================================
   HAS PERSISTENT STATISTICS MARKER
========================================================= */

function hasPersistentStatisticsRecord(
    roundId
) {
    if (
        typeof roundId !==
            "string" ||
        roundId.length === 0
    ) {
        return false;
    }


    const data =
        getData();


    if (
        !Array.isArray(
            data.history
        )
    ) {
        return false;
    }


    const entry =
        data.history.find(
            (item) =>
                item &&
                item.roundId ===
                    roundId
        );


    return (
        entry?.statisticsRecorded ===
        true
    );
}


/* =========================================================
   RECORD SETTLEMENT

   Persistent flow:

   1. Validate settlement
   2. Ensure History entry exists
   3. Locate matching History entry
   4. Check statisticsRecorded
   5. Update statistics
   6. Set statisticsRecorded = true
   7. Save both atomically
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

            recorded: false,

            reason:
                validation.reason
        };
    }


    const roundId =
        settlement.roundId;


    /* -----------------------------------------------------
       Fast same-session check.

       Persistent storage is still verified below when this
       cache does not contain the ID.
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


    /* -----------------------------------------------------
       Persistent pre-check.
    ----------------------------------------------------- */

    if (
        hasPersistentStatisticsRecord(
            roundId
        )
    ) {
        processedRoundIds.add(
            roundId
        );


        return {
            success: true,

            recorded: false,

            reason:
                "ROUND_ALREADY_RECORDED",

            statistics:
                getStatistics()
        };
    }


    /* -----------------------------------------------------
       Ensure the authoritative round record exists.

       This also makes direct/manual statistics recording
       safe outside the usual settlement event order.
    ----------------------------------------------------- */

    const historyResult =
        ensureHistoryEntry(
            settlement
        );


    if (!historyResult.success) {
        return {
            success: false,

            recorded: false,

            reason:
                "HISTORY_RECORD_REQUIRED",

            historyReason:
                historyResult.reason
        };
    }


    let result =
        null;


    /* -----------------------------------------------------
       Atomic persistent update.

       The statistical counters and the history marker are
       committed in the SAME Local Storage write.
    ----------------------------------------------------- */

    const savedData =
        updateData(
            (data) => {

                if (
                    !Array.isArray(
                        data.history
                    )
                ) {
                    data.history = [];
                }


                const historyIndex =
                    findHistoryEntryIndex(
                        data.history,
                        roundId
                    );


                if (
                    historyIndex < 0
                ) {
                    result = {
                        success: false,

                        recorded: false,

                        reason:
                            "HISTORY_ENTRY_NOT_FOUND"
                    };


                    return;
                }


                const historyEntry =
                    data.history[
                        historyIndex
                    ];


                /* -----------------------------------------
                   Persistent duplicate check INSIDE the
                   atomic update operation.

                   This is the final authority.
                ------------------------------------------ */

                if (
                    historyEntry
                        .statisticsRecorded ===
                    true
                ) {
                    result = {
                        success: true,

                        recorded: false,

                        reason:
                            "ROUND_ALREADY_RECORDED",

                        statistics:
                            sanitizeStatistics(
                                data.statistics
                            )
                    };


                    return;
                }


                const previous =
                    sanitizeStatistics(
                        data.statistics
                    );


                const next = {
                    ...previous
                };


                /* -----------------------------------------
                   Every completed round counts.

                   Includes:
                   WIN
                   LOSS
                   REFUND
                   NO_BET
                ------------------------------------------ */

                next.totalRounds += 1;


                /* -----------------------------------------
                   Highest crash multiplier.

                   This is a game outcome statistic, so even
                   NO_BET / REFUND rounds may update it.
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
                   Valid wagering statistics.

                   Only WIN / LOSS.
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


                    /* =====================================
                       WIN
                    ====================================== */

                    if (
                        settlement.result ===
                        ROUND_RESULT.WIN
                    ) {
                        next.cashoutCount +=
                            1;


                        /* ---------------------------------
                           Gross positive profit
                        ---------------------------------- */

                        if (
                            profit > 0
                        ) {
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


                        /* ---------------------------------
                           Highest Cash Out multiplier
                        ---------------------------------- */

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


                    /* =====================================
                       LOSS
                    ====================================== */

                    if (
                        settlement.result ===
                        ROUND_RESULT.LOSS
                    ) {
                        next.crashLossCount +=
                            1;


                        if (
                            profit < 0
                        ) {
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


                /* -----------------------------------------
                   Save normalized statistics.
                ------------------------------------------ */

                data.statistics =
                    sanitizeStatistics(
                        next
                    );


                /* -----------------------------------------
                   PERSISTENT DEDUPLICATION MARKER

                   This is written in the same updateData()
                   operation as the counters above.
                ------------------------------------------ */

                historyEntry.statisticsRecorded =
                    true;


                historyEntry.statisticsRecordedAt =
                    new Date()
                        .toISOString();


                data.history[
                    historyIndex
                ] =
                    historyEntry;


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


    if (!result) {
        return {
            success: false,

            recorded: false,

            reason:
                "UNKNOWN_STATISTICS_ERROR"
        };
    }


    /* -----------------------------------------------------
       If the atomic callback rejected the operation,
       respect that result.
    ----------------------------------------------------- */

    if (!result.success) {
        return result;
    }


    /* -----------------------------------------------------
       Cache even duplicate persistent results.
    ----------------------------------------------------- */

    processedRoundIds.add(
        roundId
    );


    if (
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

   These values are calculated dynamically instead of being
   stored, preventing unnecessary duplicate state.
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

       gross winning profit
       -
       gross losses
    ----------------------------------------------------- */

    const netProfit =
        roundTo(
            stats.totalProfit -
            stats.totalLoss,

            STATISTICS_CONFIG
                .DECIMALS
        );


    /* -----------------------------------------------------
       Win Rate

       successful Cash Outs / valid bets
    ----------------------------------------------------- */

    const winRate =
        stats.totalBets > 0
            ? (
                stats.cashoutCount /
                stats.totalBets
            ) *
            100
            : 0;


    /* -----------------------------------------------------
       Loss Rate
    ----------------------------------------------------- */

    const lossRate =
        stats.totalBets > 0
            ? (
                stats.crashLossCount /
                stats.totalBets
            ) *
            100
            : 0;


    /* -----------------------------------------------------
       Participation Rate

       valid wagered rounds / all completed rounds
    ----------------------------------------------------- */

    const participationRate =
        stats.totalRounds > 0
            ? (
                stats.totalBets /
                stats.totalRounds
            ) *
            100
            : 0;


    /* -----------------------------------------------------
       Average Bet
    ----------------------------------------------------- */

    const averageBet =
        stats.totalBets > 0
            ? (
                stats.totalWagered /
                stats.totalBets
            )
            : 0;


    /* -----------------------------------------------------
       Average Returned Amount Per Valid Bet
    ----------------------------------------------------- */

    const averageReturn =
        stats.totalBets > 0
            ? (
                stats.totalReturned /
                stats.totalBets
            )
            : 0;


    /* -----------------------------------------------------
       Average Net Profit Per Bet
    ----------------------------------------------------- */

    const averageProfitPerBet =
        stats.totalBets > 0
            ? (
                netProfit /
                stats.totalBets
            )
            : 0;


    /* -----------------------------------------------------
       Return Rate / RTP experienced by this local player

       total returned / total wagered
    ----------------------------------------------------- */

    const returnRate =
        stats.totalWagered > 0
            ? (
                stats.totalReturned /
                stats.totalWagered
            ) *
            100
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

   Combines persistent raw counters and calculated values.
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
   GET WIN / LOSS SUMMARY
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
   PERFORMANCE CATEGORY

   Descriptive UI helper only.
========================================================= */

function getPerformanceCategory(
    statistics =
        getStatistics()
) {
    const stats =
        sanitizeStatistics(
            statistics
        );


    if (
        stats.totalBets === 0
    ) {
        return "NO_DATA";
    }


    const derived =
        calculateDerivedStatistics(
            stats
        );


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
   INITIALIZE SESSION CACHE

   Load all persistently marked History rounds into the
   in-memory Set.

   This is only an optimization.
========================================================= */

function initializeProcessedRoundCache() {
    const data =
        getData();


    if (
        !Array.isArray(
            data.history
        )
    ) {
        return;
    }


    for (
        const entry
        of data.history
    ) {
        if (
            entry &&
            typeof entry.roundId ===
                "string" &&
            entry.statisticsRecorded ===
                true
        ) {
            processedRoundIds.add(
                entry.roundId
            );
        }
    }
}


/* =========================================================
   MIGRATE LEGACY HISTORY MARKERS

   Previous statistics.js versions could already have
   updated aggregate statistics while History entries did
   not yet have statisticsRecorded.

   If aggregate statistics already contain completed rounds,
   treat existing legacy History entries as previously
   counted rather than risking double counting after upgrade.

   This is a one-time compatibility repair.
========================================================= */

function migrateLegacyStatisticsMarkers() {
    const data =
        getData();


    if (
        !Array.isArray(
            data.history
        ) ||
        data.history.length === 0
    ) {
        return {
            success: true,

            changed: false
        };
    }


    const statistics =
        sanitizeStatistics(
            data.statistics
        );


    /*
     If no statistics have ever been counted, do not mark
     legacy History entries automatically.
    */

    if (
        statistics.totalRounds === 0
    ) {
        return {
            success: true,

            changed: false
        };
    }


    const unmarkedEntries =
        data.history.filter(
            (entry) =>
                entry &&
                entry.statisticsRecorded !==
                    true
        );


    if (
        unmarkedEntries.length === 0
    ) {
        return {
            success: true,

            changed: false
        };
    }


    /*
     Compatibility assumption:

     Previous versions automatically wrote Statistics and
     History from the same SETTLEMENT_COMPLETE event.

     Therefore an existing legacy History entry is assumed
     to already be represented in the aggregate counters.

     This prevents an upgrade from double-counting old
     rounds.
    */

    const savedData =
        updateData(
            (workingData) => {

                if (
                    !Array.isArray(
                        workingData.history
                    )
                ) {
                    return;
                }


                for (
                    const entry
                    of workingData.history
                ) {
                    if (
                        !entry ||
                        typeof entry.roundId !==
                            "string"
                    ) {
                        continue;
                    }


                    if (
                        entry.statisticsRecorded ===
                        true
                    ) {
                        continue;
                    }


                    entry.statisticsRecorded =
                        true;


                    entry.statisticsRecordedAt =
                        entry.recordedAt ??
                        new Date()
                            .toISOString();
                }
            }
        );


    return {
        success:
            Boolean(
                savedData
            ),

        changed:
            Boolean(
                savedData
            )
    };
}


/* =========================================================
   RESET STATISTICS

   Resets aggregate statistics only.

   History remains intact.

   Existing History entries remain marked as processed so
   old settlements cannot accidentally repopulate statistics
   merely through duplicate events.

   New future rounds will still be counted normally.
========================================================= */

function resetStatistics() {
    const previous =
        getStatistics();


    const savedData =
        updateData(
            (data) => {

                data.statistics = {
                    ...DEFAULT_STATISTICS
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


    /*
     Do NOT remove persistent history markers.
     Otherwise old rounds could be counted again.
    */

    processedRoundIds.clear();


    initializeProcessedRoundCache();


    const statistics =
        getStatistics();


    notifyStatisticsListeners(
        previous,
        statistics,
        null
    );


    return {
        success: true,

        previous,

        statistics
    };
}


/* =========================================================
   REBUILD STATISTICS FROM HISTORY

   Development / repair utility.

   Unlike resetStatistics(), this intentionally recalculates
   everything from saved History records.

   Useful when:
   - statistics data is damaged
   - a future statistics schema changes
   - derived persistent fields are added
========================================================= */

function rebuildStatisticsFromHistory() {
    const data =
        getData();


    const history =
        Array.isArray(
            data.history
        )
            ? clone(
                data.history
            )
            : [];


    const previous =
        getStatistics();


    let rebuilt = {
        ...DEFAULT_STATISTICS
    };


    for (
        const entry
        of history
    ) {
        const settlement =
            entry?.settlement;


        const validation =
            validateSettlement(
                settlement
            );


        if (!validation.valid) {
            continue;
        }


        /* -------------------------------------------------
           Round
        -------------------------------------------------- */

        rebuilt.totalRounds +=
            1;


        const crashMultiplier =
            normalizeNonNegativeNumber(
                settlement
                    .crashMultiplier
            );


        rebuilt.highestCrashMultiplier =
            Math.max(
                rebuilt
                    .highestCrashMultiplier,

                crashMultiplier
            );


        /* -------------------------------------------------
           Valid bet
        -------------------------------------------------- */

        if (
            !isValidBetResult(
                settlement.result
            )
        ) {
            continue;
        }


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


        rebuilt.totalBets +=
            1;


        rebuilt.totalWagered =
            roundTo(
                rebuilt.totalWagered +
                wagered,

                STATISTICS_CONFIG
                    .DECIMALS
            );


        rebuilt.totalReturned =
            roundTo(
                rebuilt.totalReturned +
                returned,

                STATISTICS_CONFIG
                    .DECIMALS
            );


        /* -------------------------------------------------
           WIN
        -------------------------------------------------- */

        if (
            settlement.result ===
            ROUND_RESULT.WIN
        ) {
            rebuilt.cashoutCount +=
                1;


            if (
                profit > 0
            ) {
                rebuilt.totalProfit =
                    roundTo(
                        rebuilt.totalProfit +
                        profit,

                        STATISTICS_CONFIG
                            .DECIMALS
                    );


                rebuilt.highestSingleWin =
                    Math.max(
                        rebuilt
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


            rebuilt.highestCashoutMultiplier =
                Math.max(
                    rebuilt
                        .highestCashoutMultiplier,

                    cashoutMultiplier
                );
        }


        /* -------------------------------------------------
           LOSS
        -------------------------------------------------- */

        if (
            settlement.result ===
            ROUND_RESULT.LOSS
        ) {
            rebuilt.crashLossCount +=
                1;


            if (
                profit < 0
            ) {
                rebuilt.totalLoss =
                    roundTo(
                        rebuilt.totalLoss +
                        Math.abs(
                            profit
                        ),

                        STATISTICS_CONFIG
                            .DECIMALS
                    );
            }
        }
    }


    rebuilt =
        sanitizeStatistics(
            rebuilt
        );


    const savedData =
        updateData(
            (workingData) => {

                workingData.statistics =
                    clone(
                        rebuilt
                    );


                if (
                    !Array.isArray(
                        workingData.history
                    )
                ) {
                    workingData.history =
                        [];

                    return;
                }


                /*
                 Every valid History settlement has now been
                 accounted for by this rebuild.
                */

                for (
                    const entry
                    of workingData.history
                ) {
                    if (
                        !entry ||
                        !entry.settlement
                    ) {
                        continue;
                    }


                    const validation =
                        validateSettlement(
                            entry.settlement
                        );


                    if (!validation.valid) {
                        continue;
                    }


                    entry.statisticsRecorded =
                        true;


                    entry.statisticsRecordedAt =
                        new Date()
                            .toISOString();
                }
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


    initializeProcessedRoundCache();


    notifyStatisticsListeners(
        previous,
        rebuilt,
        null
    );


    return {
        success: true,

        previous,

        statistics:
            clone(
                rebuilt
            ),

        historyEntries:
            history.length
    };
}


/* =========================================================
   AUTO RECORD SETTLEMENT

   settlement.js emits SETTLEMENT_COMPLETE after the round
   has fully transitioned to ENDED.

   recordSettlement() itself ensures History exists and is
   persistently deduplicated.
========================================================= */

subscribeToSettlement(
    (event) => {

        if (
            event.type !==
            "SETTLEMENT_COMPLETE"
        ) {
            return;
        }


        const result =
            recordSettlement(
                event.settlement
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
   MODULE INITIALIZATION
========================================================= */

/*
 First upgrade old History entries so already-counted rounds
 cannot become duplicates after adopting persistent markers.
*/

migrateLegacyStatisticsMarkers();


/*
 Then populate the optional session cache.
*/

initializeProcessedRoundCache();


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

    hasPersistentStatisticsRecord,

    getWinLossSummary,
    getPerformanceCategory,

    resetStatistics,
    rebuildStatisticsFromHistory,

    subscribeToStatistics
};
