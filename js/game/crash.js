/* =========================================================
   CG FLIGHT
   js/game/crash.js

   Crash multiplier generator.

   Responsibilities:
   - Generate crash multiplier for each round
   - Store crash multiplier in round state
   - Check whether current multiplier has reached crash point
   - Provide crash probability helpers
   - Provide simulation/debug helpers

   IMPORTANT:
   This module does NOT:
   - Animate the multiplier
   - Control flight timing
   - Deduct bets
   - Perform cashout
   - Perform settlement
========================================================= */

import {
    setCrashMultiplier,
    getCrashMultiplier
} from "./state.js";

import {
    clamp,
    roundTo,
    isFiniteNumber
} from "../core/utils.js";


/* =========================================================
   CRASH CONFIG
========================================================= */

const CRASH_CONFIG = Object.freeze({

    /*
     Lowest possible crash multiplier.

     1.00 means the plane can crash effectively
     immediately after takeoff.
    */
    MIN_MULTIPLIER: 1.00,


    /*
     Hard upper limit.

     Prevents extreme values from producing impractically
     long rounds.
    */
    MAX_MULTIPLIER: 1000.00,


    /*
     Statistical house edge.

     0.03 = 3%

     This affects the crash distribution.
    */
    HOUSE_EDGE: 0.03,


    /*
     Stored/displayed precision.
    */
    DECIMALS: 2
});


/* =========================================================
   RANDOM SOURCE

   Prefer crypto.getRandomValues() when available.

   This is still client-side randomness and should not be
   treated as server-authoritative or tamper-proof.
========================================================= */

function getRandomUnit() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.getRandomValues === "function"
    ) {
        const array =
            new Uint32Array(1);

        crypto.getRandomValues(
            array
        );

        /*
         Divide by 2^32.

         Result:
         0 <= value < 1
        */

        return (
            array[0] /
            4294967296
        );
    }

    return Math.random();
}


/* =========================================================
   CRASH FORMULA

   Uses a heavy-tailed inverse distribution.

   Approximate survival probability:

       P(crash >= x)
       ≈ (1 - houseEdge) / x

   This naturally creates:
   - many low multipliers
   - fewer medium multipliers
   - rare high multipliers
========================================================= */

function calculateCrashMultiplier(
    randomValue,
    {
        houseEdge =
            CRASH_CONFIG.HOUSE_EDGE,

        minMultiplier =
            CRASH_CONFIG.MIN_MULTIPLIER,

        maxMultiplier =
            CRASH_CONFIG.MAX_MULTIPLIER,

        decimals =
            CRASH_CONFIG.DECIMALS
    } = {}
) {
    const safeRandom =
        clamp(
            randomValue,
            0,
            0.999999999999
        );

    const safeEdge =
        clamp(
            houseEdge,
            0,
            0.99
        );

    const safeMin =
        Math.max(
            1,
            Number(minMultiplier) || 1
        );

    const safeMax =
        Math.max(
            safeMin,
            Number(maxMultiplier) ||
                safeMin
        );


    /*
     Prevent division by zero.

     Using (1 - random) gives a Pareto-like tail.
    */

    const denominator =
        1 - safeRandom;


    const rawMultiplier =
        (
            1 - safeEdge
        ) /
        denominator;


    const boundedMultiplier =
        clamp(
            rawMultiplier,
            safeMin,
            safeMax
        );


    return roundTo(
        boundedMultiplier,
        decimals
    );
}


/* =========================================================
   GENERATE CRASH MULTIPLIER

   Pure generator.
   Does NOT modify game state.
========================================================= */

function generateCrashMultiplier(
    options = {}
) {
    const randomValue =
        getRandomUnit();

    return calculateCrashMultiplier(
        randomValue,
        options
    );
}


/* =========================================================
   PREPARE ROUND CRASH POINT

   Generates and stores the crash multiplier in state.js.

   Recommended usage:
       prepareCrashPoint();

   This should normally happen once before the round starts.
========================================================= */

function prepareCrashPoint(
    options = {}
) {
    const existing =
        getCrashMultiplier();

    if (
        existing !== null &&
        existing !== undefined
    ) {
        return {
            success: false,
            reason:
                "CRASH_POINT_ALREADY_SET",

            crashMultiplier:
                existing
        };
    }


    const crashMultiplier =
        generateCrashMultiplier(
            options
        );


    const stateResult =
        setCrashMultiplier(
            crashMultiplier
        );


    if (!stateResult.success) {
        return {
            success: false,

            reason:
                stateResult.reason
        };
    }


    return {
        success: true,

        crashMultiplier
    };
}


/* =========================================================
   FORCE CRASH POINT

   Intended for:
   - development
   - deterministic testing
   - replay/debug tools

   Example:
       forceCrashPoint(2.00);
========================================================= */

function forceCrashPoint(
    multiplier
) {
    if (
        !isFiniteNumber(
            multiplier
        ) ||
        multiplier <
            CRASH_CONFIG.MIN_MULTIPLIER
    ) {
        return {
            success: false,
            reason:
                "INVALID_CRASH_MULTIPLIER"
        };
    }


    const bounded =
        roundTo(
            clamp(
                multiplier,
                CRASH_CONFIG.MIN_MULTIPLIER,
                CRASH_CONFIG.MAX_MULTIPLIER
            ),
            CRASH_CONFIG.DECIMALS
        );


    const result =
        setCrashMultiplier(
            bounded
        );


    if (!result.success) {
        return result;
    }


    return {
        success: true,

        crashMultiplier:
            bounded
    };
}


/* =========================================================
   CHECK CRASH

   Returns true once current multiplier is equal to or above
   the prepared crash multiplier.
========================================================= */

function hasReachedCrashPoint(
    currentMultiplier
) {
    if (
        !isFiniteNumber(
            currentMultiplier
        )
    ) {
        return false;
    }


    const crashMultiplier =
        getCrashMultiplier();


    if (
        !isFiniteNumber(
            crashMultiplier
        )
    ) {
        return false;
    }


    return (
        currentMultiplier >=
        crashMultiplier
    );
}


/* =========================================================
   GET REMAINING MULTIPLIER DISTANCE
========================================================= */

function getCrashDistance(
    currentMultiplier
) {
    const crashMultiplier =
        getCrashMultiplier();


    if (
        !isFiniteNumber(
            crashMultiplier
        ) ||
        !isFiniteNumber(
            currentMultiplier
        )
    ) {
        return null;
    }


    return roundTo(
        Math.max(
            0,
            crashMultiplier -
                currentMultiplier
        ),
        CRASH_CONFIG.DECIMALS
    );
}


/* =========================================================
   CRASH RANGE LABEL

   Useful later for statistics/history UI.
========================================================= */

function getCrashRange(
    multiplier
) {
    if (
        !isFiniteNumber(
            multiplier
        )
    ) {
        return "UNKNOWN";
    }

    if (multiplier < 1.20) {
        return "VERY_LOW";
    }

    if (multiplier < 2.00) {
        return "LOW";
    }

    if (multiplier < 5.00) {
        return "MEDIUM";
    }

    if (multiplier < 10.00) {
        return "HIGH";
    }

    if (multiplier < 50.00) {
        return "VERY_HIGH";
    }

    return "EXTREME";
}


/* =========================================================
   THEORETICAL SURVIVAL PROBABILITY

   Approximate probability that the generated multiplier
   reaches at least the requested target.

   Example:
       getSurvivalProbability(2)
========================================================= */

function getSurvivalProbability(
    targetMultiplier,
    {
        houseEdge =
            CRASH_CONFIG.HOUSE_EDGE
    } = {}
) {
    if (
        !isFiniteNumber(
            targetMultiplier
        ) ||
        targetMultiplier < 1
    ) {
        return 0;
    }


    const safeEdge =
        clamp(
            houseEdge,
            0,
            0.99
        );


    const probability =
        (
            1 - safeEdge
        ) /
        targetMultiplier;


    return clamp(
        probability,
        0,
        1
    );
}


/* =========================================================
   THEORETICAL CRASH-BELOW PROBABILITY
========================================================= */

function getCrashBelowProbability(
    targetMultiplier,
    options = {}
) {
    return (
        1 -
        getSurvivalProbability(
            targetMultiplier,
            options
        )
    );
}


/* =========================================================
   SIMULATION

   Development/debug helper.

   Does NOT modify round state.

   Example:
       simulateCrashes(10000)
========================================================= */

function simulateCrashes(
    count = 1000,
    options = {}
) {
    const safeCount =
        Number.isInteger(count)
            ? clamp(
                count,
                1,
                100000
            )
            : 1000;


    const results = [];

    let total = 0;

    let minimum =
        Infinity;

    let maximum =
        -Infinity;


    const buckets = {
        under1_2: 0,
        under2: 0,
        under5: 0,
        under10: 0,
        under50: 0,
        over50: 0
    };


    for (
        let i = 0;
        i < safeCount;
        i += 1
    ) {
        const multiplier =
            generateCrashMultiplier(
                options
            );


        results.push(
            multiplier
        );


        total +=
            multiplier;


        minimum =
            Math.min(
                minimum,
                multiplier
            );


        maximum =
            Math.max(
                maximum,
                multiplier
            );


        if (multiplier < 1.20) {
            buckets.under1_2 += 1;
        } else if (
            multiplier < 2
        ) {
            buckets.under2 += 1;
        } else if (
            multiplier < 5
        ) {
            buckets.under5 += 1;
        } else if (
            multiplier < 10
        ) {
            buckets.under10 += 1;
        } else if (
            multiplier < 50
        ) {
            buckets.under50 += 1;
        } else {
            buckets.over50 += 1;
        }
    }


    const average =
        roundTo(
            total /
                safeCount,
            4
        );


    return {
        count:
            safeCount,

        minimum:
            minimum === Infinity
                ? 0
                : minimum,

        maximum:
            maximum === -Infinity
                ? 0
                : maximum,

        average,

        buckets,

        results
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    CRASH_CONFIG,

    calculateCrashMultiplier,
    generateCrashMultiplier,

    prepareCrashPoint,
    forceCrashPoint,

    hasReachedCrashPoint,
    getCrashDistance,

    getCrashRange,

    getSurvivalProbability,
    getCrashBelowProbability,

    simulateCrashes
};
