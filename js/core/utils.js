/* =========================================================
   CG FLIGHT
   js/core/utils.js

   Shared utility layer.

   Responsibilities:
   - Numeric validation / normalization
   - Number formatting
   - Multiplier formatting
   - Date / time formatting
   - Duration formatting
   - Safe object cloning
   - DOM visibility helpers
   - DOM text / disabled helpers
   - Generic value clamping

   IMPORTANT:
   This module must remain:
   - stateless
   - side-effect free where possible
   - independent from game modules
========================================================= */


/* =========================================================
   NUMBER VALIDATION
========================================================= */

/**
 * Returns true only for a real finite number.
 *
 * Examples:
 *   isFiniteNumber(10)       -> true
 *   isFiniteNumber(1.5)      -> true
 *   isFiniteNumber(NaN)      -> false
 *   isFiniteNumber(Infinity) -> false
 *   isFiniteNumber("10")     -> false
 */
function isFiniteNumber(
    value
) {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}


/* =========================================================
   NUMERIC CONVERSION
========================================================= */

/**
 * Converts value to a finite number.
 * Returns fallback when conversion fails.
 */
function toFiniteNumber(
    value,
    fallback = 0
) {
    const numeric =
        Number(value);


    return Number.isFinite(
        numeric
    )
        ? numeric
        : fallback;
}


/* =========================================================
   INTEGER CONVERSION
========================================================= */

/**
 * Converts value into an integer.
 */
function toInteger(
    value,
    fallback = 0
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return fallback;
    }


    return Math.trunc(
        numeric
    );
}


/* =========================================================
   CLAMP
========================================================= */

/**
 * Restricts a value to the inclusive [min, max] range.
 */
function clamp(
    value,
    min,
    max
) {
    const numeric =
        Number(value);


    const minimum =
        Number(min);


    const maximum =
        Number(max);


    if (
        !Number.isFinite(
            numeric
        ) ||
        !Number.isFinite(
            minimum
        ) ||
        !Number.isFinite(
            maximum
        )
    ) {
        return numeric;
    }


    /*
     Handle reversed arguments safely.
    */

    const lower =
        Math.min(
            minimum,
            maximum
        );


    const upper =
        Math.max(
            minimum,
            maximum
        );


    return Math.min(
        upper,
        Math.max(
            lower,
            numeric
        )
    );
}


/* =========================================================
   ROUND
========================================================= */

/**
 * Rounds a number to a given number of decimal places.
 *
 * Uses Number.EPSILON to reduce common floating point cases:
 *
 *   1.005 -> 1.01
 */
function roundTo(
    value,
    decimals = 2
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return 0;
    }


    const safeDecimals =
        clamp(
            Math.trunc(
                Number(decimals) || 0
            ),
            0,
            12
        );


    const factor =
        10 **
        safeDecimals;


    return (
        Math.round(
            (
                numeric +
                Number.EPSILON
            ) *
            factor
        ) /
        factor
    );
}


/* =========================================================
   FLOOR TO DECIMALS
========================================================= */

/**
 * Floors a number without rounding upward.
 *
 * Useful if gameplay ever needs conservative numeric
 * truncation.
 */
function floorTo(
    value,
    decimals = 2
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return 0;
    }


    const safeDecimals =
        clamp(
            Math.trunc(
                Number(decimals) || 0
            ),
            0,
            12
        );


    const factor =
        10 **
        safeDecimals;


    return (
        Math.floor(
            numeric *
            factor
        ) /
        factor
    );
}


/* =========================================================
   RANDOM NUMBER
========================================================= */

/**
 * Inclusive min, exclusive max floating point random number.
 */
function randomBetween(
    min,
    max
) {
    const minimum =
        Number(min);


    const maximum =
        Number(max);


    if (
        !Number.isFinite(
            minimum
        ) ||
        !Number.isFinite(
            maximum
        )
    ) {
        return 0;
    }


    const lower =
        Math.min(
            minimum,
            maximum
        );


    const upper =
        Math.max(
            minimum,
            maximum
        );


    if (
        lower === upper
    ) {
        return lower;
    }


    return (
        lower +
        Math.random() *
        (
            upper -
            lower
        )
    );
}


/* =========================================================
   RANDOM INTEGER
========================================================= */

/**
 * Inclusive integer random range.
 */
function randomInteger(
    min,
    max
) {
    const minimum =
        Math.ceil(
            Number(min)
        );


    const maximum =
        Math.floor(
            Number(max)
        );


    if (
        !Number.isFinite(
            minimum
        ) ||
        !Number.isFinite(
            maximum
        )
    ) {
        return 0;
    }


    const lower =
        Math.min(
            minimum,
            maximum
        );


    const upper =
        Math.max(
            minimum,
            maximum
        );


    return (
        Math.floor(
            Math.random() *
            (
                upper -
                lower +
                1
            )
        ) +
        lower
    );
}


/* =========================================================
   SAFE CLONE
========================================================= */

/**
 * Creates a deep clone of common game data.
 *
 * structuredClone is preferred because it safely handles
 * more data types than JSON serialization.
 *
 * JSON fallback is sufficient for the plain object data
 * currently stored by CG Flight.
 */
function clone(
    value
) {
    if (
        value === undefined
    ) {
        return undefined;
    }


    if (
        value === null
    ) {
        return null;
    }


    if (
        typeof structuredClone ===
        "function"
    ) {
        try {
            return structuredClone(
                value
            );
        } catch (error) {
            /*
             Fall through to JSON/plain fallback.
            */
        }
    }


    try {
        return JSON.parse(
            JSON.stringify(
                value
            )
        );
    } catch (error) {

        /*
         Primitive values can safely be returned directly.
        */

        if (
            typeof value !==
            "object"
        ) {
            return value;
        }


        console.warn(
            "[CG Flight] Unable to clone value:",
            error
        );


        return value;
    }
}


/* =========================================================
   PLAIN OBJECT CHECK
========================================================= */

function isPlainObject(
    value
) {
    if (
        value === null ||
        typeof value !== "object"
    ) {
        return false;
    }


    const prototype =
        Object.getPrototypeOf(
            value
        );


    return (
        prototype ===
            Object.prototype ||
        prototype ===
            null
    );
}


/* =========================================================
   FORMAT GENERIC NUMBER
========================================================= */

/**
 * Locale-aware numeric formatter.
 */
function formatNumber(
    value,
    {
        minimumFractionDigits = 0,
        maximumFractionDigits = 2
    } = {}
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return "0";
    }


    return new Intl.NumberFormat(
        "en-US",
        {
            minimumFractionDigits,
            maximumFractionDigits
        }
    ).format(
        numeric
    );
}


/* =========================================================
   FORMAT COINS
========================================================= */

/**
 * Formats virtual coin amounts with thousand separators.
 *
 * Examples:
 *   1000     -> "1,000"
 *   1234.5   -> "1,234.5"
 *   1234.56  -> "1,234.56"
 */
function formatCoins(
    value
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return "0";
    }


    const rounded =
        roundTo(
            numeric,
            2
        );


    return new Intl.NumberFormat(
        "en-US",
        {
            minimumFractionDigits:
                Number.isInteger(
                    rounded
                )
                    ? 0
                    : 0,

            maximumFractionDigits:
                2
        }
    ).format(
        rounded
    );
}


/* =========================================================
   FORMAT MULTIPLIER
========================================================= */

/**
 * Always renders multiplier with two decimals.
 *
 * Examples:
 *   1       -> "1.00×"
 *   2.5     -> "2.50×"
 *   13.127  -> "13.13×"
 */
function formatMultiplier(
    value,
    decimals = 2
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return "0.00×";
    }


    const safeDecimals =
        clamp(
            Math.trunc(
                Number(decimals) || 2
            ),
            0,
            6
        );


    return (
        roundTo(
            numeric,
            safeDecimals
        ).toFixed(
            safeDecimals
        ) +
        "×"
    );
}


/* =========================================================
   FORMAT SIGNED NUMBER
========================================================= */

/**
 * Formats a number with explicit + sign for positive values.
 *
 * Examples:
 *   1500  -> "+1,500"
 *   -500  -> "-500"
 *   0     -> "0"
 */
function formatSignedNumber(
    value,
    {
        maximumFractionDigits = 2
    } = {}
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return "0";
    }


    const absolute =
        formatNumber(
            Math.abs(
                numeric
            ),
            {
                minimumFractionDigits: 0,
                maximumFractionDigits
            }
        );


    if (
        numeric > 0
    ) {
        return `+${absolute}`;
    }


    if (
        numeric < 0
    ) {
        return `-${absolute}`;
    }


    return "0";
}


/* =========================================================
   FORMAT PERCENT
========================================================= */

function formatPercent(
    value,
    decimals = 2
) {
    const numeric =
        Number(value);


    if (
        !Number.isFinite(
            numeric
        )
    ) {
        return "0.00%";
    }


    const safeDecimals =
        clamp(
            Math.trunc(
                Number(decimals) || 2
            ),
            0,
            6
        );


    return (
        roundTo(
            numeric,
            safeDecimals
        ).toFixed(
            safeDecimals
        ) +
        "%"
    );
}


/* =========================================================
   DATE PARSING
========================================================= */

function parseDateValue(
    value
) {
    if (
        value instanceof Date
    ) {

        return Number.isNaN(
            value.getTime()
        )
            ? null
            : new Date(
                value.getTime()
            );
    }


    if (
        typeof value === "number"
    ) {

        const date =
            new Date(
                value
            );


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;
    }


    if (
        typeof value === "string" &&
        value.trim().length > 0
    ) {

        const date =
            new Date(
                value
            );


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;
    }


    return null;
}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatDate(
    value,
    {
        locale = "zh-TW"
    } = {}
) {
    const date =
        parseDateValue(
            value
        );


    if (!date) {
        return "—";
    }


    return new Intl.DateTimeFormat(
        locale,
        {
            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit"
        }
    ).format(
        date
    );
}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTime(
    value,
    {
        locale = "zh-TW",
        includeSeconds = false
    } = {}
) {
    const date =
        parseDateValue(
            value
        );


    if (!date) {
        return "—";
    }


    const options = {

        hour:
            "2-digit",

        minute:
            "2-digit",

        hour12:
            false
    };


    if (
        includeSeconds
    ) {
        options.second =
            "2-digit";
    }


    return new Intl.DateTimeFormat(
        locale,
        options
    ).format(
        date
    );
}


/* =========================================================
   FORMAT DATE + TIME
========================================================= */

/**
 * Used heavily by History page.
 */
function formatDateTime(
    value,
    {
        locale = "zh-TW",
        includeSeconds = false
    } = {}
) {
    const date =
        parseDateValue(
            value
        );


    if (!date) {
        return "—";
    }


    const options = {

        year:
            "numeric",

        month:
            "2-digit",

        day:
            "2-digit",

        hour:
            "2-digit",

        minute:
            "2-digit",

        hour12:
            false
    };


    if (
        includeSeconds
    ) {
        options.second =
            "2-digit";
    }


    return new Intl.DateTimeFormat(
        locale,
        options
    ).format(
        date
    );
}


/* =========================================================
   FORMAT DURATION
========================================================= */

/**
 * Formats milliseconds into a compact readable duration.
 *
 * Examples:
 *   0       -> "0.00 s"
 *   1530    -> "1.53 s"
 *   65000   -> "1m 05s"
 *   3661000 -> "1h 01m 01s"
 */
function formatDuration(
    milliseconds
) {
    const numeric =
        Number(
            milliseconds
        );


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric < 0
    ) {
        return "—";
    }


    if (
        numeric <
        60000
    ) {

        const seconds =
            numeric /
            1000;


        return (
            `${roundTo(
                seconds,
                2
            ).toFixed(2)} s`
        );
    }


    const totalSeconds =
        Math.floor(
            numeric /
            1000
        );


    const hours =
        Math.floor(
            totalSeconds /
            3600
        );


    const minutes =
        Math.floor(
            (
                totalSeconds %
                3600
            ) /
            60
        );


    const seconds =
        totalSeconds %
        60;


    if (
        hours > 0
    ) {
        return (
            `${hours}h ` +
            `${String(
                minutes
            ).padStart(
                2,
                "0"
            )}m ` +
            `${String(
                seconds
            ).padStart(
                2,
                "0"
            )}s`
        );
    }


    return (
        `${minutes}m ` +
        `${String(
            seconds
        ).padStart(
            2,
            "0"
        )}s`
    );
}


/* =========================================================
   DATE KEY

   Produces a LOCAL calendar date key.

   Used by login/day tracking logic when needed.

   IMPORTANT:
   This intentionally does NOT use toISOString(), because
   UTC conversion can shift the local calendar day.
========================================================= */

function getLocalDateKey(
    value =
        new Date()
) {
    const date =
        parseDateValue(
            value
        );


    if (!date) {
        return null;
    }


    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() +
            1
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


    return (
        `${year}-${month}-${day}`
    );
}


/* =========================================================
   DAY DIFFERENCE

   Compares local calendar dates rather than raw 24-hour
   intervals, avoiding DST/time-of-day issues.
========================================================= */

function getCalendarDayDifference(
    from,
    to
) {
    const fromDate =
        parseDateValue(
            from
        );


    const toDate =
        parseDateValue(
            to
        );


    if (
        !fromDate ||
        !toDate
    ) {
        return null;
    }


    const fromUtc =
        Date.UTC(
            fromDate.getFullYear(),
            fromDate.getMonth(),
            fromDate.getDate()
        );


    const toUtc =
        Date.UTC(
            toDate.getFullYear(),
            toDate.getMonth(),
            toDate.getDate()
        );


    return Math.round(
        (
            toUtc -
            fromUtc
        ) /
        86400000
    );
}


/* =========================================================
   DOM: SHOW ELEMENT

   Removes BOTH:
   - hidden attribute
   - .is-hidden

   This matches common.css.
========================================================= */

function showElement(
    element
) {
    if (!element) {
        return false;
    }


    element.hidden =
        false;


    element.classList.remove(
        "is-hidden"
    );


    return true;
}


/* =========================================================
   DOM: HIDE ELEMENT
========================================================= */

function hideElement(
    element
) {
    if (!element) {
        return false;
    }


    element.hidden =
        true;


    element.classList.add(
        "is-hidden"
    );


    return true;
}


/* =========================================================
   DOM: TOGGLE ELEMENT
========================================================= */

function toggleElement(
    element,
    visible
) {
    return visible
        ? showElement(
            element
        )
        : hideElement(
            element
        );
}


/* =========================================================
   DOM: VISIBLE CHECK
========================================================= */

function isElementVisible(
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
   DOM: SET TEXT
========================================================= */

/**
 * Safely updates textContent.
 *
 * null / undefined render as empty strings.
 */
function setText(
    element,
    value
) {
    if (!element) {
        return false;
    }


    element.textContent =
        value === null ||
        value === undefined
            ? ""
            : String(value);


    return true;
}


/* =========================================================
   DOM: SET DISABLED
========================================================= */

function setDisabled(
    element,
    disabled = true
) {
    if (!element) {
        return false;
    }


    element.disabled =
        Boolean(
            disabled
        );


    return true;
}


/* =========================================================
   DOM: SET ARIA PRESSED
========================================================= */

function setAriaPressed(
    element,
    pressed
) {
    if (!element) {
        return false;
    }


    element.setAttribute(
        "aria-pressed",
        String(
            Boolean(
                pressed
            )
        )
    );


    return true;
}


/* =========================================================
   DOM: SAFE CLASS TOGGLE
========================================================= */

function toggleClass(
    element,
    className,
    force
) {
    if (
        !element ||
        typeof className !==
            "string" ||
        className.length === 0
    ) {
        return false;
    }


    if (
        typeof force ===
        "boolean"
    ) {

        element.classList.toggle(
            className,
            force
        );


        return force;
    }


    return element.classList.toggle(
        className
    );
}


/* =========================================================
   STRING SAFETY
========================================================= */

function normalizeString(
    value,
    fallback = ""
) {
    if (
        value === null ||
        value === undefined
    ) {
        return fallback;
    }


    return String(
        value
    ).trim();
}


/* =========================================================
   UNIQUE ID

   Used for lightweight local transaction/round IDs if any
   module needs a generic fallback.
========================================================= */

function createId(
    prefix = "id"
) {
    const safePrefix =
        normalizeString(
            prefix,
            "id"
        ) ||
        "id";


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


    return (
        `${safePrefix}-` +
        `${Date.now().toString(36)}-` +
        `${Math.random()
            .toString(36)
            .slice(2, 10)}`
    );
}


/* =========================================================
   DELAY

   Generic async utility.
========================================================= */

function delay(
    milliseconds
) {
    const safeMs =
        Math.max(
            0,
            toFiniteNumber(
                milliseconds,
                0
            )
        );


    return new Promise(
        (resolve) => {

            window.setTimeout(
                resolve,
                safeMs
            );
        }
    );
}


/* =========================================================
   EXPORTS
========================================================= */

export {
    /* Numeric */
    isFiniteNumber,
    toFiniteNumber,
    toInteger,

    clamp,
    roundTo,
    floorTo,

    randomBetween,
    randomInteger,

    /* Object */
    clone,
    isPlainObject,

    /* Formatting */
    formatNumber,
    formatCoins,
    formatMultiplier,
    formatSignedNumber,
    formatPercent,

    /* Date */
    parseDateValue,
    formatDate,
    formatTime,
    formatDateTime,
    formatDuration,
    getLocalDateKey,
    getCalendarDayDifference,

    /* DOM */
    showElement,
    hideElement,
    toggleElement,
    isElementVisible,

    setText,
    setDisabled,
    setAriaPressed,
    toggleClass,

    /* String / IDs */
    normalizeString,
    createId,

    /* Async */
    delay
};
