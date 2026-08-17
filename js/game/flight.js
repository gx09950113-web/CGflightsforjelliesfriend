/* =========================================================
   CG FLIGHT
   js/game/flight.js

   Flight runtime controller.

   Responsibilities:
   - Run pre-flight countdown
   - Prepare crash point
   - Activate placed bet at takeoff
   - Start flight
   - Update multiplier over time
   - Drive requestAnimationFrame loop
   - Detect crash point
   - Transition round phases
   - Maintain flight timing in state.js
   - Publish flight events

   IMPORTANT:
   This module does NOT:
   - Place bets
   - Deduct wallet balance
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
    activateCurrentBet
} from "./betting.js";

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
     Initial multiplier.
    */
    START_MULTIPLIER: 1.00,

    /*
     Display / state precision.
    */
    MULTIPLIER_DECIMALS: 2,

    /*
     Exponential multiplier growth coefficient.

     Formula:
         multiplier = e^(GROWTH_RATE × seconds)

     Approx:
         0 sec  -> 1.00×
         5 sec  -> 1.53×
         8 sec  -> 1.97×
         10 sec -> 2.34×
         15 sec -> 3.58×
         20 sec -> 5.47×
    */
    GROWTH_RATE: 0.085,

    /*
     Hard runtime cap.
    */
    MAX_MULTIPLIER: 1000,

    /*
     Prevent multiplier-rise sound from firing every frame.
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
        typeof listener !== "function"
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


/* =========================================================
   EMIT FLIGHT EVENT
========================================================= */

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
        typeof performance !== "undefined" &&
        typeof performance.now === "function"
    ) {
        return performance.now();
    }

    return Date.now();
}


/* =========================================================
   MULTIPLIER CURVE
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


    const numericGrowthRate =
        Number(
            growthRate
        );


    const safeGrowthRate =
        isFiniteNumber(
            numericGrowthRate
        )
            ? Math.max(
                0.001,
                numericGrowthRate
            )
            : FLIGHT_CONFIG
                .GROWTH_RATE;


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

            FLIGHT_CONFIG
                .START_MULTIPLIER,

            FLIGHT_CONFIG
                .MAX_MULTIPLIER
        ),

        FLIGHT_CONFIG
            .MULTIPLIER_DECIMALS
    );
}


/* =========================================================
   ESTIMATE TIME TO MULTIPLIER

   Inverse of the exponential curve.
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


    if (
        multiplier === 1
    ) {
        return 0;
    }


    const numericGrowthRate =
        Number(
            growthRate
        );


    const safeGrowthRate =
        isFiniteNumber(
            numericGrowthRate
        )
            ? Math.max(
                0.001,
                numericGrowthRate
            )
            : FLIGHT_CONFIG
                .GROWTH_RATE;


    const seconds =
        Math.log(
            multiplier
        ) /
        safeGrowthRate;


    return Math.max(
        0,
        seconds * 1000
    );
}


/* =========================================================
   PREPARE FLIGHT

   Requirements:
   - Current phase must be BETTING
   - Crash point must exist
   - Multiplier resets to 1.00×
========================================================= */

function prepareFlight() {
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


    const multiplierResult =
        setMultiplier(
            FLIGHT_CONFIG
                .START_MULTIPLIER
        );


    if (!multiplierResult.success) {
        return {
            success: false,

            reason:
                multiplierResult.reason
        };
    }


    return {
        success: true,

        crashMultiplier:
            getCrashMultiplier(),

        multiplier:
            getMultiplier()
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


    /* -----------------------------------------------------
       Prepare crash point and initial multiplier.
    ----------------------------------------------------- */

    const preparation =
        prepareFlight();


    if (!preparation.success) {
        return preparation;
    }


    /* -----------------------------------------------------
       Normalize countdown.
    ----------------------------------------------------- */

    const numericSeconds =
        Number(seconds);


    const safeSeconds =
        Number.isFinite(
            numericSeconds
        )
            ? Math.max(
                0,
                Math.floor(
                    numericSeconds
                )
            )
            : FLIGHT_CONFIG
                .COUNTDOWN_SECONDS;


    /* -----------------------------------------------------
       BETTING -> COUNTDOWN
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       No countdown.
    ----------------------------------------------------- */

    if (
        safeSeconds === 0
    ) {
        runtime.countdownRunning =
            false;


        setCountdown({
            remaining: 0,

            startedAt,

            endsAt:
                startedAt
        });


        emitFlightEvent(
            "COUNTDOWN_END",
            {
                crashMultiplier:
                    getCrashMultiplier()
            }
        );


        if (autoStartFlight) {
            return startFlight();
        }


        return {
            success: true,

            countdown: 0,

            crashMultiplier:
                getCrashMultiplier()
        };
    }


    /* -----------------------------------------------------
       First visible tick.
    ----------------------------------------------------- */

    let remaining =
        safeSeconds;


    playCountdown();


    emitFlightEvent(
        "COUNTDOWN_TICK",
        {
            remaining
        }
    );


    /* -----------------------------------------------------
       Countdown timer.
    ----------------------------------------------------- */

    runtime.countdownTimerId =
        window.setInterval(
            () => {

                remaining -= 1;


                const displayedRemaining =
                    Math.max(
                        0,
                        remaining
                    );


                setCountdown({
                    remaining:
                        displayedRemaining,

                    startedAt,

                    endsAt
                });


                emitFlightEvent(
                    "COUNTDOWN_TICK",
                    {
                        remaining:
                            displayedRemaining
                    }
                );


                if (
                    remaining > 0
                ) {
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


                if (
                    autoStartFlight
                ) {
                    const result =
                        startFlight();


                    if (
                        !result.success
                    ) {
                        console.error(
                            "[CG Flight] Unable to start flight after countdown:",
                            result
                        );
                    }
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
   CLEAR COUNTDOWN TIMER
========================================================= */

function clearCountdownTimer() {
    if (
        runtime.countdownTimerId ===
        null
    ) {
        return;
    }


    window.clearInterval(
        runtime.countdownTimerId
    );


    runtime.countdownTimerId =
        null;
}


/* =========================================================
   ACTIVATE BET FOR TAKEOFF

   The player's PLACED bet becomes ACTIVE exactly when the
   round begins flying.

   No-bet and cancelled-bet rounds are both valid.
========================================================= */

function activateBetForTakeoff() {
    const result =
        activateCurrentBet();


    if (!result.success) {
        return {
            success: false,

            reason:
                result.reason,

            bet:
                result.bet,

            status:
                result.status
        };
    }


    return {
        success: true,

        activated:
            result.activated ===
            true,

        reason:
            result.reason ?? null,

        bet:
            result.bet ?? null
    };
}


/* =========================================================
   START FLIGHT
========================================================= */

function startFlight() {
    if (
        runtime.flightRunning
    ) {
        return {
            success: false,

            reason:
                "FLIGHT_ALREADY_RUNNING"
        };
    }


    const initialPhase =
        getPhase();


    /* -----------------------------------------------------
       Valid normal state:
       COUNTDOWN

       BETTING is also allowed for controlled direct-start
       testing.
    ----------------------------------------------------- */

    if (
        initialPhase !==
            GAME_PHASES.COUNTDOWN &&
        initialPhase !==
            GAME_PHASES.BETTING
    ) {
        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase:
                initialPhase
        };
    }


    /* -----------------------------------------------------
       Direct start from BETTING still needs preparation.
    ----------------------------------------------------- */

    if (
        initialPhase ===
        GAME_PHASES.BETTING
    ) {
        const preparation =
            prepareFlight();


        if (!preparation.success) {
            return preparation;
        }


        const countdownPhase =
            setPhase(
                GAME_PHASES.COUNTDOWN
            );


        if (!countdownPhase.success) {
            return countdownPhase;
        }
    }


    /* -----------------------------------------------------
       Crash point must exist.
    ----------------------------------------------------- */

    const crashMultiplier =
        getCrashMultiplier();


    if (
        !isFiniteNumber(
            crashMultiplier
        )
    ) {
        return {
            success: false,

            reason:
                "MISSING_CRASH_POINT"
        };
    }


    /* -----------------------------------------------------
       Stop countdown runtime before takeoff.
    ----------------------------------------------------- */

    clearCountdownTimer();


    runtime.countdownRunning =
        false;


    /* -----------------------------------------------------
       IMPORTANT:
       Activate the player's bet BEFORE entering the live
       flight runtime.

       PLACED -> ACTIVE

       NONE / CANCELLED are also legitimate states and do
       not prevent the round from flying.
    ----------------------------------------------------- */

    const betActivation =
        activateBetForTakeoff();


    if (!betActivation.success) {
        emitFlightEvent(
            "FLIGHT_START_FAILED",
            {
                reason:
                    "BET_ACTIVATION_FAILED",

                betReason:
                    betActivation.reason,

                state:
                    getState()
            }
        );


        return {
            success: false,

            reason:
                "BET_ACTIVATION_FAILED",

            betReason:
                betActivation.reason
        };
    }


    /* -----------------------------------------------------
       COUNTDOWN -> FLYING
    ----------------------------------------------------- */

    const phaseResult =
        setPhase(
            GAME_PHASES.FLYING
        );


    if (!phaseResult.success) {
        emitFlightEvent(
            "FLIGHT_START_FAILED",
            {
                reason:
                    phaseResult.reason,

                state:
                    getState()
            }
        );


        return phaseResult;
    }


    /* -----------------------------------------------------
       Initialize runtime.
    ----------------------------------------------------- */

    runtime.flightRunning =
        true;

    runtime.crashHandled =
        false;

    runtime.lastMultiplierSoundAt =
        0;

    runtime.flightStartPerformanceTime =
        getPerformanceNow();


    const multiplierResult =
        setMultiplier(
            FLIGHT_CONFIG
                .START_MULTIPLIER
        );


    if (!multiplierResult.success) {
        runtime.flightRunning =
            false;


        return {
            success: false,

            reason:
                multiplierResult.reason
        };
    }


    markFlightStarted(
        Date.now()
    );


    /* -----------------------------------------------------
       Audio.
    ----------------------------------------------------- */

    playTakeoff();

    startFlyingLoop();


    /* -----------------------------------------------------
       Event.

       By this point:
       - phase = FLYING
       - placed bet = ACTIVE
       - crash point exists
    ----------------------------------------------------- */

    emitFlightEvent(
        "FLIGHT_START",
        {
            multiplier:
                FLIGHT_CONFIG
                    .START_MULTIPLIER,

            crashMultiplier:
                getCrashMultiplier(),

            betActivated:
                betActivation
                    .activated,

            bet:
                betActivation
                    .bet
        }
    );


    /* -----------------------------------------------------
       Immediate crash at exactly 1.00×.

       The bet has already become ACTIVE, therefore the later
       settlement correctly recognizes it as a LOSS.
    ----------------------------------------------------- */

    if (
        hasReachedCrashPoint(
            FLIGHT_CONFIG
                .START_MULTIPLIER
        )
    ) {
        const crashResult =
            handleCrash(
                FLIGHT_CONFIG
                    .START_MULTIPLIER
            );


        return {
            success:
                crashResult.success,

            immediateCrash:
                true,

            crashMultiplier:
                getCrashMultiplier(),

            betActivated:
                betActivation
                    .activated,

            crash:
                crashResult
        };
    }


    /* -----------------------------------------------------
       Begin animation loop.
    ----------------------------------------------------- */

    runtime.animationFrameId =
        requestAnimationFrame(
            flightFrame
        );


    return {
        success: true,

        immediateCrash:
            false,

        crashMultiplier:
            getCrashMultiplier(),

        betActivated:
            betActivation
                .activated
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


    /* -----------------------------------------------------
       Elapsed runtime.
    ----------------------------------------------------- */

    const elapsedMs =
        Math.max(
            0,
            frameTime -
                startTime
        );


    /* -----------------------------------------------------
       Calculate next multiplier.
    ----------------------------------------------------- */

    let nextMultiplier =
        calculateFlightMultiplier(
            elapsedMs
        );


    const crashMultiplier =
        getCrashMultiplier();


    /* -----------------------------------------------------
       Never visually overshoot crash point.

       Example:

       previous frame:
       2.46×

       calculated:
       2.49×

       actual crash:
       2.47×

       state/display:
       2.47×
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       Update state.
    ----------------------------------------------------- */

    updateFlightElapsed(
        elapsedMs
    );


    setMultiplier(
        nextMultiplier
    );


    /* -----------------------------------------------------
       Publish multiplier.

       cashout.js listens to this event for Auto Cash Out.
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       Crash check happens AFTER the multiplier event.

       Auto Cash Out is still safe because cashout.js checks:

           targetMultiplier < crashMultiplier

       Therefore an Auto target equal to the crash point
       cannot win.
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       Lock final multiplier exactly to crash point.
    ----------------------------------------------------- */

    const multiplierResult =
        setMultiplier(
            finalMultiplier
        );


    if (!multiplierResult.success) {
        return {
            success: false,

            reason:
                multiplierResult.reason
        };
    }


    /* -----------------------------------------------------
       Save crash timing.
    ----------------------------------------------------- */

    markFlightCrashed(
        Date.now()
    );


    /* -----------------------------------------------------
       FLYING -> CRASHED
    ----------------------------------------------------- */

    const phaseResult =
        setPhase(
            GAME_PHASES.CRASHED
        );


    if (!phaseResult.success) {
        return {
            success: false,

            reason:
                phaseResult.reason
        };
    }


    playCrash();


    const state =
        getState();


    /* -----------------------------------------------------
       settlement.js listens to this event and performs:

       CRASHED
       -> SETTLING
       -> ENDED
    ----------------------------------------------------- */

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
                state.roundId,

            betStatus:
                state.bet
                    .status,

            cashoutCompleted:
                state.cashout
                    .completed
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
        runtime.animationFrameId ===
        null
    ) {
        return;
    }


    cancelAnimationFrame(
        runtime.animationFrameId
    );


    runtime.animationFrameId =
        null;
}


/* =========================================================
   ABORT FLIGHT

   Intended for runtime failures.

   Does NOT:
   - refund bet
   - settle round
   - write history

   A higher-level game controller must decide how an aborted
   round should be recovered.
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

    runtime.lastMultiplierSoundAt =
        0;

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

   Call before / when starting a new round.
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
    const state =
        getState();


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
            state.multiplier,

        crashMultiplier:
            state.crashMultiplier,

        phase:
            state.phase,

        betStatus:
            state.bet
                .status,

        cashoutCompleted:
            state.cashout
                .completed
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
