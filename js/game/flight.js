/* =========================================================
   CG FLIGHT
   js/game/flight.js

   Flight runtime controller.

   Responsibilities:
   - Run pre-flight countdown
   - Start flight
   - Update multiplier over time
   - Drive requestAnimationFrame loop
   - Detect crash point
   - Transition round phases
   - Maintain flight timing in state.js
   - Publish flight events

   IMPORTANT:
   This module does NOT:
   - Deduct bets
   - Perform cashout
   - Perform settlement
   - Write game history
========================================================= */

import {
    GAME_PHASES,

    getState,
    getPhase,

    setPhase,

    getMultiplier,
    setMultiplier,

    getCrashMultiplier,

    setCountdown,

    markFlightStarted,
    updateFlightElapsed,
    markFlightCrashed
} from "./state.js";

import {
    prepareCrashPoint,
    hasReachedCrashPoint
} from "./crash.js";

import {
    roundTo,
    clamp,
    isFiniteNumber
} from "../core/utils.js";

import {
    playCountdown,
    playTakeoff,
    startFlyingLoop,
    stopFlyingLoop,
    playMultiplierRise,
    playCrash
} from "../core/audio.js";


/* =========================================================
   FLIGHT CONFIG
========================================================= */

const FLIGHT_CONFIG = Object.freeze({

    /*
     Countdown before flight begins.
    */
    COUNTDOWN_SECONDS: 3,


    /*
     Minimum multiplier.
    */
    START_MULTIPLIER: 1.00,


    /*
     Visual/display precision.
    */
    MULTIPLIER_DECIMALS: 2,


    /*
     Exponential growth coefficient.

     Formula:
         multiplier = e^(GROWTH_RATE * seconds)

     0.085 gives a moderate acceleration curve.
    */
    GROWTH_RATE: 0.085,


    /*
     Maximum multiplier accepted by flight runtime.

     crash.js currently also caps generated crash values.
    */
    MAX_MULTIPLIER: 1000,


    /*
     Interval for optional multiplier-rise sound.

     Prevents playing the sound every animation frame.
    */
    MULTIPLIER_SOUND_INTERVAL_MS: 900
});


/* =========================================================
   INTERNAL RUNTIME STATE
========================================================= */

const runtime = {

    animationFrameId: null,

    countdownTimerId: null,

    countdownRunning: false,

    flightRunning: false,

    flightStartPerformanceTime: null,

    lastMultiplierSoundAt: 0,

    crashHandled: false
};


/* =========================================================
   FLIGHT EVENT SYSTEM
========================================================= */

const flightListeners =
    new Set();


function subscribeToFlight(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Flight listener must be a function."
        );
    }

    flightListeners.add(
        listener
    );

    return function unsubscribe() {
        flightListeners.delete(
            listener
        );
    };
}


function emitFlightEvent(
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
        of flightListeners
    ) {
        try {
            listener(event);
        } catch (error) {
            console.error(
                "[CG Flight] Flight listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   PERFORMANCE TIME
========================================================= */

function getPerformanceNow() {
    if (
        typeof performance !==
            "undefined" &&
        typeof performance.now ===
            "function"
    ) {
        return performance.now();
    }

    return Date.now();
}


/* =========================================================
   MULTIPLIER CURVE

   Starts at exactly 1.00×.

   Formula:
       e^(growthRate * seconds)

   Examples approximately:
       0 sec  -> 1.00×
       5 sec  -> 1.53×
       8 sec  -> 1.97×
       10 sec -> 2.34×
       15 sec -> 3.58×
       20 sec -> 5.47×
========================================================= */

function calculateFlightMultiplier(
    elapsedMs,
    {
        growthRate =
            FLIGHT_CONFIG.GROWTH_RATE
    } = {}
) {
    if (
        !isFiniteNumber(
            elapsedMs
        ) ||
        elapsedMs <= 0
    ) {
        return (
            FLIGHT_CONFIG
                .START_MULTIPLIER
        );
    }

    const safeGrowthRate =
        Math.max(
            0.001,
            Number(growthRate) ||
                FLIGHT_CONFIG
                    .GROWTH_RATE
        );

    const elapsedSeconds =
        elapsedMs / 1000;

    const rawMultiplier =
        Math.exp(
            safeGrowthRate *
            elapsedSeconds
        );

    return roundTo(
        clamp(
            rawMultiplier,
            FLIGHT_CONFIG.START_MULTIPLIER,
            FLIGHT_CONFIG.MAX_MULTIPLIER
        ),
        FLIGHT_CONFIG.MULTIPLIER_DECIMALS
    );
}


/* =========================================================
   ESTIMATE TIME TO MULTIPLIER

   Inverse of the exponential curve.

   Useful later for animation/UI positioning.
========================================================= */

function estimateTimeToMultiplier(
    multiplier,
    {
        growthRate =
            FLIGHT_CONFIG.GROWTH_RATE
    } = {}
) {
    if (
        !isFiniteNumber(
            multiplier
        ) ||
        multiplier < 1
    ) {
        return null;
    }

    if (multiplier === 1) {
        return 0;
    }

    const safeGrowthRate =
        Math.max(
            0.001,
            Number(growthRate) ||
                FLIGHT_CONFIG
                    .GROWTH_RATE
        );

    const seconds =
        Math.log(multiplier) /
        safeGrowthRate;

    return Math.max(
        0,
        seconds * 1000
    );
}


/* =========================================================
   PREPARE FLIGHT

   Ensures the round has a crash point before countdown.
========================================================= */

function prepareFlight() {
    const phase =
        getPhase();

    if (
        phase !== GAME_PHASES.BETTING
    ) {
        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase
        };
    }


    const existingCrash =
        getCrashMultiplier();

    if (
        existingCrash === null ||
        existingCrash === undefined
    ) {
        const crashResult =
            prepareCrashPoint();

        if (!crashResult.success) {
            return {
                success: false,

                reason:
                    crashResult.reason
            };
        }
    }


    setMultiplier(
        FLIGHT_CONFIG
            .START_MULTIPLIER
    );


    return {
        success: true,

        crashMultiplier:
            getCrashMultiplier()
    };
}


/* =========================================================
   START COUNTDOWN
========================================================= */

function startCountdown({
    seconds =
        FLIGHT_CONFIG
            .COUNTDOWN_SECONDS,

    autoStartFlight = true
} = {}) {
    if (
        runtime.countdownRunning ||
        runtime.flightRunning
    ) {
        return {
            success: false,

            reason:
                "FLIGHT_ALREADY_RUNNING"
        };
    }


    const phase =
        getPhase();

    if (
        phase !==
        GAME_PHASES.BETTING
    ) {
        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase
        };
    }


    const preparation =
        prepareFlight();

    if (!preparation.success) {
        return preparation;
    }


    const safeSeconds =
        Math.max(
            0,
            Math.floor(
                Number(seconds) ||
                0
            )
        );


    const phaseResult =
        setPhase(
            GAME_PHASES.COUNTDOWN
        );

    if (!phaseResult.success) {
        return phaseResult;
    }


    const startedAt =
        Date.now();

    const endsAt =
        startedAt +
        safeSeconds * 1000;


    runtime.countdownRunning =
        true;


    setCountdown({
        remaining:
            safeSeconds,

        startedAt,

        endsAt
    });


    emitFlightEvent(
        "COUNTDOWN_START",
        {
            seconds:
                safeSeconds,

            endsAt,

            crashMultiplier:
                getCrashMultiplier()
        }
    );


    if (safeSeconds === 0) {
        runtime.countdownRunning =
            false;

        setCountdown({
            remaining: 0,

            startedAt,

            endsAt:
                startedAt
        });

        if (autoStartFlight) {
            return startFlight();
        }

        return {
            success: true,
            countdown: 0
        };
    }


    let remaining =
        safeSeconds;


    /*
     Play one countdown sound immediately for the
     first displayed number.
    */

    playCountdown();


    emitFlightEvent(
        "COUNTDOWN_TICK",
        {
            remaining
        }
    );


    runtime.countdownTimerId =
        window.setInterval(
            () => {
                remaining -= 1;


                setCountdown({
                    remaining:
                        Math.max(
                            0,
                            remaining
                        ),

                    startedAt,

                    endsAt
                });


                emitFlightEvent(
                    "COUNTDOWN_TICK",
                    {
                        remaining:
                            Math.max(
                                0,
                                remaining
                            )
                    }
                );


                if (remaining > 0) {
                    playCountdown();
                    return;
                }


                clearCountdownTimer();

                runtime.countdownRunning =
                    false;


                emitFlightEvent(
                    "COUNTDOWN_END",
                    {
                        crashMultiplier:
                            getCrashMultiplier()
                    }
                );


                if (autoStartFlight) {
                    startFlight();
                }
            },
            1000
        );


    return {
        success: true,

        countdown:
            safeSeconds,

        crashMultiplier:
            getCrashMultiplier()
    };
}


/* =========================================================
   CLEAR COUNTDOWN
========================================================= */

function clearCountdownTimer() {
    if (
        runtime.countdownTimerId !==
        null
    ) {
        window.clearInterval(
            runtime.countdownTimerId
        );

        runtime.countdownTimerId =
            null;
    }
}


/* =========================================================
   START FLIGHT
========================================================= */

function startFlight() {
    if (runtime.flightRunning) {
        return {
            success: false,

            reason:
                "FLIGHT_ALREADY_RUNNING"
        };
    }


    const phase =
        getPhase();


    /*
     Normally flight begins from COUNTDOWN.

     Allow BETTING only for controlled testing or
     countdown-less rounds.
    */

    if (
        phase !==
            GAME_PHASES.COUNTDOWN &&
        phase !==
            GAME_PHASES.BETTING
    ) {
        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase
        };
    }


    if (
        getCrashMultiplier() ===
        null
    ) {
        const prepared =
            prepareFlight();

        if (!prepared.success) {
            return prepared;
        }
    }


    /*
     If starting directly from BETTING, phase transition
     requires going through COUNTDOWN according to state.js.
    */

    if (
        getPhase() ===
        GAME_PHASES.BETTING
    ) {
        const countdownPhase =
            setPhase(
                GAME_PHASES.COUNTDOWN
            );

        if (
            !countdownPhase.success
        ) {
            return countdownPhase;
        }
    }


    const phaseResult =
        setPhase(
            GAME_PHASES.FLYING
        );

    if (!phaseResult.success) {
        return phaseResult;
    }


    clearCountdownTimer();

    runtime.countdownRunning =
        false;

    runtime.flightRunning =
        true;

    runtime.crashHandled =
        false;

    runtime.lastMultiplierSoundAt =
        0;

    runtime.flightStartPerformanceTime =
        getPerformanceNow();


    setMultiplier(
        FLIGHT_CONFIG
            .START_MULTIPLIER
    );


    markFlightStarted(
        Date.now()
    );


    playTakeoff();

    startFlyingLoop();


    emitFlightEvent(
        "FLIGHT_START",
        {
            multiplier:
                FLIGHT_CONFIG
                    .START_MULTIPLIER,

            crashMultiplier:
                getCrashMultiplier()
        }
    );


    /*
     Important special case:
     crash point can be exactly 1.00×.
    */

    if (
        hasReachedCrashPoint(
            FLIGHT_CONFIG
                .START_MULTIPLIER
        )
    ) {
        handleCrash(
            FLIGHT_CONFIG
                .START_MULTIPLIER
        );

        return {
            success: true,

            immediateCrash: true,

            crashMultiplier:
                getCrashMultiplier()
        };
    }


    runtime.animationFrameId =
        requestAnimationFrame(
            flightFrame
        );


    return {
        success: true,

        crashMultiplier:
            getCrashMultiplier()
    };
}


/* =========================================================
   ANIMATION FRAME
========================================================= */

function flightFrame(
    frameTime
) {
    if (
        !runtime.flightRunning
    ) {
        return;
    }


    if (
        getPhase() !==
        GAME_PHASES.FLYING
    ) {
        stopAnimationFrame();

        runtime.flightRunning =
            false;

        return;
    }


    const startTime =
        runtime
            .flightStartPerformanceTime;


    if (
        startTime === null
    ) {
        abortFlight(
            "MISSING_FLIGHT_START_TIME"
        );

        return;
    }


    const elapsedMs =
        Math.max(
            0,
            frameTime -
                startTime
        );


    let nextMultiplier =
        calculateFlightMultiplier(
            elapsedMs
        );


    const crashMultiplier =
        getCrashMultiplier();


    /*
     Prevent the visible/state multiplier from overshooting
     the actual crash point.

     Example:
     Previous frame = 2.46
     Calculated next = 2.49
     Crash point = 2.47

     Final multiplier becomes exactly 2.47.
    */

    if (
        isFiniteNumber(
            crashMultiplier
        ) &&
        nextMultiplier >
            crashMultiplier
    ) {
        nextMultiplier =
            crashMultiplier;
    }


    updateFlightElapsed(
        elapsedMs
    );


    setMultiplier(
        nextMultiplier
    );


    emitFlightEvent(
        "MULTIPLIER_UPDATE",
        {
            multiplier:
                nextMultiplier,

            elapsedMs,

            crashMultiplier
        }
    );


    maybePlayMultiplierRise(
        frameTime
    );


    if (
        hasReachedCrashPoint(
            nextMultiplier
        )
    ) {
        handleCrash(
            nextMultiplier
        );

        return;
    }


    runtime.animationFrameId =
        requestAnimationFrame(
            flightFrame
        );
}


/* =========================================================
   MULTIPLIER RISE AUDIO
========================================================= */

function maybePlayMultiplierRise(
    timestamp
) {
    if (
        !isFiniteNumber(
            timestamp
        )
    ) {
        return;
    }


    if (
        timestamp -
            runtime
                .lastMultiplierSoundAt <
        FLIGHT_CONFIG
            .MULTIPLIER_SOUND_INTERVAL_MS
    ) {
        return;
    }


    runtime.lastMultiplierSoundAt =
        timestamp;


    playMultiplierRise();
}


/* =========================================================
   HANDLE CRASH
========================================================= */

function handleCrash(
    multiplier =
        getMultiplier()
) {
    if (
        runtime.crashHandled
    ) {
        return {
            success: false,

            reason:
                "CRASH_ALREADY_HANDLED"
        };
    }


    runtime.crashHandled =
        true;

    runtime.flightRunning =
        false;


    stopAnimationFrame();

    stopFlyingLoop();


    const crashMultiplier =
        getCrashMultiplier();


    const finalMultiplier =
        isFiniteNumber(
            crashMultiplier
        )
            ? crashMultiplier
            : multiplier;


    setMultiplier(
        finalMultiplier
    );


    markFlightCrashed(
        Date.now()
    );


    const phaseResult =
        setPhase(
            GAME_PHASES.CRASHED
        );


    if (
        !phaseResult.success
    ) {
        return {
            success: false,

            reason:
                phaseResult.reason
        };
    }


    playCrash();


    const state =
        getState();


    emitFlightEvent(
        "CRASH",
        {
            multiplier:
                finalMultiplier,

            crashMultiplier:
                finalMultiplier,

            elapsedMs:
                state.flight
                    .elapsedMs,

            roundId:
                state.roundId
        }
    );


    return {
        success: true,

        crashMultiplier:
            finalMultiplier,

        elapsedMs:
            state.flight
                .elapsedMs
    };
}


/* =========================================================
   STOP ANIMATION FRAME
========================================================= */

function stopAnimationFrame() {
    if (
        runtime.animationFrameId !==
        null
    ) {
        cancelAnimationFrame(
            runtime.animationFrameId
        );

        runtime.animationFrameId =
            null;
    }
}


/* =========================================================
   ABORT FLIGHT

   Intended for unexpected runtime failures.

   This does NOT perform settlement/refund.
   Higher-level game controller must decide what to do.
========================================================= */

function abortFlight(
    reason =
        "ABORTED"
) {
    clearCountdownTimer();

    stopAnimationFrame();

    stopFlyingLoop();


    runtime.countdownRunning =
        false;

    runtime.flightRunning =
        false;

    runtime.flightStartPerformanceTime =
        null;

    runtime.crashHandled =
        false;


    emitFlightEvent(
        "FLIGHT_ABORTED",
        {
            reason,

            state:
                getState()
        }
    );


    return {
        success: true,

        reason
    };
}


/* =========================================================
   RESET FLIGHT RUNTIME

   Call when creating a new round if required.
========================================================= */

function resetFlightRuntime() {
    clearCountdownTimer();

    stopAnimationFrame();

    stopFlyingLoop();


    runtime.countdownRunning =
        false;

    runtime.flightRunning =
        false;

    runtime.flightStartPerformanceTime =
        null;

    runtime.lastMultiplierSoundAt =
        0;

    runtime.crashHandled =
        false;


    return true;
}


/* =========================================================
   RUNTIME STATUS
========================================================= */

function getFlightRuntimeStatus() {
    return {
        countdownRunning:
            runtime
                .countdownRunning,

        flightRunning:
            runtime
                .flightRunning,

        crashHandled:
            runtime
                .crashHandled,

        multiplier:
            getMultiplier(),

        crashMultiplier:
            getCrashMultiplier(),

        phase:
            getPhase()
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    FLIGHT_CONFIG,

    calculateFlightMultiplier,
    estimateTimeToMultiplier,

    prepareFlight,

    startCountdown,
    startFlight,

    handleCrash,

    abortFlight,
    resetFlightRuntime,

    getFlightRuntimeStatus,

    subscribeToFlight
};
