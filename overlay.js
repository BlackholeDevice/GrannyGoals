import $ from 'jquery';
import {
    clamp,
    defaults,
    entries,
    filter,
    flow,
    isArray,
    isFinite,
    isNumber,
    isBoolean,
    toNumber,
    reduce,
    round,
    sortBy,
    template,
    values,
    forEach
} from 'lodash/fp';
import templateText from './templates/goal.html' with {type: 'text'};

const params = new URLSearchParams(window.location.search);
const isDebug = params.has('debug') && params.get('debug') === 'true';
const {StreamerbotClient} = isDebug
    ? await import('./debug-client')
    : await import('@streamerbot/client');

const goalDefaults = defaults({
    enabled: true,
    colorStart: '#26A0AD',
    colorEnd: '#771DAD',
    color: null,
    order: 0,
    unit: '',
    value: 0,
    target: 100
});
const goalTemplate = function() {
    const t = template(`${templateText}`);
    return function(data) {
        return t(goalDefaults(data));
    }
}();
const goalKey = /^goal-/;

let $connDot;
let $connText;
let $goalsList;
let $connection;


// Keep an in-memory map of goals by id
const state = {
    goals: new Map(), // id -> goal
};


function setConnectionState(connected) {
    if (!$connDot || !$connText || !$connDot.length || !$connText.length) return;
    $connection.toggleClass('connected', connected);
    $connDot.toggleClass('disconnected', !connected)
        .toggleClass('connected', connected);
    $connText.text(connected && 'Connected' || 'Disconnected');
}

function sanitizeNumber(n) {
    const v = Number(n);
    return isFinite(v) ? v : 0;
}

function formatUnit(n, unit) {
    if (!unit) return String(n);
    if (isNumber(n)) {
        if (unit.endsWith('%')) return `${n}${unit}`;
        return `${n} ${n === 1 ? unit : unit + 's'}`;
    }
    return `${n} ${unit}`;
}

function renderGoals() {
    if (!$goalsList || !$goalsList.length) return;
    $goalsList.empty();
    const items = flow(
        filter(isValidGoal),
        sortBy(g => g.order ?? 0)
    )(Array.from(state.goals.values()));
    for (const goal of items) {
        $goalsList.append(renderGoal(goal));
    }
}

function renderGoal(goal) {
    const {value = 0, target = 100, unit = ''} = goal;
    const pct = target > 0 ? clamp(0, 1, sanitizeNumber(value) / sanitizeNumber(target)) : 0;
    const percent = round(pct * 100);
    const metaText = `${formatUnit(value, unit)} / ${formatUnit(target, unit)}`;
    console.log(goal);
    const html = goalTemplate({
        metaText,
        percent,
        ...goal
    });
    return $(html);
}

function upsertGoal(goal) {
    const id = goal.id ?? goal.key ?? goal.title ?? `goal_${state.goals.size + 1}`;
    state.goals.set(id, goal);
}

function clearGoals() {
    state.goals.clear();
}

function initGoals(globals) {
    const goals = flow(
        entries,
        filter(([k]) => goalKey.test(k)),
        reduce((acc, [k, {value}]) => {
            const {goal, field} = parseVariableName(k);
            const v = parseValue(value);
            acc[goal] || (acc[goal] = {});
            acc[goal][field] = v;
            acc[goal].id = goal;
            return acc;
        }, {}),
        values
    )(globals.variables || {});
    applyGoals(goals);
}


function roundTo(value, places = 0) {
    const multiplier = Math.pow(10, places);
    return Math.round(value * multiplier) / multiplier;
}

function parseValue(value) {
    let v = toNumber(value);
    if (isFinite(v)) {
        return roundTo(v, 2);
    }
    v = parseBoolean(value);
    if (isBoolean(v)) {
        return v;
    }
    return value;
}

function parseBoolean(value) {
    const normal = `${value}`.toLowerCase().trim();
    switch (normal) {
        case 'true':
            return true;
        case 'false':
            return false;
        default:
            return value;
    }
}

function parseVariableName(name) {
    const [goal, field] = name.split('-').slice(1);
    return {goal, field};
}

function isValidGoal(goal) {
    return goal && isFinite(goal.target) && goal.enabled !== false;
}

function handleGlobalUpdated(global) {
    const {data:{name, newValue, value}} = global;
    if(!goalKey.test(name)) {
        return;
    }
    const {goal, field} = parseVariableName(name);
    const goalData = state.goals.get(goal) || {id: goal};
    goalData[field] = parseValue(newValue ?? value);
    upsertGoal(goalData);
    renderGoals();
}

function applyGoals(goalsArray) {
    if (!isArray(goalsArray)) return;
    clearGoals();
    forEach(upsertGoal, goalsArray);
    renderGoals();
}

async function init() {
    $connDot = $('#conn-dot');
    $connText = $('#conn-text');
    $goalsList = $('#goals-list');
    $connection = $('.connection');

    const client = new StreamerbotClient({
        subscribe: 'Misc.*',
        onConnect: () => setConnectionState(true),
        onDisconnect: () => setConnectionState(false),
        immediate: false,
        autoReconnect: true,
        logLevel: 'error'
    });

    await client.connect();
    for (const e of ['Created', 'Updated', 'Deleted']) {
        // noinspection JSCheckFunctionSignatures
        await client.on(`Misc.GlobalVariable${e}`, handleGlobalUpdated);
    }
    initGoals(await client.getGlobals());
}

$(init);