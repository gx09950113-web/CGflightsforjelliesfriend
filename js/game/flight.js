/* =========================================================
   CG FLIGHT
   js/game/flight.js

   Flight runtime engine.

   Responsibilities:
   - Prepare hidden Crash Point
   - Run pre-flight countdown
   - Start the flight
   - Advance multiplier with requestAnimationFrame
   - Publish multiplier updates
   - Detect Crash Point
   - Update state.js runtime values
   - Stop the round exactly at Crash Point
   - Publish flight lifecycle events
   - Coordinate flight-related audio

   IMPORTANT:
   flight.js does NOT:
   - Debit bets
   - Perform Cash Out
   - Credit Wallet
   - Perform Settlement
   - Save History
========================================================= */


import {
    GAME_PHASES,

    getState,
    getPhase,

    setPhase,

    startFlightState,
    setCurrentMultiplier,
    markFlightCrashed
} from "./state.js";


import {
    prepareCrashPoint,
    hasReachedCrashPoint
} from "./crash.js";


import {
    roundTo,
    clamp
} from "../core/utils.js";


import {
    playCountdown,
    playTakeoff,

    startFlyingLoop,
    stopFlyingLoop,

    startMultiplierRise,
    stopMultiplierRise,

    playCrash
} from "../core/audio.js";


/* =========================================================
   FLIGHT CONFIG
========================================================= */

const FLIGHT_CONFIG = Object.freeze({

    /* -----------------------------------------------------
       Countdown
    ----------------------------------------------------- */

    COUNTDOWN_SECONDS:
        3,

    COUNTDOWN_INTERVAL_MS:
        1000,


    /* -----------------------------------------------------
       Multiplier
    -----------------------------------------------------

       Flight curve:

           multiplier =
               e ^ (
                   GROWTH_RATE *
                   elapsedSeconds
               )

       Examples with 0.115:

           ~1.12× after 1 sec
           ~1.41× after 3 sec
           ~1.78× after 5 sec
           ~3.16× after 10 sec
           ~10.00× after ~20 sec

       The curve gets progressively faster while remaining
       smooth and predictable.
    ----------------------------------------------------- */

    GROWTH_RATE:
        0.115,


    /* -----------------------------------------------------
       Display / state precision
    ----------------------------------------------------- */

    MULTIPLIER_DECIMALS:
        2,


    /* -----------------------------------------------------
       requestAnimationFrame protection

       Browsers heavily throttle background tabs.

       We still calculate multiplier from total elapsed time
       instead of adding fixed values every frame, so frame
       rate does not affect the game outcome.
    ----------------------------------------------------- */

    MAX_FRAME_DELTA_MS:
        1000,


    /* -----------------------------------------------------
       Safety ceiling

       crash.js currently caps Crash Point at 1000×.
       This is merely an additional runtime guard.
    ----------------------------------------------------- */

    MAX_RUNTIME_MULTIPLIER:
        1000
});


/* =========================================================
   FLIGHT EVENT TYPES
========================================================= */

const FLIGHT_EVENT_TYPES =
    Object.freeze({

        COUNTDOWN_START:
            "COUNTDOWN_START",

        COUNTDOWN_TICK:
            "COUNTDOWN_TICK",

        COUNTDOWN_END:
            "COUNTDOWN_END",

        FLIGHT_START:
            "FLIGHT_START",

        MULTIPLIER_UPDATE:
            "MULTIPLIER_UPDATE",

        CRASH:
            "CRASH",

        FLIGHT_ABORTED:
            "FLIGHT_ABORTED"
    });


/* =========================================================
   RUNTIME
========================================================= */

const runtime = {

    countdownTimerId:
        null,

    countdownRemaining:
        0,

    animationFrameId:
        null,

    flightStartPerformance:
        null,

    lastFramePerformance:
        null,

    running:
        false,

    countdownRunning:
        false,

    crashed:
        false,

    roundId:
        null
};


/* =========================================================
   LISTENERS
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


/* =========================================================
   NOTIFY
========================================================= */

function notifyFlightListeners(
    event
) {

    const state =
        getState();


    const payload = {

        ...event,

        roundId:
            event.roundId ??
            state.roundId,

        phase:
            state.phase,

        timestamp:
            event.timestamp ??
            Date.now()
    };


    for (
        const listener
        of flightListeners
    ) {

        try {

            listener(
                payload
            );

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

function nowPerformance() {

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
   REQUEST ANIMATION FRAME FALLBACK
========================================================= */

function requestFrame(
    callback
) {

    if (
        typeof requestAnimationFrame ===
        "function"
    ) {

        return requestAnimationFrame(
            callback
        );
    }


    return window.setTimeout(
        () => {

            callback(
                nowPerformance()
            );
        },
        16
    );
}


/* =========================================================
   CANCEL ANIMATION FRAME FALLBACK
========================================================= */

function cancelFrame(
    id
) {

    if (
        id === null ||
        id === undefined
    ) {
        return;
    }


    if (
        typeof cancelAnimationFrame ===
        "function"
    ) {

        cancelAnimationFrame(
            id
        );

        return;
    }


    window.clearTimeout(
        id
    );
}


/* =========================================================
   CALCULATE MULTIPLIER

   Time-based rather than frame-based.

   Therefore:
   - 60 FPS and 144 FPS produce the same multiplier
   - minor frame drops do not alter gameplay
========================================================= */

function calculateMultiplier(
    elapsedMs
) {

    const milliseconds =
        Math.max(
            0,
            Number(
                elapsedMs
            ) || 0
        );


    const seconds =
        milliseconds /
        1000;


    const raw =
        Math.exp(
            FLIGHT_CONFIG
                .GROWTH_RATE *
            seconds
        );


    return clamp(
        raw,
        1,
        FLIGHT_CONFIG
            .MAX_RUNTIME_MULTIPLIER
    );
}


/* =========================================================
   CALCULATE ELAPSED TIME FOR MULTIPLIER

   Inverse of calculateMultiplier().

   Useful for testing and debugging.
========================================================= */

function calculateElapsedForMultiplier(
    multiplier
) {

    const value =
        Number(
            multiplier
        );


    if (
        !Number.isFinite(
            value
        ) ||
        value <= 1
    ) {
        return 0;
    }


    const seconds =
        Math.log(
            value
        ) /
        FLIGHT_CONFIG
            .GROWTH_RATE;


    return Math.max(
        0,
        seconds *
        1000
    );
}


/* =========================================================
   START COUNTDOWN

   Expected page flow:

       createRound()
       ↓
       5 second betting window in pages/game.js
       ↓
       startCountdown()
       ↓
       COUNTDOWN 3 / 2 / 1
       ↓
       FLYING
========================================================= */

function startCountdown() {

    if (
        runtime.countdownRunning ||
        runtime.running
    ) {

        return {
            success: false,

            reason:
                "FLIGHT_ALREADY_RUNNING"
        };
    }


    const state =
        getState();


    if (
        !state.roundId
    ) {

        return {
            success: false,

            reason:
                "NO_ACTIVE_ROUND"
        };
    }


    if (
        state.phase !==
        GAME_PHASES.BETTING
    ) {

        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase:
                state.phase
        };
    }


    /* -----------------------------------------------------
       Generate hidden Crash Point once.
    ----------------------------------------------------- */

    const crashPreparation =
        prepareCrashPoint();


    if (
        !crashPreparation.success
    ) {

        abortFlight(
            crashPreparation.reason ??
            "CRASH_POINT_PREPARATION_FAILED"
        );


        return {
            success: false,

            reason:
                crashPreparation.reason ??
                "CRASH_POINT_PREPARATION_FAILED"
        };
    }


    /* -----------------------------------------------------
       Move round into COUNTDOWN.
    ----------------------------------------------------- */

    const phaseResult =
        setPhase(
            GAME_PHASES.COUNTDOWN,
            {
                source:
                    "flight.startCountdown"
            }
        );


    if (
        !phaseResult.success
    ) {

        abortFlight(
            "COUNTDOWN_PHASE_FAILED"
        );


        return {
            success: false,

            reason:
                "COUNTDOWN_PHASE_FAILED"
        };
    }


    runtime.roundId =
        state.roundId;


    runtime.countdownRunning =
        true;


    runtime.countdownRemaining =
        FLIGHT_CONFIG
            .COUNTDOWN_SECONDS;


    runtime.crashed =
        false;


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .COUNTDOWN_START,

        remaining:
            runtime.countdownRemaining
    });


    emitCountdownTick();


    return {
        success: true,

        countdown:
            FLIGHT_CONFIG
                .COUNTDOWN_SECONDS
    };
}


/* =========================================================
   COUNTDOWN TICK
========================================================= */

function emitCountdownTick() {

    if (
        !runtime.countdownRunning
    ) {
        return;
    }


    const currentRound =
        getState();


    /*
     Protect against a different round being created while
     the old countdown is still alive.
    */

    if (
        currentRound.roundId !==
        runtime.roundId
    ) {

        abortFlight(
            "ROUND_CHANGED_DURING_COUNTDOWN"
        );

        return;
    }


    playCountdown();


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .COUNTDOWN_TICK,

        remaining:
            runtime.countdownRemaining
    });


    if (
        runtime.countdownRemaining <=
        0
    ) {

        finishCountdown();

        return;
    }


    runtime.countdownTimerId =
        window.setTimeout(
            () => {

                runtime
                    .countdownTimerId =
                    null;


                runtime
                    .countdownRemaining -=
                    1;


                emitCountdownTick();
            },
            FLIGHT_CONFIG
                .COUNTDOWN_INTERVAL_MS
        );
}


/* =========================================================
   FINISH COUNTDOWN
========================================================= */

function finishCountdown() {

    clearCountdownTimer();


    runtime.countdownRunning =
        false;


    runtime.countdownRemaining =
        0;


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .COUNTDOWN_END
    });


    startFlight();
}


/* =========================================================
   START FLIGHT
========================================================= */

function startFlight() {

    if (
        runtime.running
    ) {

        return {
            success: false,

            reason:
                "FLIGHT_ALREADY_RUNNING"
        };
    }


    const state =
        getState();


    if (
        state.phase !==
        GAME_PHASES.COUNTDOWN
    ) {

        abortFlight(
            "INVALID_FLIGHT_START_PHASE"
        );


        return {
            success: false,

            reason:
                "INVALID_PHASE",

            phase:
                state.phase
        };
    }


    if (
        state.flight
            .crashMultiplier ===
        null
    ) {

        abortFlight(
            "MISSING_CRASH_POINT"
        );


        return {
            success: false,

            reason:
                "MISSING_CRASH_POINT"
        };
    }


    const started =
        startFlightState();


    if (!started) {

        abortFlight(
            "STATE_FLIGHT_START_FAILED"
        );


        return {
            success: false,

            reason:
                "STATE_FLIGHT_START_FAILED"
        };
    }


    runtime.running =
        true;


    runtime.crashed =
        false;


    runtime.roundId =
        state.roundId;


    runtime.flightStartPerformance =
        nowPerformance();


    runtime.lastFramePerformance =
        runtime.flightStartPerformance;


    playTakeoff();

    startFlyingLoop();

    startMultiplierRise();


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .FLIGHT_START,

        multiplier:
            1
    });


    /*
     Crash Point may be 1.00×.

     In that case we should crash immediately instead of
     rendering an unnecessary animation frame.
    */

    const freshState =
        getState();


    if (
        hasReachedCrashPoint(
            1,
            freshState.flight
                .crashMultiplier
        )
    ) {

        crashFlight(
            freshState.flight
                .crashMultiplier,
            0
        );


        return {
            success: true,

            immediateCrash:
                true
        };
    }


    runtime.animationFrameId =
        requestFrame(
            flightFrame
        );


    return {
        success: true,

        immediateCrash:
            false
    };
}


/* =========================================================
   FLIGHT FRAME
========================================================= */

function flightFrame(
    timestamp
) {

    runtime.animationFrameId =
        null;


    if (
        !runtime.running ||
        runtime.crashed
    ) {
        return;
    }


    const state =
        getState();


    /* -----------------------------------------------------
       Protect current round identity.
    ----------------------------------------------------- */

    if (
        state.roundId !==
        runtime.roundId
    ) {

        abortFlight(
            "ROUND_CHANGED_DURING_FLIGHT"
        );

        return;
    }


    if (
        state.phase !==
        GAME_PHASES.FLYING
    ) {

        abortFlight(
            "FLIGHT_PHASE_CHANGED_UNEXPECTEDLY"
        );

        return;
    }


    const currentTimestamp =
        Number.isFinite(
            Number(timestamp)
        )
            ? Number(timestamp)
            : nowPerformance();


    const elapsedMs =
        Math.max(
            0,
            currentTimestamp -
            runtime
                .flightStartPerformance
        );


    /*
     Track frame delta for debugging / future effects.

     Outcome itself is NOT calculated from frame delta.
    */

    const frameDelta =
        clamp(
            currentTimestamp -
            runtime
                .lastFramePerformance,
            0,
            FLIGHT_CONFIG
                .MAX_FRAME_DELTA_MS
        );


    runtime.lastFramePerformance =
        currentTimestamp;


    const rawMultiplier =
        calculateMultiplier(
            elapsedMs
        );


    const crashMultiplier =
        state.flight
            .crashMultiplier;


    /* =====================================================
       CRASH REACHED

       Important:
       We clamp the final state to EXACT Crash Point.

       Example:
           previous frame = 1.99
           next calculated = 2.03
           crash point = 2.00

       UI / history should record 2.00×, not 2.03×.
    ====================================================== */

    if (
        hasReachedCrashPoint(
            rawMultiplier,
            crashMultiplier
        )
    ) {

        crashFlight(
            crashMultiplier,
            elapsedMs
        );


        return;
    }


    /* =====================================================
       NORMAL MULTIPLIER UPDATE
    ====================================================== */

    const displayMultiplier =
        roundTo(
            rawMultiplier,
            FLIGHT_CONFIG
                .MULTIPLIER_DECIMALS
        );


    setCurrentMultiplier(
        displayMultiplier,
        elapsedMs
    );


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .MULTIPLIER_UPDATE,

        multiplier:
            displayMultiplier,

        rawMultiplier,

        elapsedMs,

        frameDelta
    });


    runtime.animationFrameId =
        requestFrame(
            flightFrame
        );
}


/* =========================================================
   CRASH FLIGHT
========================================================= */

function crashFlight(
    crashMultiplier,
    elapsedMs
) {

    if (
        runtime.crashed
    ) {
        return;
    }


    runtime.crashed =
        true;


    runtime.running =
        false;


    cancelFlightFrame();


    stopFlyingLoop();

    stopMultiplierRise();


    const normalizedCrash =
        roundTo(
            Number(
                crashMultiplier
            ) || 1,
            FLIGHT_CONFIG
                .MULTIPLIER_DECIMALS
        );


    /*
     Ensure State's final multiplier and elapsed time match
     the exact crash result before phase changes.
    */

    setCurrentMultiplier(
        normalizedCrash,
        elapsedMs
    );


    markFlightCrashed(
        normalizedCrash
    );


    playCrash();


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .CRASH,

        crashMultiplier:
            normalizedCrash,

        multiplier:
            normalizedCrash,

        elapsedMs:
            Math.max(
                0,
                Number(
                    elapsedMs
                ) || 0
            )
    });
}


/* =========================================================
   ABORT FLIGHT

   Runtime / programming failure only.

   This is NOT a normal Crash.
========================================================= */

function abortFlight(
    reason =
        "UNKNOWN_FLIGHT_ERROR"
) {

    const state =
        getState();


    clearCountdownTimer();

    cancelFlightFrame();


    runtime.countdownRunning =
        false;


    runtime.running =
        false;


    runtime.crashed =
        false;


    stopFlyingLoop();

    stopMultiplierRise();


    /*
     Do not mark this as CRASHED because an aborted runtime
     is not a legitimate game result.

     Leave normal settlement/refund policy to settlement.js.
    */


    notifyFlightListeners({

        type:
            FLIGHT_EVENT_TYPES
                .FLIGHT_ABORTED,

        reason,

        state
    });


    return {
        success: false,
        reason
    };
}


/* =========================================================
   CLEAR COUNTDOWN TIMER
========================================================= */

function clearCountdownTimer() {

    if (
        runtime.countdownTimerId !==
        null
    ) {

        window.clearTimeout(
            runtime
                .countdownTimerId
        );


        runtime.countdownTimerId =
            null;
    }
}


/* =========================================================
   CANCEL FLIGHT FRAME
========================================================= */

function cancelFlightFrame() {

    if (
        runtime.animationFrameId !==
        null
    ) {

        cancelFrame(
            runtime
                .animationFrameId
        );


        runtime.animationFrameId =
            null;
    }
}


/* =========================================================
   RESET FLIGHT RUNTIME

   Called by pages/game.js before createRound().

   Does NOT reset state.js itself.
========================================================= */

function resetFlightRuntime() {

    clearCountdownTimer();

    cancelFlightFrame();


    runtime.countdownRemaining =
        0;


    runtime.flightStartPerformance =
        null;


    runtime.lastFramePerformance =
        null;


    runtime.running =
        false;


    runtime.countdownRunning =
        false;


    runtime.crashed =
        false;


    runtime.roundId =
        null;


    stopFlyingLoop();

    stopMultiplierRise();


    return true;
}


/* =========================================================
   GET FLIGHT STATUS
========================================================= */

function getFlightStatus() {

    const state =
        getState();


    return {

        roundId:
            state.roundId,

        phase:
            state.phase,

        countdownRunning:
            runtime
                .countdownRunning,

        countdownRemaining:
            runtime
                .countdownRemaining,

        running:
            runtime.running,

        crashed:
            runtime.crashed,

        currentMultiplier:
            state.flight
                .currentMultiplier,

        crashMultiplier:
            state.flight
                .crashMultiplier,

        elapsedMs:
            state.flight
                .elapsedMs
    };
}


/* =========================================================
   IS FLIGHT RUNNING
========================================================= */

function isFlightRunning() {

    return runtime.running;
}


/* =========================================================
   IS COUNTDOWN RUNNING
========================================================= */

function isCountdownRunning() {

    return runtime
        .countdownRunning;
}


/* =========================================================
   PAGE VISIBILITY

   No special mathematical correction is required because
   multiplier is derived from total elapsed time.

   When returning from a throttled background tab, the next
   frame immediately catches up and may correctly trigger
   Crash.
========================================================= */

function handleVisibilityChange() {

    if (
        document.visibilityState !==
        "visible"
    ) {
        return;
    }


    /*
     requestAnimationFrame should resume automatically.

     This fallback only protects unusual browsers where the
     scheduled frame was dropped while hidden.
    */

    if (
        runtime.running &&
        runtime.animationFrameId ===
            null
    ) {

        runtime.animationFrameId =
            requestFrame(
                flightFrame
            );
    }
}


if (
    typeof document !==
    "undefined"
) {

    document.addEventListener(
        "visibilitychange",
        handleVisibilityChange
    );
}


/* =========================================================
   COMPATIBILITY ALIASES

   Temporarily retained while cashout.js / settlement.js are
   being audited.
========================================================= */

function beginCountdown() {

    return startCountdown();
}


function beginFlight() {

    return startFlight();
}


function stopFlight() {

    resetFlightRuntime();

    return true;
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    FLIGHT_CONFIG,
    FLIGHT_EVENT_TYPES,

    calculateMultiplier,
    calculateElapsedForMultiplier,

    startCountdown,
    startFlight,

    abortFlight,

    resetFlightRuntime,

    getFlightStatus,

    isFlightRunning,
    isCountdownRunning,

    subscribeToFlight,

    /* Compatibility */
    beginCountdown,
    beginFlight,
    stopFlight
};
