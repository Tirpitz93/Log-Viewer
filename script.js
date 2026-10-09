const logContainer = document.getElementById('log');
const fileInput = document.getElementById('file');
const clearButton = document.getElementById('clear');
const loadButton = document.getElementById('load');
const saveButton = document.getElementById('save');
const wrapLinesToggle = document.getElementById('wrap-lines-toggle');
const compactToggle = document.getElementById('compact-toggle');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const patternList = document.getElementById('pattern-list');
const addPatternButton = document.getElementById('add-pattern');
const exportPatternsButton = document.getElementById('export-patterns');
const importPatternsInput = document.getElementById('import-patterns');
// const xAxisToggle = document.getElementById('x-axis');
// const highlightToggle = document.getElementById('highlight-style');
const timestampRenderingSelect = document.getElementById('timestamp-rendering');
const frequencyGraphPanel = document.getElementById('frequency-graph-panel');
const frequencyGraph = document.getElementById('frequency-graph');
const graphUpdateDelayInput = document.getElementById('graph-update-delay');
const frequencyBinCountInput = document.getElementById('frequency-bin-count');
const DEFAULT_PATTERN_SETTINGS = {
    xAxisEnabled: false,
    highlightEnabled: false,
    wrapLines: true,
    compactMode: false,
    darkMode: false,
    timestampRendering: 'absolute',
    graphUpdateDelayMs: 200,
    frequencyBinCount: 24,
    patterns: [
        {
            pattern: '^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})[\\sT](?<hour>\\d{2}):(?<minute>\\d{2}):(?<second>\\d{2})(?:\\.(?<ms>\\d+))?(?<tz>[+-]\\d{2}:?\\d{2})?',
            style: 'info',
            applyWholeLine: false,
            xAxisEnabled: true,
            includeInFrequency: false,
            enabled: true
        },
        {
            pattern: '.*ERROR.*',
            style: 'error',
            applyWholeLine: true,
            xAxisEnabled: false,
            includeInFrequency: true,
            enabled: true
        }
    ]
};
const VIEWER_SETTINGS_STORAGE_KEY = 'log-viewer.settings';
const LEGACY_PATTERN_SETTINGS_STORAGE_KEY = 'log-viewer.pattern-settings';

let currentNavigator = null;
let currentLines = [];
let currentLineEntries = [];
let currentPatternRules = [];
let activeFileName = 'dummy.log';
let pendingGraphRenderTimeoutId = null;
const fallbackDummyLog = `2026-09-16 08:00:00 INFO Server started successfully.
2026-09-16 08:00:05 WARN Cache miss for /health probe.
2026-09-16 08:00:17 ERROR Failed to write to database.
2026-09-16 08:00:35 INFO User login succeeded for admin.
2026-09-16 08:00:46 DEBUG Request payload size 845 bytes.
2026-09-16 08:01:10 TRACE HTTP GET /api/version returned 200.
2026-09-16 08:02:30 CRITICAL Disk usage above 95%.
2026-09-16 08:03:11 ERROR Failed to refresh token.
2026-09-16 08:03:46 INFO Background job completed.
2026-09-16 08:04:02 WARN Retry scheduled for outbound queue.
2026-09-16 08:04:19 GOOD Health check passed.
2026-09-16 08:05:00 OK Deployment finished without errors.
2026-09-16 08:05:34 BAD Nightly archive checksum mismatch.
2026-09-16 08:05:41 FATAL Service crashed during shutdown.`;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createPatternRow(patternValue = '', styleValue = 'error', applyWholeLine = true, xAxisEnabled = false, includeInFrequency = true, enabled = true) {
    const row = document.createElement('div');
    row.className = 'pattern-row row g-2 align-items-center mb-2';

    row.innerHTML = `
        <div class="col-5">
            <input type="text" class="pattern-input form-control" placeholder="Pattern" value="${escapeHtml(patternValue)}">
        </div>
        <div class="col-3">
            <select class="pattern-style-select form-select">
                <option value="normal">Normal</option>
                <option value="hidden">Hidden</option>
                <option value="none">None</option>
                <option value="fatal">Fatal</option>
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
                <option value="trace">Trace</option>
                <option value="good">Good</option>
                <option value="ok">OK</option>
                <option value="bad">Bad</option>
            
            </select>
        </div>
        <div class="col-2 d-flex align-items-center justify-content-center">
            <div class="form-check form-switch mb-0">
                <input class="form-check-input pattern-line-toggle" type="checkbox" role="switch">
                <label class="form-check-label small">Line</label>
            </div>
        </div>
        <div class="col-2 d-flex align-items-center justify-content-center">
            <div class="form-check form-switch mb-0">
                <input class="form-check-input pattern-enabled-toggle" type="checkbox" role="switch">
                <label class="form-check-label small">On</label>
            </div>
        </div>
        <div class="col-2 d-flex align-items-center justify-content-center">
            <div class="form-check form-switch mb-0">
                <input class="form-check-input pattern-x-axis-toggle" type="checkbox" role="switch">
                <label class="form-check-label small">X-axis</label>
            </div>
        </div>
        <div class="col-2 d-flex align-items-center justify-content-center">
            <div class="form-check form-switch mb-0">
                <input class="form-check-input pattern-frequency-toggle" type="checkbox" role="switch">
                <label class="form-check-label small">Graph</label>
            </div>
        </div>
        <div class="col-2 d-grid">
            <button class="btn btn-outline-danger btn-sm remove-pattern" type="button">Remove</button>
        </div>
    `;

    const styleSelect = row.querySelector('.pattern-style-select');
    const lineToggle = row.querySelector('.pattern-line-toggle');
    const enabledToggleInput = row.querySelector('.pattern-enabled-toggle');
    const xAxisToggleInput = row.querySelector('.pattern-x-axis-toggle');
    const frequencyToggleInput = row.querySelector('.pattern-frequency-toggle');
    styleSelect.value = styleValue;
    lineToggle.checked = Boolean(applyWholeLine);
    enabledToggleInput.checked = Boolean(enabled);
    xAxisToggleInput.checked = Boolean(xAxisEnabled);
    frequencyToggleInput.checked = Boolean(includeInFrequency) && !xAxisEnabled;
    frequencyToggleInput.disabled = Boolean(xAxisEnabled);

    row.querySelector('.pattern-input').addEventListener('input', refreshLogFromPatternControls);
    styleSelect.addEventListener('change', refreshLogFromPatternControls);
    lineToggle.addEventListener('change', refreshLogFromPatternControls);
    enabledToggleInput.addEventListener('change', refreshLogFromPatternControls);
    frequencyToggleInput.addEventListener('change', refreshLogFromPatternControls);
    xAxisToggleInput.addEventListener('change', () => {
        if (xAxisToggleInput.checked) {
            frequencyToggleInput.checked = false;
            frequencyToggleInput.disabled = true;
        } else {
            frequencyToggleInput.disabled = false;
            frequencyToggleInput.checked = true;
        }
        refreshLogFromPatternControls();
    });
    row.querySelector('.remove-pattern').addEventListener('click', () => {
        if (patternList.querySelectorAll('.pattern-row').length > 1) {
            row.remove();
            refreshLogFromPatternControls();
        }
    });

    return row;
}

function getPatternRules() {
    return Array.from(patternList.querySelectorAll('.pattern-row')).map((row) => {
        const patternInput = row.querySelector('.pattern-input');
        const styleSelect = row.querySelector('.pattern-style-select');
        const lineToggle = row.querySelector('.pattern-line-toggle');
        const enabledToggle = row.querySelector('.pattern-enabled-toggle');
        const xAxisEnabled = row.querySelector('.pattern-x-axis-toggle');
        const frequencyToggle = row.querySelector('.pattern-frequency-toggle');
        const rawPattern = patternInput.value.trim();

        if (!rawPattern || !enabledToggle.checked) {
            return null;
        }

        try {
            return {
                regex: new RegExp(rawPattern, 'i'),
                style: styleSelect.value,
                applyWholeLine: lineToggle.checked,
                xAxisEnabled: xAxisEnabled.checked,
                includeInFrequency: !xAxisEnabled.checked && frequencyToggle.checked,
                enabled: enabledToggle.checked
            };
        } catch (error) {
            console.warn('Invalid regex pattern:', error.message);
            return null;
        }
    }).filter(Boolean);
}

function getPatternSettings() {
    const patterns = Array.from(patternList.querySelectorAll('.pattern-row')).map((row) => ({
        pattern: row.querySelector('.pattern-input').value,
        style: row.querySelector('.pattern-style-select').value,
        applyWholeLine: row.querySelector('.pattern-line-toggle').checked,
        enabled: row.querySelector('.pattern-enabled-toggle').checked,
        xAxisEnabled: row.querySelector('.pattern-x-axis-toggle').checked,
        includeInFrequency: row.querySelector('.pattern-frequency-toggle').checked
    }));

    return {
        // xAxisEnabled: xAxisToggle.checked,
        // highlightEnabled: highlightToggle.checked,
        wrapLines: wrapLinesToggle ? wrapLinesToggle.checked : true,
        compactMode: compactToggle ? compactToggle.checked : false,
        darkMode: darkModeToggle ? darkModeToggle.checked : false,
        timestampRendering: timestampRenderingSelect.value,
        graphUpdateDelayMs: getGraphUpdateDelayMs(),
        frequencyBinCount: getFrequencyBinCount(),
        patterns
    };
}

function savePatternSettings() {
    try {
        const serializedSettings = JSON.stringify(getPatternSettings());
        localStorage.setItem(VIEWER_SETTINGS_STORAGE_KEY, serializedSettings);
        // Keep writing legacy key so older copies of the page can still load the same settings.
        localStorage.setItem(LEGACY_PATTERN_SETTINGS_STORAGE_KEY, serializedSettings);
    } catch (error) {
        console.warn('Could not save pattern settings:', error.message);
    }
}

function downloadPatternSettings() {
    const content = JSON.stringify(getPatternSettings(), null, 2);
    const blob = new Blob([content], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'log-viewer-settings.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function getDefaultPatternSettings() {
    return {
        xAxisEnabled: DEFAULT_PATTERN_SETTINGS.xAxisEnabled,
        highlightEnabled: DEFAULT_PATTERN_SETTINGS.highlightEnabled,
        wrapLines: DEFAULT_PATTERN_SETTINGS.wrapLines,
        compactMode: DEFAULT_PATTERN_SETTINGS.compactMode,
        darkMode: DEFAULT_PATTERN_SETTINGS.darkMode,
        timestampRendering: DEFAULT_PATTERN_SETTINGS.timestampRendering,
        graphUpdateDelayMs: DEFAULT_PATTERN_SETTINGS.graphUpdateDelayMs,
        frequencyBinCount: DEFAULT_PATTERN_SETTINGS.frequencyBinCount,
        patterns: DEFAULT_PATTERN_SETTINGS.patterns.map((pattern) => ({...pattern}))
    };
}

function normalizeGraphUpdateDelayMs(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return DEFAULT_PATTERN_SETTINGS.graphUpdateDelayMs;
    }

    return Math.min(5000, Math.max(0, parsed));
}

function getGraphUpdateDelayMs() {
    return normalizeGraphUpdateDelayMs(graphUpdateDelayInput.value);
}

function normalizeFrequencyBinCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return DEFAULT_PATTERN_SETTINGS.frequencyBinCount;
    }

    return Math.min(500, Math.max(2, parsed));
}

function getFrequencyBinCount() {
    return normalizeFrequencyBinCount(frequencyBinCountInput.value);
}

function normalizePatternSettings(rawSettings) {
    if (!rawSettings || typeof rawSettings !== 'object') {
        return null;
    }

    const patterns = Array.isArray(rawSettings.patterns)
        ? rawSettings.patterns.map((pattern) => {
            if (!pattern || typeof pattern !== 'object') {
                return null;
            }

            const patternValue = typeof pattern.pattern === 'string' ? pattern.pattern : '';
            const styleValue = typeof pattern.style === 'string' ? pattern.style : 'error';
            const applyWholeLine = Boolean(pattern.applyWholeLine);
            const enabled = pattern.enabled !== false;
            const xAxisEnabled = Boolean(pattern.xAxisEnabled);
            const includeInFrequency = xAxisEnabled ? false : pattern.includeInFrequency !== false;

            return {
                pattern: patternValue,
                style: styleValue,
                applyWholeLine,
                enabled,
                xAxisEnabled,
                includeInFrequency
            };
        }).filter((pattern) => pattern && pattern.pattern.trim())
        : [];

    const fallbackSettings = getDefaultPatternSettings();
    const safePatterns = patterns.length ? patterns : fallbackSettings.patterns;

    return {
        xAxisEnabled: Boolean(rawSettings.xAxisEnabled),
        highlightEnabled: Boolean(rawSettings.highlightEnabled),
        wrapLines: rawSettings.wrapLines !== false,
        compactMode: Boolean(rawSettings.compactMode),
        darkMode: Boolean(rawSettings.darkMode),
        timestampRendering: isValidTimestampRendering(rawSettings.timestampRendering)
            ? rawSettings.timestampRendering
            : DEFAULT_PATTERN_SETTINGS.timestampRendering,
        graphUpdateDelayMs: normalizeGraphUpdateDelayMs(rawSettings.graphUpdateDelayMs),
        frequencyBinCount: normalizeFrequencyBinCount(rawSettings.frequencyBinCount),
        patterns: safePatterns
    };
}

function isValidTimestampRendering(value) {
    return value === 'absolute' || value === 'relative' || value === 'delta';
}

function setWrapLines(enabled) {
    if (wrapLinesToggle) {
        wrapLinesToggle.checked = Boolean(enabled);
    }
    logContainer.classList.toggle('no-wrap', !enabled);
}

function setCompactMode(enabled) {
    if (compactToggle) {
        compactToggle.checked = Boolean(enabled);
    }
    document.body.classList.toggle('compact-mode', Boolean(enabled));
}

function setDarkMode(enabled) {
    if (darkModeToggle) {
        darkModeToggle.checked = Boolean(enabled);
    }
    document.body.classList.toggle('dark-mode', Boolean(enabled));
    document.documentElement.setAttribute('data-bs-theme', enabled ? 'dark' : 'light');
}

function applyPatternSettings(settings) {
    const safeSettings = normalizePatternSettings(settings) || getDefaultPatternSettings();
    patternList.innerHTML = '';

    for (const pattern of safeSettings.patterns) {
        patternList.appendChild(
            createPatternRow(
                pattern.pattern,
                pattern.style,
                pattern.applyWholeLine,
                pattern.xAxisEnabled,
                pattern.includeInFrequency,
                pattern.enabled
            )
        );
    }

    // xAxisToggle.checked = safeSettings.xAxisEnabled;
    // highlightToggle.checked = safeSettings.highlightEnabled;
    setWrapLines(safeSettings.wrapLines);
    setCompactMode(safeSettings.compactMode);
    setDarkMode(safeSettings.darkMode);
    timestampRenderingSelect.value = isValidTimestampRendering(safeSettings.timestampRendering)
        ? safeSettings.timestampRendering
        : DEFAULT_PATTERN_SETTINGS.timestampRendering;
    graphUpdateDelayInput.value = normalizeGraphUpdateDelayMs(safeSettings.graphUpdateDelayMs);
    frequencyBinCountInput.value = normalizeFrequencyBinCount(safeSettings.frequencyBinCount);
}

function restorePatternSettings() {
    let restoredSettings = null;

    try {
        const rawSettings = localStorage.getItem(VIEWER_SETTINGS_STORAGE_KEY)
            || localStorage.getItem(LEGACY_PATTERN_SETTINGS_STORAGE_KEY);
        if (rawSettings) {
            restoredSettings = normalizePatternSettings(JSON.parse(rawSettings));
        }
    } catch (error) {
        console.warn('Could not restore pattern settings:', error.message);
    }

    applyPatternSettings(restoredSettings || getDefaultPatternSettings());
}

function importPatternSettings(file) {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        try {
            const importedSettings = normalizePatternSettings(JSON.parse(reader.result));
            if (!importedSettings) {
                throw new Error('Invalid pattern settings file');
            }

            applyPatternSettings(importedSettings);
            savePatternSettings();
            if (currentLines.length) {
                renderLog(currentLines);
            }
        } catch (error) {
            console.warn('Could not import pattern settings:', error.message);
        }
    });
    reader.addEventListener('error', () => {
        console.warn('Could not read pattern settings file');
    });
    reader.readAsText(file);
}

function getPatternMatch(line, rules) {
    const matchedRules = [];
    for (const rule of rules) {
        const match = rule.regex.exec(line);
        rule.regex.lastIndex = 0;
        if (match) {
            matchedRules.push({
                rule,
                match,
                value: match[1] || match[0],
                start: match.index,
                end: match.index + match[0].length,
                groups: match.groups || null
            });
        }
    }

    return matchedRules.sort((left, right) => {
        if (left.start !== right.start) {
            return left.start - right.start;
        }

        return left.end - right.end;
    });
}

function getTimestampSourceRule(rules) {
    return rules.find((rule) => rule.xAxisEnabled) || null;
}

function getTimestampMatch(matches) {
    return matches.find((matchObj) => matchObj.rule.xAxisEnabled) || null;
}

// function getSeverityClass(line) {
//     const text = line.toLowerCase();
//
//     if (text.includes('fatal')) return 'fatal';
//     if (text.includes('critical')) return 'critical';
//     if (text.includes('error')) return 'error';
//     if (text.includes('warn')) return 'warning';
//     if (text.includes('info')) return 'info';
//     if (text.includes('debug')) return 'debug';
//     if (text.includes('trace')) return 'trace';
//     if (text.includes('success') || text.includes('ok') || text.includes('good')) return 'good';
//     if (text.includes('bad') || text.includes('fail')) return 'bad';
//
//     return 'normal';
// }

const MONTH_NAMES = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
};

function parseEpochString(str, type = null) {
    if (!str || typeof str !== 'string') {
        return null;
    }
    const raw = str.trim();
    if (!/^-?\d+$/.test(raw)) {
        return null;
    }

    try {
        if (type === 'filetime' || type === 'ntfs') {
            const bigVal = BigInt(raw);
            const epochMs = Number((bigVal - 116444736000000000n) / 10000n);
            const d = new Date(epochMs);
            return isNaN(d.getTime()) ? null : d;
        }

        if (type === 'ntp') {
            const num = Number(raw);
            const epochMs = (num - 2208988800) * 1000;
            const d = new Date(epochMs);
            return isNaN(d.getTime()) ? null : d;
        }

        if (type === 'hfs' || type === 'mac') {
            const num = Number(raw);
            const epochMs = (num - 2082844800) * 1000;
            const d = new Date(epochMs);
            return isNaN(d.getTime()) ? null : d;
        }

        if (type === 's') {
            const num = Number(raw);
            const d = new Date(num * 1000);
            return isNaN(d.getTime()) ? null : d;
        }

        if (type === 'ms') {
            const num = Number(raw);
            const d = new Date(num);
            return isNaN(d.getTime()) ? null : d;
        }

        if (type === 'us') {
            const num = Number(raw);
            const d = new Date(Math.floor(num / 1000));
            return isNaN(d.getTime()) ? null : d;
        }

        if (type === 'ns') {
            const bigVal = BigInt(raw);
            const epochMs = Number(bigVal / 1000000n);
            const d = new Date(epochMs);
            return isNaN(d.getTime()) ? null : d;
        }

        const len = raw.length;
        if (len >= 17) {
            if (len === 18 && raw.startsWith('1')) {
                const bigVal = BigInt(raw);
                const epochMs = Number((bigVal - 116444736000000000n) / 10000n);
                const d = new Date(epochMs);
                if (!isNaN(d.getTime())) return d;
            }
            if (len === 19) {
                const bigVal = BigInt(raw);
                const epochMs = Number(bigVal / 1000000n);
                const d = new Date(epochMs);
                if (!isNaN(d.getTime())) return d;
            }
            const bigVal = BigInt(raw);
            const epochMs = Number((bigVal - 116444736000000000n) / 10000n);
            const d = new Date(epochMs);
            return isNaN(d.getTime()) ? null : d;
        }

        if (len === 15 || len === 16) {
            const num = Number(raw);
            const d = new Date(Math.floor(num / 1000));
            return isNaN(d.getTime()) ? null : d;
        }

        if (len === 14) {
            const y = Number.parseInt(raw.slice(0, 4), 10);
            const m = Number.parseInt(raw.slice(4, 6), 10) - 1;
            const day = Number.parseInt(raw.slice(6, 8), 10);
            const h = Number.parseInt(raw.slice(8, 10), 10);
            const min = Number.parseInt(raw.slice(10, 12), 10);
            const s = Number.parseInt(raw.slice(12, 14), 10);
            if (y >= 1970 && m >= 0 && m <= 11 && day >= 1 && day <= 31 && h <= 23 && min <= 59 && s <= 59) {
                const d = new Date(y, m, day, h, min, s);
                if (!isNaN(d.getTime())) return d;
            }
        }

        if (len === 12 || len === 13) {
            const num = Number(raw);
            const d = new Date(num);
            return isNaN(d.getTime()) ? null : d;
        }

        if (len >= 9 && len <= 11) {
            const num = Number(raw);
            if (num >= 3000000000) {
                const epochMs = (num - 2208988800) * 1000;
                const d = new Date(epochMs);
                if (!isNaN(d.getTime())) return d;
            }
            const d = new Date(num * 1000);
            return isNaN(d.getTime()) ? null : d;
        }
    } catch (_) {}
    return null;
}

function parseTimestampFromNamedGroups(groups) {
    if (!groups || typeof groups !== 'object') {
        return null;
    }

    const wftVal = groups.windowsfiletime || groups.windows_filetime || groups.windows_file_time ||
        groups.winfiletime || groups.win_filetime || groups.win_file_time ||
        groups.filetime || groups.file_time || groups.wft || groups.ntfs || groups.ntfs_time;
    if (wftVal) {
        const d = parseEpochString(wftVal, 'filetime');
        if (d) return d;
    }

    const ntpVal = groups.ntp || groups.ntp_epoch || groups.epoch_ntp || groups.ntp_time;
    if (ntpVal) {
        const d = parseEpochString(ntpVal, 'ntp');
        if (d) return d;
    }

    const hfsVal = groups.hfs || groups.hfsplus || groups.hfs_plus || groups.hfs_epoch || groups.epoch_hfs ||
        groups.mac || groups.mac_epoch || groups.mac_time || groups.machfs;
    if (hfsVal) {
        const d = parseEpochString(hfsVal, 'hfs');
        if (d) return d;
    }

    const nsVal = groups.epoch_ns || groups.epoch_nanos || groups.epoch_nanosecond || groups.epoch_nanoseconds ||
        groups.epochNs || groups.epochNanos || groups.epochNanoseconds ||
        groups.unix_ns || groups.unix_nanos || groups.unix_nanoseconds ||
        groups.unixNs || groups.unixNanos || groups.unixNanoseconds ||
        groups.timestamp_ns;
    if (nsVal) {
        const d = parseEpochString(nsVal, 'ns');
        if (d) return d;
    }

    const usVal = groups.epoch_us || groups.epoch_micro || groups.epoch_micros || groups.epoch_microsecond || groups.epoch_microseconds ||
        groups.epochUs || groups.epochMicro || groups.epochMicros || groups.epochMicroseconds ||
        groups.unix_us || groups.unix_micro || groups.unix_micros || groups.unix_microseconds ||
        groups.unixUs || groups.unixMicro || groups.unixMicros || groups.unixMicroseconds ||
        groups.timestamp_us;
    if (usVal) {
        const d = parseEpochString(usVal, 'us');
        if (d) return d;
    }

    const msEpochVal = groups.epoch_ms || groups.epoch_milli || groups.epoch_millis || groups.epoch_millisecond || groups.epoch_milliseconds ||
        groups.epochMs || groups.epochMilli || groups.epochMillis || groups.epochMilliseconds ||
        groups.unix_ms || groups.unix_milli || groups.unix_millis || groups.unix_milliseconds ||
        groups.unixMs || groups.unixMillis || groups.unixMilliseconds ||
        groups.timestamp_ms;
    if (msEpochVal) {
        const d = parseEpochString(msEpochVal, 'ms');
        if (d) return d;
    }

    const sEpochVal = groups.epoch_s || groups.epoch_sec || groups.epoch_second || groups.epoch_seconds ||
        groups.epochSec || groups.epochSecond || groups.epochSeconds ||
        groups.unix_s || groups.unix_sec || groups.unix_second || groups.unix_seconds ||
        groups.unixSec || groups.unixSecond || groups.unixSeconds ||
        groups.timestamp_s;
    if (sEpochVal) {
        const d = parseEpochString(sEpochVal, 's');
        if (d) return d;
    }

    const mysqlVal = groups.mysql || groups.numeric || groups.compact || groups.pure_numeric || groups.pureNumeric || groups.datetime;
    if (mysqlVal && /^\d{14}$/.test(mysqlVal.trim())) {
        const d = parseEpochString(mysqlVal.trim());
        if (d) return d;
    }

    const genericEpochVal = groups.epoch || groups.unix || groups.timestamp || groups.raw || groups.val || groups.value;
    if (genericEpochVal && !groups.year && !groups.month && !groups.day) {
        const d = parseEpochString(genericEpochVal);
        if (d) return d;
    }

    const yearVal = groups.year;
    const monthVal = groups.month || groups.monthName || groups.month_name || groups.mon;
    const dayVal = groups.day || groups.dayOfMonth || groups.day_of_month || groups.dom;
    const hourVal = groups.hour || groups.hours || groups.hr;
    const minuteVal = groups.minute || groups.minutes || groups.min;
    const secondVal = groups.second || groups.seconds || groups.sec;
    const msVal = groups.ms || groups.millisecond || groups.milliseconds || groups.millis ||
        groups.subsecond || groups.subseconds || groups.fraction || groups.frac;
    const tzVal = groups.tz || groups.timezone || groups.offset || groups.tzOffset || groups.tz_offset;
    const ampmVal = groups.ampm || groups.meridiem || groups.period || groups.am_pm || groups.ap;

    if (!yearVal || !monthVal || !dayVal || !hourVal || !minuteVal || secondVal === undefined) {
        if (genericEpochVal) {
            const d = parseEpochString(genericEpochVal);
            if (d) return d;
        }
        return null;
    }

    let safeYear = Number.parseInt(yearVal, 10);
    if (Number.isNaN(safeYear)) {
        return null;
    }
    if (safeYear < 100) {
        safeYear = safeYear < 70 ? 2000 + safeYear : 1900 + safeYear;
    }

    let safeMonth;
    const monthStr = String(monthVal).trim().toLowerCase();
    if (MONTH_NAMES.hasOwnProperty(monthStr)) {
        safeMonth = MONTH_NAMES[monthStr];
    } else {
        safeMonth = Number.parseInt(monthVal, 10) - 1;
    }
    if (Number.isNaN(safeMonth) || safeMonth < 0 || safeMonth > 11) {
        return null;
    }

    const safeDay = Number.parseInt(dayVal, 10);
    if (Number.isNaN(safeDay) || safeDay < 1 || safeDay > 31) {
        return null;
    }

    let safeHour = Number.parseInt(hourVal, 10);
    if (Number.isNaN(safeHour) || safeHour < 0 || safeHour > 23) {
        return null;
    }

    if (ampmVal) {
        const ap = String(ampmVal).trim().toUpperCase();
        if (ap.startsWith('P') && safeHour < 12) {
            safeHour += 12;
        } else if (ap.startsWith('A') && safeHour === 12) {
            safeHour = 0;
        }
    }

    const safeMinute = Number.parseInt(minuteVal, 10);
    if (Number.isNaN(safeMinute) || safeMinute < 0 || safeMinute > 59) {
        return null;
    }

    const safeSecond = Number.parseInt(secondVal, 10);
    if (Number.isNaN(safeSecond) || safeSecond < 0 || safeSecond > 60) {
        return null;
    }

    let safeMs = 0;
    if (msVal) {
        const msDigits = String(msVal).replace(/\D/g, '');
        if (msDigits.length >= 3) {
            safeMs = Number.parseInt(msDigits.slice(0, 3), 10);
        } else if (msDigits.length > 0) {
            safeMs = Number.parseInt(msDigits.padEnd(3, '0'), 10);
        }
    }

    if (tzVal && String(tzVal).trim()) {
        const cleanTz = String(tzVal).trim();
        const upperTz = cleanTz.toUpperCase();
        if (upperTz === 'Z' || upperTz === 'UTC' || upperTz === 'GMT') {
            return new Date(Date.UTC(safeYear, safeMonth, safeDay, safeHour, safeMinute, safeSecond, safeMs));
        }

        const tzMatch = cleanTz.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
        if (tzMatch) {
            const tzSign = tzMatch[1] === '+' ? 1 : -1;
            const tzHours = Number.parseInt(tzMatch[2], 10);
            const tzMinutes = tzMatch[3] ? Number.parseInt(tzMatch[3], 10) : 0;
            const tzOffsetMs = tzSign * (tzHours * 3600000 + tzMinutes * 60000);
            return new Date(Date.UTC(safeYear, safeMonth, safeDay, safeHour, safeMinute, safeSecond, safeMs) - tzOffsetMs);
        }
    }

    return new Date(safeYear, safeMonth, safeDay, safeHour, safeMinute, safeSecond, safeMs);
}

function parseTimestamp(timeString) {
    if (!timeString || typeof timeString !== 'string') {
        return null;
    }

    const trimmed = timeString.trim();
    if (/^-?\d+$/.test(trimmed)) {
        const epochDate = parseEpochString(trimmed);
        if (epochDate) {
            return epochDate;
        }
    }

    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
}

function getTimestampDateFromMatch(matchObj) {
    if (!matchObj) {
        return null;
    }

    if (matchObj.groups) {
        const fromGroups = parseTimestampFromNamedGroups(matchObj.groups);
        if (fromGroups) {
            return fromGroups;
        }
    }

    if (matchObj.value) {
        return parseTimestamp(matchObj.value);
    }

    return null;
}

function renderTimestamp(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }
    if (timestampRenderingSelect.value === 'relative') {
        return renderRelativeTimestamp(date);
    }
    return formatAbsoluteTimestamp(date);
}

function renderRelativeTimestamp(date) {
    const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'});
    const steps = [
        {unit: 'year', seconds: 31536000},
        {unit: 'month', seconds: 2592000},
        {unit: 'day', seconds: 86400},
        {unit: 'hour', seconds: 3600},
        {unit: 'minute', seconds: 60}
    ];

    for (const step of steps) {
        if (Math.abs(deltaSeconds) >= step.seconds) {
            return formatter.format(Math.round(deltaSeconds / step.seconds), step.unit);
        }
    }

    return formatter.format(deltaSeconds, 'second');
}

function formatAbsoluteTimestamp(date) {
    return date.toISOString();
}

function formatDeltaTimestamp(milliseconds) {
    const absoluteMilliseconds = Math.max(0, milliseconds);

    if (absoluteMilliseconds < 1000) {
        return `+${absoluteMilliseconds}ms`;
    }

    if (absoluteMilliseconds < 60000) {
        return `+${(absoluteMilliseconds / 1000).toFixed(1).replace(/\\.0$/, '')}s`;
    }

    const totalSeconds = Math.round(absoluteMilliseconds / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (absoluteMilliseconds < 3600000) {
        return `+${totalMinutes}:${String(seconds).padStart(2, '0')}`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (absoluteMilliseconds < 86400000) {
        return `+${totalHours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `+${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}
/*
 takes a line and an array of matches, and returns the HTML representation of the line with the rules applied

 */
function renderLine(line, matches) {
    const originalLine = line;
    const lineClassList = [];
    let timestampText = '';
    let timestampDate = null;
    const segments = [];
    let cursor = 0;

    for (const matchObj of matches) {
        const {rule, value, start, end} = matchObj;

        if (rule.xAxisEnabled) {
            const parsedTimestamp = getTimestampDateFromMatch(matchObj);
            if (parsedTimestamp) {
                timestampDate = parsedTimestamp;
                timestampText = renderTimestamp(parsedTimestamp);
            } else if (!timestampText) {
                timestampText = value;
            }
        }

        if (rule.applyWholeLine) {
            lineClassList.push(rule.style);
            continue;
        }

        const matchStart = Math.max(start, cursor);
        const matchEnd = end;
        if (matchStart >= matchEnd) {
            continue;
        }

        if (cursor < matchStart) {
            segments.push(escapeHtml(originalLine.slice(cursor, matchStart)));
        }

        const matchedText = escapeHtml(originalLine.slice(matchStart, matchEnd));
        segments.push(`<span class="${rule.style}">${matchedText}</span>`);
        cursor = matchEnd;
    }

    const renderedBody = segments.length
        ? `${segments.join('')}${escapeHtml(originalLine.slice(cursor))}`
        : escapeHtml(originalLine);
    const timestampPrefix = timestampText
        ? `<span class="timestamp" data-timestamp="${timestampDate ? timestampDate.toISOString() : ''}">${escapeHtml(timestampText)}</span> `
        : '';

    return `<p class="log-line ${lineClassList.join(' ')}">${timestampPrefix}${renderedBody}</p>`;
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
}

function getTimestampElements() {
    return Array.from(logContainer.querySelectorAll('.timestamp[data-timestamp]'));
}

function getTimestampDateFromElement(element) {
    const rawValue = element && element.dataset ? element.dataset.timestamp : '';
    if (!rawValue) {
        return null;
    }

    return parseTimestamp(rawValue);
}

function cancelScheduledGraphRender() {
    if (pendingGraphRenderTimeoutId !== null) {
        window.clearTimeout(pendingGraphRenderTimeoutId);
        pendingGraphRenderTimeoutId = null;
    }
}

function scrollLogToTimestamp(targetTime) {
    const timestamps = getTimestampElements();
    if (!timestamps.length) {
        return;
    }

    const targetTimeMs = targetTime instanceof Date ? targetTime.getTime() : Number(targetTime);
    let closestElement = null;
    let closestDelta = Number.POSITIVE_INFINITY;

    for (const timestampElement of timestamps) {
        const timestampDate = getTimestampDateFromElement(timestampElement);
        if (!timestampDate) {
            continue;
        }

        const delta = Math.abs(timestampDate.getTime() - targetTimeMs);
        if (delta < closestDelta) {
            closestDelta = delta;
            closestElement = timestampElement;
            if (delta === 0) {
                break;
            }
        }
    }

    if (closestElement) {
        const lineElement = closestElement.closest('.log-line');
        if (lineElement) {
            lineElement.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }
}

function scrollLogToTimeRange(rangeStart, rangeEnd) {
    const timestamps = getTimestampElements();
    if (!timestamps.length) {
        return;
    }

    let fallbackElement = null;
    let fallbackDelta = Number.POSITIVE_INFINITY;

    for (const timestampElement of timestamps) {
        const timestampDate = getTimestampDateFromElement(timestampElement);
        if (!timestampDate) {
            continue;
        }

        const timeValue = timestampDate.getTime();
        if (timeValue >= rangeStart.getTime() && timeValue < rangeEnd.getTime()) {
            const lineElement = timestampElement.closest('.log-line');
            if (lineElement) {
                lineElement.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
            return;
        }

        const rangeDelta = timeValue < rangeStart.getTime()
            ? rangeStart.getTime() - timeValue
            : timeValue - rangeEnd.getTime();
        if (rangeDelta < fallbackDelta) {
            fallbackDelta = rangeDelta;
            fallbackElement = timestampElement;
        }
    }

    if (fallbackElement) {
        const lineElement = fallbackElement.closest('.log-line');
        if (lineElement) {
            lineElement.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }
}

function renderFrequencyGraph(lineEntries, rules) {
    const timestampRule = getTimestampSourceRule(rules);
    if (!timestampRule) {
        cancelScheduledGraphRender();
        frequencyGraphPanel.classList.add('d-none');
        frequencyGraph.innerHTML = '';
        return;
    }

    const graphData = buildFrequencyGraphData(lineEntries, rules);
    if (!graphData) {
        frequencyGraphPanel.classList.add('d-none');
        frequencyGraph.innerHTML = '';
        return;
    }

    frequencyGraphPanel.classList.remove('d-none');
    drawFrequencyGraph(graphData);
}

function scheduleFrequencyGraphRender(lineEntries, rules) {
    cancelScheduledGraphRender();

    const delay = getGraphUpdateDelayMs();
    if (delay <= 0) {
        renderFrequencyGraph(lineEntries, rules);
        return;
    }

    pendingGraphRenderTimeoutId = window.setTimeout(() => {
        pendingGraphRenderTimeoutId = null;
        renderFrequencyGraph(lineEntries, rules);
    }, delay);
}

function buildFrequencyGraphData(lineEntries, rules) {
    const entries = [];
    for (const lineEntry of lineEntries) {
        const timestampMatch = getTimestampMatch(lineEntry.matches);
        const timestamp = getTimestampDateFromMatch(timestampMatch);
        if (!timestamp) {
            continue;
        }

        entries.push({
            line: lineEntry.line,
            timestamp,
            matches: lineEntry.matches
        });
    }

    if (!entries.length) {
        return null;
    }
    entries.sort((left, right) => left.timestamp - right.timestamp);
    const bucketSize = getFrequencyBucketSize(
        entries[0].timestamp,
        entries[entries.length - 1].timestamp,
        getFrequencyBinCount()
    );
    const bucketCount = Math.max(1, Math.floor((entries[entries.length - 1].timestamp - entries[0].timestamp) / bucketSize) + 1);
    const series = rules.filter((rule) => rule.includeInFrequency).map((rule) => ({
        rule,
        label: rule.regex.source,
        style: rule.style,
        buckets: new Array(bucketCount).fill(0),
        total: 0
    }));

    if (!series.length) {
        return null;
    }

    for (const entry of entries) {
        const bucketIndex = Math.min(
            bucketCount - 1,
            Math.floor((entry.timestamp - entries[0].timestamp) / bucketSize)
        );

        for (const seriesItem of series) {
            const hasMatch = entry.matches.some((matchObj) => matchObj.rule === seriesItem.rule);
            if (!hasMatch) {
                continue;
            }

            seriesItem.buckets[bucketIndex] += 1;
            seriesItem.total += 1;
        }
    }

    const filteredSeries = series.filter((seriesItem) => seriesItem.total > 0);
    if (!filteredSeries.length) {
        return null;
    }

    return {
        bucketSize,
        bucketStart: entries[0].timestamp,
        bucketCount,
        maxCount: Math.max(...filteredSeries.flatMap((seriesItem) => seriesItem.buckets)),
        series: filteredSeries
    };
}

function getFrequencyBucketSize(startDate, endDate, targetBins) {
    const spanMilliseconds = Math.max(1, endDate.getTime() - startDate.getTime());
    const safeTargetBins = Math.max(1, targetBins);
    return Math.max(1, Math.ceil(spanMilliseconds / safeTargetBins));
}

function getFrequencyXAxisConfig(d3, startDate, endDate, innerWidth) {
    const spanMilliseconds = Math.max(1, endDate.getTime() - startDate.getTime());
    const targetTickCount = Math.max(2, Math.min(10, Math.floor(innerWidth / 90)));
    const targetStepMilliseconds = Math.ceil(spanMilliseconds / targetTickCount);
    const tickOptions = [
        {
            stepMilliseconds: 1000,
            interval: () => d3.timeSecond.every(1),
            format: d3.timeFormat('%H:%M:%S')
        },
        {
            stepMilliseconds: 5000,
            interval: () => d3.timeSecond.every(5),
            format: d3.timeFormat('%H:%M:%S')
        },
        {
            stepMilliseconds: 15000,
            interval: () => d3.timeSecond.every(15),
            format: d3.timeFormat('%H:%M:%S')
        },
        {
            stepMilliseconds: 30000,
            interval: () => d3.timeSecond.every(30),
            format: d3.timeFormat('%H:%M:%S')
        },
        {
            stepMilliseconds: 60000,
            interval: () => d3.timeMinute.every(1),
            format: d3.timeFormat('%H:%M')
        },
        {
            stepMilliseconds: 300000,
            interval: () => d3.timeMinute.every(5),
            format: d3.timeFormat('%H:%M')
        },
        {
            stepMilliseconds: 900000,
            interval: () => d3.timeMinute.every(15),
            format: d3.timeFormat('%H:%M')
        },
        {
            stepMilliseconds: 1800000,
            interval: () => d3.timeMinute.every(30),
            format: d3.timeFormat('%H:%M')
        },
        {
            stepMilliseconds: 3600000,
            interval: () => d3.timeHour.every(1),
            format: d3.timeFormat('%H:%M')
        },
        {
            stepMilliseconds: 21600000,
            interval: () => d3.timeHour.every(6),
            format: d3.timeFormat('%m-%d %H:%M')
        },
        {
            stepMilliseconds: 43200000,
            interval: () => d3.timeHour.every(12),
            format: d3.timeFormat('%m-%d %H:%M')
        },
        {
            stepMilliseconds: 86400000,
            interval: () => d3.timeDay.every(1),
            format: d3.timeFormat('%Y-%m-%d')
        },
        {
            stepMilliseconds: 604800000,
            interval: () => d3.timeWeek.every(1),
            format: d3.timeFormat('%Y-%m-%d')
        },
        {
            stepMilliseconds: 2678400000,
            interval: () => d3.timeMonth.every(1),
            format: d3.timeFormat('%Y-%m')
        },
        {
            stepMilliseconds: 7776000000,
            interval: () => d3.timeMonth.every(3),
            format: d3.timeFormat('%Y-%m')
        },
        {
            stepMilliseconds: 31536000000,
            interval: () => d3.timeYear.every(1),
            format: d3.timeFormat('%Y')
        }
    ];

    const selectedOption = tickOptions.find((option) => option.stepMilliseconds >= targetStepMilliseconds)
        || tickOptions[tickOptions.length - 1];

    return {
        interval: selectedOption.interval(),
        format: selectedOption.format
    };
}

function drawFrequencyGraph(graphData) {
    if (!window.d3) {
        frequencyGraph.innerHTML = '<div class="frequency-graph-empty">D3 failed to load.</div>';
        return;
    }

    const d3 = window.d3;
    const isCompact = document.body.classList.contains('compact-mode');
    const measuredWidth = frequencyGraph.clientWidth || (frequencyGraph.getBoundingClientRect && frequencyGraph.getBoundingClientRect().width) || 0;
    const width = Math.max(100, Math.floor(measuredWidth) || 280);
    const height = isCompact ? 150 : 240;
    const margin = {top: 12, right: 16, bottom: 36, left: 36};
    const innerWidth = Math.max(10, width - margin.left - margin.right);
    const innerHeight = Math.max(10, height - margin.top - margin.bottom);
    const colors = d3.schemeTableau10;
    const bucketDates = Array.from({length: graphData.bucketCount}, (_, index) => (
        new Date(graphData.bucketStart.getTime() + (index * graphData.bucketSize))
    ));
    const chartStart = bucketDates[0];
    const chartEnd = new Date(
        graphData.bucketStart.getTime() + (graphData.bucketCount * graphData.bucketSize)
    );

    frequencyGraph.innerHTML = '';
    const svg = d3.select(frequencyGraph)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('width', '100%')
        .attr('height', height)
        .attr('role', 'img')
        .attr('aria-label', 'Frequency over time chart');

    const chart = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleTime()
        .domain([chartStart, chartEnd])
        .range([0, innerWidth]);
    const yScale = d3.scaleLinear()
        .domain([0, Math.max(1, graphData.maxCount)])
        .nice()
        .range([innerHeight, 0]);
    const xAxisConfig = getFrequencyXAxisConfig(d3, chartStart, chartEnd, innerWidth);

    chart.append('g')
        .attr('class', 'frequency-graph-grid')
        .call(d3.axisLeft(yScale).ticks(4).tickSize(-innerWidth).tickFormat(() => ''));

    graphData.series.forEach((series, index) => {
        const stepPoints = [];
        series.buckets.forEach((value, bucketIndex) => {
            const start = new Date(graphData.bucketStart.getTime() + (bucketIndex * graphData.bucketSize));
            const end = new Date(start.getTime() + graphData.bucketSize);
            // Duplicate each bucket value at its start/end to create square segments.
            stepPoints.push({time: start, value});
            stepPoints.push({time: end, value});
        });

        const line = d3.line()
            .x((point) => xScale(point.time))
            .y((point) => yScale(point.value));

        chart.append('path')
            .datum(stepPoints)
            .attr('class', 'frequency-graph-line')
            .attr('stroke', colors[index % colors.length])
            .attr('d', line);
    });

    chart.append('g')
        .attr('class', 'frequency-graph-axis')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(xAxisConfig.interval).tickFormat(xAxisConfig.format));

    chart.append('g')
        .attr('class', 'frequency-graph-axis')
        .call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('d')));

    chart.append('rect')
        .attr('class', 'frequency-graph-hit-area')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', innerWidth)
        .attr('height', innerHeight)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('click', function (event) {
            const [x] = d3.pointer(event, this);
            const clickedTime = xScale.invert(Math.max(0, Math.min(innerWidth, x)));
            scrollLogToTimestamp(clickedTime);
        });

    const legend = document.createElement('div');
    legend.className = 'frequency-graph-legend';
    legend.innerHTML = graphData.series.map((series, index) => `
        <span class="frequency-graph-legend-item" title="${escapeAttribute(series.label)}">
            <span class="frequency-graph-legend-swatch" style="background:${colors[index % colors.length]}"></span>
            <span>${escapeHtml(series.label)} (${series.total})</span>
        </span>
    `).join('');
    frequencyGraph.appendChild(legend);
}

function renderLog(lines) {
    const rules = getPatternRules();
    const lineEntries = lines.map((line) => ({
        line,
        matches: getPatternMatch(line, rules)
    }));
    currentPatternRules = rules;
    currentLineEntries = lineEntries;
    // logContainer.classList.toggle('show-axis', xAxisToggle.checked);

    const renderedLines = lineEntries.map(({line, matches}) => {
        if (matches.length) {
            return renderLine(line, matches);
        }
        return renderLine(line, []);

        // const rule = matchedPattern.rule;
        // const lineStyleClass = rule.applyWholeLine ? rule.style : null;
        // const matchStyleClass = rule.applyWholeLine ? null : rule.style;
        // const timestamp = xAxisToggle.checked ? matchedPattern.value : null;
        // const forceHighlight = highlightToggle.checked;
        //
        // if (rule.applyWholeLine) {
        //     return renderLine(line, matches);
        // }

        // return renderLine(line, lineStyleClass, matchStyleClass, matchedPattern.match, timestamp, forceHighlight);
    }).join('');

    logContainer.innerHTML = renderedLines;
    if (timestampRenderingSelect.value === 'delta') {
        applyDeltaTimestamps();
    }
    scheduleFrequencyGraphRender(lineEntries, rules);
}

function applyDeltaTimestamps() {
    let previousTimestamp = null;
    for (const element of logContainer.querySelectorAll('.timestamp')) {
        const isoTimestamp = element.dataset.timestamp;
        if (!isoTimestamp) {
            previousTimestamp = null;
            continue;
        }

        const currentTimestamp = parseTimestamp(isoTimestamp);
        if (!currentTimestamp) {
            previousTimestamp = null;
            continue;
        }

        if (!previousTimestamp) {
            element.textContent = '+0:00';
        } else {
            element.textContent = formatDeltaTimestamp(currentTimestamp.getTime() - previousTimestamp.getTime());
        }

        previousTimestamp = currentTimestamp;
    }
}

function refreshLogFromPatternControls() {
    savePatternSettings();
    if (currentNavigator && currentLines.length) {
        renderLog(currentLines);
    }
}

function loadFileIntoLog(file) {
    const navigator = new LineNavigator(file);
    currentNavigator = navigator;
    activeFileName = file.name || 'log.txt';

    const lines = [];
    currentLines = [];
    const readChunk = function (error, index, chunkLines, isEof) {
        if (error) {
            console.error(error);
            return;
        }

        lines.push(...chunkLines);

        if (isEof) {
            currentLines = lines.slice();
            renderLog(currentLines);
            return;
        }

        navigator.readSomeLines(index + chunkLines.length, readChunk);
    };

    navigator.readSomeLines(0, readChunk);
}

function loadSelectedFile() {
    const selectedFile = fileInput.files && fileInput.files[0];
    if (selectedFile) {
        loadFileIntoLog(selectedFile);
        return;
    }

    loadDefaultLogFile();
}

function loadDefaultLogFile() {
    fetch('./dummy.log')
        .then((response) => {
            if (!response.ok) {
                throw new Error('dummy.log not found');
            }
            return response.text();
        })
        .then((text) => {
            const file = new File([text], activeFileName, {type: 'text/plain'});
            loadFileIntoLog(file);
        })
        .catch((error) => {
            console.warn('Could not load dummy.log:', error.message);
            const file = new File([fallbackDummyLog], activeFileName, {type: 'text/plain'});
            loadFileIntoLog(file);
        });
}

function clearLog() {
    currentNavigator = null;
    currentLines = [];
    currentLineEntries = [];
    currentPatternRules = [];
    cancelScheduledGraphRender();
    logContainer.innerHTML = '';
    logContainer.classList.remove('show-axis');
    frequencyGraphPanel.classList.add('d-none');
    frequencyGraph.innerHTML = '';
}

function saveLog() {
    const lines = Array.from(logContainer.querySelectorAll('.log-line')).map((line) => line.textContent);
    const content = lines.join('\n');
    const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = activeFileName.replace(/\.[^.]+$/, '') + '.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

addPatternButton.addEventListener('click', () => {
    patternList.appendChild(createPatternRow());
    refreshLogFromPatternControls();
});
exportPatternsButton.addEventListener('click', downloadPatternSettings);
importPatternsInput.addEventListener('change', (event) => {
    const importedFile = event.target.files && event.target.files[0];
    if (importedFile) {
        importPatternSettings(importedFile);
    }
    event.target.value = '';
});

fileInput.addEventListener('change', function (event) {
    const selectedFile = event.target.files && event.target.files[0];
    if (selectedFile) {
        loadFileIntoLog(selectedFile);
    }
});

clearButton.addEventListener('click', clearLog);
loadButton.addEventListener('click', loadSelectedFile);
saveButton.addEventListener('click', saveLog);
if (wrapLinesToggle) {
    wrapLinesToggle.addEventListener('change', () => {
        setWrapLines(wrapLinesToggle.checked);
        savePatternSettings();
    });
}
if (compactToggle) {
    compactToggle.addEventListener('change', () => {
        setCompactMode(compactToggle.checked);
        savePatternSettings();
        if (currentLineEntries.length) {
            renderFrequencyGraph(currentLineEntries, currentPatternRules);
        }
    });
}
if (darkModeToggle) {
    darkModeToggle.addEventListener('change', () => {
        setDarkMode(darkModeToggle.checked);
        savePatternSettings();
        if (currentLineEntries.length) {
            renderFrequencyGraph(currentLineEntries, currentPatternRules);
        }
    });
}
// xAxisToggle.addEventListener('change', () => {
//     logContainer.classList.toggle('show-axis', xAxisToggle.checked);
//     refreshLogFromPatternControls();
// });
// highlightToggle.addEventListener('change', refreshLogFromPatternControls);
timestampRenderingSelect.addEventListener('change', refreshLogFromPatternControls);
frequencyBinCountInput.addEventListener('change', () => {
    frequencyBinCountInput.value = getFrequencyBinCount();
    refreshLogFromPatternControls();
});
frequencyBinCountInput.addEventListener('input', () => {
    savePatternSettings();
    if (currentLineEntries.length) {
        scheduleFrequencyGraphRender(currentLineEntries, currentPatternRules);
    }
});
frequencyBinCountInput.addEventListener('blur', () => {
    frequencyBinCountInput.value = getFrequencyBinCount();
    savePatternSettings();
});
graphUpdateDelayInput.addEventListener('change', () => {
    graphUpdateDelayInput.value = getGraphUpdateDelayMs();
    savePatternSettings();
    if (currentLineEntries.length) {
        scheduleFrequencyGraphRender(currentLineEntries, currentPatternRules);
    }
});
graphUpdateDelayInput.addEventListener('input', () => {
    savePatternSettings();
});
graphUpdateDelayInput.addEventListener('blur', () => {
    graphUpdateDelayInput.value = getGraphUpdateDelayMs();
    savePatternSettings();
});

window.addEventListener('resize', () => {
    if (currentLineEntries.length && currentPatternRules.length && !frequencyGraphPanel.classList.contains('d-none')) {
        renderFrequencyGraph(currentLineEntries, currentPatternRules);
    }
});

if (window.ResizeObserver && frequencyGraph) {
    let lastGraphWidth = 0;
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const currentWidth = entry.contentRect.width;
            if (currentWidth > 0 && Math.abs(currentWidth - lastGraphWidth) > 2) {
                lastGraphWidth = currentWidth;
                if (currentLineEntries.length && currentPatternRules.length && !frequencyGraphPanel.classList.contains('d-none')) {
                    renderFrequencyGraph(currentLineEntries, currentPatternRules);
                }
            }
        }
    });
    resizeObserver.observe(frequencyGraph);
}

restorePatternSettings();
loadDefaultLogFile();