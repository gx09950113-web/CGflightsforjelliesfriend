/* =========================================================
   CG FLIGHT
   js/game/history.js

   Persistent round history manager.

   Responsibilities:
   - Persist canonical settlement records
   - Prevent duplicate round records
   - Read all history
   - Read recent Crash results
   - Build History page summary
   - Filter / paginate History
   - Provide detailed single-round data
   - Publish History change events
   - Clear / remove History for development

   IMPORTANT:
   history.js does NOT:
   - Determine WIN / LOSS
   - Calculate Settlement
   - Modify Wallet
   - Calculate aggregate Statistics

   settlement.js creates the canonical record.
   statistics.js separately records aggregates.
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
   HISTORY CONFIG
========================================================= */

const HISTORY_CONFIG = Object.freeze({

    DEFAULT_RECENT_LIMIT:
        10,

    DEFAULT_PAGE_SIZE:
        20,

    MAX_PAGE_SIZE:
        100
});


/* =========================================================
   HISTORY EVENT TYPES
========================================================= */

const HISTORY_EVENT_TYPES =
    Object.freeze({

        ENTRY_ADDED:
            "ENTRY_ADDED",

        ENTRY_REMOVED:
            "ENTRY_REMOVED",

        CLEARED:
            "CLEARED"
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
   NOTIFY
========================================================= */

function notifyHistoryListeners(
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
        of historyListeners
    ) {

        try {

            listener(
                payload
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
   BASIC NORMALIZERS
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
        2
    );
}


function normalizeMultiplier(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }


    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return null;
    }


    return Math.max(
        0,
        roundTo(
            numeric,
            2
        )
    );
}


/* =========================================================
   VALID RESULT
========================================================= */

function isValidResult(
    result
) {

    return Object.values(
        ROUND_RESULT
    ).includes(
        result
    );
}


/* =========================================================
   VALID HISTORY ENTRY
========================================================= */

function isValidHistoryEntry(
    entry
) {

    if (
        !entry ||
        typeof entry !==
            "object"
    ) {
        return false;
    }


    if (
        typeof entry.roundId !==
            "string" ||
        entry.roundId.trim().length ===
            0
    ) {
        return false;
    }


    if (
        !isValidResult(
            entry.result
        )
    ) {
        return false;
    }


    return true;
}


/* =========================================================
   NORMALIZE HISTORY ENTRY

   Important:
   Preserve unknown fields.

   statistics.js may later add:
       statisticsRecorded
       statisticsRecordedAt

   Future modules may also add new detail fields.
========================================================= */

function normalizeHistoryEntry(
    entry
) {

    if (
        !isValidHistoryEntry(
            entry
        )
    ) {
        return null;
    }


    const normalized =
        clone(
            entry
        );


    normalized.roundId =
        String(
            normalized.roundId
        );


    normalized.recordId =
        normalized.recordId ??
        null;


    normalized.recordedAt =
        normalized.recordedAt ??
        new Date()
            .toISOString();


    normalized.result =
        normalized.result;


    normalized.crashMultiplier =
        normalizeMultiplier(
            normalized.crashMultiplier
        );


    normalized.betAmount =
        normalizeMoney(
            normalized.betAmount ??
            normalized.bet?.amount
        );


    normalized.hasBet =
        typeof normalized.hasBet ===
            "boolean"
            ? normalized.hasBet
            : (
                normalized.betAmount > 0 &&
                ![
                    ROUND_RESULT.NO_BET
                ].includes(
                    normalized.result
                )
            );


    normalized.cashoutMultiplier =
        normalizeMultiplier(
            normalized.cashoutMultiplier ??
            normalized.cashout?.multiplier
        );


    normalized.automaticCashout =
        typeof normalized
            .automaticCashout ===
            "boolean"
            ? normalized
                .automaticCashout
            : Boolean(
                normalized.cashout
                    ?.automatic
            );


    normalized.cashoutType =
        normalized.cashoutType ??
        normalized.cashout?.type ??
        "NONE";


    normalized.wagered =
        normalizeMoney(
            normalized.wagered ??
            normalized.financial
                ?.wagered
        );


    normalized.returned =
        normalizeMoney(
            normalized.returned ??
            normalized.financial
                ?.returned
        );


    normalized.profit =
        normalizeMoney(
            normalized.profit ??
            normalized.financial
                ?.profit
        );


    if (
        typeof normalized
            .statisticsRecorded !==
            "boolean"
    ) {
        normalized.statisticsRecorded =
            false;
    }


    normalized.statisticsRecordedAt =
        normalized.statisticsRecordedAt ??
        null;


    return normalized;
}


/* =========================================================
   GET HISTORY

   Storage order:
       oldest -> newest

   Public API default:
       newest -> oldest
========================================================= */

function getHistory({
    newestFirst = true
} = {}) {

    const data =
        getData();


    const history =
        Array.isArray(
            data.history
        )
            ? data.history
            : [];


    const normalized =
        history
            .map(
                normalizeHistoryEntry
            )
            .filter(
                Boolean
            );


    if (
        newestFirst
    ) {

        normalized.reverse();
    }


    return clone(
        normalized
    );
}


/* =========================================================
   GET HISTORY COUNT
========================================================= */

function getHistoryCount() {

    return getHistory({
        newestFirst:
            false
    }).length;
}


/* =========================================================
   FIND ROUND
========================================================= */

function getHistoryEntryByRoundId(
    roundId
) {

    if (
        typeof roundId !==
            "string" ||
        roundId.trim().length ===
            0
    ) {
        return null;
    }


    const data =
        getData();


    const entry =
        Array.isArray(
            data.history
        )
            ? data.history.find(
                (item) =>
                    item &&
                    item.roundId ===
                        roundId
            )
            : null;


    if (!entry) {
        return null;
    }


    return clone(
        normalizeHistoryEntry(
            entry
        )
    );
}


/* =========================================================
   HAS ROUND
========================================================= */

function hasHistoryEntry(
    roundId
) {

    return (
        getHistoryEntryByRoundId(
            roundId
        ) !== null
    );
}


/* =========================================================
   ADD HISTORY ENTRY

   Canonical write API used by settlement.js.

   Idempotent by roundId:
       same roundId -> successful no-op
========================================================= */

function addHistoryEntry(
    record
) {

    const normalized =
        normalizeHistoryEntry(
            record
        );


    if (!normalized) {

        return {
            success: false,

            reason:
                "INVALID_HISTORY_ENTRY"
        };
    }


    let result =
        null;


    const saved =
        updateData(
            (data) => {

                if (
                    !Array.isArray(
                        data.history
                    )
                ) {
                    data.history = [];
                }


                const existing =
                    data.history.find(
                        (entry) =>
                            entry &&
                            entry.roundId ===
                                normalized.roundId
                    );


                if (existing) {

                    result = {

                        success: true,

                        added:
                            false,

                        reason:
                            "ALREADY_EXISTS",

                        entry:
                            clone(
                                existing
                            )
                    };


                    return;
                }


                data.history.push(
                    clone(
                        normalized
                    )
                );


                result = {

                    success: true,

                    added:
                        true,

                    entry:
                        clone(
                            normalized
                        ),

                    count:
                        data.history.length
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
                "UNKNOWN_HISTORY_ERROR"
        };
    }


    if (
        result.added
    ) {

        notifyHistoryListeners({

            type:
                HISTORY_EVENT_TYPES
                    .ENTRY_ADDED,

            roundId:
                normalized.roundId,

            entry:
                clone(
                    normalized
                ),

            count:
                result.count
        });
    }


    return clone(
        result
    );
}


/* =========================================================
   GET RECENT RESULTS

   Used by:
   - game page recent 10
   - history page recent 10
========================================================= */

function getRecentResults(
    limit =
        HISTORY_CONFIG
            .DEFAULT_RECENT_LIMIT
) {

    const numericLimit =
        Math.max(
            0,
            Math.trunc(
                Number(limit) ||
                0
            )
        );


    if (
        numericLimit === 0
    ) {
        return [];
    }


    return getHistory({
        newestFirst:
            true
    })
        .slice(
            0,
            numericLimit
        )
        .map(
            (entry) => ({

                roundId:
                    entry.roundId,

                recordedAt:
                    entry.recordedAt,

                result:
                    entry.result,

                crashMultiplier:
                    entry
                        .crashMultiplier,

                betAmount:
                    entry.betAmount,

                cashoutMultiplier:
                    entry
                        .cashoutMultiplier,

                automaticCashout:
                    entry
                        .automaticCashout,

                returned:
                    entry.returned,

                profit:
                    entry.profit
            })
        );
}


/* =========================================================
   HISTORY SUMMARY

   History page summary is separate from global player
   Statistics.

   This summarizes persisted round records directly.
========================================================= */

function getHistorySummary() {

    const history =
        getHistory({
            newestFirst:
                false
        });


    if (
        history.length === 0
    ) {

        return {

            totalRounds:
                0,

            winCount:
                0,

            lossCount:
                0,

            refundCount:
                0,

            noBetCount:
                0,

            highestCrashMultiplier:
                0,

            averageCrashMultiplier:
                0,

            highestCashoutMultiplier:
                0,

            averageCashoutMultiplier:
                0,

            totalWagered:
                0,

            totalReturned:
                0,

            netProfit:
                0
        };
    }


    let winCount =
        0;


    let lossCount =
        0;


    let refundCount =
        0;


    let noBetCount =
        0;


    let crashTotal =
        0;


    let crashCount =
        0;


    let highestCrashMultiplier =
        0;


    let cashoutTotal =
        0;


    let cashoutCount =
        0;


    let highestCashoutMultiplier =
        0;


    let totalWagered =
        0;


    let totalReturned =
        0;


    let netProfit =
        0;


    for (
        const entry
        of history
    ) {

        switch (
            entry.result
        ) {

            case ROUND_RESULT.WIN:

                winCount +=
                    1;

                break;


            case ROUND_RESULT.LOSS:

                lossCount +=
                    1;

                break;


            case ROUND_RESULT.REFUND:

                refundCount +=
                    1;

                break;


            case ROUND_RESULT.NO_BET:

                noBetCount +=
                    1;

                break;


            default:
                break;
        }


        /* -------------------------------------------------
           Crash
        -------------------------------------------------- */

        if (
            Number.isFinite(
                Number(
                    entry.crashMultiplier
                )
            )
        ) {

            const crash =
                Number(
                    entry.crashMultiplier
                );


            crashTotal +=
                crash;


            crashCount +=
                1;


            highestCrashMultiplier =
                Math.max(
                    highestCrashMultiplier,
                    crash
                );
        }


        /* -------------------------------------------------
           Cash Out
        -------------------------------------------------- */

        if (
            Number.isFinite(
                Number(
                    entry.cashoutMultiplier
                )
            )
        ) {

            const cashout =
                Number(
                    entry.cashoutMultiplier
                );


            cashoutTotal +=
                cashout;


            cashoutCount +=
                1;


            highestCashoutMultiplier =
                Math.max(
                    highestCashoutMultiplier,
                    cashout
                );
        }


        totalWagered =
            roundTo(
                totalWagered +
                normalizeMoney(
                    entry.wagered
                ),
                2
            );


        totalReturned =
            roundTo(
                totalReturned +
                normalizeMoney(
                    entry.returned
                ),
                2
            );


        netProfit =
            roundTo(
                netProfit +
                normalizeMoney(
                    entry.profit
                ),
                2
            );
    }


    return {

        totalRounds:
            history.length,

        winCount,

        lossCount,

        refundCount,

        noBetCount,

        highestCrashMultiplier:
            roundTo(
                highestCrashMultiplier,
                2
            ),

        averageCrashMultiplier:
            crashCount > 0
                ? roundTo(
                    crashTotal /
                    crashCount,
                    2
                )
                : 0,

        highestCashoutMultiplier:
            roundTo(
                highestCashoutMultiplier,
                2
            ),

        averageCashoutMultiplier:
            cashoutCount > 0
                ? roundTo(
                    cashoutTotal /
                    cashoutCount,
                    2
                )
                : 0,

        totalWagered:
            roundTo(
                totalWagered,
                2
            ),

        totalReturned:
            roundTo(
                totalReturned,
                2
            ),

        netProfit:
            roundTo(
                netProfit,
                2
            )
    };
}


/* =========================================================
   NORMALIZE RESULT FILTER
========================================================= */

function normalizeResultFilter(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }


    return isValidResult(
        value
    )
        ? value
        : null;
}


/* =========================================================
   NORMALIZE CASHOUT FILTER
========================================================= */

function normalizeCashoutTypeFilter(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }


    const normalized =
        String(
            value
        ).toUpperCase();


    if (
        [
            "AUTO",
            "MANUAL",
            "NONE"
        ].includes(
            normalized
        )
    ) {
        return normalized;
    }


    return null;
}


/* =========================================================
   MATCH HAS BET

   History UI supports:
       true
       false
       null -> all
========================================================= */

function matchesHasBet(
    entry,
    hasBet
) {

    if (
        hasBet === null ||
        hasBet === undefined
    ) {
        return true;
    }


    return (
        Boolean(
            entry.hasBet
        ) ===
        Boolean(
            hasBet
        )
    );
}


/* =========================================================
   MATCH CASHOUT TYPE
========================================================= */

function matchesCashoutType(
    entry,
    cashoutType
) {

    if (
        cashoutType === null
    ) {
        return true;
    }


    if (
        cashoutType ===
        "AUTO"
    ) {

        return (
            entry.cashoutMultiplier !==
                null &&
            entry.automaticCashout ===
                true
        );
    }


    if (
        cashoutType ===
        "MANUAL"
    ) {

        return (
            entry.cashoutMultiplier !==
                null &&
            entry.automaticCashout ===
                false
        );
    }


    if (
        cashoutType ===
        "NONE"
    ) {

        return (
            entry.cashoutMultiplier ===
            null
        );
    }


    return true;
}


/* =========================================================
   FILTER HISTORY
========================================================= */

function filterHistory({
    result = null,
    hasBet = null,
    cashoutType = null
} = {}) {

    const normalizedResult =
        normalizeResultFilter(
            result
        );


    const normalizedCashoutType =
        normalizeCashoutTypeFilter(
            cashoutType
        );


    return getHistory({
        newestFirst:
            true
    })
        .filter(
            (entry) => {

                if (
                    normalizedResult !==
                        null &&
                    entry.result !==
                        normalizedResult
                ) {
                    return false;
                }


                if (
                    !matchesHasBet(
                        entry,
                        hasBet
                    )
                ) {
                    return false;
                }


                if (
                    !matchesCashoutType(
                        entry,
                        normalizedCashoutType
                    )
                ) {
                    return false;
                }


                return true;
            }
        );
}


/* =========================================================
   GET HISTORY PAGE
========================================================= */

function getHistoryPage({
    page = 1,
    pageSize =
        HISTORY_CONFIG
            .DEFAULT_PAGE_SIZE,

    result = null,
    hasBet = null,
    cashoutType = null
} = {}) {

    const safePageSize =
        Math.max(
            1,
            Math.min(
                HISTORY_CONFIG
                    .MAX_PAGE_SIZE,

                Math.trunc(
                    Number(
                        pageSize
                    ) ||
                    HISTORY_CONFIG
                        .DEFAULT_PAGE_SIZE
                )
            )
        );


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


    const requestedPage =
        Math.max(
            1,
            Math.trunc(
                Number(page) ||
                1
            )
        );


    const safePage =
        Math.min(
            requestedPage,
            totalPages
        );


    const start =
        (
            safePage -
            1
        ) *
        safePageSize;


    const end =
        start +
        safePageSize;


    const items =
        filtered.slice(
            start,
            end
        );


    return {

        page:
            safePage,

        pageSize:
            safePageSize,

        totalItems,

        totalPages,

        hasPrevious:
            safePage > 1,

        hasNext:
            safePage <
            totalPages,

        items:
            clone(
                items
            ),

        filters: {

            result:
                normalizeResultFilter(
                    result
                ),

            hasBet:
                hasBet === null ||
                hasBet === undefined
                    ? null
                    : Boolean(
                        hasBet
                    ),

            cashoutType:
                normalizeCashoutTypeFilter(
                    cashoutType
                )
        }
    };
}


/* =========================================================
   GET PLAYER ROUND DETAIL

   Used by pages/history.js Modal.

   The canonical History record already contains the detail
   structure created by settlement.js.

   This helper provides a stable UI contract.
========================================================= */

function getPlayerRoundDetail(
    roundId
) {

    const entry =
        getHistoryEntryByRoundId(
            roundId
        );


    if (!entry) {
        return null;
    }


    return {

        /* -------------------------------------------------
           Identity / result
        -------------------------------------------------- */

        recordId:
            entry.recordId,

        roundId:
            entry.roundId,

        recordedAt:
            entry.recordedAt,

        result:
            entry.result,

        crashMultiplier:
            entry.crashMultiplier,


        /* -------------------------------------------------
           Bet
        -------------------------------------------------- */

        bet: {

            status:
                entry.bet?.status ??
                entry.betStatus ??
                null,

            amount:
                normalizeMoney(
                    entry.bet?.amount ??
                    entry.betAmount
                ),

            placedAt:
                entry.bet?.placedAt ??
                null,

            activatedAt:
                entry.bet
                    ?.activatedAt ??
                null,

            cancelledAt:
                entry.bet
                    ?.cancelledAt ??
                null,

            refundedAt:
                entry.bet
                    ?.refundedAt ??
                null,

            transactionId:
                entry.bet
                    ?.transactionId ??
                null,

            refundTransactionId:
                entry.bet
                    ?.refundTransactionId ??
                null
        },


        /* -------------------------------------------------
           Auto Cash Out
        -------------------------------------------------- */

        autoCashout: {

            enabled:
                Boolean(
                    entry.autoCashout
                        ?.enabled
                ),

            targetMultiplier:
                normalizeMultiplier(
                    entry.autoCashout
                        ?.targetMultiplier
                )
        },


        /* -------------------------------------------------
           Cash Out
        -------------------------------------------------- */

        cashout: {

            completed:
                Boolean(
                    entry.cashout
                        ?.completed ??
                    (
                        entry
                            .cashoutMultiplier !==
                        null
                    )
                ),

            automatic:
                Boolean(
                    entry.cashout
                        ?.automatic ??
                    entry
                        .automaticCashout
                ),

            type:
                entry.cashout?.type ??
                entry.cashoutType ??
                "NONE",

            multiplier:
                normalizeMultiplier(
                    entry.cashout
                        ?.multiplier ??
                    entry
                        .cashoutMultiplier
                ),

            amount:
                normalizeMoney(
                    entry.cashout
                        ?.amount ??
                    entry.returned
                ),

            profit:
                normalizeMoney(
                    entry.cashout
                        ?.profit ??
                    entry.profit
                ),

            completedAt:
                entry.cashout
                    ?.completedAt ??
                null,

            transactionId:
                entry.cashout
                    ?.transactionId ??
                null
        },


        /* -------------------------------------------------
           Financial
        -------------------------------------------------- */

        financial: {

            wagered:
                normalizeMoney(
                    entry.financial
                        ?.wagered ??
                    entry.wagered
                ),

            returned:
                normalizeMoney(
                    entry.financial
                        ?.returned ??
                    entry.returned
                ),

            profit:
                normalizeMoney(
                    entry.financial
                        ?.profit ??
                    entry.profit
                )
        },


        /* -------------------------------------------------
           Timing
        -------------------------------------------------- */

        timing: {

            roundCreatedAt:
                entry.timing
                    ?.roundCreatedAt ??
                null,

            flightStartedAt:
                entry.timing
                    ?.flightStartedAt ??
                null,

            crashedAt:
                entry.timing
                    ?.crashedAt ??
                null,

            flightElapsedMs:
                Math.max(
                    0,
                    Number(
                        entry.timing
                            ?.flightElapsedMs
                    ) || 0
                ),

            settledAt:
                entry.timing
                    ?.settledAt ??
                entry.recordedAt
        },


        /* -------------------------------------------------
           Statistics marker
        -------------------------------------------------- */

        statisticsRecorded:
            entry.statisticsRecorded ===
            true,

        statisticsRecordedAt:
            entry.statisticsRecordedAt ??
            null
    };
}


/* =========================================================
   REMOVE HISTORY ENTRY

   Development / repair helper.

   IMPORTANT:
   Removing a History entry does NOT automatically reverse
   aggregate Statistics.

   If used, call rebuildStatisticsFromHistory() afterwards.
========================================================= */

function removeHistoryEntry(
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


    let removed =
        null;


    const saved =
        updateData(
            (data) => {

                if (
                    !Array.isArray(
                        data.history
                    )
                ) {
                    return;
                }


                const index =
                    data.history.findIndex(
                        (entry) =>
                            entry &&
                            entry.roundId ===
                                roundId
                    );


                if (
                    index < 0
                ) {
                    return;
                }


                const [
                    entry
                ] =
                    data.history.splice(
                        index,
                        1
                    );


                removed =
                    clone(
                        entry
                    );
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    if (!removed) {

        return {
            success: false,

            reason:
                "HISTORY_ENTRY_NOT_FOUND"
        };
    }


    notifyHistoryListeners({

        type:
            HISTORY_EVENT_TYPES
                .ENTRY_REMOVED,

        roundId,

        entry:
            clone(
                removed
            )
    });


    return {

        success: true,

        entry:
            clone(
                removed
            )
    };
}


/* =========================================================
   CLEAR HISTORY

   Development helper.

   IMPORTANT:
   Does NOT automatically clear Statistics.
========================================================= */

function clearHistory() {

    const previousCount =
        getHistoryCount();


    const saved =
        updateData(
            (data) => {

                data.history =
                    [];
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    notifyHistoryListeners({

        type:
            HISTORY_EVENT_TYPES
                .CLEARED,

        previousCount
    });


    return {

        success: true,

        previousCount,

        count:
            0
    };
}


/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

function addHistory(
    record
) {

    return addHistoryEntry(
        record
    );
}


function getRecentHistory(
    limit
) {

    return getRecentResults(
        limit
    );
}


function getRoundDetail(
    roundId
) {

    return getPlayerRoundDetail(
        roundId
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    HISTORY_CONFIG,
    HISTORY_EVENT_TYPES,

    getHistory,
    getHistoryCount,

    getHistoryEntryByRoundId,
    hasHistoryEntry,

    addHistoryEntry,

    getRecentResults,
    getHistorySummary,

    filterHistory,
    getHistoryPage,

    getPlayerRoundDetail,

    removeHistoryEntry,
    clearHistory,

    subscribeToHistory,

    /* Compatibility */
    addHistory,
    getRecentHistory,
    getRoundDetail
};
