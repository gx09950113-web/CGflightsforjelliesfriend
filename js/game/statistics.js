/* =========================================================
   CG FLIGHT
   js/game/statistics.js

   Persistent player statistics manager.

   Responsibilities:
   - Record completed round statistics
   - Prevent duplicate round counting
   - Maintain aggregate player statistics
   - Mark History entries as statisticsRecorded
   - Expose raw statistics
   - Expose UI-oriented summary
   - Migrate legacy History statistic markers
   - Rebuild statistics from History when required

   IMPORTANT:
   Valid Bets:
       WIN
       LOSS

   NOT valid bets:
       REFUND
       NO_BET

   Therefore:
       REFUND / NO_BET do not affect:
       - totalBets
       - totalWagered
       - totalReturned
       - totalProfit
       - totalLoss
       - cashoutCount
       - crashLossCount

   totalRounds counts ALL persisted round records.
========================================================= */


import {
    getData,
    updateData
} from "../core/storage.js";


import {
    ROUND_RESULT
} from "./state.js";


import {
    clone,
    roundTo
} from "../core/utils.js";


/* =========================================================
   STATISTICS CONFIG
========================================================= */

const STATISTICS_CONFIG = Object.freeze({

    DECIMALS:
        2
});


/* =========================================================
   STATISTICS EVENT TYPES
========================================================= */

const STATISTICS_EVENT_TYPES =
    Object.freeze({

        ROUND_RECORDED:
            "ROUND_RECORDED",

        RESET:
            "RESET",

        REBUILT:
            "REBUILT",

        MIGRATED:
            "MIGRATED"
    });


/* =========================================================
   DEFAULT STATISTICS
========================================================= */

const DEFAULT_STATISTICS =
    Object.freeze({

        totalRounds:
            0,

        totalBets:
            0,

        totalWagered:
            0,

        totalReturned:
            0,

        totalProfit:
            0,

        totalLoss:
            0,

        cashoutCount:
            0,

        crashLossCount:
            0,

        highestCashoutMultiplier:
            0,

        highestCrashMultiplier:
            0,

        highestSingleWin:
            0
    });


/* =========================================================
   LISTENERS
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
   NOTIFY
========================================================= */

function notifyStatisticsListeners(
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
   NORMALIZERS
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
        STATISTICS_CONFIG
            .DECIMALS
    );
}


function normalizeNonNegativeMoney(
    value
) {

    return Math.max(
        0,
        normalizeMoney(
            value
        )
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
        STATISTICS_CONFIG
            .DECIMALS
    );
}


function normalizeCount(
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


    return Math.max(
        0,
        Math.trunc(
            numeric
        )
    );
}


/* =========================================================
   NORMALIZE STATISTICS
========================================================= */

function normalizeStatistics(
    statistics
) {

    const source =
        statistics &&
        typeof statistics ===
            "object"
            ? statistics
            : {};


    return {

        totalRounds:
            normalizeCount(
                source.totalRounds
            ),

        totalBets:
            normalizeCount(
                source.totalBets
            ),

        totalWagered:
            normalizeNonNegativeMoney(
                source.totalWagered
            ),

        totalReturned:
            normalizeNonNegativeMoney(
                source.totalReturned
            ),

        totalProfit:
            normalizeNonNegativeMoney(
                source.totalProfit
            ),

        totalLoss:
            normalizeNonNegativeMoney(
                source.totalLoss
            ),

        cashoutCount:
            normalizeCount(
                source.cashoutCount
            ),

        crashLossCount:
            normalizeCount(
                source.crashLossCount
            ),

        highestCashoutMultiplier:
            normalizeMultiplier(
                source.highestCashoutMultiplier
            ),

        highestCrashMultiplier:
            normalizeMultiplier(
                source.highestCrashMultiplier
            ),

        highestSingleWin:
            normalizeNonNegativeMoney(
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


    return normalizeStatistics(
        data.statistics
    );
}


/* =========================================================
   FIND HISTORY ENTRY
========================================================= */

function findHistoryEntryByRoundId(
    history,
    roundId
) {

    if (
        !Array.isArray(
            history
        )
    ) {
        return null;
    }


    return (
        history.find(
            (entry) =>
                entry &&
                entry.roundId ===
                    roundId
        ) ??
        null
    );
}


/* =========================================================
   VALID RESULT
========================================================= */

function isValidRoundResult(
    result
) {

    return Object.values(
        ROUND_RESULT
    ).includes(
        result
    );
}


/* =========================================================
   VALID BET RESULT
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
   APPLY ONE HISTORY ENTRY TO STATISTICS

   Pure mutation helper.

   This function assumes the entry has NOT already been
   counted.
========================================================= */

function applyHistoryEntryToStatistics(
    statistics,
    entry
) {

    const result =
        entry.result;


    /* -----------------------------------------------------
       Every persisted round counts as a completed round.
    ----------------------------------------------------- */

    statistics.totalRounds +=
        1;


    /* -----------------------------------------------------
       Highest Crash

       Applies to all rounds that have a legitimate
       Crash Point.
    ----------------------------------------------------- */

    if (
        Number.isFinite(
            Number(
                entry.crashMultiplier
            )
        )
    ) {

        statistics
            .highestCrashMultiplier =
            Math.max(
                statistics
                    .highestCrashMultiplier,

                normalizeMultiplier(
                    entry.crashMultiplier
                )
            );
    }


    /* -----------------------------------------------------
       REFUND / NO_BET stop here.

       They are round records but not valid wagers.
    ----------------------------------------------------- */

    if (
        !isValidBetResult(
            result
        )
    ) {
        return statistics;
    }


    const wagered =
        normalizeNonNegativeMoney(
            entry.financial
                ?.wagered ??
            entry.wagered ??
            entry.betAmount
        );


    const returned =
        normalizeNonNegativeMoney(
            entry.financial
                ?.returned ??
            entry.returned
        );


    const profit =
        normalizeMoney(
            entry.financial
                ?.profit ??
            entry.profit
        );


    statistics.totalBets +=
        1;


    statistics.totalWagered =
        roundTo(
            statistics.totalWagered +
            wagered,
            2
        );


    statistics.totalReturned =
        roundTo(
            statistics.totalReturned +
            returned,
            2
        );


    /* =====================================================
       WIN
    ====================================================== */

    if (
        result ===
        ROUND_RESULT.WIN
    ) {

        statistics.cashoutCount +=
            1;


        if (
            profit > 0
        ) {

            statistics.totalProfit =
                roundTo(
                    statistics.totalProfit +
                    profit,
                    2
                );


            statistics.highestSingleWin =
                Math.max(
                    statistics.highestSingleWin,
                    normalizeNonNegativeMoney(
                        profit
                    )
                );
        }


        const cashoutMultiplier =
            entry.cashout
                ?.multiplier ??
            entry.cashoutMultiplier;


        if (
            Number.isFinite(
                Number(
                    cashoutMultiplier
                )
            )
        ) {

            statistics
                .highestCashoutMultiplier =
                Math.max(
                    statistics
                        .highestCashoutMultiplier,

                    normalizeMultiplier(
                        cashoutMultiplier
                    )
                );
        }


        return statistics;
    }


    /* =====================================================
       LOSS
    ====================================================== */

    if (
        result ===
        ROUND_RESULT.LOSS
    ) {

        statistics.crashLossCount +=
            1;


        const lossAmount =
            profit < 0
                ? Math.abs(
                    profit
                )
                : wagered;


        statistics.totalLoss =
            roundTo(
                statistics.totalLoss +
                normalizeNonNegativeMoney(
                    lossAmount
                ),
                2
            );
    }


    return statistics;
}


/* =========================================================
   RECORD ROUND STATISTICS

   Canonical API called by settlement.js.

   Expected order:
       addHistoryEntry(record)
       ↓
       recordRoundStatistics(roundId)

   Idempotency:
       statisticsRecorded === true
       -> do NOT count again
========================================================= */

function recordRoundStatistics(
    roundId
) {

    if (
        typeof roundId !==
            "string" ||
        roundId.trim().length ===
            0
    ) {

        return {
            success: false,

            reason:
                "INVALID_ROUND_ID"
        };
    }


    let result =
        null;


    const timestamp =
        new Date()
            .toISOString();


    const saved =
        updateData(
            (data) => {

                const entry =
                    findHistoryEntryByRoundId(
                        data.history,
                        roundId
                    );


                if (!entry) {

                    result = {

                        success: false,

                        reason:
                            "HISTORY_ENTRY_NOT_FOUND"
                    };


                    return;
                }


                if (
                    !isValidRoundResult(
                        entry.result
                    )
                ) {

                    result = {

                        success: false,

                        reason:
                            "INVALID_HISTORY_RESULT"
                    };


                    return;
                }


                /* -----------------------------------------
                   Already recorded.

                   This is treated as a successful
                   idempotent no-op.
                ------------------------------------------ */

                if (
                    entry.statisticsRecorded ===
                    true
                ) {

                    result = {

                        success: true,

                        recorded:
                            false,

                        reason:
                            "ALREADY_RECORDED",

                        roundId,

                        statistics:
                            normalizeStatistics(
                                data.statistics
                            )
                    };


                    return;
                }


                const statistics =
                    normalizeStatistics(
                        data.statistics
                    );


                applyHistoryEntryToStatistics(
                    statistics,
                    entry
                );


                data.statistics =
                    statistics;


                entry.statisticsRecorded =
                    true;


                entry.statisticsRecordedAt =
                    timestamp;


                result = {

                    success: true,

                    recorded:
                        true,

                    roundId,

                    result:
                        entry.result,

                    statistics:
                        clone(
                            statistics
                        ),

                    statisticsRecordedAt:
                        timestamp
                };
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    if (!result) {

        return {
            success: false,

            reason:
                "UNKNOWN_STATISTICS_ERROR"
        };
    }


    if (
        result.success &&
        result.recorded
    ) {

        notifyStatisticsListeners({

            type:
                STATISTICS_EVENT_TYPES
                    .ROUND_RECORDED,

            roundId,

            result:
                result.result,

            statistics:
                clone(
                    result.statistics
                )
        });
    }


    return clone(
        result
    );
}


/* =========================================================
   GET STATISTICS SUMMARY

   UI-oriented derived data.
========================================================= */

function getStatisticsSummary() {

    const statistics =
        getStatistics();


    const validBets =
        statistics.totalBets;


    const wins =
        statistics.cashoutCount;


    const losses =
        statistics.crashLossCount;


    const winRate =
        validBets > 0
            ? roundTo(
                (
                    wins /
                    validBets
                ) *
                100,
                2
            )
            : 0;


    /*
     Net Profit:

         total successful profit
         -
         total crash losses

     This is deliberately NOT:

         totalReturned - totalWagered

     although the two should normally be equivalent for
     WIN/LOSS-only valid wagers.
    */

    const netProfit =
        roundTo(
            statistics.totalProfit -
            statistics.totalLoss,
            2
        );


    /*
     Experienced Return Rate:

         returned / wagered * 100

     This is historical realized return over valid bets,
     not theoretical RTP.
    */

    const experiencedReturnRate =
        statistics.totalWagered > 0
            ? roundTo(
                (
                    statistics
                        .totalReturned /
                    statistics
                        .totalWagered
                ) *
                100,
                2
            )
            : 0;


    const averageBet =
        validBets > 0
            ? roundTo(
                statistics
                    .totalWagered /
                validBets,
                2
            )
            : 0;


    const averageReturn =
        validBets > 0
            ? roundTo(
                statistics
                    .totalReturned /
                validBets,
                2
            )
            : 0;


    const averageProfitPerBet =
        validBets > 0
            ? roundTo(
                netProfit /
                validBets,
                2
            )
            : 0;


    return {

        /* -------------------------------------------------
           Raw aggregates
        -------------------------------------------------- */

        ...statistics,


        /* -------------------------------------------------
           Aliases used by UI
        -------------------------------------------------- */

        completedRounds:
            statistics.totalRounds,

        validBets,

        wins,

        losses,


        /* -------------------------------------------------
           Derived metrics
        -------------------------------------------------- */

        winRate,

        netProfit,

        experiencedReturnRate,

        averageBet,

        averageReturn,

        averageProfitPerBet
    };
}


/* =========================================================
   RESET STATISTICS

   Development helper.

   IMPORTANT:
   If aggregates are reset, History entries must also have
   their statisticsRecorded marker cleared. Otherwise
   rebuild/record would think all rounds were already counted.
========================================================= */

function resetStatistics() {

    const previous =
        getStatistics();


    const saved =
        updateData(
            (data) => {

                data.statistics =
                    clone(
                        DEFAULT_STATISTICS
                    );


                if (
                    Array.isArray(
                        data.history
                    )
                ) {

                    for (
                        const entry
                        of data.history
                    ) {

                        if (
                            !entry ||
                            typeof entry !==
                                "object"
                        ) {
                            continue;
                        }


                        entry.statisticsRecorded =
                            false;


                        entry.statisticsRecordedAt =
                            null;
                    }
                }
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    const current =
        getStatistics();


    notifyStatisticsListeners({

        type:
            STATISTICS_EVENT_TYPES
                .RESET,

        previous,

        statistics:
            current
    });


    return {

        success: true,

        previous,

        statistics:
            current
    };
}


/* =========================================================
   REBUILD STATISTICS FROM HISTORY

   This is the authoritative repair tool.

   Every valid History entry is recalculated from zero and
   then marked statisticsRecorded.
========================================================= */

function rebuildStatisticsFromHistory() {

    let rebuilt =
        null;


    const timestamp =
        new Date()
            .toISOString();


    const saved =
        updateData(
            (data) => {

                const statistics =
                    clone(
                        DEFAULT_STATISTICS
                    );


                let recordedCount =
                    0;


                if (
                    Array.isArray(
                        data.history
                    )
                ) {

                    for (
                        const entry
                        of data.history
                    ) {

                        if (
                            !entry ||
                            typeof entry !==
                                "object"
                        ) {
                            continue;
                        }


                        if (
                            !isValidRoundResult(
                                entry.result
                            )
                        ) {

                            entry.statisticsRecorded =
                                false;


                            entry.statisticsRecordedAt =
                                null;


                            continue;
                        }


                        applyHistoryEntryToStatistics(
                            statistics,
                            entry
                        );


                        entry.statisticsRecorded =
                            true;


                        entry.statisticsRecordedAt =
                            timestamp;


                        recordedCount +=
                            1;
                    }
                }


                data.statistics =
                    normalizeStatistics(
                        statistics
                    );


                rebuilt = {

                    success:
                        true,

                    recordedCount,

                    statistics:
                        clone(
                            data.statistics
                        )
                };
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    notifyStatisticsListeners({

        type:
            STATISTICS_EVENT_TYPES
                .REBUILT,

        recordedCount:
            rebuilt.recordedCount,

        statistics:
            clone(
                rebuilt.statistics
            )
    });


    return rebuilt;
}


/* =========================================================
   MIGRATE LEGACY STATISTICS MARKERS

   Problem:
   Older versions may already contain aggregate Statistics
   but old History records may lack statisticsRecorded.

   Blindly setting all old entries to false would cause the
   next load to count them again.

   Strategy:
   - If every entry already has a boolean marker -> nothing
   - If aggregate statistics are completely zero -> mark all
     valid legacy entries false so they can be rebuilt
   - If aggregates contain data -> assume legacy History was
     already reflected in those aggregates and mark existing
     valid entries true

   For a fully authoritative repair, use
   rebuildStatisticsFromHistory().
========================================================= */

function migrateLegacyStatisticsMarkers() {

    const data =
        getData();


    const history =
        Array.isArray(
            data.history
        )
            ? data.history
            : [];


    const missingMarkers =
        history.filter(
            (entry) =>
                entry &&
                typeof entry ===
                    "object" &&
                typeof entry
                    .statisticsRecorded !==
                    "boolean"
        );


    if (
        missingMarkers.length ===
        0
    ) {

        return {
            success: true,

            migrated:
                false,

            count:
                0
        };
    }


    const statistics =
        normalizeStatistics(
            data.statistics
        );


    const aggregatesAreEmpty =
        (
            statistics.totalRounds === 0 &&
            statistics.totalBets === 0 &&
            statistics.totalWagered === 0 &&
            statistics.totalReturned === 0 &&
            statistics.totalProfit === 0 &&
            statistics.totalLoss === 0 &&
            statistics.cashoutCount === 0 &&
            statistics.crashLossCount === 0 &&
            statistics.highestCashoutMultiplier === 0 &&
            statistics.highestCrashMultiplier === 0 &&
            statistics.highestSingleWin === 0
        );


    const timestamp =
        new Date()
            .toISOString();


    let migratedCount =
        0;


    const saved =
        updateData(
            (root) => {

                for (
                    const entry
                    of root.history
                ) {

                    if (
                        !entry ||
                        typeof entry !==
                            "object" ||
                        typeof entry
                            .statisticsRecorded ===
                            "boolean"
                    ) {
                        continue;
                    }


                    if (
                        !isValidRoundResult(
                            entry.result
                        )
                    ) {

                        entry.statisticsRecorded =
                            false;


                        entry.statisticsRecordedAt =
                            null;

                    } else if (
                        aggregatesAreEmpty
                    ) {

                        /*
                         No aggregate data exists, so these
                         entries are safe to treat as not yet
                         recorded.
                        */

                        entry.statisticsRecorded =
                            false;


                        entry.statisticsRecordedAt =
                            null;

                    } else {

                        /*
                         Aggregate Statistics already exist.

                         Conservatively assume legacy History
                         has already contributed to them.
                        */

                        entry.statisticsRecorded =
                            true;


                        entry.statisticsRecordedAt =
                            entry.statisticsRecordedAt ??
                            timestamp;
                    }


                    migratedCount +=
                        1;
                }
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    notifyStatisticsListeners({

        type:
            STATISTICS_EVENT_TYPES
                .MIGRATED,

        count:
            migratedCount,

        assumedRecorded:
            !aggregatesAreEmpty
    });


    return {

        success: true,

        migrated:
            true,

        count:
            migratedCount,

        assumedRecorded:
            !aggregatesAreEmpty
    };
}


/* =========================================================
   GET ROUND STATISTICS STATUS
========================================================= */

function getRoundStatisticsStatus(
    roundId
) {

    const data =
        getData();


    const entry =
        findHistoryEntryByRoundId(
            data.history,
            roundId
        );


    if (!entry) {

        return {

            exists:
                false,

            recorded:
                false,

            recordedAt:
                null
        };
    }


    return {

        exists:
            true,

        recorded:
            entry.statisticsRecorded ===
            true,

        recordedAt:
            entry.statisticsRecordedAt ??
            null,

        result:
            entry.result
    };
}


/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

function recordStatistics(
    roundId
) {

    return recordRoundStatistics(
        roundId
    );
}


function getStats() {

    return getStatistics();
}


function getStatsSummary() {

    return getStatisticsSummary();
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    STATISTICS_CONFIG,
    STATISTICS_EVENT_TYPES,
    DEFAULT_STATISTICS,

    getStatistics,
    getStatisticsSummary,

    recordRoundStatistics,

    getRoundStatisticsStatus,

    resetStatistics,

    rebuildStatisticsFromHistory,
    migrateLegacyStatisticsMarkers,

    subscribeToStatistics,

    /* Compatibility */
    recordStatistics,
    getStats,
    getStatsSummary
};
