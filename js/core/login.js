/* =========================================================
   CG FLIGHT
   js/core/login.js

   Login reward domain layer.

   Responsibilities:
   - Detect first login
   - Grant first-login bonus through wallet.js
   - Grant daily login reward
   - Track consecutive login streak
   - Handle seven-day login cycle
   - Reset streak after interruption
   - Prevent duplicate rewards on the same calendar day

   Rules:
   - First player initialization:
       +10,000 first-login bonus
       +1,000 Day 1 daily reward
       =11,000 total

   - Every valid new login day:
       +1,000

   - Day 7:
       +1,000 daily reward
       +7,777 streak bonus
       =8,777

   - Day 8:
       cycle resets to Day 1

   - Missing one or more calendar days:
       streak resets to Day 1
========================================================= */

import {
    getData,
    updateData,
    initializePlayerData
} from "./storage.js";

import {
    credit,
    claimFirstLoginBonus,
    WALLET_TRANSACTION_TYPES
} from "./wallet.js";


/* =========================================================
   LOGIN CONFIG
========================================================= */

const DAILY_LOGIN_REWARD = 1000;

const DAY_SEVEN_BONUS = 7777;

const LOGIN_CYCLE_LENGTH = 7;


/* =========================================================
   DATE HELPERS

   Login uses the player's local calendar date.

   Example:
   2026-08-17 23:59
   2026-08-18 00:01

   These are two different login days.
========================================================= */

function getLocalDateString(
    date = new Date()
) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        throw new TypeError(
            "[CG Flight] Invalid date."
        );
    }

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;
}


/* =========================================================
   PARSE LOCAL DATE

   Avoid Date("YYYY-MM-DD") because browsers interpret that
   format as UTC in many environments.

   We explicitly construct a local Date instead.
========================================================= */

function parseLocalDateString(
    dateString
) {
    if (
        typeof dateString !==
        "string"
    ) {
        return null;
    }

    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/
            .exec(dateString);

    if (!match) {
        return null;
    }

    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    const day =
        Number(match[3]);

    const date =
        new Date(
            year,
            month - 1,
            day
        );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !==
            month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}


/* =========================================================
   CALENDAR DAY DIFFERENCE

   Returns:
   0 = same day
   1 = next calendar day
   2+ = interrupted streak
   negative = system clock moved backwards
========================================================= */

function getCalendarDayDifference(
    earlierDateString,
    laterDateString
) {
    const earlier =
        parseLocalDateString(
            earlierDateString
        );

    const later =
        parseLocalDateString(
            laterDateString
        );

    if (
        !earlier ||
        !later
    ) {
        return null;
    }

    const earlierUTC =
        Date.UTC(
            earlier.getFullYear(),
            earlier.getMonth(),
            earlier.getDate()
        );

    const laterUTC =
        Date.UTC(
            later.getFullYear(),
            later.getMonth(),
            later.getDate()
        );

    return Math.round(
        (
            laterUTC -
            earlierUTC
        ) /
        86400000
    );
}


/* =========================================================
   LOGIN STATE SANITIZER
========================================================= */

function sanitizeLoginState(
    login
) {
    const source =
        login &&
        typeof login === "object" &&
        !Array.isArray(login)
            ? login
            : {};

    const lastLoginDate =
        typeof source.lastLoginDate ===
        "string"
            ? source.lastLoginDate
            : null;

    let streak =
        Number.isInteger(
            source.streak
        ) &&
        source.streak >= 0
            ? source.streak
            : 0;

    let cycleDay =
        Number.isInteger(
            source.cycleDay
        ) &&
        source.cycleDay >= 0
            ? source.cycleDay
            : 0;

    if (
        cycleDay >
        LOGIN_CYCLE_LENGTH
    ) {
        cycleDay = 0;
    }

    if (
        streak === 0 &&
        cycleDay !== 0
    ) {
        cycleDay = 0;
    }

    return {
        lastLoginDate,
        streak,
        cycleDay
    };
}


/* =========================================================
   GET LOGIN STATUS
========================================================= */

function getLoginStatus(
    now = new Date()
) {
    const today =
        getLocalDateString(now);

    const data =
        getData();

    const login =
        sanitizeLoginState(
            data.login
        );

    const alreadyClaimedToday =
        login.lastLoginDate ===
        today;

    return {
        today,

        lastLoginDate:
            login.lastLoginDate,

        streak:
            login.streak,

        cycleDay:
            login.cycleDay,

        alreadyClaimedToday
    };
}


/* =========================================================
   DETERMINE NEXT LOGIN STATE
========================================================= */

function calculateNextLoginState(
    currentLogin,
    today
) {
    const login =
        sanitizeLoginState(
            currentLogin
        );


    /* -----------------------------------------------------
       First login ever
    ----------------------------------------------------- */

    if (
        login.lastLoginDate ===
        null
    ) {
        return {
            rewardable: true,

            reason:
                "FIRST_LOGIN_DAY",

            streak: 1,

            cycleDay: 1,

            interrupted: false,

            cycleReset: false
        };
    }


    /* -----------------------------------------------------
       Same calendar day
    ----------------------------------------------------- */

    if (
        login.lastLoginDate ===
        today
    ) {
        return {
            rewardable: false,

            reason:
                "ALREADY_CLAIMED_TODAY",

            streak:
                login.streak,

            cycleDay:
                login.cycleDay,

            interrupted: false,

            cycleReset: false
        };
    }


    const difference =
        getCalendarDayDifference(
            login.lastLoginDate,
            today
        );


    /* -----------------------------------------------------
       Invalid previous date

       Treat as a broken streak and restart safely.
    ----------------------------------------------------- */

    if (difference === null) {
        return {
            rewardable: true,

            reason:
                "INVALID_PREVIOUS_DATE",

            streak: 1,

            cycleDay: 1,

            interrupted: true,

            cycleReset: true
        };
    }


    /* -----------------------------------------------------
       Device clock moved backwards

       Do not issue a reward.
       This avoids duplicate rewards caused by clock rollback.
    ----------------------------------------------------- */

    if (difference < 0) {
        return {
            rewardable: false,

            reason:
                "CLOCK_ROLLBACK",

            streak:
                login.streak,

            cycleDay:
                login.cycleDay,

            interrupted: false,

            cycleReset: false
        };
    }


    /* -----------------------------------------------------
       Consecutive next day
    ----------------------------------------------------- */

    if (difference === 1) {
        const nextStreak =
            login.streak + 1;

        let nextCycleDay =
            login.cycleDay + 1;

        let cycleReset =
            false;

        if (
            login.cycleDay <= 0 ||
            login.cycleDay >=
                LOGIN_CYCLE_LENGTH
        ) {
            nextCycleDay = 1;
            cycleReset = true;
        }

        return {
            rewardable: true,

            reason:
                "CONSECUTIVE_LOGIN",

            streak:
                nextStreak,

            cycleDay:
                nextCycleDay,

            interrupted: false,

            cycleReset
        };
    }


    /* -----------------------------------------------------
       Missed one or more days
    ----------------------------------------------------- */

    return {
        rewardable: true,

        reason:
            "STREAK_INTERRUPTED",

        streak: 1,

        cycleDay: 1,

        interrupted: true,

        cycleReset: true
    };
}


/* =========================================================
   SAVE LOGIN STATE
========================================================= */

function saveLoginState({
    today,
    streak,
    cycleDay
}) {
    return updateData(
        (data) => {
            data.login = {
                lastLoginDate:
                    today,

                streak,

                cycleDay
            };
        }
    );
}


/* =========================================================
   DAILY REWARD
========================================================= */

function grantDailyLoginReward({
    today,
    streak,
    cycleDay
}) {
    return credit(
        DAILY_LOGIN_REWARD,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .DAILY_LOGIN,

            metadata: {
                source:
                    "DAILY_LOGIN",

                date:
                    today,

                streak,

                cycleDay
            }
        }
    );
}


/* =========================================================
   DAY 7 BONUS
========================================================= */

function grantDaySevenBonus({
    today,
    streak,
    cycleDay
}) {
    if (
        cycleDay !==
        LOGIN_CYCLE_LENGTH
    ) {
        return {
            success: false,
            granted: false,
            reason:
                "NOT_DAY_SEVEN"
        };
    }

    const transaction =
        credit(
            DAY_SEVEN_BONUS,
            {
                type:
                    WALLET_TRANSACTION_TYPES
                        .STREAK_BONUS,

                metadata: {
                    source:
                        "DAY_SEVEN_BONUS",

                    date:
                        today,

                    streak,

                    cycleDay
                }
            }
        );

    if (
        !transaction.success
    ) {
        return {
            success: false,
            granted: false,
            reason:
                transaction.reason
        };
    }

    return {
        success: true,
        granted: true,

        amount:
            DAY_SEVEN_BONUS,

        transaction
    };
}


/* =========================================================
   PROCESS LOGIN

   This is the main entry point.

   Recommended usage:
       const result = processLogin();

   Call once when the game/lobby initializes.
========================================================= */

function processLogin(
    now = new Date()
) {
    const today =
        getLocalDateString(now);


    /* -----------------------------------------------------
       Step 1
       Ensure player profile exists.
    ----------------------------------------------------- */

    const initialization =
        initializePlayerData();


    /* -----------------------------------------------------
       Step 2
       Claim first-login bonus.

       claimFirstLoginBonus() itself guarantees this can
       only happen once.
    ----------------------------------------------------- */

    const firstLoginBonus =
        claimFirstLoginBonus();


    /* -----------------------------------------------------
       Step 3
       Read latest login state.
    ----------------------------------------------------- */

    const data =
        getData();

    const currentLogin =
        sanitizeLoginState(
            data.login
        );

    const next =
        calculateNextLoginState(
            currentLogin,
            today
        );


    /* -----------------------------------------------------
       Same-day login / clock rollback
    ----------------------------------------------------- */

    if (!next.rewardable) {
        return {
            success: true,

            newPlayer:
                initialization.created,

            dailyRewardGranted:
                false,

            streakBonusGranted:
                false,

            firstLoginBonusGranted:
                firstLoginBonus
                    .claimed === true,

            firstLoginBonusAmount:
                firstLoginBonus
                    .claimed === true
                    ? firstLoginBonus.amount
                    : 0,

            dailyRewardAmount: 0,
            streakBonusAmount: 0,

            totalReward:
                firstLoginBonus
                    .claimed === true
                    ? firstLoginBonus.amount
                    : 0,

            reason:
                next.reason,

            today,

            streak:
                next.streak,

            cycleDay:
                next.cycleDay,

            interrupted:
                next.interrupted,

            cycleReset:
                next.cycleReset,

            balance:
                getCurrentBalanceSafely()
        };
    }


    /* -----------------------------------------------------
       Step 4
       Save today's login state before issuing rewards.

       This makes same-day duplicate calls much less likely
       to issue the daily reward twice.
    ----------------------------------------------------- */

    const loginSaveResult =
        saveLoginState({
            today,

            streak:
                next.streak,

            cycleDay:
                next.cycleDay
        });

    if (!loginSaveResult) {
        return {
            success: false,

            reason:
                "LOGIN_STATE_SAVE_FAILED",

            today
        };
    }


    /* -----------------------------------------------------
       Step 5
       Grant daily +1,000
    ----------------------------------------------------- */

    const dailyReward =
        grantDailyLoginReward({
            today,

            streak:
                next.streak,

            cycleDay:
                next.cycleDay
        });

    if (
        !dailyReward.success
    ) {
        return {
            success: false,

            reason:
                "DAILY_REWARD_FAILED",

            today,

            streak:
                next.streak,

            cycleDay:
                next.cycleDay
        };
    }


    /* -----------------------------------------------------
       Step 6
       Day 7 additional +7,777
    ----------------------------------------------------- */

    let streakBonus = {
        success: true,
        granted: false,
        amount: 0
    };

    if (
        next.cycleDay ===
        LOGIN_CYCLE_LENGTH
    ) {
        streakBonus =
            grantDaySevenBonus({
                today,

                streak:
                    next.streak,

                cycleDay:
                    next.cycleDay
            });

        if (
            !streakBonus.success
        ) {
            return {
                success: false,

                reason:
                    "STREAK_BONUS_FAILED",

                today,

                streak:
                    next.streak,

                cycleDay:
                    next.cycleDay
            };
        }
    }


    /* -----------------------------------------------------
       Result
    ----------------------------------------------------- */

    const firstLoginAmount =
        firstLoginBonus.claimed ===
        true
            ? firstLoginBonus.amount
            : 0;

    const streakBonusAmount =
        streakBonus.granted
            ? streakBonus.amount
            : 0;

    const totalReward =
        firstLoginAmount +
        DAILY_LOGIN_REWARD +
        streakBonusAmount;

    return {
        success: true,

        newPlayer:
            initialization.created,

        firstLoginBonusGranted:
            firstLoginBonus
                .claimed === true,

        dailyRewardGranted:
            true,

        streakBonusGranted:
            streakBonus.granted,

        firstLoginBonusAmount:
            firstLoginAmount,

        dailyRewardAmount:
            DAILY_LOGIN_REWARD,

        streakBonusAmount,

        totalReward,

        reason:
            next.reason,

        today,

        streak:
            next.streak,

        cycleDay:
            next.cycleDay,

        interrupted:
            next.interrupted,

        cycleReset:
            next.cycleReset,

        balance:
            dailyReward.balanceAfter !==
            undefined
                ? (
                    streakBonus.granted
                        ? streakBonus
                            .transaction
                            .balanceAfter
                        : dailyReward
                            .balanceAfter
                )
                : getCurrentBalanceSafely()
    };
}


/* =========================================================
   CURRENT BALANCE

   Avoid importing getBalance solely for one small fallback.
========================================================= */

function getCurrentBalanceSafely() {
    const data =
        getData();

    if (
        data.wallet &&
        typeof data.wallet.balance ===
        "number" &&
        Number.isFinite(
            data.wallet.balance
        )
    ) {
        return data.wallet.balance;
    }

    return 0;
}


/* =========================================================
   LOGIN REWARD PREVIEW

   Does not modify storage.

   Useful for UI.
========================================================= */

function getLoginRewardPreview(
    now = new Date()
) {
    const today =
        getLocalDateString(now);

    const data =
        getData();

    const currentLogin =
        sanitizeLoginState(
            data.login
        );

    const next =
        calculateNextLoginState(
            currentLogin,
            today
        );

    if (!next.rewardable) {
        return {
            claimable: false,

            today,

            reason:
                next.reason,

            streak:
                next.streak,

            cycleDay:
                next.cycleDay,

            dailyReward: 0,

            streakBonus: 0,

            totalReward: 0
        };
    }

    const streakBonus =
        next.cycleDay ===
        LOGIN_CYCLE_LENGTH
            ? DAY_SEVEN_BONUS
            : 0;

    return {
        claimable: true,

        today,

        reason:
            next.reason,

        streak:
            next.streak,

        cycleDay:
            next.cycleDay,

        dailyReward:
            DAILY_LOGIN_REWARD,

        streakBonus,

        totalReward:
            DAILY_LOGIN_REWARD +
            streakBonus
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    DAILY_LOGIN_REWARD,
    DAY_SEVEN_BONUS,
    LOGIN_CYCLE_LENGTH,

    getLocalDateString,
    getCalendarDayDifference,

    getLoginStatus,
    getLoginRewardPreview,

    processLogin
};
