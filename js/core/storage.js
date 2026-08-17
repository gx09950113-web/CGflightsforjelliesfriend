/* =========================================================
   CG FLIGHT
   js/core/storage.js

   Persistent Local Storage foundation.

   Responsibilities:
   - Define persistent root schema
   - Read Local Storage safely
   - Sanitize corrupted / legacy data
   - Migrate older schema versions
   - Persist updates
   - Provide atomic-style updateData()
   - Reset local game data
   - Preserve forward-compatible History entries

   IMPORTANT:
   This module does NOT:
   - Apply login rewards
   - Modify wallet rules
   - Calculate statistics
   - Generate game results
========================================================= */

import {
    clone,
    isPlainObject,
    isFiniteNumber
} from "./utils.js";


/* =========================================================
   STORAGE CONFIG
========================================================= */

const STORAGE_CONFIG = Object.freeze({

    KEY:
        "cg-flight-data",

    SCHEMA_VERSION:
        3
});


/* =========================================================
   DEFAULT ROOT DATA
========================================================= */

const DEFAULT_DATA = Object.freeze({

    schemaVersion:
        STORAGE_CONFIG.SCHEMA_VERSION,


    /* -----------------------------------------------------
       Player
    ----------------------------------------------------- */

    player: {

        initialized:
            false,

        createdAt:
            null
    },


    /* -----------------------------------------------------
       Wallet
    ----------------------------------------------------- */

    wallet: {

        balance:
            0,

        totalCredited:
            0,

        totalDebited:
            0,

        updatedAt:
            null
    },


    /* -----------------------------------------------------
       Login
    ----------------------------------------------------- */

    login: {

        lastLoginDate:
            null,

        streak:
            0,

        cycleDay:
            0,

        totalLoginDays:
            0,

        lastReward:
            0,

        lastRewardAt:
            null
    },


    /* -----------------------------------------------------
       Settings
    ----------------------------------------------------- */

    settings: {

        soundEnabled:
            true,

        musicEnabled:
            true
    },


    /* -----------------------------------------------------
       Statistics
    ----------------------------------------------------- */

    statistics: {

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
    },


    /* -----------------------------------------------------
       History

       Stored oldest -> newest.

       History entries remain flexible plain objects so
       later fields such as:

           statisticsRecorded
           statisticsRecordedAt

       are preserved automatically.
    ----------------------------------------------------- */

    history:
        []
});


/* =========================================================
   STORAGE LISTENERS
========================================================= */

const storageListeners =
    new Set();


function subscribeToStorage(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Storage listener must be a function."
        );
    }


    storageListeners.add(
        listener
    );


    return function unsubscribe() {

        storageListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY STORAGE LISTENERS
========================================================= */

function notifyStorageListeners(
    previous,
    current
) {
    const event = {

        previous:
            clone(previous),

        current:
            clone(current),

        timestamp:
            Date.now()
    };


    for (
        const listener
        of storageListeners
    ) {
        try {

            listener(
                event
            );

        } catch (error) {

            console.error(
                "[CG Flight] Storage listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   BASIC SANITIZERS
========================================================= */

function sanitizeBoolean(
    value,
    fallback
) {
    return typeof value ===
        "boolean"
        ? value
        : fallback;
}


function sanitizeNonNegativeNumber(
    value,
    fallback = 0
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric < 0
    ) {
        return fallback;
    }


    return numeric;
}


function sanitizeNonNegativeInteger(
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


function sanitizeNullableString(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }


    if (
        typeof value !==
        "string"
    ) {
        return null;
    }


    const trimmed =
        value.trim();


    return trimmed.length > 0
        ? trimmed
        : null;
}


/* =========================================================
   PLAYER SANITIZER
========================================================= */

function sanitizePlayer(
    player
) {
    const source =
        isPlainObject(player)
            ? player
            : {};


    return {

        initialized:
            sanitizeBoolean(
                source.initialized,
                false
            ),

        createdAt:
            sanitizeNullableString(
                source.createdAt
            )
    };
}


/* =========================================================
   WALLET SANITIZER
========================================================= */

function sanitizeWallet(
    wallet
) {
    const source =
        isPlainObject(wallet)
            ? wallet
            : {};


    return {

        balance:
            sanitizeNonNegativeNumber(
                source.balance
            ),

        totalCredited:
            sanitizeNonNegativeNumber(
                source.totalCredited
            ),

        totalDebited:
            sanitizeNonNegativeNumber(
                source.totalDebited
            ),

        updatedAt:
            sanitizeNullableString(
                source.updatedAt
            )
    };
}


/* =========================================================
   LOGIN SANITIZER
========================================================= */

function sanitizeLogin(
    login
) {
    const source =
        isPlainObject(login)
            ? login
            : {};


    const cycleDay =
        sanitizeNonNegativeInteger(
            source.cycleDay
        );


    return {

        lastLoginDate:
            sanitizeNullableString(
                source.lastLoginDate
            ),

        streak:
            sanitizeNonNegativeInteger(
                source.streak
            ),

        cycleDay:
            cycleDay >= 1 &&
            cycleDay <= 7
                ? cycleDay
                : 0,

        totalLoginDays:
            sanitizeNonNegativeInteger(
                source.totalLoginDays
            ),

        lastReward:
            sanitizeNonNegativeNumber(
                source.lastReward
            ),

        lastRewardAt:
            sanitizeNullableString(
                source.lastRewardAt
            )
    };
}


/* =========================================================
   SETTINGS SANITIZER
========================================================= */

function sanitizeSettings(
    settings
) {
    const source =
        isPlainObject(settings)
            ? settings
            : {};


    return {

        soundEnabled:
            sanitizeBoolean(
                source.soundEnabled,
                true
            ),

        musicEnabled:
            sanitizeBoolean(
                source.musicEnabled,
                true
            )
    };
}


/* =========================================================
   STATISTICS SANITIZER
========================================================= */

function sanitizeStatistics(
    statistics
) {
    const source =
        isPlainObject(
            statistics
        )
            ? statistics
            : {};


    return {

        totalRounds:
            sanitizeNonNegativeInteger(
                source.totalRounds
            ),

        totalBets:
            sanitizeNonNegativeInteger(
                source.totalBets
            ),

        totalWagered:
            sanitizeNonNegativeNumber(
                source.totalWagered
            ),

        totalReturned:
            sanitizeNonNegativeNumber(
                source.totalReturned
            ),

        totalProfit:
            sanitizeNonNegativeNumber(
                source.totalProfit
            ),

        totalLoss:
            sanitizeNonNegativeNumber(
                source.totalLoss
            ),

        cashoutCount:
            sanitizeNonNegativeInteger(
                source.cashoutCount
            ),

        crashLossCount:
            sanitizeNonNegativeInteger(
                source.crashLossCount
            ),

        highestCashoutMultiplier:
            sanitizeNonNegativeNumber(
                source.highestCashoutMultiplier
            ),

        highestCrashMultiplier:
            sanitizeNonNegativeNumber(
                source.highestCrashMultiplier
            ),

        highestSingleWin:
            sanitizeNonNegativeNumber(
                source.highestSingleWin
            )
    };
}


/* =========================================================
   HISTORY SANITIZER

   IMPORTANT:
   Do NOT rebuild entries from a fixed whitelist.

   History is intentionally forward-compatible because other
   modules may add fields later.
========================================================= */

function sanitizeHistory(
    history
) {
    if (
        !Array.isArray(
            history
        )
    ) {
        return [];
    }


    return history
        .filter(
            (entry) =>
                isPlainObject(
                    entry
                )
        )
        .map(
            (entry) =>
                clone(entry)
        );
}


/* =========================================================
   ROOT SANITIZER
========================================================= */

function sanitizeData(
    data
) {
    const source =
        isPlainObject(data)
            ? data
            : {};


    return {

        schemaVersion:
            STORAGE_CONFIG
                .SCHEMA_VERSION,

        player:
            sanitizePlayer(
                source.player
            ),

        wallet:
            sanitizeWallet(
                source.wallet
            ),

        login:
            sanitizeLogin(
                source.login
            ),

        settings:
            sanitizeSettings(
                source.settings
            ),

        statistics:
            sanitizeStatistics(
                source.statistics
            ),

        history:
            sanitizeHistory(
                source.history
            )
    };
}


/* =========================================================
   LEGACY MIGRATION

   This migration is intentionally tolerant.

   Older versions may have had:
   - balance at root level
   - firstLogin flags
   - loginStreak naming
   - sound/music booleans at root level
========================================================= */

function migrateLegacyData(
    rawData
) {
    if (
        !isPlainObject(
            rawData
        )
    ) {
        return clone(
            DEFAULT_DATA
        );
    }


    const migrated =
        clone(
            rawData
        );


    const version =
        Number(
            migrated.schemaVersion
        ) || 0;


    /* =====================================================
       VERSION < 1

       Early prototype compatibility.
    ====================================================== */

    if (
        version < 1
    ) {

        if (
            !isPlainObject(
                migrated.wallet
            )
        ) {
            migrated.wallet = {};
        }


        if (
            Number.isFinite(
                Number(
                    migrated.balance
                )
            )
        ) {
            migrated.wallet.balance =
                Number(
                    migrated.balance
                );
        }


        if (
            !isPlainObject(
                migrated.player
            )
        ) {
            migrated.player = {};
        }


        if (
            typeof migrated.initialized ===
            "boolean"
        ) {
            migrated.player.initialized =
                migrated.initialized;
        }


        if (
            !isPlainObject(
                migrated.settings
            )
        ) {
            migrated.settings = {};
        }


        if (
            typeof migrated.soundEnabled ===
            "boolean"
        ) {
            migrated.settings.soundEnabled =
                migrated.soundEnabled;
        }


        if (
            typeof migrated.musicEnabled ===
            "boolean"
        ) {
            migrated.settings.musicEnabled =
                migrated.musicEnabled;
        }
    }


    /* =====================================================
       VERSION < 2

       Normalize login fields.
    ====================================================== */

    if (
        version < 2
    ) {

        if (
            !isPlainObject(
                migrated.login
            )
        ) {
            migrated.login = {};
        }


        if (
            Number.isInteger(
                Number(
                    migrated.loginStreak
                )
            )
        ) {
            migrated.login.streak =
                Number(
                    migrated.loginStreak
                );
        }


        if (
            typeof migrated.lastLoginDate ===
            "string"
        ) {
            migrated.login.lastLoginDate =
                migrated.lastLoginDate;
        }


        if (
            !Number.isInteger(
                Number(
                    migrated.login.cycleDay
                )
            )
        ) {

            const streak =
                Number(
                    migrated.login.streak
                ) || 0;


            migrated.login.cycleDay =
                streak > 0
                    ? (
                        (
                            streak - 1
                        ) %
                        7
                    ) + 1
                    : 0;
        }
    }


    /* =====================================================
       VERSION < 3

       Current Statistics + History compatibility.
    ====================================================== */

    if (
        version < 3
    ) {

        if (
            !isPlainObject(
                migrated.statistics
            )
        ) {
            migrated.statistics = {};
        }


        if (
            !Array.isArray(
                migrated.history
            )
        ) {
            migrated.history = [];
        }


        /*
         Do NOT add statisticsRecorded markers here.

         statistics.js owns that migration because it must
         inspect aggregate statistics before deciding whether
         old History records were already counted.
        */
    }


    migrated.schemaVersion =
        STORAGE_CONFIG
            .SCHEMA_VERSION;


    return migrated;
}


/* =========================================================
   RAW READ
========================================================= */

function readRawStorage() {
    try {

        return localStorage.getItem(
            STORAGE_CONFIG.KEY
        );

    } catch (error) {

        console.error(
            "[CG Flight] Unable to access Local Storage:",
            error
        );


        return null;
    }
}


/* =========================================================
   RAW WRITE
========================================================= */

function writeRawStorage(
    data
) {
    try {

        localStorage.setItem(
            STORAGE_CONFIG.KEY,
            JSON.stringify(
                data
            )
        );


        return true;

    } catch (error) {

        console.error(
            "[CG Flight] Unable to write Local Storage:",
            error
        );


        return false;
    }
}


/* =========================================================
   READ DATA

   This is the canonical read path.
========================================================= */

function getData() {
    const raw =
        readRawStorage();


    if (
        raw === null
    ) {
        return clone(
            DEFAULT_DATA
        );
    }


    let parsed;


    try {

        parsed =
            JSON.parse(
                raw
            );

    } catch (error) {

        console.warn(
            "[CG Flight] Corrupted Local Storage JSON. Using defaults.",
            error
        );


        return clone(
            DEFAULT_DATA
        );
    }


    const migrated =
        migrateLegacyData(
            parsed
        );


    return sanitizeData(
        migrated
    );
}


/* =========================================================
   SAVE DATA
========================================================= */

function saveData(
    data
) {
    const sanitized =
        sanitizeData(
            data
        );


    const success =
        writeRawStorage(
            sanitized
        );


    return success
        ? clone(
            sanitized
        )
        : null;
}


/* =========================================================
   UPDATE DATA

   Main mutation API.

   Flow:
   1. Read latest storage
   2. Clone working state
   3. Run mutator synchronously
   4. Sanitize result
   5. Persist result
   6. Notify listeners
========================================================= */

function updateData(
    mutator
) {
    if (
        typeof mutator !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] updateData() requires a mutator function."
        );
    }


    const previous =
        getData();


    const working =
        clone(
            previous
        );


    try {

        const returned =
            mutator(
                working
            );


        /*
         updateData() is intentionally synchronous.

         Accidentally returning a Promise is almost always a
         programming error because Local Storage itself is
         synchronous.
        */

        if (
            returned &&
            typeof returned.then ===
            "function"
        ) {
            throw new TypeError(
                "[CG Flight] updateData() mutator must be synchronous."
            );
        }

    } catch (error) {

        console.error(
            "[CG Flight] Storage update mutator failed:",
            error
        );


        return null;
    }


    const next =
        sanitizeData(
            working
        );


    const saved =
        writeRawStorage(
            next
        );


    if (!saved) {
        return null;
    }


    notifyStorageListeners(
        previous,
        next
    );


    return clone(
        next
    );
}


/* =========================================================
   INITIALIZE STORAGE

   Writes sanitized current schema into Local Storage.

   Useful once at startup / first player initialization.
========================================================= */

function initializeStorage() {
    const existing =
        getData();


    const saved =
        saveData(
            existing
        );


    return saved;
}


/* =========================================================
   HAS STORED DATA
========================================================= */

function hasStoredData() {
    return (
        readRawStorage() !==
        null
    );
}


/* =========================================================
   RESET DATA
========================================================= */

function resetData() {
    const previous =
        getData();


    const next =
        clone(
            DEFAULT_DATA
        );


    const saved =
        writeRawStorage(
            next
        );


    if (!saved) {
        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    notifyStorageListeners(
        previous,
        next
    );


    return {
        success: true,

        data:
            clone(
                next
            )
    };
}


/* =========================================================
   REMOVE STORAGE ENTIRELY

   Different from resetData():
   - resetData() writes DEFAULT_DATA
   - clearStorage() removes the Local Storage key

   After clearStorage(), the next getData() behaves as a
   completely fresh installation.
========================================================= */

function clearStorage() {
    const previous =
        getData();


    try {

        localStorage.removeItem(
            STORAGE_CONFIG.KEY
        );

    } catch (error) {

        console.error(
            "[CG Flight] Unable to clear Local Storage:",
            error
        );


        return {
            success: false,

            reason:
                "STORAGE_REMOVE_FAILED"
        };
    }


    const current =
        clone(
            DEFAULT_DATA
        );


    notifyStorageListeners(
        previous,
        current
    );


    return {
        success: true,

        data:
            current
    };
}


/* =========================================================
   EXPORT DATA

   Helpful for debugging / backup.
========================================================= */

function exportData() {
    return clone(
        getData()
    );
}


/* =========================================================
   IMPORT DATA

   Useful for development/testing.

   Imported content is migrated and sanitized before saving.
========================================================= */

function importData(
    data
) {
    if (
        !isPlainObject(
            data
        )
    ) {
        return {
            success: false,

            reason:
                "INVALID_DATA"
        };
    }


    const previous =
        getData();


    const migrated =
        migrateLegacyData(
            data
        );


    const sanitized =
        sanitizeData(
            migrated
        );


    const saved =
        writeRawStorage(
            sanitized
        );


    if (!saved) {
        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    notifyStorageListeners(
        previous,
        sanitized
    );


    return {
        success: true,

        data:
            clone(
                sanitized
            )
    };
}


/* =========================================================
   STORAGE EVENT

   If multiple tabs of CG Flight are open, listen for another
   tab modifying the same Local Storage key.
========================================================= */

if (
    typeof window !==
        "undefined"
) {

    window.addEventListener(
        "storage",
        (event) => {

            if (
                event.key !==
                STORAGE_CONFIG.KEY
            ) {
                return;
            }


            let previous =
                clone(
                    DEFAULT_DATA
                );


            let current =
                clone(
                    DEFAULT_DATA
                );


            if (
                event.oldValue
            ) {
                try {

                    previous =
                        sanitizeData(
                            migrateLegacyData(
                                JSON.parse(
                                    event.oldValue
                                )
                            )
                        );

                } catch (error) {

                    /*
                     Keep default previous data.
                    */
                }
            }


            if (
                event.newValue
            ) {
                try {

                    current =
                        sanitizeData(
                            migrateLegacyData(
                                JSON.parse(
                                    event.newValue
                                )
                            )
                        );

                } catch (error) {

                    /*
                     Keep default current data.
                    */
                }
            }


            notifyStorageListeners(
                previous,
                current
            );
        }
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    STORAGE_CONFIG,
    DEFAULT_DATA,

    getData,
    saveData,
    updateData,

    initializeStorage,

    hasStoredData,

    resetData,
    clearStorage,

    exportData,
    importData,

    subscribeToStorage
};
