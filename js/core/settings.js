/* =========================================================
   CG FLIGHT
   js/core/settings.js

   Persistent player settings.

   Responsibilities:
   - Read persisted settings
   - Enable / disable sound effects
   - Enable / disable background music
   - Toggle settings
   - Restore defaults
   - Publish setting change events

   IMPORTANT:
   This module stores preferences only.

   It does NOT:
   - Play audio
   - Pause audio directly
   - Create Audio objects
   - Control page DOM

   audio.js and page controllers react to settings changes.
========================================================= */


import {
    getData,
    updateData,
    subscribeToStorage
} from "./storage.js";

import {
    clone
} from "./utils.js";


/* =========================================================
   SETTINGS DEFAULTS
========================================================= */

const DEFAULT_SETTINGS = Object.freeze({

    soundEnabled:
        true,

    musicEnabled:
        true
});


/* =========================================================
   SETTINGS KEYS
========================================================= */

const SETTINGS_KEYS = Object.freeze({

    SOUND_ENABLED:
        "soundEnabled",

    MUSIC_ENABLED:
        "musicEnabled"
});


/* =========================================================
   SETTINGS LISTENERS
========================================================= */

const settingsListeners =
    new Set();


/* =========================================================
   LAST KNOWN SETTINGS

   Used to prevent duplicate notifications and to detect
   changes originating from storage events / other tabs.
========================================================= */

let lastKnownSettings =
    null;


/* =========================================================
   NORMALIZE SETTINGS
========================================================= */

function normalizeSettings(
    settings
) {
    const source =
        settings &&
        typeof settings === "object"
            ? settings
            : {};


    return {

        soundEnabled:
            typeof source.soundEnabled ===
                "boolean"
                ? source.soundEnabled
                : DEFAULT_SETTINGS
                    .soundEnabled,

        musicEnabled:
            typeof source.musicEnabled ===
                "boolean"
                ? source.musicEnabled
                : DEFAULT_SETTINGS
                    .musicEnabled
    };
}


/* =========================================================
   GET SETTINGS
========================================================= */

function getSettings() {

    const data =
        getData();


    const settings =
        normalizeSettings(
            data.settings
        );


    lastKnownSettings =
        clone(
            settings
        );


    return clone(
        settings
    );
}


/* =========================================================
   GET INDIVIDUAL VALUES
========================================================= */

function isSoundEnabled() {

    return getSettings()
        .soundEnabled;
}


function isMusicEnabled() {

    return getSettings()
        .musicEnabled;
}


/* =========================================================
   COMPARE SETTINGS
========================================================= */

function getChangedKeys(
    previous,
    current
) {
    const changedKeys =
        [];


    if (
        previous.soundEnabled !==
        current.soundEnabled
    ) {
        changedKeys.push(
            SETTINGS_KEYS
                .SOUND_ENABLED
        );
    }


    if (
        previous.musicEnabled !==
        current.musicEnabled
    ) {
        changedKeys.push(
            SETTINGS_KEYS
                .MUSIC_ENABLED
        );
    }


    return changedKeys;
}


/* =========================================================
   NOTIFY LISTENERS

   Subscriber payload:

   {
       settings,
       previousSettings,
       changedKeys,
       source,
       timestamp
   }
========================================================= */

function notifySettingsListeners({
    settings,
    previousSettings,
    changedKeys,
    source = "LOCAL"
}) {

    if (
        !Array.isArray(
            changedKeys
        ) ||
        changedKeys.length === 0
    ) {
        return;
    }


    const payload = {

        settings:
            clone(
                settings
            ),

        previousSettings:
            clone(
                previousSettings
            ),

        changedKeys:
            [...changedKeys],

        source,

        timestamp:
            Date.now()
    };


    for (
        const listener
        of settingsListeners
    ) {
        try {

            listener(
                payload
            );

        } catch (error) {

            console.error(
                "[CG Flight] Settings listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   SUBSCRIBE
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


    /*
     Make sure comparison state exists before any future
     Storage notification arrives.
    */

    if (
        lastKnownSettings ===
        null
    ) {
        lastKnownSettings =
            getSettings();
    }


    return function unsubscribe() {

        settingsListeners.delete(
            listener
        );
    };
}


/* =========================================================
   SET SETTINGS

   Supports partial updates:

   setSettings({
       soundEnabled: false
   });

   Unknown fields are ignored.
========================================================= */

function setSettings(
    updates
) {

    if (
        !updates ||
        typeof updates !==
            "object"
    ) {
        return {
            success: false,

            reason:
                "INVALID_SETTINGS"
        };
    }


    const previousSettings =
        getSettings();


    const nextSettings = {
        ...previousSettings
    };


    let hasRecognizedField =
        false;


    /* -----------------------------------------------------
       Sound
    ----------------------------------------------------- */

    if (
        Object.prototype
            .hasOwnProperty
            .call(
                updates,
                SETTINGS_KEYS
                    .SOUND_ENABLED
            )
    ) {

        if (
            typeof updates.soundEnabled !==
            "boolean"
        ) {
            return {
                success: false,

                reason:
                    "INVALID_SOUND_SETTING"
            };
        }


        nextSettings.soundEnabled =
            updates.soundEnabled;


        hasRecognizedField =
            true;
    }


    /* -----------------------------------------------------
       Music
    ----------------------------------------------------- */

    if (
        Object.prototype
            .hasOwnProperty
            .call(
                updates,
                SETTINGS_KEYS
                    .MUSIC_ENABLED
            )
    ) {

        if (
            typeof updates.musicEnabled !==
            "boolean"
        ) {
            return {
                success: false,

                reason:
                    "INVALID_MUSIC_SETTING"
            };
        }


        nextSettings.musicEnabled =
            updates.musicEnabled;


        hasRecognizedField =
            true;
    }


    if (
        !hasRecognizedField
    ) {
        return {
            success: false,

            reason:
                "NO_RECOGNIZED_SETTINGS"
        };
    }


    const changedKeys =
        getChangedKeys(
            previousSettings,
            nextSettings
        );


    /*
     Setting the same value again is valid but does not
     require a Local Storage write or notification.
    */

    if (
        changedKeys.length === 0
    ) {

        return {
            success: true,

            changed:
                false,

            settings:
                clone(
                    previousSettings
                ),

            changedKeys:
                []
        };
    }


    const saved =
        updateData(
            (data) => {

                data.settings =
                    normalizeSettings({
                        ...data.settings,
                        ...nextSettings
                    });
            }
        );


    if (!saved) {

        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    const currentSettings =
        normalizeSettings(
            saved.settings
        );


    lastKnownSettings =
        clone(
            currentSettings
        );


    notifySettingsListeners({

        settings:
            currentSettings,

        previousSettings,

        changedKeys,

        source:
            "LOCAL"
    });


    return {

        success: true,

        changed:
            true,

        settings:
            clone(
                currentSettings
            ),

        changedKeys:
            [...changedKeys]
    };
}


/* =========================================================
   SET SOUND ENABLED
========================================================= */

function setSoundEnabled(
    enabled
) {

    if (
        typeof enabled !==
        "boolean"
    ) {
        return {
            success: false,

            reason:
                "INVALID_SOUND_SETTING"
        };
    }


    return setSettings({
        soundEnabled:
            enabled
    });
}


/* =========================================================
   SET MUSIC ENABLED
========================================================= */

function setMusicEnabled(
    enabled
) {

    if (
        typeof enabled !==
        "boolean"
    ) {
        return {
            success: false,

            reason:
                "INVALID_MUSIC_SETTING"
        };
    }


    return setSettings({
        musicEnabled:
            enabled
    });
}


/* =========================================================
   TOGGLE SOUND
========================================================= */

function toggleSoundEnabled() {

    const settings =
        getSettings();


    return setSoundEnabled(
        !settings.soundEnabled
    );
}


/* =========================================================
   TOGGLE MUSIC
========================================================= */

function toggleMusicEnabled() {

    const settings =
        getSettings();


    return setMusicEnabled(
        !settings.musicEnabled
    );
}


/* =========================================================
   RESET SETTINGS
========================================================= */

function resetSettings() {

    const previousSettings =
        getSettings();


    const changedKeys =
        getChangedKeys(
            previousSettings,
            DEFAULT_SETTINGS
        );


    const saved =
        updateData(
            (data) => {

                data.settings = {

                    soundEnabled:
                        DEFAULT_SETTINGS
                            .soundEnabled,

                    musicEnabled:
                        DEFAULT_SETTINGS
                            .musicEnabled
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


    const currentSettings =
        normalizeSettings(
            saved.settings
        );


    lastKnownSettings =
        clone(
            currentSettings
        );


    if (
        changedKeys.length > 0
    ) {

        notifySettingsListeners({

            settings:
                currentSettings,

            previousSettings,

            changedKeys,

            source:
                "RESET"
        });
    }


    return {

        success: true,

        changed:
            changedKeys.length > 0,

        settings:
            clone(
                currentSettings
            ),

        changedKeys:
            [...changedKeys]
    };
}


/* =========================================================
   STORAGE SYNCHRONIZATION

   Handles changes from:
   - another browser tab
   - direct storage import/reset
   - other modules replacing root settings

   Local setSettings() also triggers storage listeners.
   Duplicate events are prevented by comparing the latest
   known values.
========================================================= */

subscribeToStorage(
    ({
        current
    }) => {

        const currentSettings =
            normalizeSettings(
                current?.settings
            );


        if (
            lastKnownSettings ===
            null
        ) {

            lastKnownSettings =
                clone(
                    currentSettings
                );


            return;
        }


        const previousSettings =
            clone(
                lastKnownSettings
            );


        const changedKeys =
            getChangedKeys(
                previousSettings,
                currentSettings
            );


        if (
            changedKeys.length === 0
        ) {
            return;
        }


        lastKnownSettings =
            clone(
                currentSettings
            );


        notifySettingsListeners({

            settings:
                currentSettings,

            previousSettings,

            changedKeys,

            source:
                "STORAGE"
        });
    }
);


/* =========================================================
   EXPORTS
========================================================= */

export {
    DEFAULT_SETTINGS,
    SETTINGS_KEYS,

    getSettings,

    isSoundEnabled,
    isMusicEnabled,

    setSettings,

    setSoundEnabled,
    setMusicEnabled,

    toggleSoundEnabled,
    toggleMusicEnabled,

    resetSettings,

    subscribeToSettings
};
