/* =========================================================
   CG FLIGHT
   js/core/wallet.js

   Persistent virtual coin wallet.

   Responsibilities:
   - Read player balance
   - Credit coins
   - Debit coins
   - Validate available balance
   - Track lifetime credited / debited totals
   - Publish wallet change events
   - Provide formatted coin values

   IMPORTANT:
   This module does NOT:
   - Decide login rewards
   - Decide bet validity
   - Decide Cash Out multiplier
   - Perform settlement logic

   Other modules decide WHY money moves.
   wallet.js only performs the balance movement.
========================================================= */


import {
    getData,
    updateData
} from "./storage.js";

import {
    roundTo,
    formatCoins as formatCoinValue,
    clone,
    isFiniteNumber,
    createId
} from "./utils.js";


/* =========================================================
   WALLET CONFIG
========================================================= */

const WALLET_CONFIG = Object.freeze({

    DECIMALS:
        2,

    MIN_BALANCE:
        0
});


/* =========================================================
   TRANSACTION TYPES

   These are descriptive labels only.

   wallet.js does not interpret their business meaning.
========================================================= */

const WALLET_TRANSACTION_TYPES =
    Object.freeze({

        INITIAL_BONUS:
            "INITIAL_BONUS",

        DAILY_LOGIN:
            "DAILY_LOGIN",

        LOGIN_STREAK_BONUS:
            "LOGIN_STREAK_BONUS",

        BET:
            "BET",

        BET_REFUND:
            "BET_REFUND",

        CASHOUT:
            "CASHOUT",

        SETTLEMENT_REFUND:
            "SETTLEMENT_REFUND",

        MANUAL:
            "MANUAL"
    });


/* =========================================================
   WALLET LISTENERS
========================================================= */

const walletListeners =
    new Set();


function subscribeToWallet(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Wallet listener must be a function."
        );
    }


    walletListeners.add(
        listener
    );


    return function unsubscribe() {

        walletListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY WALLET LISTENERS
========================================================= */

function notifyWalletListeners(
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
        of walletListeners
    ) {
        try {

            listener(
                payload
            );

        } catch (error) {

            console.error(
                "[CG Flight] Wallet listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   NORMALIZE AMOUNT
========================================================= */

function normalizeWalletAmount(
    amount
) {
    const numeric =
        Number(amount);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return null;
    }


    const normalized =
        roundTo(
            numeric,
            WALLET_CONFIG.DECIMALS
        );


    if (
        normalized <= 0
    ) {
        return null;
    }


    return normalized;
}


/* =========================================================
   NORMALIZE BALANCE
========================================================= */

function normalizeBalance(
    balance
) {
    const numeric =
        Number(balance);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return 0;
    }


    return Math.max(
        WALLET_CONFIG.MIN_BALANCE,

        roundTo(
            numeric,
            WALLET_CONFIG.DECIMALS
        )
    );
}


/* =========================================================
   GET WALLET
========================================================= */

function getWallet() {
    const data =
        getData();


    const wallet =
        data.wallet ?? {};


    return {

        balance:
            normalizeBalance(
                wallet.balance
            ),

        totalCredited:
            Math.max(
                0,

                roundTo(
                    Number(
                        wallet.totalCredited
                    ) || 0,

                    WALLET_CONFIG.DECIMALS
                )
            ),

        totalDebited:
            Math.max(
                0,

                roundTo(
                    Number(
                        wallet.totalDebited
                    ) || 0,

                    WALLET_CONFIG.DECIMALS
                )
            ),

        updatedAt:
            wallet.updatedAt ??
            null
    };
}


/* =========================================================
   GET BALANCE
========================================================= */

function getBalance() {
    return getWallet()
        .balance;
}


/* =========================================================
   HAS BALANCE
========================================================= */

function hasBalance(
    amount
) {
    const normalizedAmount =
        normalizeWalletAmount(
            amount
        );


    if (
        normalizedAmount ===
        null
    ) {
        return false;
    }


    return (
        getBalance() >=
        normalizedAmount
    );
}


/* =========================================================
   CREDIT

   Adds coins to Wallet.

   Example:
       credit(1000, {
           type: "DAILY_LOGIN"
       });
========================================================= */

function credit(
    amount,
    {
        type =
            WALLET_TRANSACTION_TYPES.MANUAL,

        reason =
            null,

        referenceId =
            null,

        metadata =
            null
    } = {}
) {
    const normalizedAmount =
        normalizeWalletAmount(
            amount
        );


    if (
        normalizedAmount ===
        null
    ) {
        return {
            success: false,

            reason:
                "INVALID_AMOUNT"
        };
    }


    const previousBalance =
        getBalance();


    const transactionId =
        createId(
            "credit"
        );


    const timestamp =
        new Date()
            .toISOString();


    let result =
        null;


    const saved =
        updateData(
            (data) => {

                if (
                    !data.wallet ||
                    typeof data.wallet !==
                        "object"
                ) {
                    data.wallet = {
                        balance: 0,
                        totalCredited: 0,
                        totalDebited: 0,
                        updatedAt: null
                    };
                }


                const currentBalance =
                    normalizeBalance(
                        data.wallet.balance
                    );


                const currentCredited =
                    Math.max(
                        0,

                        Number(
                            data.wallet
                                .totalCredited
                        ) || 0
                    );


                const nextBalance =
                    roundTo(
                        currentBalance +
                        normalizedAmount,

                        WALLET_CONFIG
                            .DECIMALS
                    );


                const nextTotalCredited =
                    roundTo(
                        currentCredited +
                        normalizedAmount,

                        WALLET_CONFIG
                            .DECIMALS
                    );


                data.wallet.balance =
                    nextBalance;


                data.wallet.totalCredited =
                    nextTotalCredited;


                data.wallet.updatedAt =
                    timestamp;


                result = {

                    success: true,

                    transactionId,

                    direction:
                        "CREDIT",

                    type,

                    amount:
                        normalizedAmount,

                    previousBalance:
                        currentBalance,

                    balance:
                        nextBalance,

                    reason,

                    referenceId,

                    metadata:
                        metadata
                            ? clone(metadata)
                            : null,

                    timestamp
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


    if (!result) {
        return {
            success: false,

            reason:
                "UNKNOWN_WALLET_ERROR"
        };
    }


    notifyWalletListeners(
        result
    );


    return result;
}


/* =========================================================
   DEBIT

   Removes coins from Wallet.

   Balance can NEVER become negative.
========================================================= */

function debit(
    amount,
    {
        type =
            WALLET_TRANSACTION_TYPES.MANUAL,

        reason =
            null,

        referenceId =
            null,

        metadata =
            null
    } = {}
) {
    const normalizedAmount =
        normalizeWalletAmount(
            amount
        );


    if (
        normalizedAmount ===
        null
    ) {
        return {
            success: false,

            reason:
                "INVALID_AMOUNT"
        };
    }


    const transactionId =
        createId(
            "debit"
        );


    const timestamp =
        new Date()
            .toISOString();


    let result =
        null;


    const saved =
        updateData(
            (data) => {

                if (
                    !data.wallet ||
                    typeof data.wallet !==
                        "object"
                ) {
                    data.wallet = {
                        balance: 0,
                        totalCredited: 0,
                        totalDebited: 0,
                        updatedAt: null
                    };
                }


                const currentBalance =
                    normalizeBalance(
                        data.wallet.balance
                    );


                /* -----------------------------------------
                   Insufficient Balance

                   IMPORTANT:
                   No Wallet fields are modified.
                ------------------------------------------ */

                if (
                    currentBalance <
                    normalizedAmount
                ) {
                    result = {

                        success: false,

                        reason:
                            "INSUFFICIENT_BALANCE",

                        required:
                            normalizedAmount,

                        balance:
                            currentBalance,

                        shortage:
                            roundTo(
                                normalizedAmount -
                                currentBalance,

                                WALLET_CONFIG
                                    .DECIMALS
                            )
                    };


                    return;
                }


                const currentDebited =
                    Math.max(
                        0,

                        Number(
                            data.wallet
                                .totalDebited
                        ) || 0
                    );


                const nextBalance =
                    roundTo(
                        currentBalance -
                        normalizedAmount,

                        WALLET_CONFIG
                            .DECIMALS
                    );


                const nextTotalDebited =
                    roundTo(
                        currentDebited +
                        normalizedAmount,

                        WALLET_CONFIG
                            .DECIMALS
                    );


                data.wallet.balance =
                    Math.max(
                        WALLET_CONFIG
                            .MIN_BALANCE,

                        nextBalance
                    );


                data.wallet.totalDebited =
                    nextTotalDebited;


                data.wallet.updatedAt =
                    timestamp;


                result = {

                    success: true,

                    transactionId,

                    direction:
                        "DEBIT",

                    type,

                    amount:
                        normalizedAmount,

                    previousBalance:
                        currentBalance,

                    balance:
                        data.wallet.balance,

                    reason,

                    referenceId,

                    metadata:
                        metadata
                            ? clone(metadata)
                            : null,

                    timestamp
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


    if (!result) {
        return {
            success: false,

            reason:
                "UNKNOWN_WALLET_ERROR"
        };
    }


    /*
     Insufficient balance is a valid business failure,
     therefore updateData() may still have returned a saved
     root object without any Wallet mutation.

     No wallet event should fire.
    */

    if (!result.success) {
        return result;
    }


    notifyWalletListeners(
        result
    );


    return result;
}


/* =========================================================
   ADD BALANCE

   Compatibility alias for older modules.

   Prefer credit() in new code.
========================================================= */

function addBalance(
    amount,
    options = {}
) {
    return credit(
        amount,
        options
    );
}


/* =========================================================
   SUBTRACT BALANCE

   Compatibility alias for older modules.

   Prefer debit() in new code.
========================================================= */

function subtractBalance(
    amount,
    options = {}
) {
    return debit(
        amount,
        options
    );
}


/* =========================================================
   CREDIT INITIAL BONUS
========================================================= */

function creditInitialBonus(
    amount
) {
    return credit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .INITIAL_BONUS,

            reason:
                "FIRST_LOCAL_PLAYER_INITIALIZATION"
        }
    );
}


/* =========================================================
   CREDIT DAILY LOGIN
========================================================= */

function creditDailyLogin(
    amount,
    {
        date = null,
        cycleDay = null
    } = {}
) {
    return credit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .DAILY_LOGIN,

            reason:
                "DAILY_LOGIN_REWARD",

            metadata: {
                date,
                cycleDay
            }
        }
    );
}


/* =========================================================
   CREDIT LOGIN STREAK BONUS
========================================================= */

function creditLoginStreakBonus(
    amount,
    {
        date = null,
        cycleDay = null
    } = {}
) {
    return credit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .LOGIN_STREAK_BONUS,

            reason:
                "LOGIN_STREAK_BONUS",

            metadata: {
                date,
                cycleDay
            }
        }
    );
}


/* =========================================================
   PLACE BET DEBIT
========================================================= */

function debitBet(
    amount,
    {
        roundId = null
    } = {}
) {
    return debit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .BET,

            reason:
                "BET_PLACED",

            referenceId:
                roundId,

            metadata: {
                roundId
            }
        }
    );
}


/* =========================================================
   REFUND BET
========================================================= */

function refundBet(
    amount,
    {
        roundId = null,
        reason =
            "BET_CANCELLED"
    } = {}
) {
    return credit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .BET_REFUND,

            reason,

            referenceId:
                roundId,

            metadata: {
                roundId
            }
        }
    );
}


/* =========================================================
   CREDIT CASHOUT
========================================================= */

function creditCashout(
    amount,
    {
        roundId = null,
        multiplier = null,
        automatic = false
    } = {}
) {
    return credit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .CASHOUT,

            reason:
                automatic
                    ? "AUTO_CASHOUT"
                    : "MANUAL_CASHOUT",

            referenceId:
                roundId,

            metadata: {
                roundId,
                multiplier,
                automatic
            }
        }
    );
}


/* =========================================================
   SETTLEMENT REFUND
========================================================= */

function creditSettlementRefund(
    amount,
    {
        roundId = null,
        reason =
            "ROUND_REFUND"
    } = {}
) {
    return credit(
        amount,
        {
            type:
                WALLET_TRANSACTION_TYPES
                    .SETTLEMENT_REFUND,

            reason,

            referenceId:
                roundId,

            metadata: {
                roundId
            }
        }
    );
}


/* =========================================================
   SET BALANCE

   Development / maintenance helper.

   This is intentionally NOT used for normal game money flow.

   Unlike credit/debit:
   - does not increment totalCredited / totalDebited
   - directly replaces current balance
========================================================= */

function setBalance(
    balance
) {
    const numeric =
        Number(balance);


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric < 0
    ) {
        return {
            success: false,

            reason:
                "INVALID_BALANCE"
        };
    }


    const nextBalance =
        normalizeBalance(
            numeric
        );


    const previousBalance =
        getBalance();


    const timestamp =
        new Date()
            .toISOString();


    const saved =
        updateData(
            (data) => {

                data.wallet.balance =
                    nextBalance;


                data.wallet.updatedAt =
                    timestamp;
            }
        );


    if (!saved) {
        return {
            success: false,

            reason:
                "STORAGE_WRITE_FAILED"
        };
    }


    const result = {

        success: true,

        transactionId:
            createId(
                "wallet-set"
            ),

        direction:
            "SET",

        type:
            WALLET_TRANSACTION_TYPES
                .MANUAL,

        previousBalance,

        balance:
            nextBalance,

        timestamp
    };


    notifyWalletListeners(
        result
    );


    return result;
}


/* =========================================================
   RESET WALLET

   Development helper.

   Resets:
   - current balance
   - total credited
   - total debited
========================================================= */

function resetWallet() {
    const previous =
        getWallet();


    const timestamp =
        new Date()
            .toISOString();


    const saved =
        updateData(
            (data) => {

                data.wallet = {

                    balance:
                        0,

                    totalCredited:
                        0,

                    totalDebited:
                        0,

                    updatedAt:
                        timestamp
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


    const current =
        getWallet();


    notifyWalletListeners({

        transactionId:
            createId(
                "wallet-reset"
            ),

        direction:
            "RESET",

        type:
            WALLET_TRANSACTION_TYPES
                .MANUAL,

        previousBalance:
            previous.balance,

        balance:
            current.balance,

        timestamp
    });


    return {
        success: true,

        previous,

        wallet:
            current
    };
}


/* =========================================================
   FORMAT COINS

   Public convenience wrapper.

   Existing page modules import formatCoins() from wallet.js,
   so keep this export for compatibility.

   The actual formatter lives in utils.js.
========================================================= */

function formatCoins(
    value
) {
    return formatCoinValue(
        value
    );
}


/* =========================================================
   GET WALLET SUMMARY
========================================================= */

function getWalletSummary() {
    const wallet =
        getWallet();


    const netFlow =
        roundTo(
            wallet.totalCredited -
            wallet.totalDebited,

            WALLET_CONFIG
                .DECIMALS
        );


    return {

        ...wallet,

        netFlow,

        formattedBalance:
            formatCoins(
                wallet.balance
            ),

        formattedTotalCredited:
            formatCoins(
                wallet.totalCredited
            ),

        formattedTotalDebited:
            formatCoins(
                wallet.totalDebited
            )
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    WALLET_CONFIG,
    WALLET_TRANSACTION_TYPES,

    getWallet,
    getWalletSummary,

    getBalance,
    hasBalance,

    credit,
    debit,

    addBalance,
    subtractBalance,

    creditInitialBonus,
    creditDailyLogin,
    creditLoginStreakBonus,

    debitBet,
    refundBet,

    creditCashout,
    creditSettlementRefund,

    setBalance,
    resetWallet,

    formatCoins,

    subscribeToWallet
};
