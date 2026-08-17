/* =========================================================
   CG FLIGHT
   js/pages/history.js

   History page controller.

   Responsibilities:
   - Render wallet balance
   - Render persistent sound/music settings
   - Render history summary
   - Render recent 10 crash results
   - Render filtered/paginated history
   - Render desktop history table
   - Render mobile history cards
   - Open single-round detail modal
   - Manage filters / pagination
   - Manage settings modal
   - Play page audio

   IMPORTANT:
   This file only coordinates UI.

   It does NOT:
   - Perform settlement
   - Modify history records
   - Modify statistics
   - Modify wallet balance
========================================================= */


/* =========================================================
   CORE IMPORTS
========================================================= */

import {
    getBalance,
    formatCoins
} from "../core/wallet.js";

import {
    getSettings,
    toggleSoundEnabled,
    toggleMusicEnabled,
    subscribeToSettings
} from "../core/settings.js";

import {
    preloadAudio,
    playBgm,
    pauseBgm,
    playClick
} from "../core/audio.js";

import {
    showElement,
    hideElement,
    setText,
    formatMultiplier,
    formatSignedNumber,
    formatDateTime,
    formatDuration
} from "../core/utils.js";


/* =========================================================
   HISTORY IMPORTS
========================================================= */

import {
    getRecentResults,
    getHistorySummary,
    getHistoryPage,
    getPlayerRoundDetail,
    subscribeToHistory
} from "../game/history.js";


/* =========================================================
   PAGE CONFIG
========================================================= */

const PAGE_CONFIG = Object.freeze({

    PAGE_SIZE: 20
});


/* =========================================================
   ICON PATHS
========================================================= */

const ICONS = Object.freeze({

    soundOn:
        "./assets/icons/sound-on.svg",

    soundOff:
        "./assets/icons/sound-off.svg",

    musicOn:
        "./assets/icons/music-on.svg",

    musicOff:
        "./assets/icons/music-off.svg"
});


/* =========================================================
   DOM REFERENCES
========================================================= */

const elements = {

    /* -----------------------------------------------------
       Header
    ----------------------------------------------------- */

    walletBalance:
        document.getElementById(
            "walletBalance"
        ),

    soundToggleButton:
        document.getElementById(
            "soundToggleButton"
        ),

    soundToggleIcon:
        document.getElementById(
            "soundToggleIcon"
        ),

    musicToggleButton:
        document.getElementById(
            "musicToggleButton"
        ),

    musicToggleIcon:
        document.getElementById(
            "musicToggleIcon"
        ),

    settingsButton:
        document.getElementById(
            "settingsButton"
        ),


    /* -----------------------------------------------------
       Summary
    ----------------------------------------------------- */

    summaryTotalRounds:
        document.getElementById(
            "summaryTotalRounds"
        ),

    summaryWins:
        document.getElementById(
            "summaryWins"
        ),

    summaryLosses:
        document.getElementById(
            "summaryLosses"
        ),

    summaryHighestCrash:
        document.getElementById(
            "summaryHighestCrash"
        ),

    summaryAverageCrash:
        document.getElementById(
            "summaryAverageCrash"
        ),

    summaryAverageCashout:
        document.getElementById(
            "summaryAverageCashout"
        ),


    /* -----------------------------------------------------
       Recent results
    ----------------------------------------------------- */

    recentResults:
        document.getElementById(
            "recentResults"
        ),


    /* -----------------------------------------------------
       Filters
    ----------------------------------------------------- */

    resultFilter:
        document.getElementById(
            "resultFilter"
        ),

    betFilter:
        document.getElementById(
            "betFilter"
        ),

    cashoutFilter:
        document.getElementById(
            "cashoutFilter"
        ),

    resetFiltersButton:
        document.getElementById(
            "resetFiltersButton"
        ),


    /* -----------------------------------------------------
       History list
    ----------------------------------------------------- */

    historyResultCount:
        document.getElementById(
            "historyResultCount"
        ),

    historyTableBody:
        document.getElementById(
            "historyTableBody"
        ),

    historyCardList:
        document.getElementById(
            "historyCardList"
        ),


    /* -----------------------------------------------------
       Pagination
    ----------------------------------------------------- */

    previousPageButton:
        document.getElementById(
            "previousPageButton"
        ),

    nextPageButton:
        document.getElementById(
            "nextPageButton"
        ),

    currentPageDisplay:
        document.getElementById(
            "currentPageDisplay"
        ),

    totalPagesDisplay:
        document.getElementById(
            "totalPagesDisplay"
        ),


    /* -----------------------------------------------------
       Round detail modal
    ----------------------------------------------------- */

    roundDetailModal:
        document.getElementById(
            "roundDetailModal"
        ),

    closeRoundDetailButton:
        document.getElementById(
            "closeRoundDetailButton"
        ),

    detailResult:
        document.getElementById(
            "detailResult"
        ),

    detailCrashMultiplier:
        document.getElementById(
            "detailCrashMultiplier"
        ),

    detailRoundId:
        document.getElementById(
            "detailRoundId"
        ),

    detailRecordedAt:
        document.getElementById(
            "detailRecordedAt"
        ),

    detailFlightDuration:
        document.getElementById(
            "detailFlightDuration"
        ),

    detailBetStatus:
        document.getElementById(
            "detailBetStatus"
        ),

    detailBetAmount:
        document.getElementById(
            "detailBetAmount"
        ),

    detailBetPlacedAt:
        document.getElementById(
            "detailBetPlacedAt"
        ),

    detailAutoEnabled:
        document.getElementById(
            "detailAutoEnabled"
        ),

    detailAutoTarget:
        document.getElementById(
            "detailAutoTarget"
        ),

    detailCashoutType:
        document.getElementById(
            "detailCashoutType"
        ),

    detailCashoutMultiplier:
        document.getElementById(
            "detailCashoutMultiplier"
        ),

    detailCashoutAmount:
        document.getElementById(
            "detailCashoutAmount"
        ),

    detailWagered:
        document.getElementById(
            "detailWagered"
        ),

    detailReturned:
        document.getElementById(
            "detailReturned"
        ),

    detailProfit:
        document.getElementById(
            "detailProfit"
        ),


    /* -----------------------------------------------------
       Settings modal
    ----------------------------------------------------- */

    settingsModal:
        document.getElementById(
            "settingsModal"
        ),

    closeSettingsButton:
        document.getElementById(
            "closeSettingsButton"
        ),

    settingsSoundToggle:
        document.getElementById(
            "settingsSoundToggle"
        ),

    settingsMusicToggle:
        document.getElementById(
            "settingsMusicToggle"
        )
};


/* =========================================================
   PAGE STATE
========================================================= */

const pageState = {

    page: 1,

    result: null,

    hasBet: null,

    cashoutType: null,

    lastFocusedElement: null
};


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    preloadAudio();

    bindControls();

    bindModuleEvents();

    renderWallet();

    updateSettingsUI();

    renderHistoryPage();

    playBgm(
        "lobby"
    );
}


/* =========================================================
   BIND CONTROLS
========================================================= */

function bindControls() {

    /* -----------------------------------------------------
       Settings
    ----------------------------------------------------- */

    elements.soundToggleButton
        ?.addEventListener(
            "click",
            () => {

                toggleSoundEnabled();
            }
        );


    elements.musicToggleButton
        ?.addEventListener(
            "click",
            () => {

                toggleMusicEnabled();
            }
        );


    elements.settingsButton
        ?.addEventListener(
            "click",
            openSettingsModal
        );


    elements.closeSettingsButton
        ?.addEventListener(
            "click",
            closeSettingsModal
        );


    elements.settingsSoundToggle
        ?.addEventListener(
            "click",
            () => {

                toggleSoundEnabled();
            }
        );


    elements.settingsMusicToggle
        ?.addEventListener(
            "click",
            () => {

                toggleMusicEnabled();
            }
        );


    elements.settingsModal
        ?.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    elements.settingsModal
                ) {
                    closeSettingsModal();
                }
            }
        );


    /* -----------------------------------------------------
       Filters
    ----------------------------------------------------- */

    elements.resultFilter
        ?.addEventListener(
            "change",
            handleFilterChange
        );


    elements.betFilter
        ?.addEventListener(
            "change",
            handleFilterChange
        );


    elements.cashoutFilter
        ?.addEventListener(
            "change",
            handleFilterChange
        );


    elements.resetFiltersButton
        ?.addEventListener(
            "click",
            resetFilters
        );


    /* -----------------------------------------------------
       Pagination
    ----------------------------------------------------- */

    elements.previousPageButton
        ?.addEventListener(
            "click",
            goToPreviousPage
        );


    elements.nextPageButton
        ?.addEventListener(
            "click",
            goToNextPage
        );


    /* -----------------------------------------------------
       Detail modal
    ----------------------------------------------------- */

    elements.closeRoundDetailButton
        ?.addEventListener(
            "click",
            closeRoundDetailModal
        );


    elements.roundDetailModal
        ?.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    elements.roundDetailModal
                ) {
                    closeRoundDetailModal();
                }
            }
        );


    /* -----------------------------------------------------
       Dynamic Detail Buttons
    ----------------------------------------------------- */

    elements.historyTableBody
        ?.addEventListener(
            "click",
            handleHistoryDetailClick
        );


    elements.historyCardList
        ?.addEventListener(
            "click",
            handleHistoryDetailClick
        );


    /* -----------------------------------------------------
       Keyboard
    ----------------------------------------------------- */

    document.addEventListener(
        "keydown",
        handleKeydown
    );
}


/* =========================================================
   MODULE EVENTS
========================================================= */

function bindModuleEvents() {

    subscribeToSettings(
        ({
            settings,
            changedKeys
        }) => {

            updateSettingsUI();


            if (
                changedKeys.includes(
                    "musicEnabled"
                ) &&
                settings.musicEnabled
            ) {
                playBgm(
                    "lobby"
                );
            }
        }
    );


    subscribeToHistory(
        () => {

            /*
             If History changes while this page remains open,
             refresh summary / recent / current page.
            */

            renderHistoryPage();
        }
    );
}


/* =========================================================
   MASTER RENDER
========================================================= */

function renderHistoryPage() {

    renderSummary();

    renderRecentResults();

    renderHistoryList();

    renderWallet();
}


/* =========================================================
   WALLET
========================================================= */

function renderWallet() {

    setText(
        elements.walletBalance,
        formatCoins(
            getBalance()
        )
    );
}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

    const summary =
        getHistorySummary();


    setText(
        elements.summaryTotalRounds,
        formatCoins(
            summary.totalRounds
        )
    );


    setText(
        elements.summaryWins,
        formatCoins(
            summary.winCount
        )
    );


    setText(
        elements.summaryLosses,
        formatCoins(
            summary.lossCount
        )
    );


    setText(
        elements.summaryHighestCrash,
        formatMultiplier(
            summary.highestCrashMultiplier
        )
    );


    setText(
        elements.summaryAverageCrash,
        formatMultiplier(
            summary.averageCrashMultiplier
        )
    );


    setText(
        elements.summaryAverageCashout,
        formatMultiplier(
            summary.averageCashoutMultiplier
        )
    );
}


/* =========================================================
   RECENT 10
========================================================= */

function renderRecentResults() {

    if (
        !elements.recentResults
    ) {
        return;
    }


    const results =
        getRecentResults(
            10
        );


    elements.recentResults
        .replaceChildren();


    for (
        const result
        of results
    ) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "recent-history-result";


        item.classList.add(
            getCrashClass(
                result.crashMultiplier
            )
        );


        const multiplier =
            document.createElement(
                "strong"
            );


        multiplier.textContent =
            formatMultiplier(
                result.crashMultiplier
            );


        const label =
            document.createElement(
                "span"
            );


        label.textContent =
            getResultLabel(
                result.result
            );


        item.append(
            multiplier,
            label
        );


        elements.recentResults
            .appendChild(
                item
            );
    }


    for (
        let i = results.length;
        i < 10;
        i += 1
    ) {

        const placeholder =
            document.createElement(
                "div"
            );


        placeholder.className =
            "recent-history-placeholder";


        placeholder.textContent =
            "—";


        elements.recentResults
            .appendChild(
                placeholder
            );
    }
}


/* =========================================================
   FILTER CHANGE
========================================================= */

function handleFilterChange() {

    playClick();


    pageState.result =
        elements.resultFilter
            ?.value ||
        null;


    const betValue =
        elements.betFilter
            ?.value;


    if (
        betValue === "BET"
    ) {

        pageState.hasBet =
            true;

    } else if (
        betValue === "NO_BET"
    ) {

        pageState.hasBet =
            false;

    } else {

        pageState.hasBet =
            null;
    }


    pageState.cashoutType =
        elements.cashoutFilter
            ?.value ||
        null;


    pageState.page = 1;


    renderHistoryList();
}


/* =========================================================
   RESET FILTERS
========================================================= */

function resetFilters() {

    playClick();


    pageState.page = 1;

    pageState.result =
        null;

    pageState.hasBet =
        null;

    pageState.cashoutType =
        null;


    if (
        elements.resultFilter
    ) {
        elements.resultFilter.value =
            "";
    }


    if (
        elements.betFilter
    ) {
        elements.betFilter.value =
            "";
    }


    if (
        elements.cashoutFilter
    ) {
        elements.cashoutFilter.value =
            "";
    }


    renderHistoryList();
}


/* =========================================================
   HISTORY LIST
========================================================= */

function renderHistoryList() {

    const pageResult =
        getHistoryPage({
            page:
                pageState.page,

            pageSize:
                PAGE_CONFIG.PAGE_SIZE,

            result:
                pageState.result,

            hasBet:
                pageState.hasBet,

            cashoutType:
                pageState.cashoutType
        });


    /*
     getHistoryPage() can normalize the requested page if
     filtering reduced the page count.
    */

    pageState.page =
        pageResult.page;


    setText(
        elements.historyResultCount,
        formatCoins(
            pageResult.totalItems
        )
    );


    setText(
        elements.currentPageDisplay,
        pageResult.page
    );


    setText(
        elements.totalPagesDisplay,
        pageResult.totalPages
    );


    if (
        elements.previousPageButton
    ) {
        elements.previousPageButton.disabled =
            !pageResult.hasPrevious;
    }


    if (
        elements.nextPageButton
    ) {
        elements.nextPageButton.disabled =
            !pageResult.hasNext;
    }


    renderDesktopTable(
        pageResult.items
    );


    renderMobileCards(
        pageResult.items
    );
}


/* =========================================================
   DESKTOP TABLE
========================================================= */

function renderDesktopTable(
    items
) {

    if (
        !elements.historyTableBody
    ) {
        return;
    }


    elements.historyTableBody
        .replaceChildren();


    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        elements.historyTableBody
            .appendChild(
                createEmptyTableRow()
            );


        return;
    }


    const fragment =
        document.createDocumentFragment();


    for (
        const entry
        of items
    ) {

        const row =
            document.createElement(
                "tr"
            );


        /* -------------------------------------------------
           Round
        -------------------------------------------------- */

        const roundCell =
            document.createElement(
                "td"
            );


        const roundCode =
            document.createElement(
                "code"
            );


        roundCode.className =
            "history-round-id";


        roundCode.textContent =
            entry.roundId;


        roundCode.title =
            entry.roundId;


        roundCell.appendChild(
            roundCode
        );


        /* -------------------------------------------------
           Time
        -------------------------------------------------- */

        const timeCell =
            document.createElement(
                "td"
            );


        timeCell.textContent =
            formatHistoryDateTime(
                entry.recordedAt
            );


        /* -------------------------------------------------
           Crash
        -------------------------------------------------- */

        const crashCell =
            document.createElement(
                "td"
            );


        const crashValue =
            document.createElement(
                "strong"
            );


        crashValue.className =
            "history-crash-value";


        crashValue.classList.add(
            getCrashClass(
                entry.crashMultiplier
            )
        );


        crashValue.textContent =
            formatMultiplier(
                entry.crashMultiplier
            );


        crashCell.appendChild(
            crashValue
        );


        /* -------------------------------------------------
           Bet
        -------------------------------------------------- */

        const betCell =
            document.createElement(
                "td"
            );


        betCell.textContent =
            entry.betAmount > 0
                ? formatCoins(
                    entry.betAmount
                )
                : "—";


        /* -------------------------------------------------
           Cash Out
        -------------------------------------------------- */

        const cashoutCell =
            document.createElement(
                "td"
            );


        if (
            entry.cashoutMultiplier !==
            null
        ) {

            const value =
                document.createElement(
                    "strong"
                );


            value.className =
                "history-cashout-value";


            value.textContent =
                formatMultiplier(
                    entry.cashoutMultiplier
                );


            if (
                entry.automaticCashout
            ) {
                value.title =
                    "Auto Cash Out";
            }


            cashoutCell.appendChild(
                value
            );

        } else {

            cashoutCell.textContent =
                "—";
        }


        /* -------------------------------------------------
           Return
        -------------------------------------------------- */

        const returnCell =
            document.createElement(
                "td"
            );


        returnCell.textContent =
            entry.returned > 0
                ? formatCoins(
                    entry.returned
                )
                : "0";


        /* -------------------------------------------------
           Profit
        -------------------------------------------------- */

        const profitCell =
            document.createElement(
                "td"
            );


        const profitValue =
            document.createElement(
                "strong"
            );


        profitValue.className =
            "history-profit-value";


        profitValue.classList.add(
            getProfitClass(
                entry.profit
            )
        );


        profitValue.textContent =
            formatSignedNumber(
                entry.profit
            );


        profitCell.appendChild(
            profitValue
        );


        /* -------------------------------------------------
           Result
        -------------------------------------------------- */

        const resultCell =
            document.createElement(
                "td"
            );


        resultCell.appendChild(
            createResultBadge(
                entry.result
            )
        );


        /* -------------------------------------------------
           Detail
        -------------------------------------------------- */

        const detailCell =
            document.createElement(
                "td"
            );


        const detailButton =
            createDetailButton(
                entry.roundId
            );


        detailCell.appendChild(
            detailButton
        );


        /* -------------------------------------------------
           Row assembly
        -------------------------------------------------- */

        row.append(
            roundCell,
            timeCell,
            crashCell,
            betCell,
            cashoutCell,
            returnCell,
            profitCell,
            resultCell,
            detailCell
        );


        fragment.appendChild(
            row
        );
    }


    elements.historyTableBody
        .appendChild(
            fragment
        );
}


/* =========================================================
   EMPTY TABLE
========================================================= */

function createEmptyTableRow() {

    const row =
        document.createElement(
            "tr"
        );


    row.className =
        "history-empty-row";


    const cell =
        document.createElement(
            "td"
        );


    cell.colSpan = 9;


    const container =
        document.createElement(
            "div"
        );


    container.className =
        "history-empty-state";


    const icon =
        document.createElement(
            "img"
        );


    icon.src =
        "./assets/icons/history.svg";


    icon.alt = "";


    icon.setAttribute(
        "aria-hidden",
        "true"
    );


    const title =
        document.createElement(
            "strong"
        );


    title.textContent =
        "沒有符合條件的紀錄";


    const description =
        document.createElement(
            "span"
        );


    description.textContent =
        "調整篩選條件，或完成更多飛行後再查看。";


    container.append(
        icon,
        title,
        description
    );


    cell.appendChild(
        container
    );


    row.appendChild(
        cell
    );


    return row;
}


/* =========================================================
   MOBILE CARDS
========================================================= */

function renderMobileCards(
    items
) {

    if (
        !elements.historyCardList
    ) {
        return;
    }


    elements.historyCardList
        .replaceChildren();


    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "history-empty-state";


        const title =
            document.createElement(
                "strong"
            );


        title.textContent =
            "沒有符合條件的紀錄";


        const description =
            document.createElement(
                "span"
            );


        description.textContent =
            "調整篩選條件，或完成更多飛行後再查看。";


        empty.append(
            title,
            description
        );


        elements.historyCardList
            .appendChild(
                empty
            );


        return;
    }


    const fragment =
        document.createDocumentFragment();


    for (
        const entry
        of items
    ) {

        fragment.appendChild(
            createHistoryCard(
                entry
            )
        );
    }


    elements.historyCardList
        .appendChild(
            fragment
        );
}


/* =========================================================
   CREATE MOBILE CARD
========================================================= */

function createHistoryCard(
    entry
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "history-card";


    /* -----------------------------------------------------
       Header
    ----------------------------------------------------- */

    const header =
        document.createElement(
            "div"
        );


    header.className =
        "history-card-header";


    const round =
        document.createElement(
            "div"
        );


    round.className =
        "history-card-round";


    const roundLabel =
        document.createElement(
            "span"
        );


    roundLabel.textContent =
        "ROUND";


    const roundCode =
        document.createElement(
            "code"
        );


    roundCode.textContent =
        entry.roundId;


    roundCode.title =
        entry.roundId;


    round.append(
        roundLabel,
        roundCode
    );


    const badge =
        createResultBadge(
            entry.result
        );


    header.append(
        round,
        badge
    );


    /* -----------------------------------------------------
       Grid
    ----------------------------------------------------- */

    const grid =
        document.createElement(
            "div"
        );


    grid.className =
        "history-card-grid";


    grid.append(
        createCardItem(
            "TIME",
            formatHistoryDateTime(
                entry.recordedAt
            )
        ),

        createCardItem(
            "CRASH",
            formatMultiplier(
                entry.crashMultiplier
            ),
            getCrashClass(
                entry.crashMultiplier
            )
        ),

        createCardItem(
            "BET",
            entry.betAmount > 0
                ? formatCoins(
                    entry.betAmount
                )
                : "—"
        ),

        createCardItem(
            "CASH OUT",
            entry.cashoutMultiplier !==
                null
                ? formatMultiplier(
                    entry.cashoutMultiplier
                )
                : "—"
        ),

        createCardItem(
            "RETURN",
            formatCoins(
                entry.returned
            )
        ),

        createCardItem(
            "PROFIT",
            formatSignedNumber(
                entry.profit
            ),
            getProfitClass(
                entry.profit
            )
        )
    );


    /* -----------------------------------------------------
       Footer
    ----------------------------------------------------- */

    const footer =
        document.createElement(
            "div"
        );


    footer.className =
        "history-card-footer";


    const cashoutType =
        document.createElement(
            "span"
        );


    cashoutType.className =
        "history-card-cashout-type";


    if (
        entry.cashoutMultiplier ===
        null
    ) {

        cashoutType.textContent =
            "NO CASH OUT";

    } else {

        cashoutType.textContent =
            entry.automaticCashout
                ? "AUTO CASH OUT"
                : "MANUAL CASH OUT";
    }


    footer.append(
        cashoutType,
        createDetailButton(
            entry.roundId
        )
    );


    card.append(
        header,
        grid,
        footer
    );


    return card;
}


/* =========================================================
   CARD ITEM
========================================================= */

function createCardItem(
    label,
    value,
    modifierClass = null
) {

    const item =
        document.createElement(
            "div"
        );


    item.className =
        "history-card-item";


    const labelElement =
        document.createElement(
            "span"
        );


    labelElement.textContent =
        label;


    const valueElement =
        document.createElement(
            "strong"
        );


    valueElement.textContent =
        value;


    if (
        modifierClass
    ) {
        valueElement.classList.add(
            modifierClass
        );
    }


    item.append(
        labelElement,
        valueElement
    );


    return item;
}


/* =========================================================
   RESULT BADGE
========================================================= */

function createResultBadge(
    result
) {

    const badge =
        document.createElement(
            "span"
        );


    badge.className =
        "history-result-badge";


    switch (result) {

        case "WIN":

            badge.classList.add(
                "is-win"
            );


            badge.textContent =
                "WIN";


            break;


        case "LOSS":

            badge.classList.add(
                "is-loss"
            );


            badge.textContent =
                "LOSS";


            break;


        case "REFUND":

            badge.classList.add(
                "is-refund"
            );


            badge.textContent =
                "REFUND";


            break;


        case "NO_BET":

            badge.classList.add(
                "is-no-bet"
            );


            badge.textContent =
                "NO BET";


            break;


        default:

            badge.textContent =
                "—";
    }


    return badge;
}


/* =========================================================
   DETAIL BUTTON
========================================================= */

function createDetailButton(
    roundId
) {

    const button =
        document.createElement(
            "button"
        );


    button.className =
        "history-detail-button";


    button.type =
        "button";


    button.dataset.roundId =
        roundId;


    button.textContent =
        "DETAIL";


    button.setAttribute(
        "aria-label",
        `查看單局 ${roundId} 詳細資料`
    );


    return button;
}


/* =========================================================
   DETAIL CLICK
========================================================= */

function handleHistoryDetailClick(
    event
) {

    const button =
        event.target.closest(
            ".history-detail-button"
        );


    if (!button) {
        return;
    }


    const roundId =
        button.dataset.roundId;


    if (!roundId) {
        return;
    }


    playClick();


    pageState.lastFocusedElement =
        button;


    openRoundDetailModal(
        roundId
    );
}


/* =========================================================
   OPEN ROUND DETAIL
========================================================= */

function openRoundDetailModal(
    roundId
) {

    const detail =
        getPlayerRoundDetail(
            roundId
        );


    if (!detail) {
        return;
    }


    renderRoundDetail(
        detail
    );


    showElement(
        elements.roundDetailModal
    );


    document.body.style.overflow =
        "hidden";


    requestAnimationFrame(
        () => {

            elements
                .closeRoundDetailButton
                ?.focus();
        }
    );
}


/* =========================================================
   CLOSE ROUND DETAIL
========================================================= */

function closeRoundDetailModal() {

    playClick();


    hideElement(
        elements.roundDetailModal
    );


    document.body.style.overflow =
        "";


    pageState
        .lastFocusedElement
        ?.focus();


    pageState.lastFocusedElement =
        null;
}


/* =========================================================
   RENDER ROUND DETAIL
========================================================= */

function renderRoundDetail(
    detail
) {

    const resultContainer =
        document.querySelector(
            ".round-detail-result"
        );


    resultContainer
        ?.classList
        .remove(
            "is-win",
            "is-loss",
            "is-refund"
        );


    switch (detail.result) {

        case "WIN":

            resultContainer
                ?.classList
                .add(
                    "is-win"
                );

            break;


        case "LOSS":

            resultContainer
                ?.classList
                .add(
                    "is-loss"
                );

            break;


        case "REFUND":

            resultContainer
                ?.classList
                .add(
                    "is-refund"
                );

            break;


        default:
            break;
    }


    setText(
        elements.detailResult,
        getResultLabel(
            detail.result
        )
    );


    setText(
        elements.detailCrashMultiplier,
        formatMultiplier(
            detail.crashMultiplier
        )
    );


    setText(
        elements.detailRoundId,
        detail.roundId
    );


    setText(
        elements.detailRecordedAt,
        formatHistoryDateTime(
            detail.recordedAt
        )
    );


    setText(
        elements.detailFlightDuration,
        formatDuration(
            detail.timing
                .flightElapsedMs
        )
    );


    setText(
        elements.detailBetStatus,
        detail.bet.status ??
        "—"
    );


    setText(
        elements.detailBetAmount,
        formatCoins(
            detail.bet.amount
        )
    );


    setText(
        elements.detailBetPlacedAt,
        detail.bet.placedAt
            ? formatHistoryDateTime(
                detail.bet.placedAt
            )
            : "—"
    );


    setText(
        elements.detailAutoEnabled,
        detail.autoCashout.enabled
            ? "YES"
            : "NO"
    );


    setText(
        elements.detailAutoTarget,

        detail.autoCashout
            .targetMultiplier !==
        null
            ? formatMultiplier(
                detail.autoCashout
                    .targetMultiplier
            )
            : "—"
    );


    setText(
        elements.detailCashoutType,
        getCashoutTypeLabel(
            detail
        )
    );


    setText(
        elements.detailCashoutMultiplier,

        detail.cashout.completed &&
        detail.cashout.multiplier !==
            null
            ? formatMultiplier(
                detail.cashout
                    .multiplier
            )
            : "—"
    );


    setText(
        elements.detailCashoutAmount,
        formatCoins(
            detail.cashout.amount
        )
    );


    setText(
        elements.detailWagered,
        formatCoins(
            detail.financial
                .wagered
        )
    );


    setText(
        elements.detailReturned,
        formatCoins(
            detail.financial
                .returned
        )
    );


    setText(
        elements.detailProfit,
        formatSignedNumber(
            detail.financial
                .profit
        )
    );


    const financialCards =
        document.querySelectorAll(
            ".round-financial-card"
        );


    financialCards.forEach(
        (card) => {

            card.classList.remove(
                "is-positive",
                "is-negative"
            );
        }
    );


    const profitCard =
        elements.detailProfit
            ?.closest(
                ".round-financial-card"
            );


    if (
        detail.financial.profit >
        0
    ) {

        profitCard
            ?.classList
            .add(
                "is-positive"
            );

    } else if (
        detail.financial.profit <
        0
    ) {

        profitCard
            ?.classList
            .add(
                "is-negative"
            );
    }
}


/* =========================================================
   PAGINATION
========================================================= */

function goToPreviousPage() {

    if (
        pageState.page <= 1
    ) {
        return;
    }


    playClick();


    pageState.page -= 1;


    renderHistoryList();

    scrollToHistoryList();
}


function goToNextPage() {

    playClick();


    pageState.page += 1;


    renderHistoryList();

    scrollToHistoryList();
}


/* =========================================================
   SCROLL HISTORY INTO VIEW
========================================================= */

function scrollToHistoryList() {

    document.querySelector(
        ".history-list-section"
    )?.scrollIntoView({
        behavior:
            prefersReducedMotion()
                ? "auto"
                : "smooth",

        block:
            "start"
    });
}


/* =========================================================
   SETTINGS MODAL
========================================================= */

function openSettingsModal() {

    playClick();


    showElement(
        elements.settingsModal
    );


    requestAnimationFrame(
        () => {

            elements
                .closeSettingsButton
                ?.focus();
        }
    );
}


function closeSettingsModal() {

    playClick();


    hideElement(
        elements.settingsModal
    );


    elements.settingsButton
        ?.focus();
}


/* =========================================================
   SETTINGS UI
========================================================= */

function updateSettingsUI() {

    const settings =
        getSettings();


    if (
        elements.soundToggleIcon
    ) {

        elements.soundToggleIcon.src =
            settings.soundEnabled
                ? ICONS.soundOn
                : ICONS.soundOff;
    }


    if (
        elements.musicToggleIcon
    ) {

        elements.musicToggleIcon.src =
            settings.musicEnabled
                ? ICONS.musicOn
                : ICONS.musicOff;
    }


    elements.soundToggleButton
        ?.setAttribute(
            "aria-label",

            settings.soundEnabled
                ? "關閉音效"
                : "開啟音效"
        );


    elements.musicToggleButton
        ?.setAttribute(
            "aria-label",

            settings.musicEnabled
                ? "關閉背景音樂"
                : "開啟背景音樂"
        );


    setText(
        elements.settingsSoundToggle,

        settings.soundEnabled
            ? "ON"
            : "OFF"
    );


    setText(
        elements.settingsMusicToggle,

        settings.musicEnabled
            ? "ON"
            : "OFF"
    );


    elements.settingsSoundToggle
        ?.setAttribute(
            "aria-pressed",
            String(
                settings.soundEnabled
            )
        );


    elements.settingsMusicToggle
        ?.setAttribute(
            "aria-pressed",
            String(
                settings.musicEnabled
            )
        );
}


/* =========================================================
   KEYBOARD
========================================================= */

function handleKeydown(
    event
) {

    if (
        event.key !==
        "Escape"
    ) {
        return;
    }


    if (
        isVisible(
            elements.roundDetailModal
        )
    ) {

        closeRoundDetailModal();

        return;
    }


    if (
        isVisible(
            elements.settingsModal
        )
    ) {

        closeSettingsModal();
    }
}


/* =========================================================
   RESULT LABEL
========================================================= */

function getResultLabel(
    result
) {

    switch (result) {

        case "WIN":
            return "WIN";

        case "LOSS":
            return "LOSS";

        case "REFUND":
            return "REFUND";

        case "NO_BET":
            return "NO BET";

        default:
            return "—";
    }
}


/* =========================================================
   CASHOUT TYPE LABEL
========================================================= */

function getCashoutTypeLabel(
    detail
) {

    if (
        !detail.cashout.completed
    ) {
        return "NONE";
    }


    return detail.cashout.automatic
        ? "AUTO"
        : "MANUAL";
}


/* =========================================================
   CRASH CLASS
========================================================= */

function getCrashClass(
    multiplier
) {

    const value =
        Number(multiplier);


    if (
        !Number.isFinite(
            value
        )
    ) {
        return "is-low";
    }


    if (
        value < 2
    ) {
        return "is-low";
    }


    if (
        value < 5
    ) {
        return "is-mid";
    }


    return "is-high";
}


/* =========================================================
   PROFIT CLASS
========================================================= */

function getProfitClass(
    profit
) {

    const value =
        Number(profit);


    if (
        value > 0
    ) {
        return "is-positive";
    }


    if (
        value < 0
    ) {
        return "is-negative";
    }


    return "is-neutral";
}


/* =========================================================
   FORMAT HISTORY DATE
========================================================= */

function formatHistoryDateTime(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {
        return "—";
    }


    return formatDateTime(
        value,
        {
            includeSeconds:
                true
        }
    );
}


/* =========================================================
   VISIBLE CHECK
========================================================= */

function isVisible(
    element
) {

    if (!element) {
        return false;
    }


    return (
        !element.hidden &&
        !element.classList.contains(
            "is-hidden"
        )
    );
}


/* =========================================================
   REDUCED MOTION
========================================================= */

function prefersReducedMotion() {

    if (
        typeof window.matchMedia !==
        "function"
    ) {
        return false;
    }


    return window
        .matchMedia(
            "(prefers-reduced-motion: reduce)"
        )
        .matches;
}


/* =========================================================
   PAGE HIDE
========================================================= */

window.addEventListener(
    "pagehide",
    () => {

        pauseBgm();
    }
);


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        init,
        {
            once: true
        }
    );

} else {

    init();
}
