const logContainer = document.getElementById('log');
const fileInput = document.getElementById('file');
const clearButton = document.getElementById('clear');
const loadButton = document.getElementById('load');
const saveButton = document.getElementById('save');
const patternList = document.getElementById('pattern-list');
const addPatternButton = document.getElementById('add-pattern');
const xAxisToggle = document.getElementById('x-axis');
const highlightToggle = document.getElementById('highlight-style');

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

function createPatternRow(patternValue = '', styleValue = 'error', applyWholeLine = true) {
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
                <input class="form-check-input pattern-x-axis-toggle" type="checkbox" role="switch">
                <label class="form-check-label small">X-axis</label>
            </div>
        </div>
        <div class="col-2 d-grid">
            <button class="btn btn-outline-danger btn-sm remove-pattern" type="button">Remove</button>
        </div>
    `;

    const styleSelect = row.querySelector('.pattern-style-select');
    const lineToggle = row.querySelector('.pattern-line-toggle');
    styleSelect.value = styleValue;
    lineToggle.checked = applyWholeLine;

    row.querySelector('.pattern-input').addEventListener('input', refreshLogFromPatternControls);
    styleSelect.addEventListener('change', refreshLogFromPatternControls);
    lineToggle.addEventListener('change', refreshLogFromPatternControls);
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
        const xAxisEnabled = row.querySelector('.pattern-x-axis-toggle');
        const rawPattern = patternInput.value.trim();

        if (!rawPattern) {
            return null;
        }

        try {
            return {
                regex: new RegExp(rawPattern, 'i'),
                style: styleSelect.value,
                applyWholeLine: lineToggle.checked,
                xAxisEnabled: xAxisEnabled.checked
            };
        } catch (error) {
            console.warn('Invalid regex pattern:', error.message);
            return null;
        }
    }).filter(Boolean);
}

function getPatternMatch(line, rules) {
    let _rules = [];
    for (const rule of rules) {
        const match = rule.regex.exec(line);
        rule.regex.lastIndex = 0;
        if (match) {
            _rules.push({
                rule,
                match,
                value: match[1] || match[0]
            });
        }
    }

    return _rules;
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
        return date.toISOString();
    }
    return null;
}

function renderTimestamp(timestamp) {
    if (!timestamp) return '';
    const parsedTime = parseTimestamp(timestamp);
    if (!parsedTime) return '';
}
/*
 takes a line and an array of matches, and returns the HTML representation of the line with the rules applied

 */
function renderLine(line, matches) {
    // const safeText = escapeHtml(line);
    let lineClassList = [];
    let timePrefix = '';
    for (const matchObj of matches) {
        const {rule, match, value} = matchObj;
        const lineStyleClass = rule.applyWholeLine ? rule.style : null;
        const matchStyleClass = rule.applyWholeLine ? null : rule.style;
        const timestamp = rule.xAxisEnabled ? value : null;
        const forceHighlight = highlightToggle.checked;
        if (rule.xAxisEnabled) {
            console.log('timestamp', timestamp);
            timePrefix = renderTimestamp(match);
            line = `<span class="timestamp">${timePrefix}</span> ${line}`;
        }

        if (matchStyleClass) {
            const before = line.slice(0, match.index);
            const found = line.slice(match.index, match.index + match[0].length);
            const after = line.slice(match.index + match[0].length);
            const content = forceHighlight
                ? `<mark>${found}</mark>`
                : `<span class="${matchStyleClass}">${found}</span>`;
            line = `${before}${content}${after}`;
        }

        if (rule.applyWholeLine) {
            lineClassList.push(lineStyleClass);
        }


    }

    return `<p class="log-line ${lineClassList.join(' ')}">${escapeHtml(line)}</p>`;

    // if (match) {
    //     const before = safeText.slice(0, match.index);
    //     const found = safeText.slice(match.index, match.index + match[0].length);
    //     const after = safeText.slice(match.index + match[0].length);
    //     const content = forceHighlight
    //         ? `<mark>${found}</mark>`
    //         : `<span class="${matchStyleClass}">${found}</span>`;
    //     const body = timestamp
    //         ? `${before}${after}`
    //         : `${before}${content}${after}`;
    //
    //     return `<p class="log-line ${lineStyleClass}">${timePrefix}${body}</p>`;
    // }


}

function renderLog(lines) {
    const rules = getPatternRules();
    logContainer.classList.toggle('show-axis', xAxisToggle.checked);

    logContainer.innerHTML = lines.map((line) => {
        const matchedPattern = getPatternMatch(line, rules);
        if (matchedPattern.length) {
            return renderLine(line, []);
        }

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
}

function refreshLogFromPatternControls() {
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

fileInput.addEventListener('change', function (event) {
    const selectedFile = event.target.files && event.target.files[0];
    if (selectedFile) {
        loadFileIntoLog(selectedFile);
    }
});

clearButton.addEventListener('click', clearLog);
loadButton.addEventListener('click', loadSelectedFile);
saveButton.addEventListener('click', saveLog);
xAxisToggle.addEventListener('change', () => {
    logContainer.classList.toggle('show-axis', xAxisToggle.checked);
    refreshLogFromPatternControls();
});
highlightToggle.addEventListener('change', refreshLogFromPatternControls);

patternList.appendChild(createPatternRow('\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}', 'normal'));
patternList.appendChild(createPatternRow('.*ERROR.*', 'error'));
loadDefaultLogFile();