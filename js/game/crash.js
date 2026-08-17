/* =========================================================
   CG FLIGHT
   js/game/crash.js

   Crash Point generator.

   Responsibilities:
   - Generate one hidden Crash Point for each round
   - Apply configured mathematical distribution
   - Enforce minimum / maximum multiplier
   - Normalize multiplier precision
   - Optionally assign Crash Point into state.js
   - Provide validation / probability helpers

   IMPORTANT:
   crash.js does NOT:
   - Start flight
   - Animate multiplier
   - Modify Wallet
   - Perform Cash Out
   - Perform Settlement
========================================================= */


import {
    clamp,
    roundTo
} from "../core/utils.js";

import {
    getState,
    setCrashMultiplier
} from "./state.js";


/* =========================================================
   CRASH CONFIG
========================================================= */

const CRASH_CONFIG = Object.freeze({

    /*
     Smallest possible Crash Point.

     1.00× means a round may crash essentially immediately.
    */
    MIN_MULTIPLIER:
        1.00,


    /*
     Hard ceiling used to prevent extreme/infinite values
     from producing impractical local-game rounds.
    */
    MAX_MULTIPLIER:
        1000.00,


    /*
     Crash Point precision.
    */
    DECIMALS:
        2,


    /*
     Distribution factor.

     The generator uses an inverse distribution similar to
     common crash-game mathematics:

         crash ≈ FACTOR / random

     A lower factor causes more low Crash Points.

     This is a virtual-coin local game, so this value is a
     gameplay tuning parameter rather than real-money RTP.
    */
    DISTRIBUTION_FACTOR:
        0.96
});


/* =========================================================
   CRYPTO RANDOM

   Prefer crypto.getRandomValues() when available.
   Fall back to Math.random() only when required.
========================================================= */

function getRandomUnit() {

    if (
        typeof crypto !== "undefined" &&
        typeof crypto.getRandomValues ===
            "function"
    ) {

        const values =
            new Uint32Array(1);


        crypto.getRandomValues(
            values
        );


        /*
         Produces:
             0 <= value < 1
        */

        return (
            values[0] /
            4294967296
        );
    }


    return Math.random();
}


/* =========================================================
   SAFE RANDOM

   Prevent exactly zero because the inverse distribution
   divides by the random value.
========================================================= */

function getSafeRandomUnit() {

    const value =
        getRandomUnit();


    return Math.max(
        Number.EPSILON,
        Math.min(
            1 - Number.EPSILON,
            value
        )
    );
}


/* =========================================================
   NORMALIZE CRASH POINT
========================================================= */

function normalizeCrashPoint(
    multiplier
) {

    const numeric =
        Number(multiplier);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return CRASH_CONFIG
            .MIN_MULTIPLIER;
    }


    const clamped =
        clamp(
            numeric,
            CRASH_CONFIG
                .MIN_MULTIPLIER,
            CRASH_CONFIG
                .MAX_MULTIPLIER
        );


    return roundTo(
        clamped,
        CRASH_CONFIG
            .DECIMALS
    );
}


/* =========================================================
   GENERATE RAW CRASH POINT

   Distribution:

       x = factor / (1 - r)

   where:
       r ∈ [0, 1)

   This creates:
   - many low multipliers
   - fewer medium multipliers
   - rare high multipliers

   Example shape:
       low Crash Points     common
       2×+                  less common
       10×+                 uncommon
       100×+                rare

   Hard MAX_MULTIPLIER prevents impractical outliers.
========================================================= */

function generateRawCrashPoint(
    randomValue =
        getSafeRandomUnit()
) {

    const r =
        clamp(
            Number(randomValue),
            Number.EPSILON,
            1 - Number.EPSILON
        );


    const raw =
        CRASH_CONFIG
            .DISTRIBUTION_FACTOR /
        (
            1 - r
        );


    return raw;
}


/* =========================================================
   GENERATE CRASH POINT
========================================================= */

function generateCrashPoint() {

    const raw =
        generateRawCrashPoint();


    return normalizeCrashPoint(
        raw
    );
}


/* =========================================================
   GENERATE + ASSIGN TO CURRENT ROUND

   Recommended entry point for flight.js.
========================================================= */

function prepareCrashPoint() {

    const state =
        getState();


    if (
        !state.roundId
    ) {

        return {
            success: false,

            reason:
                "NO_ACTIVE_ROUND",

            crashMultiplier:
                null
        };
    }


    /*
     Avoid regenerating a Crash Point if this round already
     has one.
    */

    if (
        state.flight
            .crashMultiplier !==
        null
    ) {

        return {
            success: true,

            generated:
                false,

            crashMultiplier:
                state.flight
                    .crashMultiplier
        };
    }


    const crashMultiplier =
        generateCrashPoint();


    const result =
        setCrashMultiplier(
            crashMultiplier
        );


    if (
        !result.success
    ) {

        return {
            success: false,

            reason:
                result.reason,

            crashMultiplier:
                null
        };
    }


    return {
        success: true,

        generated:
            true,

        crashMultiplier
    };
}


/* =========================================================
   VALIDATE CRASH POINT
========================================================= */

function isValidCrashPoint(
    multiplier
) {

    const numeric =
        Number(multiplier);


    return (
        Number.isFinite(
            numeric
        ) &&
        numeric >=
            CRASH_CONFIG
                .MIN_MULTIPLIER &&
        numeric <=
            CRASH_CONFIG
                .MAX_MULTIPLIER
    );
}


/* =========================================================
   CASH OUT BOUNDARY

   Core rule:

       cashoutMultiplier < crashMultiplier

   Equality is a LOSS.

   Example:
       Crash 2.00
       Cash Out 1.99 -> success
       Cash Out 2.00 -> failure
========================================================= */

function canCashoutBeforeCrash(
    cashoutMultiplier,
    crashMultiplier
) {

    const cashout =
        Number(
            cashoutMultiplier
        );


    const crash =
        Number(
            crashMultiplier
        );


    if (
        !Number.isFinite(
            cashout
        ) ||
        !Number.isFinite(
            crash
        )
    ) {
        return false;
    }


    return (
        cashout <
        crash
    );
}


/* =========================================================
   HAS CRASHED

   Used by flight.js.

   Once current displayed multiplier reaches OR exceeds the
   hidden Crash Point, the round must crash.
========================================================= */

function hasReachedCrashPoint(
    currentMultiplier,
    crashMultiplier
) {

    const current =
        Number(
            currentMultiplier
        );


    const crash =
        Number(
            crashMultiplier
        );


    if (
        !Number.isFinite(
            current
        ) ||
        !Number.isFinite(
            crash
        )
    ) {
        return false;
    }


    return (
        current >=
        crash
    );
}


/* =========================================================
   APPROXIMATE SURVIVAL PROBABILITY

   For development/testing only.

   Returns approximate probability that the generated Crash
   Point is GREATER THAN the target multiplier.

   Based on the configured inverse distribution before
   ceiling effects.

   Example:
       getApproximateSurvivalProbability(2)
       -> about 0.48
========================================================= */

function getApproximateSurvivalProbability(
    targetMultiplier
) {

    const target =
        Number(
            targetMultiplier
        );


    if (
        !Number.isFinite(
            target
        ) ||
        target <= 0
    ) {
        return 0;
    }


    if (
        target <
        CRASH_CONFIG
            .MIN_MULTIPLIER
    ) {
        return 1;
    }


    if (
        target >=
        CRASH_CONFIG
            .MAX_MULTIPLIER
    ) {
        return 0;
    }


    return clamp(
        CRASH_CONFIG
            .DISTRIBUTION_FACTOR /
        target,
        0,
        1
    );
}


/* =========================================================
   APPROXIMATE CRASH-BELOW PROBABILITY

   Complement of survival probability.
========================================================= */

function getApproximateCrashProbability(
    targetMultiplier
) {

    return (
        1 -
        getApproximateSurvivalProbability(
            targetMultiplier
        )
    );
}


/* =========================================================
   DEVELOPMENT SAMPLE

   Useful in browser console for checking distribution.

   Example:
       sampleCrashDistribution(10000)
========================================================= */

function sampleCrashDistribution(
    count = 10000
) {

    const sampleCount =
        Math.max(
            1,
            Math.floor(
                Number(count) ||
                1
            )
        );


    const buckets = {

        total:
            sampleCount,

        below1_20:
            0,

        below1_50:
            0,

        below2:
            0,

        from2To5:
            0,

        from5To10:
            0,

        from10To100:
            0,

        above100:
            0,

        highest:
            0,

        average:
            0
    };


    let sum =
        0;


    for (
        let i = 0;
        i < sampleCount;
        i += 1
    ) {

        const value =
            generateCrashPoint();


        sum += value;


        buckets.highest =
            Math.max(
                buckets.highest,
                value
            );


        if (
            value < 1.2
        ) {
            buckets.below1_20 +=
                1;
        }


        if (
            value < 1.5
        ) {
            buckets.below1_50 +=
                1;
        }


        if (
            value < 2
        ) {

            buckets.below2 +=
                1;

        } else if (
            value < 5
        ) {

            buckets.from2To5 +=
                1;

        } else if (
            value < 10
        ) {

            buckets.from5To10 +=
                1;

        } else if (
            value < 100
        ) {

            buckets.from10To100 +=
                1;

        } else {

            buckets.above100 +=
                1;
        }
    }


    buckets.average =
        roundTo(
            sum /
            sampleCount,
            2
        );


    return buckets;
}


/* =========================================================
   COMPATIBILITY ALIASES

   Keep these temporarily while the remaining game modules
   are being audited.
========================================================= */

function createCrashPoint() {

    return generateCrashPoint();
}


function generateCrashMultiplier() {

    return generateCrashPoint();
}


function initializeCrashPoint() {

    return prepareCrashPoint();
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    CRASH_CONFIG,

    generateRawCrashPoint,
    generateCrashPoint,
    prepareCrashPoint,

    normalizeCrashPoint,
    isValidCrashPoint,

    canCashoutBeforeCrash,
    hasReachedCrashPoint,

    getApproximateSurvivalProbability,
    getApproximateCrashProbability,

    sampleCrashDistribution,

    /* Compatibility */
    createCrashPoint,
    generateCrashMultiplier,
    initializeCrashPoint
};
