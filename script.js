const logContainer = document.getElementById('log');
const fileInput = document.getElementById('file');
const clearButton = document.getElementById('clear');
const loadButton = document.getElementById('load');
const saveButton = document.getElementById('save');
const patternList = document.getElementById('pattern-list');
const addPatternButton = document.getElementById('add-pattern');
const exportPatternsButton = document.getElementById('export-patterns');
const importPatternsInput = document.getElementById('import-patterns');
// const xAxisToggle = document.getElementById('x-axis');
// const highlightToggle = document.getElementById('highlight-style');
const timestampRenderingSelect = document.getElementById('timestamp-rendering');
const frequencyGraphPanel = document.getElementById('frequency-graph-panel');
const frequencyGraph = document.getElementById('frequency-graph');
const frequencyBinCountInput = document.getElementById('frequency-bin-count');
const DEFAULT_PATTERN_SETTINGS = {
    xAxisEnabled: false,
    highlightEnabled: false,
    timestampRendering: 'absolute',
    frequencyBinCount: 24,
    patterns: [
        {
            pattern: '^(\\d{4}-\\d{2}-\\d{2}[\\sT]\\d{2}:\\d{2}:\\d{2}\\.?\\d*\\+\\d{2}?\\:\\d{2}?)',
            style: 'info',
            applyWholeLine: false,
            xAxisEnabled: false,
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
let activeFileName = 'dummy.log';
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
    lineToggle.checked = applyWholeLine;
    enabledToggleInput.checked = enabled;
    // xAxisToggleInput.checked = xAxisEnabled;
    frequencyToggleInput.checked = includeInFrequency && !xAxisEnabled;
    frequencyToggleInput.disabled = xAxisEnabled;

    row.querySelector('.pattern-input').addEventListener('input', refreshLogFromPatternControls);
    styleSelect.addEventListener('change', refreshLogFromPatternControls);
    lineToggle.addEventListener('change', refreshLogFromPatternControls);
    enabledToggleInput.addEventListener('change', refreshLogFromPatternControls);
    xAxisToggleInput.addEventListener('change', refreshLogFromPatternControls);
    frequencyToggleInput.addEventListener('change', refreshLogFromPatternControls);
    xAxisToggleInput.addEventListener('change', () => {
        if (xAxisToggleInput.checked) {
            frequencyToggleInput.checked = false;
            frequencyToggleInput.disabled = true;
        } else {
            frequencyToggleInput.disabled = false;
            if (!frequencyToggleInput.checked) {
                frequencyToggleInput.checked = true;
            }
        }
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
        xAxisEnabled: xAxisToggle.checked,
        highlightEnabled: highlightToggle.checked,
        timestampRendering: timestampRenderingSelect.value,
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
        timestampRendering: DEFAULT_PATTERN_SETTINGS.timestampRendering,
        frequencyBinCount: DEFAULT_PATTERN_SETTINGS.frequencyBinCount,
        patterns: DEFAULT_PATTERN_SETTINGS.patterns.map((pattern) => ({...pattern}))
    };
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
        timestampRendering: isValidTimestampRendering(rawSettings.timestampRendering)
            ? rawSettings.timestampRendering
            : DEFAULT_PATTERN_SETTINGS.timestampRendering,
        frequencyBinCount: normalizeFrequencyBinCount(rawSettings.frequencyBinCount),
        patterns: safePatterns
    };
}

function isValidTimestampRendering(value) {
    return value === 'absolute' || value === 'relative' || value === 'delta';
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
    timestampRenderingSelect.value = isValidTimestampRendering(safeSettings.timestampRendering)
        ? safeSettings.timestampRendering
        : DEFAULT_PATTERN_SETTINGS.timestampRendering;
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
                end: match.index + match[0].length
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

function parseTimestamp(timeString) {
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
}

function renderTimestamp(timestamp) {
    if (!timestamp) return '';
    const parsedTime = parseTimestamp(timestamp);
    if (!parsedTime) return timestamp;
    if (timestampRenderingSelect.value === 'relative') {
        return renderRelativeTimestamp(parsedTime);
    }
    return formatAbsoluteTimestamp(parsedTime);
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
        const {rule, match, value, start, end} = matchObj;

        if (rule.xAxisEnabled) {
            const parsedTimestamp = parseTimestamp(value);
            if (parsedTimestamp) {
                timestampDate = parsedTimestamp;
            }
            timestampText = renderTimestamp(value) || timestampText;
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

function renderFrequencyGraph(lines, rules) {
    const timestampRule = getTimestampSourceRule(rules);
    if (!timestampRule) {
        frequencyGraphPanel.classList.add('d-none');
        frequencyGraph.innerHTML = '';
        return;
    }

    const graphData = buildFrequencyGraphData(lines, rules, timestampRule);
    if (!graphData) {
        frequencyGraphPanel.classList.add('d-none');
        frequencyGraph.innerHTML = '';
        return;
    }

    drawFrequencyGraph(graphData);
    frequencyGraphPanel.classList.remove('d-none');
}

function buildFrequencyGraphData(lines, rules, timestampRule) {
    const entries = [];
    for (const line of lines) {
        const timestampMatch = timestampRule.regex.exec(line);
        timestampRule.regex.lastIndex = 0;
        if (!timestampMatch) {
            continue;
        }

        const timestampValue = timestampMatch[1] || timestampMatch[0];
        const timestamp = parseTimestamp(timestampValue);
        if (!timestamp) {
            continue;
        }

        entries.push({line, timestamp});
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
            const match = seriesItem.rule.regex.exec(entry.line);
            seriesItem.rule.regex.lastIndex = 0;
            if (!match) {
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

function drawFrequencyGraph(graphData) {
    if (!window.d3) {
        frequencyGraph.innerHTML = '<div class="frequency-graph-empty">D3 failed to load.</div>';
        return;
    }

    const d3 = window.d3;
    const width = Math.max(280, frequencyGraph.clientWidth || 280);
    const height = 240;
    const margin = {top: 12, right: 16, bottom: 36, left: 36};
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
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
        .call(d3.axisBottom(xScale).ticks(Math.min(6, graphData.bucketCount)).tickFormat(d3.timeFormat('%H:%M')));

    chart.append('g')
        .attr('class', 'frequency-graph-axis')
        .call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('d')));

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
    // logContainer.classList.toggle('show-axis', xAxisToggle.checked);

    const renderedLines = lines.map((line) => {
        const matchedPattern = getPatternMatch(line, rules);
        if (matchedPattern.length) {
            return renderLine(line, matchedPattern);
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
    renderFrequencyGraph(lines, rules);
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
// xAxisToggle.addEventListener('change', () => {
//     logContainer.classList.toggle('show-axis', xAxisToggle.checked);
//     refreshLogFromPatternControls();
// });
// highlightToggle.addEventListener('change', refreshLogFromPatternControls);
timestampRenderingSelect.addEventListener('change', refreshLogFromPatternControls);
frequencyBinCountInput.addEventListener('change', refreshLogFromPatternControls);
frequencyBinCountInput.addEventListener('blur', () => {
    frequencyBinCountInput.value = getFrequencyBinCount();
});

restorePatternSettings();
loadDefaultLogFile();