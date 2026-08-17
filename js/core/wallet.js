/* =========================================================
   CG FLIGHT
   js/core/wallet.js

   Wallet domain layer.

   Responsibilities:
   - Read current balance
   - Credit coins
   - Debit coins
   - Validate wallet operations
   - Record wallet transactions
   - Handle first-login 10,000 coin bonus
   - Provide balance / transaction helpers

   IMPORTANT:
   Daily login rewards are NOT handled here.
   Login streak logic will call wallet credit functions later.
========================================================= */

import {
    getData,
    updateData
} from "./storage.js";


/* =========================================================
   WALLET CONFIG
========================================================= */

const FIRST_LOGIN_BONUS = 10000;

const MAX_TRANSACTION_HISTORY = 500;


/* =========================================================
   TRANSACTION TYPES

   Keep these centralized so later modules do not invent
   inconsistent string values.
========================================================= */

const WALLET_TRANSACTION_TYPES = Object.freeze({
    INITIAL_BONUS: "INITIAL_BONUS",
    DAILY_LOGIN: "DAILY_LOGIN",
    STREAK_BONUS: "STREAK_BONUS",

    BET: "BET",
    BET_REFUND: "BET_REFUND",

    CASHOUT: "CASHOUT",
    AUTO_CASHOUT: "AUTO_CASHOUT",

    SYSTEM_ADJUSTMENT: "SYSTEM_ADJUSTMENT"
});


/* =========================================================
   VALUE HELPERS
========================================================= */

function isFiniteNumber(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}


function isPositiveAmount(value) {
    return (
        isFiniteNumber(value) &&
        value > 0
    );
}


function normalizeAmount(value) {
    if (!isFiniteNumber(value)) {
        return null;
    }

    const normalized =
        Math.round(
            (value + Number.EPSILON) * 100
        ) / 100;

    if (normalized <= 0) {
        return null;
    }

    return normalized;
}


/* =========================================================
   TRANSACTION ID
========================================================= */

function createTransactionId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return [
        "tx",
        Date.now(),
        Math.random()
            .toString(36)
            .slice(2, 10)
    ].join("-");
}


/* =========================================================
   WALLET STRUCTURE REPAIR

   storage.js currently defines wallet.balance only.
   wallet.js extends the wallet structure safely with:
   - transactions
   - firstLoginBonusClaimed

   This allows the data schema to remain compatible with
   existing version-1 player data.
========================================================= */

function ensureWalletStructure(data) {
    if (
        !data.wallet ||
        typeof data.wallet !== "object" ||
        Array.isArray(data.wallet)
    ) {
        data.wallet = {};
    }

    if (
        !isFiniteNumber(data.wallet.balance) ||
        data.wallet.balance < 0
    ) {
        data.wallet.balance = 0;
    }

    if (!Array.isArray(data.wallet.transactions)) {
        data.wallet.transactions = [];
    }

    if (
        typeof data.wallet.firstLoginBonusClaimed !==
        "boolean"
    ) {
        data.wallet.firstLoginBonusClaimed = false;
    }

    return data.wallet;
}


/* =========================================================
   TRANSACTION RECORD
========================================================= */

function createTransactionRecord({
    type,
    amount,
    direction,
    balanceBefore,
    balanceAfter,
    metadata = null
}) {
    return {
        id: createTransactionId(),

        type,

        direction,

        amount,

        balanceBefore,

        balanceAfter,

        createdAt:
            new Date().toISOString(),

        metadata
    };
}


/* =========================================================
   STORE TRANSACTION
========================================================= */

function appendTransaction(
    wallet,
    transaction
) {
    wallet.transactions.push(
        transaction
    );

    if (
        wallet.transactions.length >
        MAX_TRANSACTION_HISTORY
    ) {
        wallet.transactions =
            wallet.transactions.slice(
                -MAX_TRANSACTION_HISTORY
            );
    }
}


/* =========================================================
   GET BALANCE
========================================================= */

function getBalance() {
    const data =
        getData();

    const wallet =
        ensureWalletStructure(data);

    return wallet.balance;
}


/* =========================================================
   CHECK AFFORDABILITY
========================================================= */

function canAfford(amount) {
    const normalized =
        normalizeAmount(amount);

    if (normalized === null) {
        return false;
    }

    return getBalance() >= normalized;
}


/* =========================================================
   CREDIT

   Adds coins to the wallet.

   Returns:
   {
       success,
       amount,
       balanceBefore,
       balanceAfter,
       transaction
   }
========================================================= */

function credit(
    amount,
    {
        type =
            WALLET_TRANSACTION_TYPES.SYSTEM_ADJUSTMENT,

        metadata = null
    } = {}
) {
    const normalizedAmount =
        normalizeAmount(amount);

    if (normalizedAmount === null) {
        return {
            success: false,
            reason: "INVALID_AMOUNT"
        };
    }

    let result = null;

    const savedData =
        updateData((data) => {
            const wallet =
                ensureWalletStructure(data);

            const balanceBefore =
                wallet.balance;

            const balanceAfter =
                Math.round(
                    (
                        balanceBefore +
                        normalizedAmount
                    ) * 100
                ) / 100;

            wallet.balance =
                balanceAfter;

            const transaction =
                createTransactionRecord({
                    type,
                    amount:
                        normalizedAmount,
                    direction: "CREDIT",
                    balanceBefore,
                    balanceAfter,
                    metadata
                });

            appendTransaction(
                wallet,
                transaction
            );

            result = {
                success: true,
                amount:
                    normalizedAmount,
                balanceBefore,
                balanceAfter,
                transaction
            };
        });

    if (!savedData) {
        return {
            success: false,
            reason: "STORAGE_WRITE_FAILED"
        };
    }

    return result;
}


/* =========================================================
   DEBIT

   Removes coins from the wallet.

   Prevents:
   - invalid amounts
   - negative balances
   - insufficient balance
========================================================= */

function debit(
    amount,
    {
        type =
            WALLET_TRANSACTION_TYPES.SYSTEM_ADJUSTMENT,

        metadata = null
    } = {}
) {
    const normalizedAmount =
        normalizeAmount(amount);

    if (normalizedAmount === null) {
        return {
            success: false,
            reason: "INVALID_AMOUNT"
        };
    }

    const currentBalance =
        getBalance();

    if (
        currentBalance <
        normalizedAmount
    ) {
        return {
            success: false,
            reason:
                "INSUFFICIENT_BALANCE",
            requestedAmount:
                normalizedAmount,
            balance:
                currentBalance
        };
    }

    let result = null;

    const savedData =
        updateData((data) => {
            const wallet =
                ensureWalletStructure(data);

            /*
             Re-check balance inside the update operation.

             This avoids trusting the earlier snapshot.
            */

            if (
                wallet.balance <
                normalizedAmount
            ) {
                result = {
                    success: false,
                    reason:
                        "INSUFFICIENT_BALANCE",
                    requestedAmount:
                        normalizedAmount,
                    balance:
                        wallet.balance
                };

                return;
            }

            const balanceBefore =
                wallet.balance;

            const balanceAfter =
                Math.round(
                    (
                        balanceBefore -
                        normalizedAmount
                    ) * 100
                ) / 100;

            wallet.balance =
                Math.max(
                    0,
                    balanceAfter
                );

            const transaction =
                createTransactionRecord({
                    type,
                    amount:
                        normalizedAmount,
                    direction: "DEBIT",
                    balanceBefore,
                    balanceAfter:
                        wallet.balance,
                    metadata
                });

            appendTransaction(
                wallet,
                transaction
            );

            result = {
                success: true,
                amount:
                    normalizedAmount,
                balanceBefore,
                balanceAfter:
                    wallet.balance,
                transaction
            };
        });

    if (!savedData) {
        return {
            success: false,
            reason:
                "STORAGE_WRITE_FAILED"
        };
    }

    return result;
}


/* =========================================================
   FIRST LOGIN BONUS

   Rules:
   - Award exactly once per local player data
   - +10,000 coins
   - Independent from daily login reward

   Therefore:
   First-ever login later becomes:

   10,000 initial bonus
   +1,000 daily login
   =11,000 total
========================================================= */

function claimFirstLoginBonus() {
    let result = null;

    const savedData =
        updateData((data) => {
            const wallet =
                ensureWalletStructure(data);

            if (
                wallet.firstLoginBonusClaimed
            ) {
                result = {
                    success: false,
                    claimed: false,
                    reason:
                        "ALREADY_CLAIMED",
                    amount: 0,
                    balance:
                        wallet.balance
                };

                return;
            }

            const balanceBefore =
                wallet.balance;

            const balanceAfter =
                Math.round(
                    (
                        balanceBefore +
                        FIRST_LOGIN_BONUS
                    ) * 100
                ) / 100;

            wallet.balance =
                balanceAfter;

            wallet.firstLoginBonusClaimed =
                true;

            const transaction =
                createTransactionRecord({
                    type:
                        WALLET_TRANSACTION_TYPES
                            .INITIAL_BONUS,

                    amount:
                        FIRST_LOGIN_BONUS,

                    direction:
                        "CREDIT",

                    balanceBefore,

                    balanceAfter,

                    metadata: {
                        source:
                            "FIRST_LOGIN"
                    }
                });

            appendTransaction(
                wallet,
                transaction
            );

            result = {
                success: true,
                claimed: true,

                amount:
                    FIRST_LOGIN_BONUS,

                balanceBefore,

                balanceAfter,

                transaction
            };
        });

    if (!savedData) {
        return {
            success: false,
            claimed: false,
            reason:
                "STORAGE_WRITE_FAILED"
        };
    }

    return result;
}


/* =========================================================
   CHECK FIRST LOGIN BONUS
========================================================= */

function hasClaimedFirstLoginBonus() {
    const data =
        getData();

    const wallet =
        ensureWalletStructure(data);

    return (
        wallet.firstLoginBonusClaimed ===
        true
    );
}


/* =========================================================
   GET TRANSACTIONS
========================================================= */

function getTransactions({
    limit = null,
    type = null,
    direction = null
} = {}) {
    const data =
        getData();

    const wallet =
        ensureWalletStructure(data);

    let transactions =
        [...wallet.transactions];


    /* Newest first */

    transactions.reverse();


    if (type !== null) {
        transactions =
            transactions.filter(
                (transaction) =>
                    transaction.type === type
            );
    }


    if (direction !== null) {
        transactions =
            transactions.filter(
                (transaction) =>
                    transaction.direction === direction
            );
    }


    if (
        Number.isInteger(limit) &&
        limit >= 0
    ) {
        transactions =
            transactions.slice(
                0,
                limit
            );
    }


    return transactions;
}


/* =========================================================
   GET TRANSACTION BY ID
========================================================= */

function getTransactionById(
    transactionId
) {
    if (
        typeof transactionId !== "string" ||
        transactionId.length === 0
    ) {
        return null;
    }

    const data =
        getData();

    const wallet =
        ensureWalletStructure(data);

    return (
        wallet.transactions.find(
            (transaction) =>
                transaction.id ===
                transactionId
        ) ?? null
    );
}


/* =========================================================
   WALLET SUMMARY
========================================================= */

function getWalletSummary() {
    const data =
        getData();

    const wallet =
        ensureWalletStructure(data);

    let totalCredited = 0;
    let totalDebited = 0;

    for (
        const transaction
        of wallet.transactions
    ) {
        if (
            !transaction ||
            !isPositiveAmount(
                transaction.amount
            )
        ) {
            continue;
        }

        if (
            transaction.direction ===
            "CREDIT"
        ) {
            totalCredited +=
                transaction.amount;
        }

        if (
            transaction.direction ===
            "DEBIT"
        ) {
            totalDebited +=
                transaction.amount;
        }
    }

    totalCredited =
        Math.round(
            totalCredited * 100
        ) / 100;

    totalDebited =
        Math.round(
            totalDebited * 100
        ) / 100;

    return {
        balance:
            wallet.balance,

        firstLoginBonusClaimed:
            wallet.firstLoginBonusClaimed,

        transactionCount:
            wallet.transactions.length,

        totalCredited,

        totalDebited
    };
}


/* =========================================================
   FORMAT BALANCE

   UI helper only.
========================================================= */

function formatCoins(
    amount
) {
    if (!isFiniteNumber(amount)) {
        return "0";
    }

    return amount.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    FIRST_LOGIN_BONUS,
    MAX_TRANSACTION_HISTORY,
    WALLET_TRANSACTION_TYPES,

    getBalance,
    canAfford,

    credit,
    debit,

    claimFirstLoginBonus,
    hasClaimedFirstLoginBonus,

    getTransactions,
    getTransactionById,
    getWalletSummary,

    formatCoins
};
