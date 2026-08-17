/* =========================================================
   CG FLIGHT
   js/core/audio.js

   Audio management layer.

   Responsibilities:
   - Manage BGM playback
   - Manage SFX playback
   - Respect persistent sound/music settings
   - Handle browser autoplay restrictions
   - Pause/resume audio on visibility changes
   - Provide centralized audio paths
   - Avoid duplicated audio instances
========================================================= */

import {
    isSoundEnabled,
    isMusicEnabled,
    subscribeToSettings
} from "./settings.js";


/* =========================================================
   AUDIO PATHS
========================================================= */

const AUDIO_PATHS = Object.freeze({

    bgm: {
        lobby:
            "./assets/sounds/bgm/lobby.mp3",

        game:
            "./assets/sounds/bgm/game.mp3"
    },

    sfx: {
        click:
            "./assets/sounds/sfx/click.mp3",

        enterRoom:
            "./assets/sounds/sfx/enter-room.mp3",

        loginReward:
            "./assets/sounds/sfx/login-reward.mp3",

        bet:
            "./assets/sounds/sfx/bet.mp3",

        betCancel:
            "./assets/sounds/sfx/bet-cancel.mp3",

        countdown:
            "./assets/sounds/sfx/countdown.mp3",

        takeoff:
            "./assets/sounds/sfx/takeoff.mp3",

        flyingLoop:
            "./assets/sounds/sfx/flying-loop.mp3",

        multiplierRise:
            "./assets/sounds/sfx/multiplier-rise.mp3",

        cashout:
            "./assets/sounds/sfx/cashout.mp3",

        autoCashout:
            "./assets/sounds/sfx/auto-cashout.mp3",

        crash:
            "./assets/sounds/sfx/crash.mp3",

        win:
            "./assets/sounds/sfx/win.mp3",

        insufficientBalance:
            "./assets/sounds/sfx/insufficient-balance.mp3"
    }
});


/* =========================================================
   DEFAULT VOLUMES
========================================================= */

const DEFAULT_VOLUMES = Object.freeze({

    master: 1,

    bgm: 0.45,

    sfx: 0.7,

    specific: {
        click: 0.55,

        enterRoom: 0.65,

        loginReward: 0.7,

        bet: 0.7,

        betCancel: 0.65,

        countdown: 0.75,

        takeoff: 0.8,

        flyingLoop: 0.35,

        multiplierRise: 0.4,

        cashout: 0.8,

        autoCashout: 0.8,

        crash: 0.9,

        win: 0.85,

        insufficientBalance: 0.75
    }
});


/* =========================================================
   INTERNAL STATE
========================================================= */

const audioState = {

    masterVolume:
        DEFAULT_VOLUMES.master,

    bgmVolume:
        DEFAULT_VOLUMES.bgm,

    sfxVolume:
        DEFAULT_VOLUMES.sfx,

    currentBgmKey: null,

    currentBgm: null,

    bgmWasPlayingBeforeHidden: false,

    userHasInteracted: false
};


/* =========================================================
   AUDIO CACHE
========================================================= */

const bgmCache = new Map();

const sfxCache = new Map();


/* =========================================================
   VALUE HELPERS
========================================================= */

function clampVolume(value) {
    if (
        typeof value !== "number" ||
        !Number.isFinite(value)
    ) {
        return 1;
    }

    return Math.min(
        1,
        Math.max(
            0,
            value
        )
    );
}


/* =========================================================
   CREATE AUDIO ELEMENT
========================================================= */

function createAudioElement(
    src,
    {
        loop = false,
        preload = "auto"
    } = {}
) {
    const audio =
        new Audio(src);

    audio.loop =
        loop;

    audio.preload =
        preload;

    return audio;
}


/* =========================================================
   GET BGM INSTANCE
========================================================= */

function getBgmAudio(key) {
    if (
        !Object.prototype.hasOwnProperty.call(
            AUDIO_PATHS.bgm,
            key
        )
    ) {
        return null;
    }

    if (
        bgmCache.has(key)
    ) {
        return bgmCache.get(key);
    }

    const audio =
        createAudioElement(
            AUDIO_PATHS.bgm[key],
            {
                loop: true,
                preload: "auto"
            }
        );

    bgmCache.set(
        key,
        audio
    );

    return audio;
}


/* =========================================================
   GET SFX INSTANCE
========================================================= */

function getSfxAudio(key) {
    if (
        !Object.prototype.hasOwnProperty.call(
            AUDIO_PATHS.sfx,
            key
        )
    ) {
        return null;
    }

    if (
        sfxCache.has(key)
    ) {
        return sfxCache.get(key);
    }

    const audio =
        createAudioElement(
            AUDIO_PATHS.sfx[key],
            {
                loop:
                    key === "flyingLoop",

                preload: "auto"
            }
        );

    sfxCache.set(
        key,
        audio
    );

    return audio;
}


/* =========================================================
   CALCULATE VOLUME
========================================================= */

function getEffectiveBgmVolume() {
    return clampVolume(
        audioState.masterVolume *
        audioState.bgmVolume
    );
}


function getEffectiveSfxVolume(
    key,
    overrideVolume = null
) {
    const specific =
        overrideVolume !== null
            ? clampVolume(
                overrideVolume
            )
            : (
                DEFAULT_VOLUMES
                    .specific[key] ??
                1
            );

    return clampVolume(
        audioState.masterVolume *
        audioState.sfxVolume *
        specific
    );
}


/* =========================================================
   PLAY BGM
========================================================= */

async function playBgm(
    key,
    {
        restart = false
    } = {}
) {
    if (!isMusicEnabled()) {
        return {
            success: false,
            reason: "MUSIC_DISABLED"
        };
    }

    const audio =
        getBgmAudio(key);

    if (!audio) {
        return {
            success: false,
            reason: "UNKNOWN_BGM"
        };
    }


    /* -----------------------------------------------------
       Same BGM already active
    ----------------------------------------------------- */

    if (
        audioState.currentBgmKey === key &&
        audioState.currentBgm === audio
    ) {
        audio.volume =
            getEffectiveBgmVolume();

        if (
            restart
        ) {
            try {
                audio.currentTime = 0;
            } catch {
                /* Ignore seek errors. */
            }
        }

        if (!audio.paused) {
            return {
                success: true,
                alreadyPlaying: true
            };
        }
    }


    /* -----------------------------------------------------
       Stop previous BGM
    ----------------------------------------------------- */

    if (
        audioState.currentBgm &&
        audioState.currentBgm !== audio
    ) {
        audioState.currentBgm.pause();

        try {
            audioState.currentBgm.currentTime = 0;
        } catch {
            /* Ignore seek errors. */
        }
    }


    audioState.currentBgmKey =
        key;

    audioState.currentBgm =
        audio;

    audio.volume =
        getEffectiveBgmVolume();


    if (restart) {
        try {
            audio.currentTime = 0;
        } catch {
            /* Ignore seek errors. */
        }
    }


    try {
        await audio.play();

        return {
            success: true,
            key
        };
    } catch (error) {
        return {
            success: false,
            reason: "PLAYBACK_BLOCKED",
            error
        };
    }
}


/* =========================================================
   PAUSE BGM
========================================================= */

function pauseBgm() {
    if (
        !audioState.currentBgm
    ) {
        return false;
    }

    audioState.currentBgm.pause();

    return true;
}


/* =========================================================
   RESUME BGM
========================================================= */

async function resumeBgm() {
    if (
        !audioState.currentBgm ||
        !audioState.currentBgmKey
    ) {
        return {
            success: false,
            reason: "NO_ACTIVE_BGM"
        };
    }

    if (!isMusicEnabled()) {
        return {
            success: false,
            reason: "MUSIC_DISABLED"
        };
    }

    audioState.currentBgm.volume =
        getEffectiveBgmVolume();

    try {
        await audioState.currentBgm.play();

        return {
            success: true,
            key:
                audioState.currentBgmKey
        };
    } catch (error) {
        return {
            success: false,
            reason: "PLAYBACK_BLOCKED",
            error
        };
    }
}


/* =========================================================
   STOP BGM
========================================================= */

function stopBgm({
    reset = true
} = {}) {
    if (
        !audioState.currentBgm
    ) {
        return false;
    }

    audioState.currentBgm.pause();

    if (reset) {
        try {
            audioState.currentBgm.currentTime = 0;
        } catch {
            /* Ignore seek errors. */
        }
    }

    audioState.currentBgm =
        null;

    audioState.currentBgmKey =
        null;

    return true;
}


/* =========================================================
   PLAY SFX
========================================================= */

async function playSfx(
    key,
    {
        restart = true,
        volume = null
    } = {}
) {
    if (!isSoundEnabled()) {
        return {
            success: false,
            reason: "SOUND_DISABLED"
        };
    }

    const audio =
        getSfxAudio(key);

    if (!audio) {
        return {
            success: false,
            reason: "UNKNOWN_SFX"
        };
    }

    audio.volume =
        getEffectiveSfxVolume(
            key,
            volume
        );


    if (restart) {
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch {
            /* Ignore seek errors. */
        }
    }


    try {
        await audio.play();

        return {
            success: true,
            key
        };
    } catch (error) {
        return {
            success: false,
            reason: "PLAYBACK_BLOCKED",
            error
        };
    }
}


/* =========================================================
   STOP SFX
========================================================= */

function stopSfx(
    key,
    {
        reset = true
    } = {}
) {
    const audio =
        sfxCache.get(key);

    if (!audio) {
        return false;
    }

    audio.pause();

    if (reset) {
        try {
            audio.currentTime = 0;
        } catch {
            /* Ignore seek errors. */
        }
    }

    return true;
}


/* =========================================================
   STOP ALL SFX
========================================================= */

function stopAllSfx({
    reset = true
} = {}) {
    for (
        const audio
        of sfxCache.values()
    ) {
        audio.pause();

        if (reset) {
            try {
                audio.currentTime = 0;
            } catch {
                /* Ignore seek errors. */
            }
        }
    }
}


/* =========================================================
   PRELOAD
========================================================= */

function preloadAudio() {
    for (
        const key
        of Object.keys(
            AUDIO_PATHS.bgm
        )
    ) {
        getBgmAudio(key);
    }

    for (
        const key
        of Object.keys(
            AUDIO_PATHS.sfx
        )
    ) {
        getSfxAudio(key);
    }

    return true;
}


/* =========================================================
   MASTER VOLUME
========================================================= */

function setMasterVolume(value) {
    audioState.masterVolume =
        clampVolume(value);

    refreshVolumes();

    return (
        audioState.masterVolume
    );
}


function getMasterVolume() {
    return (
        audioState.masterVolume
    );
}


/* =========================================================
   BGM VOLUME
========================================================= */

function setBgmVolume(value) {
    audioState.bgmVolume =
        clampVolume(value);

    refreshVolumes();

    return (
        audioState.bgmVolume
    );
}


function getBgmVolume() {
    return (
        audioState.bgmVolume
    );
}


/* =========================================================
   SFX VOLUME
========================================================= */

function setSfxVolume(value) {
    audioState.sfxVolume =
        clampVolume(value);

    refreshVolumes();

    return (
        audioState.sfxVolume
    );
}


function getSfxVolume() {
    return (
        audioState.sfxVolume
    );
}


/* =========================================================
   REFRESH VOLUMES
========================================================= */

function refreshVolumes() {
    if (
        audioState.currentBgm
    ) {
        audioState.currentBgm.volume =
            getEffectiveBgmVolume();
    }

    for (
        const [key, audio]
        of sfxCache.entries()
    ) {
        audio.volume =
            getEffectiveSfxVolume(
                key
            );
    }
}


/* =========================================================
   SETTINGS SYNCHRONIZATION
========================================================= */

subscribeToSettings(
    ({
        settings,
        changedKeys
    }) => {

        /* -------------------------------------------------
           Music disabled
        -------------------------------------------------- */

        if (
            changedKeys.includes(
                "musicEnabled"
            )
        ) {
            if (
                !settings.musicEnabled
            ) {
                pauseBgm();
            } else if (
                audioState.currentBgmKey &&
                audioState.userHasInteracted &&
                !document.hidden
            ) {
                resumeBgm();
            }
        }


        /* -------------------------------------------------
           Sound disabled
        -------------------------------------------------- */

        if (
            changedKeys.includes(
                "soundEnabled"
            ) &&
            !settings.soundEnabled
        ) {
            stopAllSfx({
                reset: false
            });
        }
    }
);


/* =========================================================
   USER INTERACTION TRACKING

   Browsers commonly block media playback until the user has
   interacted with the page.

   We track the first trusted interaction so other modules can
   decide when playback is likely to succeed.
========================================================= */

function markUserInteraction() {
    audioState.userHasInteracted =
        true;
}


const interactionEvents = [
    "pointerdown",
    "keydown",
    "touchstart"
];


for (
    const eventName
    of interactionEvents
) {
    window.addEventListener(
        eventName,
        markUserInteraction,
        {
            once: true,
            passive: true
        }
    );
}


/* =========================================================
   VISIBILITY HANDLING
========================================================= */

function handleVisibilityChange() {
    if (document.hidden) {

        audioState
            .bgmWasPlayingBeforeHidden =
            Boolean(
                audioState.currentBgm &&
                !audioState.currentBgm.paused
            );

        pauseBgm();

        return;
    }


    if (
        audioState
            .bgmWasPlayingBeforeHidden &&
        isMusicEnabled()
    ) {
        resumeBgm();
    }

    audioState
        .bgmWasPlayingBeforeHidden =
        false;
}


document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
);


/* =========================================================
   PAGE HIDE
========================================================= */

window.addEventListener(
    "pagehide",
    () => {
        pauseBgm();

        stopAllSfx({
            reset: false
        });
    }
);


/* =========================================================
   AUDIO STATUS
========================================================= */

function getAudioStatus() {
    return {
        soundEnabled:
            isSoundEnabled(),

        musicEnabled:
            isMusicEnabled(),

        userHasInteracted:
            audioState
                .userHasInteracted,

        currentBgmKey:
            audioState
                .currentBgmKey,

        bgmPlaying:
            Boolean(
                audioState.currentBgm &&
                !audioState
                    .currentBgm
                    .paused
            ),

        masterVolume:
            audioState.masterVolume,

        bgmVolume:
            audioState.bgmVolume,

        sfxVolume:
            audioState.sfxVolume
    };
}


/* =========================================================
   SHORTCUT HELPERS

   These make page/game modules easier to read.
========================================================= */

function playClick() {
    return playSfx("click");
}


function playEnterRoom() {
    return playSfx("enterRoom");
}


function playLoginReward() {
    return playSfx(
        "loginReward"
    );
}


function playBet() {
    return playSfx("bet");
}


function playBetCancel() {
    return playSfx(
        "betCancel"
    );
}


function playCountdown() {
    return playSfx(
        "countdown"
    );
}


function playTakeoff() {
    return playSfx(
        "takeoff"
    );
}


function startFlyingLoop() {
    return playSfx(
        "flyingLoop",
        {
            restart: false
        }
    );
}


function stopFlyingLoop() {
    return stopSfx(
        "flyingLoop"
    );
}


function playMultiplierRise() {
    return playSfx(
        "multiplierRise"
    );
}


function playCashout() {
    return playSfx(
        "cashout"
    );
}


function playAutoCashout() {
    return playSfx(
        "autoCashout"
    );
}


function playCrash() {
    return playSfx(
        "crash"
    );
}


function playWin() {
    return playSfx(
        "win"
    );
}


function playInsufficientBalance() {
    return playSfx(
        "insufficientBalance"
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    AUDIO_PATHS,
    DEFAULT_VOLUMES,

    preloadAudio,

    playBgm,
    pauseBgm,
    resumeBgm,
    stopBgm,

    playSfx,
    stopSfx,
    stopAllSfx,

    setMasterVolume,
    getMasterVolume,

    setBgmVolume,
    getBgmVolume,

    setSfxVolume,
    getSfxVolume,

    getAudioStatus,

    playClick,
    playEnterRoom,
    playLoginReward,
    playBet,
    playBetCancel,
    playCountdown,
    playTakeoff,
    startFlyingLoop,
    stopFlyingLoop,
    playMultiplierRise,
    playCashout,
    playAutoCashout,
    playCrash,
    playWin,
    playInsufficientBalance
};
