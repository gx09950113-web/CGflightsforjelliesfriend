/* =========================================================
   CG FLIGHT
   js/game/betting.js

   Betting lifecycle controller.

   Responsibilities:
   - Validate bet amount
   - Preview bet validity
   - Place bet during BETTING phase
   - Debit wallet immediately
   - Cancel bet before flight starts
   - Refund cancelled bet
   - Expose betting status

   IMPORTANT:
   betting.js does NOT:
   - Start countdown
   - Start flight
   - Perform Cash Out
   - Perform Settlement
========================================================= */


import {
    GAME_PHASES,
    BET_STATUS,

    getState,

    setBetPlaced,
    setBetCancelled
} from "./state.js";


import {
    getBalance,
    debitBet,
    refundBet
} from "../core/wallet.js";


import {
    roundTo
} from "../core/utils.js";


import {
    playBet,
    playBetCancel,
    playInsufficientBalance
} from "../core/audio.js";


/* =========================================================
   BET CONFIG
========================================================= */

const BET_CONFIG = Object.freeze({

    MIN_BET:
        1,

    MAX_BET:
        1000000,

    DECIMALS:
        2
});


/* =========================================================
   BETTING EVENT TYPES
========================================================= */

const BETTING_EVENT_TYPES =
    Object.freeze({

        BET_PLACED:
            "BET_PLACED",

        BET_CANCELLED:
            "BET_CANCELLED",

        BET_REJECTED:
            "BET_REJECTED"
    });


/* =========================================================
   LISTENERS
========================================================= */

const bettingListeners =
    new Set();


function subscribeToBetting(
    listener
) {

    if (
        typeof listener !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] Betting listener must be a function."
        );
    }


    bettingListeners.add(
        listener
    );


    return function unsubscribe() {

        bettingListeners.delete(
            listener
        );
    };
}


/* =========================================================
   NOTIFY
========================================================= */

function notifyBettingListeners(
    event
) {

    const payload = {

        ...event,

        timestamp:
            event.timestamp ??
            Date.now()
    };


    for (
        const listener
        of bettingListeners
    ) {

        try {

            listener(
                payload
            );

        } catch (error) {

            console.error(
                "[CG Flight] Betting listener failed:",
                error
            );
        }
    }
}


/* =========================================================
   NORMALIZE BET AMOUNT
========================================================= */

function normalizeBetAmount(
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
            BET_CONFIG.DECIMALS
        );


    if (
        normalized <
            BET_CONFIG.MIN_BET ||
        normalized >
            BET_CONFIG.MAX_BET
    ) {
        return null;
    }


    return normalized;
}


/* =========================================================
   PREVIEW BET
========================================================= */

function previewBet(
    amount
) {

    const normalized =
        normalizeBetAmount(
            amount
        );


    const state =
        getState();


    const balance =
        getBalance();


    if (
        normalized ===
        null
    ) {

        return {
            valid: false,

            reason:
                "INVALID_AMOUNT",

            amount:
                null,

            balance
        };
    }


    if (
        state.phase !==
        GAME_PHASES.BETTING
    ) {

        return {
            valid: false,

            reason:
                "BETTING_CLOSED",

            amount:
                normalized,

            balance
        };
    }


    if (
        state.bet.status !==
        BET_STATUS.NONE
    ) {

        return {
            valid: false,

            reason:
                "BET_ALREADY_EXISTS",

            amount:
                normalized,

            balance
        };
    }


    if (
        balance <
        normalized
    ) {

        return {
            valid: false,

            reason:
                "INSUFFICIENT_BALANCE",

            amount:
                normalized,

            balance,

            shortage:
                roundTo(
                    normalized -
                    balance,
                    2
                )
        };
    }


    return {
        valid: true,

        reason:
            null,

        amount:
            normalized,

        balance,

        balanceAfterBet:
            roundTo(
                balance -
                normalized,
                2
            )
    };
}


/* =========================================================
   PLACE BET
========================================================= */

function placeBet(
    amount
) {

    const preview =
        previewBet(
            amount
        );


    if (
        !preview.valid
    ) {

        if (
            preview.reason ===
            "INSUFFICIENT_BALANCE"
        ) {
            playInsufficientBalance();
        }


        notifyBettingListeners({

            type:
                BETTING_EVENT_TYPES
                    .BET_REJECTED,

            reason:
                preview.reason,

            amount:
                preview.amount,

            balance:
                preview.balance
        });


        return {
            success: false,

            reason:
                preview.reason,

            amount:
                preview.amount,

            balance:
                preview.balance,

            shortage:
                preview.shortage ??
                0
        };
    }


    const state =
        getState();


    const roundId =
        state.roundId;


    if (!roundId) {

        return {
            success: false,

            reason:
                "NO_ACTIVE_ROUND"
        };
    }


    /* -----------------------------------------------------
       Debit Wallet first.

       If debit fails, State must remain untouched.
    ----------------------------------------------------- */

    const debitResult =
        debitBet(
            preview.amount,
            {
                roundId
            }
        );


    if (
        !debitResult.success
    ) {

        if (
            debitResult.reason ===
            "INSUFFICIENT_BALANCE"
        ) {
            playInsufficientBalance();
        }


        notifyBettingListeners({

            type:
                BETTING_EVENT_TYPES
                    .BET_REJECTED,

            reason:
                debitResult.reason,

            amount:
                preview.amount,

            balance:
                debitResult.balance
        });


        return {
            success: false,

            reason:
                debitResult.reason,

            amount:
                preview.amount,

            balance:
                debitResult.balance
        };
    }


    /* -----------------------------------------------------
       Persist Bet into current round State.
    ----------------------------------------------------- */

    const placedAt =
        new Date()
            .toISOString();


    const updated =
        setBetPlaced({

            amount:
                preview.amount,

            transactionId:
                debitResult
                    .transactionId,

            placedAt
        });


    if (!updated) {

        /*
         State update failed after wallet debit.

         Refund immediately to avoid money loss.
        */

        const rollback =
            refundBet(
                preview.amount,
                {
                    roundId,
                    reason:
                        "BET_STATE_ROLLBACK"
                }
            );


        return {
            success: false,

            reason:
                "BET_STATE_UPDATE_FAILED",

            rollbackSuccess:
                rollback.success
        };
    }


    playBet();


    notifyBettingListeners({

        type:
            BETTING_EVENT_TYPES
                .BET_PLACED,

        roundId,

        amount:
            preview.amount,

        transactionId:
            debitResult
                .transactionId,

        balance:
            debitResult.balance,

        placedAt
    });


    return {
        success: true,

        roundId,

        amount:
            preview.amount,

        transactionId:
            debitResult
                .transactionId,

        balance:
            debitResult.balance,

        placedAt
    };
}


/* =========================================================
   CAN CANCEL BET

   Cancellation is allowed only while:
   - status is PLACED
   - phase is BETTING or COUNTDOWN

   Once FLYING starts, state.js changes PLACED -> ACTIVE.
========================================================= */

function canCancelBet() {

    const state =
        getState();


    return (
        state.bet.status ===
            BET_STATUS.PLACED &&
        (
            state.phase ===
                GAME_PHASES.BETTING ||
            state.phase ===
                GAME_PHASES.COUNTDOWN
        )
    );
}


/* =========================================================
   CANCEL BET
========================================================= */

function cancelBet() {

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
        state.bet.status !==
        BET_STATUS.PLACED
    ) {

        return {
            success: false,

            reason:
                "NO_CANCELLABLE_BET"
        };
    }


    if (
        !(
            state.phase ===
                GAME_PHASES.BETTING ||
            state.phase ===
                GAME_PHASES.COUNTDOWN
        )
    ) {

        return {
            success: false,

            reason:
                "BET_CANCELLATION_CLOSED"
        };
    }


    const amount =
        roundTo(
            state.bet.amount,
            BET_CONFIG.DECIMALS
        );


    if (
        amount <= 0
    ) {

        return {
            success: false,

            reason:
                "INVALID_BET_STATE"
        };
    }


    /* -----------------------------------------------------
       Refund first.

       State changes only after Wallet credit succeeds.
    ----------------------------------------------------- */

    const refundResult =
        refundBet(
            amount,
            {
                roundId:
                    state.roundId,

                reason:
                    "BET_CANCELLED"
            }
        );


    if (
        !refundResult.success
    ) {

        return {
            success: false,

            reason:
                "BET_REFUND_FAILED",

            walletReason:
                refundResult.reason
        };
    }


    const cancelledAt =
        new Date()
            .toISOString();


    const updated =
        setBetCancelled({

            refundTransactionId:
                refundResult
                    .transactionId,

            cancelledAt
        });


    if (!updated) {

        /*
         This situation is extremely unlikely because the
         round State is in-memory.

         The refund has already happened, so do NOT attempt
         to debit the wallet again as a rollback.
        */

        return {
            success: false,

            reason:
                "BET_STATE_UPDATE_FAILED_AFTER_REFUND",

            refunded:
                amount,

            balance:
                refundResult.balance
        };
    }


    playBetCancel();


    notifyBettingListeners({

        type:
            BETTING_EVENT_TYPES
                .BET_CANCELLED,

        roundId:
            state.roundId,

        amount,

        refundTransactionId:
            refundResult
                .transactionId,

        balance:
            refundResult.balance,

        cancelledAt
    });


    return {
        success: true,

        roundId:
            state.roundId,

        refunded:
            amount,

        refundTransactionId:
            refundResult
                .transactionId,

        balance:
            refundResult.balance,

        cancelledAt
    };
}


/* =========================================================
   GET BETTING STATUS
========================================================= */

function getBettingStatus() {

    const state =
        getState();


    const cancellable =
        canCancelBet();


    const bettingOpen =
        state.phase ===
            GAME_PHASES.BETTING;


    const canPlace =
        (
            bettingOpen &&
            state.bet.status ===
                BET_STATUS.NONE
        );


    return {

        roundId:
            state.roundId,

        phase:
            state.phase,

        bettingOpen,

        canPlace,

        cancellable,

        status:
            state.bet.status,

        amount:
            state.bet.amount,

        placedAt:
            state.bet.placedAt,

        activatedAt:
            state.bet.activatedAt,

        cancelledAt:
            state.bet.cancelledAt,

        transactionId:
            state.bet.transactionId,

        refundTransactionId:
            state.bet
                .refundTransactionId,

        balance:
            getBalance()
    };
}


/* =========================================================
   HAS BET
========================================================= */

function hasBet() {

    const state =
        getState();


    return ![
        BET_STATUS.NONE,
        BET_STATUS.CANCELLED
    ].includes(
        state.bet.status
    );
}


/* =========================================================
   HAS ACTIVE BET
========================================================= */

function hasActiveBet() {

    const state =
        getState();


    return (
        state.bet.status ===
        BET_STATUS.ACTIVE
    );
}


/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

function submitBet(
    amount
) {

    return placeBet(
        amount
    );
}


function removeBet() {

    return cancelBet();
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    BET_CONFIG,
    BETTING_EVENT_TYPES,

    normalizeBetAmount,
    previewBet,

    placeBet,
    cancelBet,

    canCancelBet,

    getBettingStatus,

    hasBet,
    hasActiveBet,

    subscribeToBetting,

    /* Compatibility */
    submitBet,
    removeBet
};
