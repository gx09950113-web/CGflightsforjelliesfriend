/* =========================================================
   CG FLIGHT
   js/core/settings.js

   Persistent player settings layer.

   Responsibilities:
   - Read saved settings
   - Update sound settings
   - Update music settings
   - Toggle settings
   - Reset settings to defaults
   - Notify same-page subscribers about changes

   Persistent storage is handled through storage.js.
========================================================= */

import {
    getData,
    updateData,
    subscribeToStorageChanges
} from "./storage.js";


/* =========================================================
   DEFAULT SETTINGS

   Keep this synchronized with storage.js defaults.
========================================================= */

const DEFAULT_SETTINGS = Object.freeze({
    soundEnabled: true,
    musicEnabled: true
});


/* =========================================================
   SETTING KEYS
========================================================= */

const SETTING_KEYS = Object.freeze({
    SOUND_ENABLED: "soundEnabled",
    MUSIC_ENABLED: "musicEnabled"
});


/* =========================================================
   LOCAL SUBSCRIBERS

   Native localStorage "storage" events do not fire in the
   same browser tab that performed the write.

   Therefore settings.js maintains its own same-page
   subscriber system.
========================================================= */

const settingsListeners = new Set();


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


function isBoolean(value) {
    return typeof value === "boolean";
}


/* =========================================================
   SANITIZE SETTINGS

   storage.js already sanitizes these values, but this module
   still validates them defensively.
========================================================= */

function sanitizeSettings(settings) {
    const source =
        isPlainObject(settings)
            ? settings
            : {};

    return {
        soundEnabled:
            isBoolean(source.soundEnabled)
                ? source.soundEnabled
                : DEFAULT_SETTINGS.soundEnabled,

        musicEnabled:
            isBoolean(source.musicEnabled)
                ? source.musicEnabled
                : DEFAULT_SETTINGS.musicEnabled
    };
}


/* =========================================================
   CLONE SETTINGS
========================================================= */

function cloneSettings(settings) {
    return {
        soundEnabled:
            settings.soundEnabled,

        musicEnabled:
            settings.musicEnabled
    };
}


/* =========================================================
   GET ALL SETTINGS
========================================================= */

function getSettings() {
    const data = getData();

    return sanitizeSettings(
        data.settings
    );
}


/* =========================================================
   GET SINGLE SETTING
========================================================= */

function getSetting(key) {
    const settings = getSettings();

    if (
        !Object.prototype.hasOwnProperty.call(
            settings,
            key
        )
    ) {
        return undefined;
    }

    return settings[key];
}


/* =========================================================
   SOUND
========================================================= */

function isSoundEnabled() {
    return getSettings().soundEnabled;
}


function setSoundEnabled(enabled) {
    if (!isBoolean(enabled)) {
        return {
            success: false,
            reason: "INVALID_VALUE"
        };
    }

    return updateSettings({
        soundEnabled: enabled
    });
}


function toggleSoundEnabled() {
    const current =
        isSoundEnabled();

    return setSoundEnabled(
        !current
    );
}


/* =========================================================
   MUSIC
========================================================= */

function isMusicEnabled() {
    return getSettings().musicEnabled;
}


function setMusicEnabled(enabled) {
    if (!isBoolean(enabled)) {
        return {
            success: false,
            reason: "INVALID_VALUE"
        };
    }

    return updateSettings({
        musicEnabled: enabled
    });
}


function toggleMusicEnabled() {
    const current =
        isMusicEnabled();

    return setMusicEnabled(
        !current
    );
}


/* =========================================================
   UPDATE SETTINGS

   Supports partial updates.

   Example:

   updateSettings({
       soundEnabled: false
   });

   Or:

   updateSettings({
       soundEnabled: true,
       musicEnabled: false
   });
========================================================= */

function updateSettings(partialSettings) {
    if (!isPlainObject(partialSettings)) {
        return {
            success: false,
            reason: "INVALID_SETTINGS"
        };
    }

    const allowedKeys = [
        SETTING_KEYS.SOUND_ENABLED,
        SETTING_KEYS.MUSIC_ENABLED
    ];

    const requestedChanges = {};

    for (const key of allowedKeys) {
        if (
            !Object.prototype.hasOwnProperty.call(
                partialSettings,
                key
            )
        ) {
            continue;
        }

        const value =
            partialSettings[key];

        if (!isBoolean(value)) {
            return {
                success: false,
                reason: "INVALID_VALUE",
                key
            };
        }

        requestedChanges[key] = value;
    }

    const changeKeys =
        Object.keys(
            requestedChanges
        );

    if (changeKeys.length === 0) {
        return {
            success: false,
            reason: "NO_CHANGES"
        };
    }

    let result = null;

    const savedData =
        updateData((data) => {
            const currentSettings =
                sanitizeSettings(
                    data.settings
                );

            const previous =
                cloneSettings(
                    currentSettings
                );

            const next = {
                ...currentSettings,
                ...requestedChanges
            };

            data.settings = next;

            const changedKeys =
                changeKeys.filter(
                    (key) =>
                        previous[key] !==
                        next[key]
                );

            result = {
                success: true,

                changed:
                    changedKeys.length > 0,

                changedKeys,

                previous:
                    cloneSettings(
                        previous
                    ),

                settings:
                    cloneSettings(
                        next
                    )
            };
        });

    if (!savedData) {
        return {
            success: false,
            reason: "STORAGE_WRITE_FAILED"
        };
    }

    if (
        result &&
        result.changed
    ) {
        notifySettingsListeners(
            result.settings,
            result.previous,
            result.changedKeys
        );
    }

    return result;
}


/* =========================================================
   RESET SETTINGS

   Restores current settings to defaults.
========================================================= */

function resetSettings() {
    const current =
        getSettings();

    const next = {
        ...DEFAULT_SETTINGS
    };

    let result = null;

    const savedData =
        updateData((data) => {
            data.settings = {
                ...next
            };

            const changedKeys =
                Object.keys(next)
                    .filter(
                        (key) =>
                            current[key] !==
                            next[key]
                    );

            result = {
                success: true,

                changed:
                    changedKeys.length > 0,

                changedKeys,

                previous:
                    cloneSettings(
                        current
                    ),

                settings:
                    cloneSettings(
                        next
                    )
            };
        });

    if (!savedData) {
        return {
            success: false,
            reason: "STORAGE_WRITE_FAILED"
        };
    }

    if (
        result &&
        result.changed
    ) {
        notifySettingsListeners(
            result.settings,
            result.previous,
            result.changedKeys
        );
    }

    return result;
}


/* =========================================================
   SUBSCRIBE

   Listener receives:

   {
       settings,
       previous,
       changedKeys,
       source
   }
========================================================= */

function subscribeToSettings(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Settings listener must be a function."
        );
    }

    settingsListeners.add(
        listener
    );

    return function unsubscribe() {
        settingsListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY LOCAL LISTENERS
========================================================= */

function notifySettingsListeners(
    settings,
    previous,
    changedKeys,
    source = "LOCAL"
) {
    const payload = {
        settings:
            cloneSettings(
                settings
            ),

        previous:
            cloneSettings(
                previous
            ),

        changedKeys:
            [...changedKeys],

        source
    };

    for (
        const listener
        of settingsListeners
    ) {
        try {
            listener(payload);
        } catch (error) {
            console.error(
                "[CG Flight] Settings listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   CROSS-TAB SYNCHRONIZATION

   storage.js watches localStorage changes from other tabs.

   When another CG Flight tab changes settings, update local
   subscribers as well.
========================================================= */

let lastKnownSettings =
    getSettings();


subscribeToStorageChanges(
    (data) => {
        const nextSettings =
            sanitizeSettings(
                data.settings
            );

        const previous =
            lastKnownSettings;

        const changedKeys =
            Object.keys(
                DEFAULT_SETTINGS
            ).filter(
                (key) =>
                    previous[key] !==
                    nextSettings[key]
            );

        lastKnownSettings =
            cloneSettings(
                nextSettings
            );

        if (
            changedKeys.length === 0
        ) {
            return;
        }

        notifySettingsListeners(
            nextSettings,
            previous,
            changedKeys,
            "EXTERNAL"
        );
    }
);


/* =========================================================
   UPDATE LAST KNOWN SETTINGS AFTER SAME-TAB CHANGES

   Keep the cross-tab comparison baseline synchronized.
========================================================= */

subscribeToSettings(
    ({ settings }) => {
        lastKnownSettings =
            cloneSettings(
                settings
            );
    }
);


/* =========================================================
   SETTINGS SUMMARY

   Useful for UI initialization.
========================================================= */

function getSettingsSummary() {
    const settings =
        getSettings();

    return {
        soundEnabled:
            settings.soundEnabled,

        musicEnabled:
            settings.musicEnabled
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    DEFAULT_SETTINGS,
    SETTING_KEYS,

    getSettings,
    getSetting,
    getSettingsSummary,

    isSoundEnabled,
    setSoundEnabled,
    toggleSoundEnabled,

    isMusicEnabled,
    setMusicEnabled,
    toggleMusicEnabled,

    updateSettings,
    resetSettings,

    subscribeToSettings
};
