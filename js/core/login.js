/* =========================================================
   CG FLIGHT
   js/core/login.js

   Persistent player initialization and daily login rewards.

   Responsibilities:
   - Initialize first local player data
   - Grant one-time initial bonus
   - Process daily login reward
   - Track consecutive login streak
   - Track 7-day reward cycle
   - Reset streak when login continuity is broken
   - Prevent duplicate same-day rewards
   - Expose current login status

   LOGIN RULES:
   1. First local player initialization:
        +10,000 initial bonus

   2. Every valid new login day:
        +1,000 daily reward

   3. Cycle Day 7:
        +7,777 EXTRA bonus

   Therefore:
        First login Day 1 = 11,000
        Day 7            = 8,777

   4. Cycle Day 8 returns to Day 1.

   5. Missing one or more calendar days resets:
        streak   -> 1
        cycleDay -> 1

   IMPORTANT:
   Date comparison uses LOCAL CALENDAR DATES,
   not UTC ISO date slicing.
========================================================= */


import {
    getData,
    updateData
} from "./storage.js";

import {
    creditInitialBonus,
    creditDailyLogin,
    creditLoginStreakBonus
} from "./wallet.js";

import {
    clone,
    getLocalDateKey,
    getCalendarDayDifference
} from "./utils.js";


/* =========================================================
   LOGIN CONFIG
========================================================= */

const LOGIN_CONFIG = Object.freeze({

    INITIAL_BONUS:
        10000,

    DAILY_REWARD:
        1000,

    STREAK_BONUS:
        7777,

    CYCLE_LENGTH:
        7
});


/* =========================================================
   LOGIN EVENT TYPES
========================================================= */

const LOGIN_EVENT_TYPES =
    Object.freeze({

        INITIALIZED:
            "INITIALIZED",

        DAILY_REWARD:
            "DAILY_REWARD",

        STREAK_BONUS:
            "STREAK_BONUS",

        ALREADY_CLAIMED:
            "ALREADY_CLAIMED",

        STREAK_RESET:
            "STREAK_RESET"
    });


/* =========================================================
   LOGIN LISTENERS
========================================================= */

const loginListeners =
    new Set();


function subscribeToLogin(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Login listener must be a function."
        );
    }


    loginListeners.add(
        listener
    );


    return function unsubscribe() {

        loginListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY LOGIN LISTENERS
========================================================= */

function notifyLoginListeners(
    event
) {
    const payload = {
        ...clone(event),

        timestamp:
            event.timestamp ??
            Date.now()
    };


    for (
        const listener
        of loginListeners
    ) {
        try {

            listener(
                payload
            );

        } catch (error) {

            console.error(
                "[CG Flight] Login listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   CYCLE DAY FROM STREAK

   Examples:
       streak 1  -> Day 1
       streak 7  -> Day 7
       streak 8  -> Day 1
       streak 14 -> Day 7
       streak 15 -> Day 1
========================================================= */

function calculateCycleDay(
    streak
) {
    const numeric =
        Number(streak);


    if (
        !Number.isInteger(
            numeric
        ) ||
        numeric <= 0
    ) {
        return 0;
    }


    return (
        (
            numeric - 1
        ) %
        LOGIN_CONFIG.CYCLE_LENGTH
    ) + 1;
}


/* =========================================================
   GET LOGIN DATA
========================================================= */

function getLoginData() {
    const data =
        getData();


    const login =
        data.login ?? {};


    return {

        lastLoginDate:
            login.lastLoginDate ??
            null,

        streak:
            Number.isInteger(
                login.streak
            )
                ? Math.max(
                    0,
                    login.streak
                )
                : 0,

        cycleDay:
            Number.isInteger(
                login.cycleDay
            )
                ? Math.max(
                    0,
                    Math.min(
                        LOGIN_CONFIG
                            .CYCLE_LENGTH,

                        login.cycleDay
                    )
                )
                : 0,

        totalLoginDays:
            Number.isInteger(
                login.totalLoginDays
            )
                ? Math.max(
                    0,
                    login.totalLoginDays
                )
                : 0,

        lastReward:
            Number.isFinite(
                Number(
                    login.lastReward
                )
            )
                ? Math.max(
                    0,
                    Number(
                        login.lastReward
                    )
                )
                : 0,

        lastRewardAt:
            login.lastRewardAt ??
            null
    };
}


/* =========================================================
   GET PLAYER INITIALIZATION STATUS
========================================================= */

function isPlayerInitialized() {
    const data =
        getData();


    return (
        data.player?.initialized ===
        true
    );
}


/* =========================================================
   INITIALIZE PLAYER

   Grants ONLY the one-time 10,000 initial bonus.

   Daily Day 1 reward is handled separately by
   processLogin(), so the responsibilities remain explicit.
========================================================= */

function initializePlayer() {

    const currentData =
        getData();


    if (
        currentData.player
            ?.initialized ===
        true
    ) {
        return {
            success: true,

            initialized: false,

            reason:
                "ALREADY_INITIALIZED",

            initialBonus:
                0
        };
    }


    const timestamp =
        new Date()
            .toISOString();


    /*
     First mark player initialized.

     This prevents a failed/reloaded page from repeatedly
     treating an existing local profile as completely new.
    */

    const saved =
        updateData(
            (data) => {

                data.player.initialized =
                    true;


                data.player.createdAt =
                    data.player.createdAt ??
                    timestamp;
            }
        );


    if (!saved) {
        return {
            success: false,

            initialized: false,

            reason:
                "STORAGE_WRITE_FAILED",

            initialBonus:
                0
        };
    }


    const bonusResult =
        creditInitialBonus(
            LOGIN_CONFIG
                .INITIAL_BONUS
        );


    if (
        !bonusResult.success
    ) {

        /*
         Roll the initialization flag back if the bonus
         cannot be credited.

         This keeps first-login initialization recoverable.
        */

        updateData(
            (data) => {

                data.player.initialized =
                    false;


                data.player.createdAt =
                    null;
            }
        );


        return {
            success: false,

            initialized: false,

            reason:
                "INITIAL_BONUS_FAILED",

            walletReason:
                bonusResult.reason,

            initialBonus:
                0
        };
    }


    const event = {

        type:
            LOGIN_EVENT_TYPES
                .INITIALIZED,

        initialized:
            true,

        initialBonus:
            LOGIN_CONFIG
                .INITIAL_BONUS,

        transactionId:
            bonusResult
                .transactionId,

        timestamp:
            Date.now()
    };


    notifyLoginListeners(
        event
    );


    return {
        success: true,

        initialized: true,

        initialBonus:
            LOGIN_CONFIG
                .INITIAL_BONUS,

        transactionId:
            bonusResult
                .transactionId
    };
}


/* =========================================================
   DETERMINE LOGIN TRANSITION

   Returns how today's login should behave based on
   lastLoginDate.
========================================================= */

function determineLoginTransition(
    lastLoginDate,
    today
) {

    if (
        !lastLoginDate
    ) {
        return {
            sameDay:
                false,

            consecutive:
                false,

            reset:
                false,

            dayDifference:
                null
        };
    }


    const difference =
        getCalendarDayDifference(
            lastLoginDate,
            today
        );


    if (
        difference === null
    ) {
        return {
            sameDay:
                false,

            consecutive:
                false,

            reset:
                true,

            dayDifference:
                null
        };
    }


    if (
        difference === 0
    ) {
        return {
            sameDay:
                true,

            consecutive:
                false,

            reset:
                false,

            dayDifference:
                0
        };
    }


    if (
        difference === 1
    ) {
        return {
            sameDay:
                false,

            consecutive:
                true,

            reset:
                false,

            dayDifference:
                1
        };
    }


    /*
     difference > 1:
         missed at least one calendar day

     difference < 0:
         system clock moved backwards

     Both cases are treated conservatively as a reset.
    */

    return {
        sameDay:
            false,

        consecutive:
            false,

        reset:
            true,

        dayDifference:
            difference
    };
}


/* =========================================================
   PROCESS LOGIN

   Canonical login entry point.

   Safe to call repeatedly on the same day.

   First login:
       initializePlayer()
           +10,000

       daily login
           +1,000

       totalReward
           11,000
========================================================= */

function processLogin(
    now =
        new Date()
) {

    const today =
        getLocalDateKey(
            now
        );


    if (!today) {
        return {
            success: false,

            reason:
                "INVALID_DATE",

            totalReward:
                0
        };
    }


    /* -----------------------------------------------------
       Step 1:
       Ensure local player exists.
    ----------------------------------------------------- */

    const initialization =
        initializePlayer();


    if (
        !initialization.success
    ) {
        return {
            success: false,

            reason:
                initialization.reason,

            totalReward:
                0
        };
    }


    /* -----------------------------------------------------
       Step 2:
       Read latest login state AFTER initialization.
    ----------------------------------------------------- */

    const current =
        getLoginData();


    const transition =
        determineLoginTransition(
            current.lastLoginDate,
            today
        );


    /* =====================================================
       SAME DAY

       No additional reward.
    ====================================================== */

    if (
        transition.sameDay
    ) {

        const result = {

            success: true,

            claimed:
                false,

            initialized:
                initialization.initialized,

            reason:
                "ALREADY_CLAIMED_TODAY",

            initialBonus:
                initialization.initialBonus,

            dailyReward:
                0,

            streakBonus:
                0,

            totalReward:
                initialization.initialBonus,

            date:
                today,

            streak:
                current.streak,

            cycleDay:
                current.cycleDay,

            totalLoginDays:
                current.totalLoginDays
        };


        notifyLoginListeners({

            type:
                LOGIN_EVENT_TYPES
                    .ALREADY_CLAIMED,

            ...result,

            timestamp:
                Date.now()
        });


        return result;
    }


    /* =====================================================
       NEW LOGIN DAY
    ====================================================== */

    const nextStreak =
        transition.consecutive
            ? current.streak + 1
            : 1;


    const nextCycleDay =
        transition.consecutive
            ? calculateCycleDay(
                nextStreak
            )
            : 1;


    const nextTotalLoginDays =
        current.totalLoginDays +
        1;


    const dailyReward =
        LOGIN_CONFIG
            .DAILY_REWARD;


    const streakBonus =
        nextCycleDay ===
            LOGIN_CONFIG
                .CYCLE_LENGTH
            ? LOGIN_CONFIG
                .STREAK_BONUS
            : 0;


    /*
     Login state is written only after reward operations
     succeed.

     This prevents the day from being marked claimed when the
     Wallet credit failed.
    */


    /* -----------------------------------------------------
       Step 3:
       Daily +1,000
    ----------------------------------------------------- */

    const dailyResult =
        creditDailyLogin(
            dailyReward,
            {
                date:
                    today,

                cycleDay:
                    nextCycleDay
            }
        );


    if (
        !dailyResult.success
    ) {
        return {
            success: false,

            reason:
                "DAILY_REWARD_FAILED",

            walletReason:
                dailyResult.reason,

            initialBonus:
                initialization.initialBonus,

            dailyReward:
                0,

            streakBonus:
                0,

            totalReward:
                initialization.initialBonus
        };
    }


    /* -----------------------------------------------------
       Step 4:
       Day 7 extra +7,777
    ----------------------------------------------------- */

    let streakBonusResult =
        null;


    if (
        streakBonus > 0
    ) {

        streakBonusResult =
            creditLoginStreakBonus(
                streakBonus,
                {
                    date:
                        today,

                    cycleDay:
                        nextCycleDay
                }
            );


        if (
            !streakBonusResult.success
        ) {

            /*
             IMPORTANT:
             At this point daily +1,000 was already credited.

             Refund/rollback by negative Wallet operations is
             intentionally avoided because wallet.js rejects
             negative credits.

             Instead, do NOT mark login as claimed. The next
             processLogin() call can retry.

             In normal Local Storage operation, failure
             between these two writes is extremely rare.
            */

            return {
                success: false,

                reason:
                    "STREAK_BONUS_FAILED",

                walletReason:
                    streakBonusResult
                        .reason,

                partialReward:
                    dailyReward,

                initialBonus:
                    initialization.initialBonus,

                dailyReward,

                streakBonus:
                    0,

                totalReward:
                    initialization.initialBonus +
                    dailyReward
            };
        }
    }


    /* -----------------------------------------------------
       Step 5:
       Persist claimed login state.
    ----------------------------------------------------- */

    const rewardTotalForDay =
        dailyReward +
        streakBonus;


    const timestamp =
        new Date()
            .toISOString();


    const savedLogin =
        updateData(
            (data) => {

                data.login.lastLoginDate =
                    today;


                data.login.streak =
                    nextStreak;


                data.login.cycleDay =
                    nextCycleDay;


                data.login.totalLoginDays =
                    nextTotalLoginDays;


                data.login.lastReward =
                    rewardTotalForDay;


                data.login.lastRewardAt =
                    timestamp;
            }
        );


    if (!savedLogin) {

        return {
            success: false,

            reason:
                "LOGIN_STATE_WRITE_FAILED",

            partialReward:
                rewardTotalForDay,

            initialBonus:
                initialization.initialBonus,

            dailyReward,

            streakBonus,

            totalReward:
                initialization.initialBonus +
                rewardTotalForDay
        };
    }


    /* =====================================================
       EVENTS
    ====================================================== */

    if (
        transition.reset &&
        current.lastLoginDate
    ) {

        notifyLoginListeners({

            type:
                LOGIN_EVENT_TYPES
                    .STREAK_RESET,

            previousStreak:
                current.streak,

            streak:
                nextStreak,

            cycleDay:
                nextCycleDay,

            date:
                today,

            timestamp:
                Date.now()
        });
    }


    notifyLoginListeners({

        type:
            LOGIN_EVENT_TYPES
                .DAILY_REWARD,

        date:
            today,

        streak:
            nextStreak,

        cycleDay:
            nextCycleDay,

        reward:
            dailyReward,

        transactionId:
            dailyResult
                .transactionId,

        timestamp:
            Date.now()
    });


    if (
        streakBonus > 0
    ) {

        notifyLoginListeners({

            type:
                LOGIN_EVENT_TYPES
                    .STREAK_BONUS,

            date:
                today,

            streak:
                nextStreak,

            cycleDay:
                nextCycleDay,

            reward:
                streakBonus,

            transactionId:
                streakBonusResult
                    ?.transactionId ??
                null,

            timestamp:
                Date.now()
        });
    }


    /* =====================================================
       RESULT
    ====================================================== */

    return {

        success: true,

        claimed:
            true,

        initialized:
            initialization.initialized,

        reset:
            transition.reset,

        consecutive:
            transition.consecutive,

        initialBonus:
            initialization.initialBonus,

        dailyReward,

        streakBonus,

        /*
         Reward granted during THIS processLogin() call.

         First login:
             10,000 + 1,000 = 11,000

         Normal day:
             1,000

         Day 7:
             1,000 + 7,777 = 8,777
        */

        totalReward:
            initialization.initialBonus +
            dailyReward +
            streakBonus,

        date:
            today,

        streak:
            nextStreak,

        cycleDay:
            nextCycleDay,

        totalLoginDays:
            nextTotalLoginDays
    };
}


/* =========================================================
   GET LOGIN STATUS

   Read-only UI-oriented summary.
========================================================= */

function getLoginStatus(
    now =
        new Date()
) {

    const playerInitialized =
        isPlayerInitialized();


    const login =
        getLoginData();


    const today =
        getLocalDateKey(
            now
        );


    const transition =
        determineLoginTransition(
            login.lastLoginDate,
            today
        );


    const claimedToday =
        Boolean(
            today &&
            login.lastLoginDate ===
                today
        );


    let projectedStreak =
        login.streak;


    let projectedCycleDay =
        login.cycleDay;


    /*
     If today has not yet been claimed, expose what today
     WOULD become after processLogin().
    */

    if (
        !claimedToday
    ) {

        if (
            transition.consecutive
        ) {

            projectedStreak =
                login.streak +
                1;


            projectedCycleDay =
                calculateCycleDay(
                    projectedStreak
                );

        } else {

            projectedStreak =
                1;


            projectedCycleDay =
                1;
        }
    }


    const projectedDailyReward =
        LOGIN_CONFIG
            .DAILY_REWARD;


    const projectedStreakBonus =
        projectedCycleDay ===
            LOGIN_CONFIG
                .CYCLE_LENGTH
            ? LOGIN_CONFIG
                .STREAK_BONUS
            : 0;


    return {

        playerInitialized,

        claimedToday,

        lastLoginDate:
            login.lastLoginDate,

        streak:
            claimedToday
                ? login.streak
                : projectedStreak,

        cycleDay:
            claimedToday
                ? login.cycleDay
                : projectedCycleDay,

        totalLoginDays:
            login.totalLoginDays,

        lastReward:
            login.lastReward,

        lastRewardAt:
            login.lastRewardAt,

        today:
            today,

        dailyReward:
            projectedDailyReward,

        streakBonus:
            projectedStreakBonus,

        projectedReward:
            projectedDailyReward +
            projectedStreakBonus,

        nextCycleDay:
            projectedCycleDay >=
                LOGIN_CONFIG
                    .CYCLE_LENGTH
                ? 1
                : projectedCycleDay + 1
    };
}


/* =========================================================
   GET LOGIN REWARD PREVIEW

   Pure read helper.

   Does NOT issue rewards.
========================================================= */

function getLoginRewardPreview(
    now =
        new Date()
) {

    const status =
        getLoginStatus(
            now
        );


    if (
        status.claimedToday
    ) {
        return {

            claimable:
                false,

            reason:
                "ALREADY_CLAIMED_TODAY",

            cycleDay:
                status.cycleDay,

            dailyReward:
                LOGIN_CONFIG
                    .DAILY_REWARD,

            streakBonus:
                status.cycleDay ===
                    LOGIN_CONFIG
                        .CYCLE_LENGTH
                    ? LOGIN_CONFIG
                        .STREAK_BONUS
                    : 0,

            reward:
                0
        };
    }


    return {

        claimable:
            true,

        cycleDay:
            status.cycleDay,

        dailyReward:
            LOGIN_CONFIG
                .DAILY_REWARD,

        streakBonus:
            status.cycleDay ===
                LOGIN_CONFIG
                    .CYCLE_LENGTH
                ? LOGIN_CONFIG
                    .STREAK_BONUS
                : 0,

        reward:
            status.projectedReward
    };
}


/* =========================================================
   RESET LOGIN DATA

   Development/testing helper.

   Does NOT reset:
   - player.initialized
   - wallet balance

   Therefore it should not be exposed as a normal player UI
   action.
========================================================= */

function resetLoginData() {

    const previous =
        getLoginData();


    const saved =
        updateData(
            (data) => {

                data.login = {

                    lastLoginDate:
                        null,

                    streak:
                        0,

                    cycleDay:
                        0,

                    totalLoginDays:
                        0,

                    lastReward:
                        0,

                    lastRewardAt:
                        null
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


    return {

        success: true,

        previous,

        login:
            getLoginData()
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    LOGIN_CONFIG,
    LOGIN_EVENT_TYPES,

    calculateCycleDay,

    isPlayerInitialized,
    initializePlayer,

    processLogin,

    getLoginData,
    getLoginStatus,
    getLoginRewardPreview,

    resetLoginData,

    subscribeToLogin
};
