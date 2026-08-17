/* =========================================================
   CG FLIGHT
   js/game/betting.js

   Betting domain layer.

   Responsibilities:
   - Validate bet amount
   - Deduct wallet balance when placing a bet
   - Store bet state in state.js
   - Cancel/refund bets before flight starts
   - Activate placed bet when flight begins
   - Expose bet status helpers

   IMPORTANT:
   This module does NOT:
   - Perform cashout
   - Mark bet loss
   - Perform settlement
   - Write round history
========================================================= */

import {
    GAME_PHASES,
    BET_STATUS,

    getPhase,
    getBet,

    setBet,
    activateBet,
    markBetCancelled
} from "./state.js";

import {
    getBalance,
    canAfford,
    debit,
    credit,
    WALLET_TRANSACTION_TYPES
} from "../core/wallet.js";

import {
    roundTo,
    isFiniteNumber
} from "../core/utils.js";

import {
    playBet,
    playBetCancel,
    playInsufficientBalance
} from "../core/audio.js";


/* =========================================================
   BETTING CONFIG
========================================================= */

const BETTING_CONFIG = Object.freeze({

    /*
     Minimum allowed bet.
    */
    MIN_BET: 1,

    /*
     Maximum allowed bet.

     This is a gameplay cap, not the wallet balance cap.
    */
    MAX_BET: 1000000,

    /*
     Bet precision.
    */
    DECIMALS: 2
});


/* =========================================================
   NORMALIZE BET AMOUNT
========================================================= */

function normalizeBetAmount(
    amount
) {
    const numeric =
        Number(amount);

    if (
        !isFiniteNumber(
            numeric
        )
    ) {
        return null;
    }

    const normalized =
        roundTo(
            numeric,
            BETTING_CONFIG.DECIMALS
        );

    if (
        normalized <
            BETTING_CONFIG.MIN_BET ||
        normalized >
            BETTING_CONFIG.MAX_BET
    ) {
        return null;
    }

    return normalized;
}


/* =========================================================
   VALIDATE BET
========================================================= */

function validateBet(
    amount
) {
    const normalized =
        normalizeBetAmount(
            amount
        );

    if (normalized === null) {
        return {
            valid: false,
            reason:
                "INVALID_BET_AMOUNT"
        };
    }


    const phase =
        getPhase();

    if (
        phase !==
        GAME_PHASES.BETTING
    ) {
        return {
            valid: false,

            reason:
                "BETTING_CLOSED",

            phase
        };
    }


    const currentBet =
        getBet();

    if (
        currentBet.status !==
        BET_STATUS.NONE
    ) {
        return {
            valid: false,

            reason:
                "BET_ALREADY_EXISTS",

            bet:
                currentBet
        };
    }


    const balance =
        getBalance();

    if (
        !canAfford(
            normalized
        )
    ) {
        return {
            valid: false,

            reason:
                "INSUFFICIENT_BALANCE",

            requestedAmount:
                normalized,

            balance
        };
    }


    return {
        valid: true,

        amount:
            normalized,

        balance
    };
}


/* =========================================================
   PLACE BET

   Flow:
   1. Validate phase / amount / existing bet
   2. Debit wallet
   3. Store bet in round state
   4. If state write somehow fails, refund wallet
========================================================= */

function placeBet(
    amount
) {
    const validation =
        validateBet(
            amount
        );


    if (!validation.valid) {
        if (
            validation.reason ===
            "INSUFFICIENT_BALANCE"
        ) {
            playInsufficientBalance();
        }

        return {
            success: false,
            ...validation
        };
    }


    const normalizedAmount =
        validation.amount;


    /* -----------------------------------------------------
       Wallet debit
    ----------------------------------------------------- */

    const debitResult =
        debit(
            normalizedAmount,
            {
                type:
                    WALLET_TRANSACTION_TYPES
                        .BET,

                metadata: {
                    source:
                        "BET",

                    phase:
                        getPhase()
                }
            }
        );


    if (!debitResult.success) {
        if (
            debitResult.reason ===
            "INSUFFICIENT_BALANCE"
        ) {
            playInsufficientBalance();
        }

        return {
            success: false,

            reason:
                debitResult.reason,

            balance:
                debitResult.balance
        };
    }


    /* -----------------------------------------------------
       Store state
    ----------------------------------------------------- */

    const stateResult =
        setBet({
            amount:
                normalizedAmount,

            transactionId:
                debitResult
                    .transaction
                    .id
        });


    /* -----------------------------------------------------
       Rollback if state update failed
    ----------------------------------------------------- */

    if (!stateResult.success) {
        const refundResult =
            credit(
                normalizedAmount,
                {
                    type:
                        WALLET_TRANSACTION_TYPES
                            .BET_REFUND,

                    metadata: {
                        source:
                            "BET_ROLLBACK",

                        originalTransactionId:
                            debitResult
                                .transaction
                                .id,

                        reason:
                            stateResult
                                .reason
                    }
                }
            );


        return {
            success: false,

            reason:
                "BET_STATE_WRITE_FAILED",

            stateReason:
                stateResult.reason,

            rollbackSuccess:
                refundResult.success
        };
    }


    playBet();


    return {
        success: true,

        amount:
            normalizedAmount,

        balanceBefore:
            debitResult
                .balanceBefore,

        balanceAfter:
            debitResult
                .balanceAfter,

        transaction:
            debitResult
                .transaction,

        bet:
            stateResult
                .bet
    };
}


/* =========================================================
   CAN CANCEL BET

   Current rule:
   A placed bet can be cancelled while the round is still in
   BETTING or COUNTDOWN phase, but not once it is ACTIVE.
========================================================= */

function canCancelBet() {
    const phase =
        getPhase();

    const bet =
        getBet();


    if (
        bet.status !==
        BET_STATUS.PLACED
    ) {
        return false;
    }


    return (
        phase ===
            GAME_PHASES.BETTING ||
        phase ===
            GAME_PHASES.COUNTDOWN
    );
}


/* =========================================================
   CANCEL BET

   Flow:
   1. Check cancellability
   2. Refund wallet
   3. Mark bet as cancelled in state
========================================================= */

function cancelBet() {
    if (!canCancelBet()) {
        return {
            success: false,

            reason:
                "BET_NOT_CANCELLABLE",

            phase:
                getPhase(),

            bet:
                getBet()
        };
    }


    const bet =
        getBet();


    const refundResult =
        credit(
            bet.amount,
            {
                type:
                    WALLET_TRANSACTION_TYPES
                        .BET_REFUND,

                metadata: {
                    source:
                        "BET_CANCEL",

                    originalBetTransactionId:
                        bet.transactionId
                }
            }
        );


    if (!refundResult.success) {
        return {
            success: false,

            reason:
                refundResult.reason
        };
    }


    const stateResult =
        markBetCancelled({
            transactionId:
                refundResult
                    .transaction
                    .id
        });


    if (!stateResult.success) {
        /*
         At this point the wallet has already been refunded.

         We do NOT debit the wallet again automatically,
         because double-reversing financial state is riskier
         than leaving the round state inconsistent.

         Higher-level settlement logic can detect and resolve
         this edge case.
        */

        return {
            success: false,

            reason:
                "BET_CANCEL_STATE_FAILED",

            stateReason:
                stateResult.reason,

            refundCompleted:
                true,

            refundTransaction:
                refundResult
                    .transaction
        };
    }


    playBetCancel();


    return {
        success: true,

        refunded:
            bet.amount,

        balanceBefore:
            refundResult
                .balanceBefore,

        balanceAfter:
            refundResult
                .balanceAfter,

        refundTransaction:
            refundResult
                .transaction
    };
}


/* =========================================================
   ACTIVATE CURRENT BET

   Call this at the transition into FLYING.

   A PLACED bet becomes ACTIVE.
========================================================= */

function activateCurrentBet() {
    const bet =
        getBet();


    if (
        bet.status ===
        BET_STATUS.NONE
    ) {
        return {
            success: true,

            activated: false,

            reason:
                "NO_BET"
        };
    }


    if (
        bet.status ===
        BET_STATUS.CANCELLED
    ) {
        return {
            success: true,

            activated: false,

            reason:
                "BET_CANCELLED"
        };
    }


    if (
        bet.status ===
        BET_STATUS.ACTIVE
    ) {
        return {
            success: true,

            activated: false,

            reason:
                "ALREADY_ACTIVE",

            bet
        };
    }


    if (
        bet.status !==
        BET_STATUS.PLACED
    ) {
        return {
            success: false,

            reason:
                "INVALID_BET_STATUS",

            status:
                bet.status
        };
    }


    const result =
        activateBet();


    if (!result.success) {
        return result;
    }


    return {
        success: true,

        activated: true,

        bet:
            result.bet
    };
}


/* =========================================================
   BETTING STATUS
========================================================= */

function getBettingStatus() {
    const phase =
        getPhase();

    const bet =
        getBet();

    return {
        phase,

        bettingOpen:
            phase ===
            GAME_PHASES.BETTING,

        cancellationOpen:
            canCancelBet(),

        balance:
            getBalance(),

        bet,

        hasBet:
            bet.status !==
            BET_STATUS.NONE,

        betActive:
            bet.status ===
            BET_STATUS.ACTIVE
    };
}


/* =========================================================
   BET AMOUNT HELPERS
========================================================= */

function getMinimumBet() {
    return (
        BETTING_CONFIG.MIN_BET
    );
}


function getMaximumBet() {
    return (
        BETTING_CONFIG.MAX_BET
    );
}


/* =========================================================
   QUICK BET VALIDATION

   Useful for UI input feedback without performing wallet
   operations.
========================================================= */

function previewBet(
    amount
) {
    const normalized =
        normalizeBetAmount(
            amount
        );


    if (normalized === null) {
        return {
            valid: false,

            reason:
                "INVALID_BET_AMOUNT",

            min:
                BETTING_CONFIG.MIN_BET,

            max:
                BETTING_CONFIG.MAX_BET
        };
    }


    const balance =
        getBalance();


    return {
        valid:
            normalized <=
            balance,

        reason:
            normalized <=
            balance
                ? null
                : "INSUFFICIENT_BALANCE",

        amount:
            normalized,

        balance,

        balanceAfter:
            normalized <= balance
                ? roundTo(
                    balance -
                    normalized,
                    2
                )
                : balance
    };
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    BETTING_CONFIG,

    normalizeBetAmount,
    validateBet,
    previewBet,

    placeBet,
    cancelBet,

    canCancelBet,
    activateCurrentBet,

    getBettingStatus,

    getMinimumBet,
    getMaximumBet
};
