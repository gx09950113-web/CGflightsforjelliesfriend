/* =========================================================
   CG FLIGHT
   js/core/audio.js

   Global audio manager.

   Responsibilities:
   - Preload BGM / SFX assets
   - Play / pause Lobby and Game BGM
   - Play one-shot sound effects
   - Play / stop looped flight SFX
   - Respect persistent sound/music settings
   - React to settings changes
   - Handle browser autoplay failures safely

   IMPORTANT:
   settings.js owns preferences.
   audio.js owns actual playback.
========================================================= */


import {
    getSettings,
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
   AUDIO CONFIG
========================================================= */

const AUDIO_CONFIG = Object.freeze({

    bgmVolume:
        0.32,

    sfxVolume:
        0.72,

    flyingLoopVolume:
        0.46,

    multiplierRiseVolume:
        0.34,

    fadeStepMs:
        35,

    fadeDurationMs:
        280
});


/* =========================================================
   RUNTIME
========================================================= */

const runtime = {

    initialized:
        false,

    currentBgmKey:
        null,

    bgm:
        new Map(),

    sfx:
        new Map(),

    activeLoops:
        new Set(),

    settingsUnsubscribe:
        null
};


/* =========================================================
   CREATE AUDIO
========================================================= */

function createAudio(
    src,
    {
        loop = false,
        volume = 1
    } = {}
) {

    const audio =
        new Audio(
            src
        );


    audio.preload =
        "auto";


    audio.loop =
        loop;


    audio.volume =
        clampVolume(
            volume
        );


    return audio;
}


/* =========================================================
   VOLUME CLAMP
========================================================= */

function clampVolume(
    value
) {

    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return 1;
    }


    return Math.max(
        0,
        Math.min(
            1,
            numeric
        )
    );
}


/* =========================================================
   INITIALIZE AUDIO MAPS
========================================================= */

function initializeAudio() {

    if (
        runtime.initialized
    ) {
        return;
    }


    /* -----------------------------------------------------
       BGM
    ----------------------------------------------------- */

    runtime.bgm.set(
        "lobby",
        createAudio(
            AUDIO_PATHS.bgm.lobby,
            {
                loop: true,
                volume:
                    AUDIO_CONFIG
                        .bgmVolume
            }
        )
    );


    runtime.bgm.set(
        "game",
        createAudio(
            AUDIO_PATHS.bgm.game,
            {
                loop: true,
                volume:
                    AUDIO_CONFIG
                        .bgmVolume
            }
        )
    );


    /* -----------------------------------------------------
       One-shot SFX
    ----------------------------------------------------- */

    const oneShotSfx = [

        [
            "click",
            AUDIO_PATHS.sfx.click
        ],

        [
            "enterRoom",
            AUDIO_PATHS.sfx.enterRoom
        ],

        [
            "loginReward",
            AUDIO_PATHS.sfx.loginReward
        ],

        [
            "bet",
            AUDIO_PATHS.sfx.bet
        ],

        [
            "betCancel",
            AUDIO_PATHS.sfx.betCancel
        ],

        [
            "countdown",
            AUDIO_PATHS.sfx.countdown
        ],

        [
            "takeoff",
            AUDIO_PATHS.sfx.takeoff
        ],

        [
            "cashout",
            AUDIO_PATHS.sfx.cashout
        ],

        [
            "autoCashout",
            AUDIO_PATHS.sfx.autoCashout
        ],

        [
            "crash",
            AUDIO_PATHS.sfx.crash
        ],

        [
            "win",
            AUDIO_PATHS.sfx.win
        ],

        [
            "insufficientBalance",
            AUDIO_PATHS.sfx
                .insufficientBalance
        ]
    ];


    for (
        const [
            key,
            src
        ]
        of oneShotSfx
    ) {

        runtime.sfx.set(
            key,
            createAudio(
                src,
                {
                    loop: false,
                    volume:
                        AUDIO_CONFIG
                            .sfxVolume
                }
            )
        );
    }


    /* -----------------------------------------------------
       Looped SFX
    ----------------------------------------------------- */

    runtime.sfx.set(
        "flyingLoop",
        createAudio(
            AUDIO_PATHS.sfx
                .flyingLoop,
            {
                loop: true,
                volume:
                    AUDIO_CONFIG
                        .flyingLoopVolume
            }
        )
    );


    runtime.sfx.set(
        "multiplierRise",
        createAudio(
            AUDIO_PATHS.sfx
                .multiplierRise,
            {
                loop: true,
                volume:
                    AUDIO_CONFIG
                        .multiplierRiseVolume
            }
        )
    );


    runtime.initialized =
        true;


    /* -----------------------------------------------------
       Settings subscription
    ----------------------------------------------------- */

    runtime.settingsUnsubscribe =
        subscribeToSettings(
            handleSettingsChanged
        );
}


/* =========================================================
   PRELOAD
========================================================= */

function preloadAudio() {

    initializeAudio();


    for (
        const audio
        of runtime.bgm.values()
    ) {

        try {

            audio.load();

        } catch (error) {

            /*
             Ignore preload failures.
            */
        }
    }


    for (
        const audio
        of runtime.sfx.values()
    ) {

        try {

            audio.load();

        } catch (error) {

            /*
             Ignore preload failures.
            */
        }
    }


    return true;
}


/* =========================================================
   SAFE PLAY
========================================================= */

async function safePlay(
    audio
) {

    if (!audio) {
        return false;
    }


    try {

        const promise =
            audio.play();


        if (
            promise &&
            typeof promise.then ===
                "function"
        ) {
            await promise;
        }


        return true;

    } catch (error) {

        /*
         Autoplay restrictions are normal browser behavior.
         Do not treat them as fatal.
        */

        return false;
    }
}


/* =========================================================
   PLAY ONE-SHOT SFX

   Clone the preloaded Audio node so rapid repeated effects
   can overlap without cutting each other off.
========================================================= */

function playSfx(
    key
) {

    initializeAudio();


    const settings =
        getSettings();


    if (
        !settings.soundEnabled
    ) {
        return false;
    }


    const template =
        runtime.sfx.get(
            key
        );


    if (!template) {
        return false;
    }


    /*
     Looped sounds must use the original instance and are
     controlled separately.
    */

    if (
        template.loop
    ) {
        return false;
    }


    const instance =
        template.cloneNode(
            true
        );


    instance.volume =
        template.volume;


    instance.currentTime =
        0;


    safePlay(
        instance
    );


    return true;
}


/* =========================================================
   START LOOP SFX
========================================================= */

function startLoopSfx(
    key
) {

    initializeAudio();


    const settings =
        getSettings();


    if (
        !settings.soundEnabled
    ) {
        return false;
    }


    const audio =
        runtime.sfx.get(
            key
        );


    if (
        !audio ||
        !audio.loop
    ) {
        return false;
    }


    if (
        !audio.paused
    ) {

        runtime.activeLoops.add(
            key
        );


        return true;
    }


    safePlay(
        audio
    );


    runtime.activeLoops.add(
        key
    );


    return true;
}


/* =========================================================
   STOP LOOP SFX
========================================================= */

function stopLoopSfx(
    key,
    {
        reset = true
    } = {}
) {

    initializeAudio();


    const audio =
        runtime.sfx.get(
            key
        );


    if (!audio) {
        return false;
    }


    audio.pause();


    if (
        reset
    ) {
        try {

            audio.currentTime =
                0;

        } catch (error) {

            /*
             Ignore media seek errors.
            */
        }
    }


    runtime.activeLoops.delete(
        key
    );


    return true;
}


/* =========================================================
   STOP ALL LOOP SFX
========================================================= */

function stopAllLoopSfx() {

    stopLoopSfx(
        "flyingLoop"
    );


    stopLoopSfx(
        "multiplierRise"
    );
}


/* =========================================================
   PLAY BGM
========================================================= */

function playBgm(
    key
) {

    initializeAudio();


    const settings =
        getSettings();


    if (
        !settings.musicEnabled
    ) {

        pauseBgm();

        return false;
    }


    const target =
        runtime.bgm.get(
            key
        );


    if (!target) {
        return false;
    }


    /* -----------------------------------------------------
       Same BGM already active
    ----------------------------------------------------- */

    if (
        runtime.currentBgmKey ===
            key &&
        !target.paused
    ) {
        return true;
    }


    /* -----------------------------------------------------
       Pause all other BGM
    ----------------------------------------------------- */

    for (
        const [
            otherKey,
            audio
        ]
        of runtime.bgm
    ) {

        if (
            otherKey === key
        ) {
            continue;
        }


        audio.pause();


        try {

            audio.currentTime =
                0;

        } catch (error) {

            /*
             Ignore seek errors.
            */
        }
    }


    runtime.currentBgmKey =
        key;


    safePlay(
        target
    );


    return true;
}


/* =========================================================
   PAUSE BGM
========================================================= */

function pauseBgm() {

    initializeAudio();


    for (
        const audio
        of runtime.bgm.values()
    ) {

        audio.pause();
    }


    return true;
}


/* =========================================================
   STOP BGM
========================================================= */

function stopBgm() {

    initializeAudio();


    for (
        const audio
        of runtime.bgm.values()
    ) {

        audio.pause();


        try {

            audio.currentTime =
                0;

        } catch (error) {

            /*
             Ignore seek errors.
            */
        }
    }


    runtime.currentBgmKey =
        null;


    return true;
}


/* =========================================================
   CURRENT BGM
========================================================= */

function getCurrentBgmKey() {

    return runtime.currentBgmKey;
}


/* =========================================================
   SETTINGS CHANGE
========================================================= */

function handleSettingsChanged({
    settings,
    changedKeys
}) {

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
            runtime.currentBgmKey
        ) {

            playBgm(
                runtime.currentBgmKey
            );
        }
    }


    if (
        changedKeys.includes(
            "soundEnabled"
        ) &&
        !settings.soundEnabled
    ) {

        stopAllLoopSfx();
    }
}


/* =========================================================
   COMMON UI SFX
========================================================= */

function playClick() {

    return playSfx(
        "click"
    );
}


function playEnterRoom() {

    return playSfx(
        "enterRoom"
    );
}


function playLoginReward() {

    return playSfx(
        "loginReward"
    );
}


/* =========================================================
   GAMEPLAY SFX
========================================================= */

function playBet() {

    return playSfx(
        "bet"
    );
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

    return startLoopSfx(
        "flyingLoop"
    );
}


function stopFlyingLoop() {

    return stopLoopSfx(
        "flyingLoop"
    );
}


function startMultiplierRise() {

    return startLoopSfx(
        "multiplierRise"
    );
}


function stopMultiplierRise() {

    return stopLoopSfx(
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
   FLIGHT AUDIO HELPERS
========================================================= */

function startFlightAudio() {

    playTakeoff();

    startFlyingLoop();

    startMultiplierRise();
}


function stopFlightAudio() {

    stopFlyingLoop();

    stopMultiplierRise();
}


/* =========================================================
   RESET AUDIO RUNTIME

   Useful for page teardown / development.
========================================================= */

function resetAudioRuntime() {

    stopBgm();

    stopAllLoopSfx();


    for (
        const audio
        of runtime.sfx.values()
    ) {

        if (
            audio.loop
        ) {
            continue;
        }


        audio.pause();


        try {

            audio.currentTime =
                0;

        } catch (error) {

            /*
             Ignore seek errors.
            */
        }
    }
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    AUDIO_PATHS,
    AUDIO_CONFIG,

    preloadAudio,

    playBgm,
    pauseBgm,
    stopBgm,
    getCurrentBgmKey,

    playSfx,
    startLoopSfx,
    stopLoopSfx,
    stopAllLoopSfx,

    playClick,
    playEnterRoom,
    playLoginReward,

    playBet,
    playBetCancel,

    playCountdown,
    playTakeoff,

    startFlyingLoop,
    stopFlyingLoop,

    startMultiplierRise,
    stopMultiplierRise,

    playCashout,
    playAutoCashout,

    playCrash,
    playWin,

    playInsufficientBalance,

    startFlightAudio,
    stopFlightAudio,

    resetAudioRuntime
};
