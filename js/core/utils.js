/* =========================================================
   CG FLIGHT
   js/core/utils.js

   Stateless utility helpers.

   Responsibilities:
   - Number helpers
   - Clamp / round helpers
   - Random helpers
   - Formatting
   - Delay / timing helpers
   - Safe DOM helpers
   - ID generation
   - Object / value helpers

   IMPORTANT:
   This module contains no game rules and no persistence.
========================================================= */


/* =========================================================
   NUMBER VALIDATION
========================================================= */

function isFiniteNumber(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}


function isPositiveNumber(value) {
    return (
        isFiniteNumber(value) &&
        value > 0
    );
}


function isNonNegativeNumber(value) {
    return (
        isFiniteNumber(value) &&
        value >= 0
    );
}


/* =========================================================
   CLAMP
========================================================= */

function clamp(
    value,
    min,
    max
) {
    if (!isFiniteNumber(value)) {
        return min;
    }

    if (!isFiniteNumber(min)) {
        min = 0;
    }

    if (!isFiniteNumber(max)) {
        max = min;
    }

    if (min > max) {
        [min, max] =
            [max, min];
    }

    return Math.min(
        max,
        Math.max(
            min,
            value
        )
    );
}


/* =========================================================
   ROUND
========================================================= */

function roundTo(
    value,
    decimals = 2
) {
    if (!isFiniteNumber(value)) {
        return 0;
    }

    const safeDecimals =
        Number.isInteger(decimals)
            ? clamp(decimals, 0, 10)
            : 2;

    const factor =
        10 ** safeDecimals;

    return (
        Math.round(
            (
                value +
                Number.EPSILON
            ) * factor
        ) / factor
    );
}


/* =========================================================
   FLOOR
========================================================= */

function floorTo(
    value,
    decimals = 2
) {
    if (!isFiniteNumber(value)) {
        return 0;
    }

    const safeDecimals =
        Number.isInteger(decimals)
            ? clamp(decimals, 0, 10)
            : 2;

    const factor =
        10 ** safeDecimals;

    return (
        Math.floor(
            value * factor
        ) / factor
    );
}


/* =========================================================
   CEIL
========================================================= */

function ceilTo(
    value,
    decimals = 2
) {
    if (!isFiniteNumber(value)) {
        return 0;
    }

    const safeDecimals =
        Number.isInteger(decimals)
            ? clamp(decimals, 0, 10)
            : 2;

    const factor =
        10 ** safeDecimals;

    return (
        Math.ceil(
            value * factor
        ) / factor
    );
}


/* =========================================================
   INTEGER CONVERSION
========================================================= */

function toSafeInteger(
    value,
    fallback = 0
) {
    const number =
        Number(value);

    if (
        !Number.isFinite(number)
    ) {
        return fallback;
    }

    return Math.trunc(number);
}


/* =========================================================
   RANDOM INTEGER

   Inclusive min and max.
========================================================= */

function randomInt(
    min,
    max
) {
    let safeMin =
        Math.ceil(
            Number(min)
        );

    let safeMax =
        Math.floor(
            Number(max)
        );

    if (
        !Number.isFinite(safeMin) ||
        !Number.isFinite(safeMax)
    ) {
        return 0;
    }

    if (safeMin > safeMax) {
        [safeMin, safeMax] =
            [safeMax, safeMin];
    }

    return (
        Math.floor(
            Math.random() *
            (
                safeMax -
                safeMin +
                1
            )
        ) +
        safeMin
    );
}


/* =========================================================
   RANDOM FLOAT
========================================================= */

function randomFloat(
    min,
    max
) {
    let safeMin =
        Number(min);

    let safeMax =
        Number(max);

    if (
        !Number.isFinite(safeMin) ||
        !Number.isFinite(safeMax)
    ) {
        return 0;
    }

    if (safeMin > safeMax) {
        [safeMin, safeMax] =
            [safeMax, safeMin];
    }

    return (
        Math.random() *
        (
            safeMax -
            safeMin
        ) +
        safeMin
    );
}


/* =========================================================
   RANDOM BOOLEAN
========================================================= */

function randomBoolean(
    probability = 0.5
) {
    const safeProbability =
        clamp(
            Number(probability),
            0,
            1
        );

    return (
        Math.random() <
        safeProbability
    );
}


/* =========================================================
   RANDOM ARRAY ITEM
========================================================= */

function randomItem(array) {
    if (
        !Array.isArray(array) ||
        array.length === 0
    ) {
        return undefined;
    }

    return array[
        randomInt(
            0,
            array.length - 1
        )
    ];
}


/* =========================================================
   SHUFFLE

   Returns a new array.
========================================================= */

function shuffleArray(array) {
    if (!Array.isArray(array)) {
        return [];
    }

    const copy = [...array];

    for (
        let i = copy.length - 1;
        i > 0;
        i -= 1
    ) {
        const j =
            randomInt(
                0,
                i
            );

        [
            copy[i],
            copy[j]
        ] = [
            copy[j],
            copy[i]
        ];
    }

    return copy;
}


/* =========================================================
   FORMAT COINS
========================================================= */

function formatCoins(
    amount,
    {
        maximumFractionDigits = 2
    } = {}
) {
    const number =
        Number(amount);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits:
                clamp(
                    maximumFractionDigits,
                    0,
                    10
                )
        }
    );
}


/* =========================================================
   FORMAT MULTIPLIER
========================================================= */

function formatMultiplier(
    multiplier,
    decimals = 2
) {
    const value =
        Number(multiplier);

    if (
        !Number.isFinite(value) ||
        value < 0
    ) {
        return "0.00×";
    }

    const safeDecimals =
        Number.isInteger(decimals)
            ? clamp(
                decimals,
                0,
                6
            )
            : 2;

    return (
        value.toFixed(
            safeDecimals
        ) + "×"
    );
}


/* =========================================================
   FORMAT PERCENT
========================================================= */

function formatPercent(
    value,
    decimals = 1
) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "0%";
    }

    const safeDecimals =
        Number.isInteger(decimals)
            ? clamp(
                decimals,
                0,
                6
            )
            : 1;

    return (
        number.toFixed(
            safeDecimals
        ) + "%"
    );
}


/* =========================================================
   FORMAT SIGNED NUMBER
========================================================= */

function formatSignedNumber(
    value,
    {
        maximumFractionDigits = 2
    } = {}
) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    const formatted =
        formatCoins(
            Math.abs(number),
            {
                maximumFractionDigits
            }
        );

    if (number > 0) {
        return `+${formatted}`;
    }

    if (number < 0) {
        return `-${formatted}`;
    }

    return formatted;
}


/* =========================================================
   FORMAT DATE/TIME

   Uses the user's local browser time.
========================================================= */

function formatDateTime(
    value,
    {
        includeSeconds = false
    } = {}
) {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return date.toLocaleString(
        "zh-TW",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",

            ...(includeSeconds
                ? {
                    second: "2-digit"
                }
                : {})
        }
    );
}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatDate(value) {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return date.toLocaleDateString(
        "zh-TW",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    );
}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTime(
    value,
    {
        includeSeconds = false
    } = {}
) {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return date.toLocaleTimeString(
        "zh-TW",
        {
            hour: "2-digit",
            minute: "2-digit",

            ...(includeSeconds
                ? {
                    second: "2-digit"
                }
                : {})
        }
    );
}


/* =========================================================
   DURATION
========================================================= */

function formatDuration(
    milliseconds
) {
    const ms =
        Number(milliseconds);

    if (
        !Number.isFinite(ms) ||
        ms < 0
    ) {
        return "00:00";
    }

    const totalSeconds =
        Math.floor(
            ms / 1000
        );

    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const seconds =
        totalSeconds % 60;

    return [
        String(minutes)
            .padStart(
                2,
                "0"
            ),

        String(seconds)
            .padStart(
                2,
                "0"
            )
    ].join(":");
}


/* =========================================================
   SLEEP
========================================================= */

function sleep(milliseconds) {
    const ms =
        Math.max(
            0,
            Number(milliseconds) || 0
        );

    return new Promise(
        (resolve) => {
            setTimeout(
                resolve,
                ms
            );
        }
    );
}


/* =========================================================
   NEXT ANIMATION FRAME
========================================================= */

function nextFrame() {
    return new Promise(
        (resolve) => {
            requestAnimationFrame(
                resolve
            );
        }
    );
}


/* =========================================================
   TWO ANIMATION FRAMES

   Useful when waiting for layout/style changes to commit.
========================================================= */

async function nextPaint() {
    await nextFrame();
    await nextFrame();
}


/* =========================================================
   DEBOUNCE
========================================================= */

function debounce(
    callback,
    delay = 200
) {
    if (
        typeof callback !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] debounce requires a function."
        );
    }

    let timeoutId = null;

    return function debounced(
        ...args
    ) {
        const context = this;

        if (timeoutId !== null) {
            clearTimeout(
                timeoutId
            );
        }

        timeoutId =
            setTimeout(
                () => {
                    timeoutId = null;

                    callback.apply(
                        context,
                        args
                    );
                },
                Math.max(
                    0,
                    Number(delay) || 0
                )
            );
    };
}


/* =========================================================
   THROTTLE
========================================================= */

function throttle(
    callback,
    interval = 100
) {
    if (
        typeof callback !==
        "function"
    ) {
        throw new TypeError(
            "[CG Flight] throttle requires a function."
        );
    }

    let lastRun = 0;
    let trailingTimer = null;

    return function throttled(
        ...args
    ) {
        const now =
            Date.now();

        const remaining =
            interval -
            (
                now -
                lastRun
            );

        const context = this;

        if (remaining <= 0) {
            if (
                trailingTimer !==
                null
            ) {
                clearTimeout(
                    trailingTimer
                );

                trailingTimer = null;
            }

            lastRun = now;

            callback.apply(
                context,
                args
            );

            return;
        }

        if (
            trailingTimer ===
            null
        ) {
            trailingTimer =
                setTimeout(
                    () => {
                        trailingTimer = null;

                        lastRun =
                            Date.now();

                        callback.apply(
                            context,
                            args
                        );
                    },
                    remaining
                );
        }
    };
}


/* =========================================================
   UNIQUE ID
========================================================= */

function createId(
    prefix = "id"
) {
    const safePrefix =
        typeof prefix === "string" &&
        prefix.length > 0
            ? prefix
            : "id";

    if (
        typeof crypto !==
            "undefined" &&
        typeof crypto.randomUUID ===
            "function"
    ) {
        return (
            `${safePrefix}-` +
            crypto.randomUUID()
        );
    }

    return [
        safePrefix,
        Date.now(),
        Math.random()
            .toString(36)
            .slice(2, 10)
    ].join("-");
}


/* =========================================================
   SAFE JSON CLONE
========================================================= */

function clone(value) {
    if (
        typeof structuredClone ===
        "function"
    ) {
        return structuredClone(
            value
        );
    }

    return JSON.parse(
        JSON.stringify(value)
    );
}


/* =========================================================
   PLAIN OBJECT
========================================================= */

function isPlainObject(value) {
    if (
        value === null ||
        typeof value !== "object"
    ) {
        return false;
    }

    if (Array.isArray(value)) {
        return false;
    }

    const prototype =
        Object.getPrototypeOf(
            value
        );

    return (
        prototype ===
            Object.prototype ||
        prototype === null
    );
}


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
    value,
    fallback = ""
) {
    if (
        value === null ||
        value === undefined
    ) {
        return fallback;
    }

    return String(value);
}


/* =========================================================
   NON-EMPTY STRING
========================================================= */

function isNonEmptyString(
    value
) {
    return (
        typeof value === "string" &&
        value.trim().length > 0
    );
}


/* =========================================================
   DOM QUERY
========================================================= */

function query(
    selector,
    root = document
) {
    if (
        typeof selector !==
        "string"
    ) {
        return null;
    }

    try {
        return root.querySelector(
            selector
        );
    } catch {
        return null;
    }
}


/* =========================================================
   DOM QUERY ALL
========================================================= */

function queryAll(
    selector,
    root = document
) {
    if (
        typeof selector !==
        "string"
    ) {
        return [];
    }

    try {
        return [
            ...root.querySelectorAll(
                selector
            )
        ];
    } catch {
        return [];
    }
}


/* =========================================================
   SET TEXT
========================================================= */

function setText(
    element,
    value
) {
    if (!element) {
        return false;
    }

    element.textContent =
        safeString(value);

    return true;
}


/* =========================================================
   SET HIDDEN
========================================================= */

function setHidden(
    element,
    hidden
) {
    if (!element) {
        return false;
    }

    const shouldHide =
        Boolean(hidden);

    element.hidden =
        shouldHide;

    element.classList.toggle(
        "is-hidden",
        shouldHide
    );

    element.setAttribute(
        "aria-hidden",
        String(shouldHide)
    );

    return true;
}


/* =========================================================
   SHOW ELEMENT
========================================================= */

function showElement(element) {
    return setHidden(
        element,
        false
    );
}


/* =========================================================
   HIDE ELEMENT
========================================================= */

function hideElement(element) {
    return setHidden(
        element,
        true
    );
}


/* =========================================================
   DISABLE ELEMENT
========================================================= */

function setDisabled(
    element,
    disabled
) {
    if (!element) {
        return false;
    }

    element.disabled =
        Boolean(disabled);

    element.setAttribute(
        "aria-disabled",
        String(
            Boolean(disabled)
        )
    );

    return true;
}


/* =========================================================
   SAFE FOCUS
========================================================= */

function focusElement(
    element
) {
    if (
        !element ||
        typeof element.focus !==
            "function"
    ) {
        return false;
    }

    try {
        element.focus();

        return true;
    } catch {
        return false;
    }
}


/* =========================================================
   ESCAPE HTML

   Useful if future modules need to construct safe strings.
   Prefer textContent whenever possible.
========================================================= */

function escapeHtml(value) {
    return safeString(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    isFiniteNumber,
    isPositiveNumber,
    isNonNegativeNumber,

    clamp,
    roundTo,
    floorTo,
    ceilTo,
    toSafeInteger,

    randomInt,
    randomFloat,
    randomBoolean,
    randomItem,
    shuffleArray,

    formatCoins,
    formatMultiplier,
    formatPercent,
    formatSignedNumber,
    formatDateTime,
    formatDate,
    formatTime,
    formatDuration,

    sleep,
    nextFrame,
    nextPaint,

    debounce,
    throttle,

    createId,

    clone,
    isPlainObject,
    safeString,
    isNonEmptyString,

    query,
    queryAll,
    setText,
    setHidden,
    showElement,
    hideElement,
    setDisabled,
    focusElement,

    escapeHtml
};
