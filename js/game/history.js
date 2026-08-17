/* =========================================================
   CG FLIGHT
   js/game/history.js

   Persistent round history layer.

   Responsibilities:
   - Save completed settlement records
   - Prevent duplicate round records
   - Read complete history
   - Get recent rounds
   - Get recent 10 crash results
   - Find round by roundId
   - Provide detailed player settlement data
   - Filter / paginate history
   - Produce history summaries
   - Automatically save SETTLEMENT_COMPLETE events

   IMPORTANT:
   This module does NOT:
   - Perform settlement
   - Update wallet
   - Update statistics
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
    clone,
    roundTo,
    isFiniteNumber
} from "../core/utils.js";


/* =========================================================
   HISTORY CONFIG
========================================================= */

const HISTORY_CONFIG = Object.freeze({

    /*
     Maximum number of completed rounds kept locally.

     Older entries are removed from the beginning of the
     array when this limit is exceeded.
    */
    MAX_HISTORY: 1000,

    /*
     Default amount shown by history page.
    */
    DEFAULT_LIMIT: 20,

    /*
     Number of rounds used for the "recent results" bar.
    */
    RECENT_RESULTS_LIMIT: 10,

    DECIMALS: 2
});


/* =========================================================
   HISTORY LISTENERS
========================================================= */

const historyListeners =
    new Set();


function subscribeToHistory(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] History listener must be a function."
        );
    }

    historyListeners.add(
        listener
    );

    return function unsubscribe() {
        historyListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY HISTORY LISTENERS
========================================================= */

function notifyHistoryListeners(
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
        of historyListeners
    ) {
        try {
            listener(
                clone(event)
            );
        } catch (error) {
            console.error(
                "[CG Flight] History listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   BASIC HELPERS
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
        HISTORY_CONFIG.DECIMALS
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


function normalizeTimestamp(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {
        return value;
    }

    if (
        typeof value === "string"
    ) {
        return value;
    }

    return null;
}


/* =========================================================
   HISTORY DATA SANITIZER
========================================================= */

function sanitizeHistoryArray(
    history
) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .filter(
            (entry) =>
                entry &&
                typeof entry === "object" &&
                !Array.isArray(entry)
        )
        .map(
            (entry) =>
                clone(entry)
        );
}


/* =========================================================
   GET HISTORY

   Stored order:
   oldest -> newest

   Public return order:
   newest -> oldest
========================================================= */

function getHistory() {
    const data =
        getData();

    const history =
        sanitizeHistoryArray(
            data.history
        );

    return history
        .slice()
        .reverse();
}


/* =========================================================
   GET HISTORY IN STORAGE ORDER

   Intended mainly for internal operations.
========================================================= */

function getHistoryOldestFirst() {
    const data =
        getData();

    return sanitizeHistoryArray(
        data.history
    );
}


/* =========================================================
   VALIDATE SETTLEMENT
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
        !isFiniteNumber(
            Number(
                settlement.crashMultiplier
            )
        )
    ) {
        return {
            valid: false,
            reason:
                "INVALID_CRASH_MULTIPLIER"
        };
    }


    return {
        valid: true
    };
}


/* =========================================================
   BUILD HISTORY ENTRY

   Settlement is already normalized by settlement.js.

   History adds:
   - recordedAt
   - compact top-level lookup fields
========================================================= */

function buildHistoryEntry(
    settlement
) {
    const crashMultiplier =
        normalizeNonNegativeNumber(
            settlement.crashMultiplier
        );

    const betAmount =
        normalizeNonNegativeNumber(
            settlement.bet
                ?.amount
        );

    const cashoutMultiplier =
        settlement.cashout
            ?.multiplier === null ||
        settlement.cashout
            ?.multiplier === undefined
            ? null
            : normalizeNonNegativeNumber(
                settlement.cashout
                    .multiplier
            );

    const returned =
        normalizeNonNegativeNumber(
            settlement.financial
                ?.returned
        );

    const profit =
        normalizeNumber(
            settlement.financial
                ?.profit
        );


    return {

        roundId:
            settlement.roundId,

        recordedAt:
            new Date()
                .toISOString(),

        result:
            settlement.result,

        crashMultiplier,

        /*
         Compact lookup fields.

         These make history.html rendering easier without
         having to traverse the full settlement record.
        */

        betAmount,

        cashoutMultiplier,

        returned,

        profit,

        automaticCashout:
            Boolean(
                settlement.cashout
                    ?.automatic
            ),

        /*
         Full normalized settlement record.

         This is the authoritative single-round detail.
        */

        settlement:
            clone(
                settlement
            )
    };
}


/* =========================================================
   ROUND EXISTS
========================================================= */

function hasRound(
    roundId
) {
    if (
        typeof roundId !==
            "string" ||
        roundId.length === 0
    ) {
        return false;
    }


    const history =
        getHistoryOldestFirst();


    return history.some(
        (entry) =>
            entry.roundId ===
            roundId
    );
}


/* =========================================================
   SAVE SETTLEMENT

   Main persistence operation.
========================================================= */

function recordHistory(
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


    let result =
        null;


    const savedData =
        updateData(
            (data) => {

                const history =
                    sanitizeHistoryArray(
                        data.history
                    );


                /* -----------------------------------------
                   Persistent duplicate protection

                   Unlike the statistics session Set, this
                   survives page reloads because we inspect
                   existing Local Storage history.
                ------------------------------------------ */

                const duplicate =
                    history.find(
                        (entry) =>
                            entry.roundId ===
                            roundId
                    );


                if (duplicate) {
                    result = {
                        success: true,

                        recorded: false,

                        reason:
                            "ROUND_ALREADY_RECORDED",

                        entry:
                            clone(
                                duplicate
                            )
                    };

                    data.history =
                        history;

                    return;
                }


                const entry =
                    buildHistoryEntry(
                        settlement
                    );


                history.push(
                    entry
                );


                /* -----------------------------------------
                   Enforce storage limit
                ------------------------------------------ */

                if (
                    history.length >
                    HISTORY_CONFIG.MAX_HISTORY
                ) {
                    data.history =
                        history.slice(
                            -HISTORY_CONFIG.MAX_HISTORY
                        );
                } else {
                    data.history =
                        history;
                }


                result = {
                    success: true,

                    recorded: true,

                    entry:
                        clone(
                            entry
                        ),

                    totalEntries:
                        data.history.length
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


    if (
        result &&
        result.recorded
    ) {
        notifyHistoryListeners(
            "HISTORY_RECORDED",
            {
                entry:
                    result.entry,

                totalEntries:
                    result.totalEntries
            }
        );
    }


    return result;
}


/* =========================================================
   GET ROUND BY ID
========================================================= */

function getRoundById(
    roundId
) {
    if (
        typeof roundId !==
            "string" ||
        roundId.length === 0
    ) {
        return null;
    }


    const history =
        getHistoryOldestFirst();


    const entry =
        history.find(
            (item) =>
                item.roundId ===
                roundId
        );


    return entry
        ? clone(entry)
        : null;
}


/* =========================================================
   GET SETTLEMENT BY ROUND ID

   Returns only the detailed settlement record.
========================================================= */

function getSettlementByRoundId(
    roundId
) {
    const entry =
        getRoundById(
            roundId
        );


    if (!entry) {
        return null;
    }


    return entry.settlement
        ? clone(
            entry.settlement
        )
        : null;
}


/* =========================================================
   RECENT HISTORY
========================================================= */

function getRecentHistory(
    limit =
        HISTORY_CONFIG.DEFAULT_LIMIT
) {
    const safeLimit =
        Number.isInteger(limit)
            ? Math.max(
                0,
                limit
            )
            : HISTORY_CONFIG.DEFAULT_LIMIT;


    return getHistory()
        .slice(
            0,
            safeLimit
        );
}


/* =========================================================
   RECENT 10 RESULTS

   Intended for the small recent-results strip.

   Returns newest first.
========================================================= */

function getRecentResults(
    limit =
        HISTORY_CONFIG.RECENT_RESULTS_LIMIT
) {
    const safeLimit =
        Number.isInteger(limit)
            ? Math.max(
                0,
                limit
            )
            : HISTORY_CONFIG
                .RECENT_RESULTS_LIMIT;


    return getRecentHistory(
        safeLimit
    ).map(
        (entry) => ({
            roundId:
                entry.roundId,

            crashMultiplier:
                normalizeNonNegativeNumber(
                    entry.crashMultiplier
                ),

            recordedAt:
                entry.recordedAt,

            result:
                entry.result
        })
    );
}


/* =========================================================
   GET PLAYER ROUND DETAIL

   Optimized for the history detail modal/page.
========================================================= */

function getPlayerRoundDetail(
    roundId
) {
    const entry =
        getRoundById(
            roundId
        );


    if (!entry) {
        return null;
    }


    const settlement =
        entry.settlement ?? {};


    const bet =
        settlement.bet ?? {};

    const cashout =
        settlement.cashout ?? {};

    const financial =
        settlement.financial ?? {};

    const timing =
        settlement.timing ?? {};


    return {

        roundId:
            entry.roundId,

        recordedAt:
            entry.recordedAt,

        result:
            entry.result,

        crashMultiplier:
            normalizeNonNegativeNumber(
                entry.crashMultiplier
            ),


        /* -------------------------------------------------
           Player bet
        -------------------------------------------------- */

        bet: {
            status:
                bet.status ?? null,

            amount:
                normalizeNonNegativeNumber(
                    bet.amount
                ),

            placedAt:
                normalizeTimestamp(
                    bet.placedAt
                ),

            activatedAt:
                normalizeTimestamp(
                    bet.activatedAt
                ),

            cancelledAt:
                normalizeTimestamp(
                    bet.cancelledAt
                )
        },


        /* -------------------------------------------------
           Auto Cash Out
        -------------------------------------------------- */

        autoCashout: {
            enabled:
                Boolean(
                    settlement.autoCashout
                        ?.enabled
                ),

            targetMultiplier:
                settlement.autoCashout
                    ?.targetMultiplier ??
                null
        },


        /* -------------------------------------------------
           Cash Out
        -------------------------------------------------- */

        cashout: {
            completed:
                Boolean(
                    cashout.completed
                ),

            automatic:
                Boolean(
                    cashout.automatic
                ),

            multiplier:
                cashout.multiplier ??
                null,

            amount:
                normalizeNonNegativeNumber(
                    cashout.amount
                ),

            profit:
                normalizeNumber(
                    cashout.profit
                ),

            completedAt:
                normalizeTimestamp(
                    cashout.completedAt
                )
        },


        /* -------------------------------------------------
           Financial result
        -------------------------------------------------- */

        financial: {
            wagered:
                normalizeNonNegativeNumber(
                    financial.wagered
                ),

            returned:
                normalizeNonNegativeNumber(
                    financial.returned
                ),

            profit:
                normalizeNumber(
                    financial.profit
                ),

            won:
                Boolean(
                    financial.won
                ),

            lost:
                Boolean(
                    financial.lost
                ),

            neutral:
                Boolean(
                    financial.neutral
                )
        },


        /* -------------------------------------------------
           Flight timing
        -------------------------------------------------- */

        timing: {
            flightStartedAt:
                normalizeTimestamp(
                    timing.flightStartedAt
                ),

            crashedAt:
                normalizeTimestamp(
                    timing.crashedAt
                ),

            flightElapsedMs:
                Math.max(
                    0,
                    Number(
                        timing.flightElapsedMs
                    ) || 0
                )
        }
    };
}


/* =========================================================
   FILTER HISTORY

   Supported:
   - result
   - hasBet
   - cashoutType
========================================================= */

function filterHistory({
    result = null,
    hasBet = null,
    cashoutType = null
} = {}) {
    let history =
        getHistory();


    /* -----------------------------------------------------
       Result filter
    ----------------------------------------------------- */

    if (result !== null) {
        history =
            history.filter(
                (entry) =>
                    entry.result ===
                    result
            );
    }


    /* -----------------------------------------------------
       Has-bet filter
    ----------------------------------------------------- */

    if (
        typeof hasBet ===
        "boolean"
    ) {
        history =
            history.filter(
                (entry) => {

                    const amount =
                        normalizeNonNegativeNumber(
                            entry.betAmount
                        );

                    return hasBet
                        ? amount > 0
                        : amount === 0;
                }
            );
    }


    /* -----------------------------------------------------
       Cashout type

       "MANUAL"
       "AUTO"
       "NONE"
    ----------------------------------------------------- */

    if (
        cashoutType ===
        "MANUAL"
    ) {
        history =
            history.filter(
                (entry) =>
                    entry.cashoutMultiplier !==
                        null &&
                    !entry.automaticCashout
            );
    }


    if (
        cashoutType ===
        "AUTO"
    ) {
        history =
            history.filter(
                (entry) =>
                    entry.cashoutMultiplier !==
                        null &&
                    entry.automaticCashout
            );
    }


    if (
        cashoutType ===
        "NONE"
    ) {
        history =
            history.filter(
                (entry) =>
                    entry.cashoutMultiplier ===
                    null
            );
    }


    return history;
}


/* =========================================================
   PAGINATE HISTORY
========================================================= */

function getHistoryPage({
    page = 1,
    pageSize =
        HISTORY_CONFIG.DEFAULT_LIMIT,

    result = null,
    hasBet = null,
    cashoutType = null
} = {}) {
    const safePage =
        Number.isInteger(page)
            ? Math.max(
                1,
                page
            )
            : 1;


    const safePageSize =
        Number.isInteger(
            pageSize
        )
            ? Math.max(
                1,
                pageSize
            )
            : HISTORY_CONFIG
                .DEFAULT_LIMIT;


    const filtered =
        filterHistory({
            result,
            hasBet,
            cashoutType
        });


    const totalItems =
        filtered.length;


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                totalItems /
                safePageSize
            )
        );


    const resolvedPage =
        Math.min(
            safePage,
            totalPages
        );


    const start =
        (
            resolvedPage - 1
        ) *
        safePageSize;


    const items =
        filtered.slice(
            start,
            start +
                safePageSize
        );


    return {

        page:
            resolvedPage,

        pageSize:
            safePageSize,

        totalItems,

        totalPages,

        hasPrevious:
            resolvedPage > 1,

        hasNext:
            resolvedPage <
            totalPages,

        items
    };
}


/* =========================================================
   HISTORY SUMMARY
========================================================= */

function getHistorySummary() {
    const history =
        getHistory();


    let winCount = 0;
    let lossCount = 0;
    let refundCount = 0;
    let noBetCount = 0;

    let manualCashoutCount = 0;
    let autoCashoutCount = 0;

    let totalCrashMultiplier = 0;

    let highestCrashMultiplier = 0;

    let lowestCrashMultiplier =
        Infinity;

    let totalCashoutMultiplier = 0;

    let cashoutMultiplierCount = 0;


    for (
        const entry
        of history
    ) {

        /* -------------------------------------------------
           Result
        -------------------------------------------------- */

        if (
            entry.result ===
            ROUND_RESULT.WIN
        ) {
            winCount += 1;
        }

        if (
            entry.result ===
            ROUND_RESULT.LOSS
        ) {
            lossCount += 1;
        }

        if (
            entry.result ===
            ROUND_RESULT.REFUND
        ) {
            refundCount += 1;
        }

        if (
            entry.result ===
            ROUND_RESULT.NO_BET
        ) {
            noBetCount += 1;
        }


        /* -------------------------------------------------
           Crash multiplier
        -------------------------------------------------- */

        const crashMultiplier =
            normalizeNonNegativeNumber(
                entry.crashMultiplier
            );


        totalCrashMultiplier +=
            crashMultiplier;


        highestCrashMultiplier =
            Math.max(
                highestCrashMultiplier,
                crashMultiplier
            );


        lowestCrashMultiplier =
            Math.min(
                lowestCrashMultiplier,
                crashMultiplier
            );


        /* -------------------------------------------------
           Cashout multiplier
        -------------------------------------------------- */

        if (
            entry.cashoutMultiplier !==
            null
        ) {
            const cashoutMultiplier =
                normalizeNonNegativeNumber(
                    entry.cashoutMultiplier
                );


            totalCashoutMultiplier +=
                cashoutMultiplier;


            cashoutMultiplierCount +=
                1;


            if (
                entry.automaticCashout
            ) {
                autoCashoutCount += 1;
            } else {
                manualCashoutCount += 1;
            }
        }
    }


    const totalRounds =
        history.length;


    const averageCrashMultiplier =
        totalRounds > 0
            ? roundTo(
                totalCrashMultiplier /
                totalRounds,
                2
            )
            : 0;


    const averageCashoutMultiplier =
        cashoutMultiplierCount > 0
            ? roundTo(
                totalCashoutMultiplier /
                cashoutMultiplierCount,
                2
            )
            : 0;


    return {

        totalRounds,

        winCount,

        lossCount,

        refundCount,

        noBetCount,

        manualCashoutCount,

        autoCashoutCount,

        highestCrashMultiplier:
            roundTo(
                highestCrashMultiplier,
                2
            ),

        lowestCrashMultiplier:
            lowestCrashMultiplier ===
            Infinity
                ? 0
                : roundTo(
                    lowestCrashMultiplier,
                    2
                ),

        averageCrashMultiplier,

        averageCashoutMultiplier
    };
}


/* =========================================================
   DELETE SINGLE HISTORY ENTRY

   Primarily useful for development/debug tools.
========================================================= */

function deleteHistoryEntry(
    roundId
) {
    if (
        typeof roundId !==
            "string" ||
        roundId.length === 0
    ) {
        return {
            success: false,

            reason:
                "INVALID_ROUND_ID"
        };
    }


    let result =
        null;


    const savedData =
        updateData(
            (data) => {

                const history =
                    sanitizeHistoryArray(
                        data.history
                    );


                const index =
                    history.findIndex(
                        (entry) =>
                            entry.roundId ===
                            roundId
                    );


                if (index < 0) {
                    result = {
                        success: false,

                        deleted: false,

                        reason:
                            "ROUND_NOT_FOUND"
                    };

                    return;
                }


                const [
                    deleted
                ] =
                    history.splice(
                        index,
                        1
                    );


                data.history =
                    history;


                result = {
                    success: true,

                    deleted: true,

                    entry:
                        clone(
                            deleted
                        )
                };
            }
        );


    if (!savedData) {
        return {
            success: false,

            deleted: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    if (
        result &&
        result.deleted
    ) {
        notifyHistoryListeners(
            "HISTORY_DELETED",
            {
                entry:
                    result.entry
            }
        );
    }


    return result;
}


/* =========================================================
   CLEAR HISTORY

   Does NOT reset:
   - wallet
   - login
   - statistics

   This distinction is intentional.
========================================================= */

function clearHistory() {
    const previous =
        getHistory();


    const savedData =
        updateData(
            (data) => {
                data.history = [];
            }
        );


    if (!savedData) {
        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    notifyHistoryListeners(
        "HISTORY_CLEARED",
        {
            removedCount:
                previous.length
        }
    );


    return {
        success: true,

        removedCount:
            previous.length
    };
}


/* =========================================================
   AUTO SAVE SETTLEMENT

   settlement.js emits SETTLEMENT_COMPLETE once the round has
   fully transitioned into ENDED.
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
            recordHistory(
                event.settlement
            );


        if (!result.success) {
            console.error(
                "[CG Flight] History write failed:",
                result
            );
        }
    }
);


/* =========================================================
   EXPORTS
========================================================= */

export {
    HISTORY_CONFIG,

    getHistory,
    getRecentHistory,
    getRecentResults,

    hasRound,

    getRoundById,
    getSettlementByRoundId,
    getPlayerRoundDetail,

    filterHistory,
    getHistoryPage,

    getHistorySummary,

    recordHistory,

    deleteHistoryEntry,
    clearHistory,

    subscribeToHistory
};
