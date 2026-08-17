/* =========================================================
   CG FLIGHT
   js/core/storage.js

   Local storage data layer.

   Responsibilities:
   - Create default local player data
   - Read local player data
   - Write local player data
   - Validate / repair stored data
   - Handle schema version
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

const CURRENT_SCHEMA_VERSION = 1;


/* =========================================================
   DEFAULT DATA FACTORY

   Always return a NEW object.
   Never reuse the same object reference.
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
            balance: 0
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
    if (!isNonNegativeNumber(value)) {
        return fallback;
    }

    return value;
}


function sanitizeNonNegativeInteger(
    value,
    fallback = 0
) {
    if (!isNonNegativeInteger(value)) {
        return fallback;
    }

    return value;
}


function sanitizeBoolean(
    value,
    fallback = false
) {
    if (!isBoolean(value)) {
        return fallback;
    }

    return value;
}


function sanitizeNullableString(
    value,
    fallback = null
) {
    if (!isNullableString(value)) {
        return fallback;
    }

    return value;
}


/* =========================================================
   DATA SANITIZATION

   This protects the game from:
   - Broken JSON
   - Missing properties
   - Old data structures
   - Invalid values
   - Manual localStorage edits

   It does NOT try to prevent cheating.
   Pure frontend storage cannot provide authoritative security.
========================================================= */

function sanitizeData(rawData) {
    const defaults = createDefaultData();

    if (!isPlainObject(rawData)) {
        return defaults;
    }

    const sanitized = createDefaultData();


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


    /*
     Login cycle only supports 0–7.

     0:
     No login cycle has been initialized yet.

     1–7:
     Current seven-day cycle position.
    */

    if (sanitized.login.cycleDay > 7) {
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
            ? rawData.history.filter(
                (entry) => isPlainObject(entry)
            )
            : [];


    return sanitized;
}


/* =========================================================
   JSON CLONE

   Prevent external modules from modifying the stored object
   by reference.
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


function writeRawStorage(serializedData) {
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
   LOAD DATA
========================================================= */

function loadData() {
    const raw =
        readRawStorage();

    /*
     No saved data exists yet.

     Return default data but DO NOT automatically
     initialize the player here.

     First-login logic belongs elsewhere.
    */

    if (raw === null) {
        return createDefaultData();
    }

    try {
        const parsed =
            JSON.parse(raw);

        const sanitized =
            migrateAndSanitize(parsed);

        /*
         If stored data required repairing,
         save the sanitized version back.
        */

        saveData(sanitized);

        return cloneData(sanitized);
    } catch (error) {
        console.warn(
            "[CG Flight] Stored data is invalid. Resetting structure.",
            error
        );

        const fallback =
            createDefaultData();

        saveData(fallback);

        return cloneData(fallback);
    }
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
            JSON.stringify(sanitized);

        const success =
            writeRawStorage(serialized);

        return success
            ? cloneData(sanitized)
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
   MIGRATION

   Future versions can be migrated here.

   Example:
   schemaVersion 1 -> schemaVersion 2

   For now, version 1 is the first schema.
========================================================= */

function migrateAndSanitize(rawData) {
    if (!isPlainObject(rawData)) {
        return createDefaultData();
    }

    let workingData =
        cloneData(rawData);

    const storedVersion =
        Number.isInteger(
            workingData.schemaVersion
        )
            ? workingData.schemaVersion
            : 0;


    /*
     Version 0 represents data created before
     schemaVersion existed.

     Currently sanitizeData is enough to upgrade it.
    */

    if (storedVersion < 1) {
        workingData.schemaVersion = 1;
    }


    /*
     Future example:

     if (storedVersion < 2) {
         workingData = migrateV1ToV2(workingData);
     }
    */


    /*
     If data comes from a newer game version,
     we still sanitize the fields we currently know.

     This avoids hard crashes.
    */

    return sanitizeData(
        workingData
    );
}


/* =========================================================
   CHECK SAVED DATA
========================================================= */

function hasStoredData() {
    return readRawStorage() !== null;
}


/* =========================================================
   GET DATA

   Alias intended for other modules.
========================================================= */

function getData() {
    return loadData();
}


/* =========================================================
   UPDATE DATA

   Usage:

   updateData((data) => {
       data.wallet.balance += 1000;
       return data;
   });

   The callback receives a cloned working copy.

   Returning undefined is also allowed because the mutated
   working copy will be saved automatically.
========================================================= */

function updateData(updater) {
    if (typeof updater !== "function") {
        throw new TypeError(
            "[CG Flight] updateData requires a function."
        );
    }

    const currentData =
        loadData();

    const workingCopy =
        cloneData(currentData);

    let result;

    try {
        result =
            updater(workingCopy);
    } catch (error) {
        console.error(
            "[CG Flight] Data update callback failed:",
            error
        );

        throw error;
    }

    const nextData =
        result === undefined
            ? workingCopy
            : result;

    if (!isPlainObject(nextData)) {
        throw new TypeError(
            "[CG Flight] updateData callback must return an object or undefined."
        );
    }

    return saveData(nextData);
}


/* =========================================================
   INITIALIZE PLAYER STORAGE

   IMPORTANT:
   This function only marks the player data as initialized.

   It DOES NOT give 10,000 coins.

   wallet.js / login logic will handle reward transactions.
========================================================= */

function initializePlayerData() {
    const data =
        loadData();

    if (data.player.initialized) {
        return {
            created: false,
            data
        };
    }

    const now =
        new Date().toISOString();

    data.player.initialized = true;
    data.player.createdAt = now;

    const saved =
        saveData(data);

    return {
        created: true,
        data: saved ?? data
    };
}


/* =========================================================
   RESET DATA

   Completely removes CG Flight player data.

   Useful during development or if a future reset feature
   is added to Settings.

   This does NOT reload the page automatically.
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
   REPLACE WITH DEFAULT DATA

   Unlike resetData(), this leaves a valid default object
   inside localStorage.
========================================================= */

function restoreDefaultData() {
    const defaults =
        createDefaultData();

    return saveData(defaults);
}


/* =========================================================
   STORAGE INFORMATION
========================================================= */

function getStorageInfo() {
    const raw =
        readRawStorage();

    const exists =
        raw !== null;

    return {
        key: STORAGE_KEY,
        schemaVersion:
            CURRENT_SCHEMA_VERSION,
        exists,
        bytes:
            raw === null
                ? 0
                : new Blob([raw]).size
    };
}


/* =========================================================
   EXTERNAL STORAGE CHANGES

   This event fires when another tab changes localStorage.

   Same-tab writes do not trigger the native storage event.

   Other modules may subscribe through
   subscribeToStorageChanges().
========================================================= */

const storageListeners =
    new Set();


function handleStorageEvent(event) {
    if (
        event.storageArea !== localStorage ||
        event.key !== STORAGE_KEY
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


function subscribeToStorageChanges(listener) {
    if (typeof listener !== "function") {
        throw new TypeError(
            "[CG Flight] Storage listener must be a function."
        );
    }

    storageListeners.add(listener);

    return function unsubscribe() {
        storageListeners.delete(listener);
    };
}


window.addEventListener(
    "storage",
    handleStorageEvent
);


/* =========================================================
   DEBUG VALIDATION

   Useful during development.

   Returns true if the stored data can be parsed and
   successfully sanitized.
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

        sanitizeData(parsed);

        return true;
    } catch {
        return false;
    }
}


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
