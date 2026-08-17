/* =========================================================
   CG FLIGHT
   js/core/storage.js

   Local storage data layer.

   Schema version: 2

   Responsibilities:
   - Create default local player data
   - Read local player data
   - Write local player data
   - Validate / repair stored data
   - Handle schema migration
   - Provide safe update helpers
   - Reset local game data

   IMPORTANT:
   This module does NOT implement game rules.

   It does NOT:
   - Give first-login coins
   - Give daily-login rewards
   - Calculate login streaks
   - Deduct bets
   - Add cashout rewards
   - Generate crash results

   Those systems use this module as the persistence layer.
========================================================= */


/* =========================================================
   STORAGE CONFIG
========================================================= */

const STORAGE_KEY = "cgFlightData";

const CURRENT_SCHEMA_VERSION = 2;


/* =========================================================
   DEFAULT DATA FACTORY

   Always return a NEW object.
========================================================= */

function createDefaultData() {
    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,

        player: {
            initialized: false,
            createdAt: null,
            lastUpdatedAt: null
        },

        wallet: {
            balance: 0,

            firstLoginBonusClaimed: false,

            transactions: []
        },

        login: {
            lastLoginDate: null,
            streak: 0,
            cycleDay: 0
        },

        settings: {
            soundEnabled: true,
            musicEnabled: true
        },

        statistics: {
            totalRounds: 0,
            totalBets: 0,
            totalWagered: 0,
            totalReturned: 0,
            totalProfit: 0,
            totalLoss: 0,

            cashoutCount: 0,
            crashLossCount: 0,

            highestCashoutMultiplier: 0,
            highestCrashMultiplier: 0,
            highestSingleWin: 0
        },

        history: []
    };
}


/* =========================================================
   TYPE HELPERS
========================================================= */

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}


function isFiniteNumber(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}


function isNonNegativeNumber(value) {
    return (
        isFiniteNumber(value) &&
        value >= 0
    );
}


function isNonNegativeInteger(value) {
    return (
        Number.isInteger(value) &&
        value >= 0
    );
}


function isBoolean(value) {
    return typeof value === "boolean";
}


function isNullableString(value) {
    return (
        value === null ||
        typeof value === "string"
    );
}


/* =========================================================
   VALUE SANITIZERS
========================================================= */

function sanitizeNonNegativeNumber(
    value,
    fallback = 0
) {
    return isNonNegativeNumber(value)
        ? value
        : fallback;
}


function sanitizeNonNegativeInteger(
    value,
    fallback = 0
) {
    return isNonNegativeInteger(value)
        ? value
        : fallback;
}


function sanitizeBoolean(
    value,
    fallback = false
) {
    return isBoolean(value)
        ? value
        : fallback;
}


function sanitizeNullableString(
    value,
    fallback = null
) {
    return isNullableString(value)
        ? value
        : fallback;
}


/* =========================================================
   CLONE
========================================================= */

function cloneData(value) {
    if (
        typeof structuredClone === "function"
    ) {
        return structuredClone(value);
    }

    return JSON.parse(
        JSON.stringify(value)
    );
}


/* =========================================================
   TRANSACTION SANITIZER
========================================================= */

function sanitizeWalletTransaction(
    transaction
) {
    if (!isPlainObject(transaction)) {
        return null;
    }

    const id =
        typeof transaction.id === "string"
            ? transaction.id
            : null;

    const type =
        typeof transaction.type === "string"
            ? transaction.type
            : null;

    const direction =
        transaction.direction === "CREDIT" ||
        transaction.direction === "DEBIT"
            ? transaction.direction
            : null;

    const amount =
        sanitizeNonNegativeNumber(
            transaction.amount,
            -1
        );

    const balanceBefore =
        sanitizeNonNegativeNumber(
            transaction.balanceBefore,
            -1
        );

    const balanceAfter =
        sanitizeNonNegativeNumber(
            transaction.balanceAfter,
            -1
        );

    const createdAt =
        typeof transaction.createdAt === "string"
            ? transaction.createdAt
            : null;

    if (
        id === null ||
        type === null ||
        direction === null ||
        amount <= 0 ||
        balanceBefore < 0 ||
        balanceAfter < 0 ||
        createdAt === null
    ) {
        return null;
    }

    return {
        id,
        type,
        direction,
        amount,
        balanceBefore,
        balanceAfter,
        createdAt,

        metadata:
            transaction.metadata === undefined
                ? null
                : cloneData(
                    transaction.metadata
                )
    };
}


/* =========================================================
   HISTORY ENTRY SANITIZER

   History format will become stricter later when
   history.js is implemented.

   For now:
   - only plain objects are accepted
   - objects are cloned
========================================================= */

function sanitizeHistoryEntry(entry) {
    if (!isPlainObject(entry)) {
        return null;
    }

    return cloneData(entry);
}


/* =========================================================
   MAIN SANITIZATION
========================================================= */

function sanitizeData(rawData) {
    const defaults =
        createDefaultData();

    if (!isPlainObject(rawData)) {
        return defaults;
    }

    const sanitized =
        createDefaultData();


    /* -----------------------------------------------------
       Schema
    ----------------------------------------------------- */

    sanitized.schemaVersion =
        CURRENT_SCHEMA_VERSION;


    /* -----------------------------------------------------
       Player
    ----------------------------------------------------- */

    const rawPlayer =
        isPlainObject(rawData.player)
            ? rawData.player
            : {};

    sanitized.player.initialized =
        sanitizeBoolean(
            rawPlayer.initialized,
            defaults.player.initialized
        );

    sanitized.player.createdAt =
        sanitizeNullableString(
            rawPlayer.createdAt,
            defaults.player.createdAt
        );

    sanitized.player.lastUpdatedAt =
        sanitizeNullableString(
            rawPlayer.lastUpdatedAt,
            defaults.player.lastUpdatedAt
        );


    /* -----------------------------------------------------
       Wallet
    ----------------------------------------------------- */

    const rawWallet =
        isPlainObject(rawData.wallet)
            ? rawData.wallet
            : {};

    sanitized.wallet.balance =
        sanitizeNonNegativeNumber(
            rawWallet.balance,
            defaults.wallet.balance
        );

    sanitized.wallet.firstLoginBonusClaimed =
        sanitizeBoolean(
            rawWallet.firstLoginBonusClaimed,
            defaults.wallet.firstLoginBonusClaimed
        );

    sanitized.wallet.transactions =
        Array.isArray(
            rawWallet.transactions
        )
            ? rawWallet.transactions
                .map(
                    sanitizeWalletTransaction
                )
                .filter(Boolean)
            : [];


    /* -----------------------------------------------------
       Login
    ----------------------------------------------------- */

    const rawLogin =
        isPlainObject(rawData.login)
            ? rawData.login
            : {};

    sanitized.login.lastLoginDate =
        sanitizeNullableString(
            rawLogin.lastLoginDate,
            defaults.login.lastLoginDate
        );

    sanitized.login.streak =
        sanitizeNonNegativeInteger(
            rawLogin.streak,
            defaults.login.streak
        );

    sanitized.login.cycleDay =
        sanitizeNonNegativeInteger(
            rawLogin.cycleDay,
            defaults.login.cycleDay
        );

    if (
        sanitized.login.cycleDay > 7
    ) {
        sanitized.login.cycleDay = 0;
    }


    /* -----------------------------------------------------
       Settings
    ----------------------------------------------------- */

    const rawSettings =
        isPlainObject(rawData.settings)
            ? rawData.settings
            : {};

    sanitized.settings.soundEnabled =
        sanitizeBoolean(
            rawSettings.soundEnabled,
            defaults.settings.soundEnabled
        );

    sanitized.settings.musicEnabled =
        sanitizeBoolean(
            rawSettings.musicEnabled,
            defaults.settings.musicEnabled
        );


    /* -----------------------------------------------------
       Statistics
    ----------------------------------------------------- */

    const rawStatistics =
        isPlainObject(rawData.statistics)
            ? rawData.statistics
            : {};

    sanitized.statistics.totalRounds =
        sanitizeNonNegativeInteger(
            rawStatistics.totalRounds,
            defaults.statistics.totalRounds
        );

    sanitized.statistics.totalBets =
        sanitizeNonNegativeInteger(
            rawStatistics.totalBets,
            defaults.statistics.totalBets
        );

    sanitized.statistics.totalWagered =
        sanitizeNonNegativeNumber(
            rawStatistics.totalWagered,
            defaults.statistics.totalWagered
        );

    sanitized.statistics.totalReturned =
        sanitizeNonNegativeNumber(
            rawStatistics.totalReturned,
            defaults.statistics.totalReturned
        );

    sanitized.statistics.totalProfit =
        sanitizeNonNegativeNumber(
            rawStatistics.totalProfit,
            defaults.statistics.totalProfit
        );

    sanitized.statistics.totalLoss =
        sanitizeNonNegativeNumber(
            rawStatistics.totalLoss,
            defaults.statistics.totalLoss
        );

    sanitized.statistics.cashoutCount =
        sanitizeNonNegativeInteger(
            rawStatistics.cashoutCount,
            defaults.statistics.cashoutCount
        );

    sanitized.statistics.crashLossCount =
        sanitizeNonNegativeInteger(
            rawStatistics.crashLossCount,
            defaults.statistics.crashLossCount
        );

    sanitized.statistics.highestCashoutMultiplier =
        sanitizeNonNegativeNumber(
            rawStatistics.highestCashoutMultiplier,
            defaults.statistics.highestCashoutMultiplier
        );

    sanitized.statistics.highestCrashMultiplier =
        sanitizeNonNegativeNumber(
            rawStatistics.highestCrashMultiplier,
            defaults.statistics.highestCrashMultiplier
        );

    sanitized.statistics.highestSingleWin =
        sanitizeNonNegativeNumber(
            rawStatistics.highestSingleWin,
            defaults.statistics.highestSingleWin
        );


    /* -----------------------------------------------------
       History
    ----------------------------------------------------- */

    sanitized.history =
        Array.isArray(rawData.history)
            ? rawData.history
                .map(
                    sanitizeHistoryEntry
                )
                .filter(Boolean)
            : [];


    return sanitized;
}


/* =========================================================
   RAW STORAGE ACCESS
========================================================= */

function readRawStorage() {
    try {
        return localStorage.getItem(
            STORAGE_KEY
        );
    } catch (error) {
        console.error(
            "[CG Flight] Unable to read localStorage:",
            error
        );

        return null;
    }
}


function writeRawStorage(
    serializedData
) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            serializedData
        );

        return true;
    } catch (error) {
        console.error(
            "[CG Flight] Unable to write localStorage:",
            error
        );

        return false;
    }
}


/* =========================================================
   MIGRATION: V1 -> V2

   V1 wallet:
   {
       balance
   }

   V2 wallet:
   {
       balance,
       firstLoginBonusClaimed,
       transactions
   }
========================================================= */

function migrateV1ToV2(data) {
    const migrated =
        cloneData(data);

    if (
        !isPlainObject(
            migrated.wallet
        )
    ) {
        migrated.wallet = {};
    }

    if (
        typeof
        migrated.wallet
            .firstLoginBonusClaimed
        !== "boolean"
    ) {
        /*
         Important migration behavior:

         Existing V1 players may already have received
         the original first-login bonus before this flag
         existed.

         If player.initialized === true, treat the bonus
         as already claimed to prevent duplicate +10,000.
        */

        migrated.wallet
            .firstLoginBonusClaimed =
            Boolean(
                migrated.player &&
                migrated.player.initialized
            );
    }

    if (
        !Array.isArray(
            migrated.wallet.transactions
        )
    ) {
        migrated.wallet.transactions = [];
    }

    migrated.schemaVersion = 2;

    return migrated;
}


/* =========================================================
   MIGRATION PIPELINE
========================================================= */

function migrateAndSanitize(
    rawData
) {
    if (!isPlainObject(rawData)) {
        return createDefaultData();
    }

    let workingData =
        cloneData(rawData);

    let version =
        Number.isInteger(
            workingData.schemaVersion
        )
            ? workingData.schemaVersion
            : 0;


    /*
     Legacy / version 0 data.

     Treat as V1-compatible first.
    */

    if (version < 1) {
        workingData.schemaVersion = 1;
        version = 1;
    }


    /*
     V1 -> V2
    */

    if (version < 2) {
        workingData =
            migrateV1ToV2(
                workingData
            );

        version = 2;
    }


    /*
     Future migrations:

     if (version < 3) {
         workingData =
             migrateV2ToV3(
                 workingData
             );

         version = 3;
     }
    */


    return sanitizeData(
        workingData
    );
}


/* =========================================================
   SAVE DATA
========================================================= */

function saveData(data) {
    const sanitized =
        sanitizeData(data);

    sanitized.player.lastUpdatedAt =
        new Date().toISOString();

    try {
        const serialized =
            JSON.stringify(
                sanitized
            );

        const success =
            writeRawStorage(
                serialized
            );

        return success
            ? cloneData(
                sanitized
            )
            : null;
    } catch (error) {
        console.error(
            "[CG Flight] Unable to serialize game data:",
            error
        );

        return null;
    }
}


/* =========================================================
   LOAD DATA
========================================================= */

function loadData() {
    const raw =
        readRawStorage();

    /*
     No local data yet.

     Return defaults only.
     Player initialization remains separate.
    */

    if (raw === null) {
        return createDefaultData();
    }

    try {
        const parsed =
            JSON.parse(raw);

        const migrated =
            migrateAndSanitize(
                parsed
            );

        /*
         Save migrated / repaired structure back.
        */

        const saved =
            saveData(migrated);

        return cloneData(
            saved ?? migrated
        );
    } catch (error) {
        console.warn(
            "[CG Flight] Stored data is invalid. Restoring default structure.",
            error
        );

        const fallback =
            createDefaultData();

        const saved =
            saveData(fallback);

        return cloneData(
            saved ?? fallback
        );
    }
}


/* =========================================================
   CHECK STORED DATA
========================================================= */

function hasStoredData() {
    return (
        readRawStorage() !== null
    );
}


/* =========================================================
   GET DATA
========================================================= */

function getData() {
    return loadData();
}


/* =========================================================
   UPDATE DATA

   Usage:

   updateData((data) => {
       data.wallet.balance += 1000;
   });

   Or:

   updateData((data) => {
       data.settings.musicEnabled = false;
       return data;
   });

   Returning undefined saves the mutated working copy.
========================================================= */

function updateData(updater) {
    if (
        typeof updater !== "function"
    ) {
        throw new TypeError(
            "[CG Flight] updateData requires a function."
        );
    }

    const currentData =
        loadData();

    const workingCopy =
        cloneData(currentData);

    let updaterResult;

    try {
        updaterResult =
            updater(
                workingCopy
            );
    } catch (error) {
        console.error(
            "[CG Flight] Data update callback failed:",
            error
        );

        throw error;
    }

    const nextData =
        updaterResult === undefined
            ? workingCopy
            : updaterResult;

    if (!isPlainObject(nextData)) {
        throw new TypeError(
            "[CG Flight] updateData callback must return an object or undefined."
        );
    }

    return saveData(
        nextData
    );
}


/* =========================================================
   PLAYER INITIALIZATION

   Does NOT award coins.

   Returns:
   {
       created,
       data
   }
========================================================= */

function initializePlayerData() {
    const data =
        loadData();

    if (
        data.player.initialized
    ) {
        return {
            created: false,
            data
        };
    }

    const now =
        new Date().toISOString();

    data.player.initialized =
        true;

    data.player.createdAt =
        now;

    const saved =
        saveData(data);

    return {
        created: true,
        data:
            saved ?? data
    };
}


/* =========================================================
   RESET DATA

   Completely removes CG Flight data.
========================================================= */

function resetData() {
    try {
        localStorage.removeItem(
            STORAGE_KEY
        );

        return true;
    } catch (error) {
        console.error(
            "[CG Flight] Unable to reset local data:",
            error
        );

        return false;
    }
}


/* =========================================================
   RESTORE DEFAULT DATA

   Leaves a valid default object in localStorage.
========================================================= */

function restoreDefaultData() {
    return saveData(
        createDefaultData()
    );
}


/* =========================================================
   STORAGE INFO
========================================================= */

function getStorageInfo() {
    const raw =
        readRawStorage();

    return {
        key:
            STORAGE_KEY,

        schemaVersion:
            CURRENT_SCHEMA_VERSION,

        exists:
            raw !== null,

        bytes:
            raw === null
                ? 0
                : getByteSize(raw)
    };
}


/* =========================================================
   BYTE SIZE
========================================================= */

function getByteSize(value) {
    if (
        typeof TextEncoder !==
        "undefined"
    ) {
        return (
            new TextEncoder()
                .encode(value)
                .length
        );
    }

    try {
        return (
            new Blob([value])
                .size
        );
    } catch {
        return value.length;
    }
}


/* =========================================================
   VALIDATE STORED DATA
========================================================= */

function validateStoredData() {
    const raw =
        readRawStorage();

    if (raw === null) {
        return true;
    }

    try {
        const parsed =
            JSON.parse(raw);

        migrateAndSanitize(
            parsed
        );

        return true;
    } catch {
        return false;
    }
}


/* =========================================================
   EXTERNAL STORAGE CHANGE LISTENERS
========================================================= */

const storageListeners =
    new Set();


function subscribeToStorageChanges(
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
   NATIVE STORAGE EVENT

   Fires only when another tab/window modifies
   the same localStorage key.
========================================================= */

function handleStorageEvent(event) {
    if (
        event.storageArea !==
            localStorage ||
        event.key !==
            STORAGE_KEY
    ) {
        return;
    }

    const data =
        loadData();

    for (
        const listener
        of storageListeners
    ) {
        try {
            listener(
                cloneData(data)
            );
        } catch (error) {
            console.error(
                "[CG Flight] Storage listener failed:",
                error
            );
        }
    }
}


window.addEventListener(
    "storage",
    handleStorageEvent
);


/* =========================================================
   EXPORTS
========================================================= */

export {
    STORAGE_KEY,
    CURRENT_SCHEMA_VERSION,

    createDefaultData,

    hasStoredData,

    loadData,
    getData,
    saveData,
    updateData,

    initializePlayerData,

    resetData,
    restoreDefaultData,

    getStorageInfo,
    validateStoredData,

    subscribeToStorageChanges
};
