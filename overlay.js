import {StreamerbotClient} from "@streamerbot/client";
import $ from 'jquery';

// noinspection JSCheckFunctionSignatures
class DemoStreamerbotClient extends StreamerbotClient {

    async connect() {
        return new Promise($.noop)
    }
    async on(event, callback) {
        return new Promise($.noop)
    }
    async getGlobals() {
        return {
            variables: {
                'goal-subs': {
                    name: 'goal-subs',
                    value: 12,
                    lastWrite: '1682300000000'
                },
                'goal-bits': {
                    name: 'goal-bits',
                    value: 1800,
                    lastWrite: '1682300000000'
                },
                'goal-donations': {
                    name: 'goal-donations',
                    value: 65,
                    lastWrite: '1682300000000'
                },
                'goal-gifted': {
                    name: 'goal-gifted',
                    value: 10,
                    lastWrite: '1682300000000'
                },
            },
            count: 4
        };
    }

}

const goalKey = /^goal-/;
let Client = StreamerbotClient;

let $connDot;
let $connText;
let $goalsList;

// Keep an in-memory map of goals by id
const state = {
    goals: new Map(), // id -> goal
};

function setConnectionState(connected) {
    if (!$connDot || !$connText || !$connDot.length || !$connText.length) return;
    if (connected) {
        $connDot.removeClass('disconnected').addClass('connected');
        $connText.text('Connected');
    } else {
        $connDot.removeClass('connected').addClass('disconnected');
        $connText.text('Disconnected');
    }
}

function sanitizeNumber(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
}

function clamp(v, min = 0, max = 1) {
    return Math.max(min, Math.min(max, v));
}

function formatUnit(n, unit) {
    if (!unit) return String(n);
    // Rudimentary pluralization
    if (typeof n === 'number') {
        if (unit.endsWith('%')) return `${n}${unit}`;
        return `${n} ${n === 1 ? unit : unit + 's'}`;
    }
    return `${n} ${unit}`;
}

function renderGoals() {
    if (!$goalsList || !$goalsList.length) return;
    $goalsList.empty();
    const items = Array.from(state.goals.values());
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const goal of items) {
        $goalsList.append(renderGoal(goal));
    }
}

function renderGoal(goal) {
    const {id, title, current = 0, target = 100, unit = '', color, complete} = goal;
    const pct = target > 0 ? clamp(sanitizeNumber(current) / sanitizeNumber(target), 0, 1) : 0;

    const $root = $('<section>', {class: 'goal'}).data('goal-id', id);

    const $header = $('<div>', {class: 'goal-header'});

    const $titleEl = $('<div>', {class: 'goal-title', text: title ?? 'Untitled Goal'});

    const $meta = $('<div>', {
        class: 'goal-meta',
        text: `${formatUnit(current, unit)} / ${formatUnit(target, unit)}`
    });

    const $progress = $('<div>', {class: 'progress'});

    const $bar = $('<div>', {class: 'progress-bar'})
        .css('width', `${Math.round(pct * 100)}%`);
    if (color) {
        $bar.css('background', color);
    }
    $progress.append($bar);

    const $footer = $('<div>', {class: 'goal-footer'});

    const $status = $('<span>', {
        class: `badge ${complete ? 'complete' : 'active'}`,
        text: complete ? 'Complete' : 'In progress'
    });

    const $pctText = $('<span>', {
        text: `${Math.round(pct * 100)}%`
    });

    $header.append($titleEl, $meta);
    $footer.append($status, $pctText);

    $root.append($header, $progress, $footer);

    return $root;
}

function upsertGoal(goal) {
    const id = goal.id ?? goal.key ?? goal.title ?? `goal_${state.goals.size + 1}`;
    const normalized = {
        id,
        title: goal.title ?? `Goal ${id}`,
        current: sanitizeNumber(goal.current ?? goal.value ?? 0),
        target: sanitizeNumber(goal.target ?? goal.max ?? 100),
        unit: goal.unit ?? '',
        order: goal.order ?? 0,
        color: goal.color,
        complete:
            typeof goal.complete === 'boolean'
                ? goal.complete
                : sanitizeNumber(goal.current ?? 0) >= sanitizeNumber(goal.target ?? 0),
    };
    state.goals.set(id, normalized);
}

function removeGoal(id) {
    state.goals.delete(id);
}

function clearGoals() {
    state.goals.clear();
}

function initGoals(globals) {
    let goals = Object.entries(globals.variables)
        .filter(([k]) => goalKey.test(k))
        .map(([k, {value}]) => [k.split('-').slice(1), value])
        .reduce((acc, [[goal, field], v]) => ({
            ...acc,
            [goal]: {
                ...(acc[goal] || {}),
                [field]: Number.parseInt(v, 10) || v,
            },
        }), {});
    console.log('goals', goals);
}

function handleGlobalUpdated({event:{type}, data:{name, newValue}}) {
    if(!goalKey.test(name)) {
        return;
    }
    const [goal, field] = name.split('-').slice(1);
    const goalData = state.goals.get(goal);
    if (!goalData) {
        console.warn(`Goal ${goal} not found`);
    }
    goalData[field] = newValue;
    upsertGoal(goalData);
}

function applyGoals(goalsArray) {
    if (!Array.isArray(goalsArray)) return;
    clearGoals();
    goalsArray.forEach(upsertGoal);
    renderGoals();
}

function handleGoalUpdate(goal) {
    if (!goal) return;
    upsertGoal(goal);
    renderGoals();
}

function handlePayload(payload) {
    // Flexible payload parsing for common Streamer.bot custom event shapes
    // We try multiple locations for event/type and data
    const data =
        payload?.data ??
        payload?.payload ??
        payload?.detail ??
        payload; // sometimes the useful data is at root

    const ev =
        payload?.event ??
        payload?.name ??
        data?.event ??
        data?.type ??
        payload?.type;

    // Full set
    if (ev === 'Goals.Update' || ev === 'goals:set' || data?.goals) {
        const goals = data?.goals ?? payload?.goals ?? [];
        applyGoals(goals);
        return;
    }

    // Upsert single goal
    if (ev === 'Goal.Update' || ev === 'goal:update' || data?.goal) {
        const goal = data?.goal ?? payload?.goal;
        handleGoalUpdate(goal);
        return;
    }

    // Remove single goal
    if (ev === 'Goal.Remove' || ev === 'goal:remove' || data?.removeId || data?.idToRemove) {
        const id = data?.removeId ?? data?.idToRemove ?? data?.id ?? payload?.id;
        if (id) {
            removeGoal(id);
            renderGoals();
        }
        return;
    }

    // Clear
    if (ev === 'Goals.Clear' || ev === 'goals:clear') {
        clearGoals();
        renderGoals();
        return;
    }

    // Visibility toggle
    if (ev === 'Overlay.Visibility' || ev === 'overlay:visibility') {
        const visible = !!(data?.visible ?? data?.show ?? true);
        $('#overlay-root').toggleClass('hidden', !visible);
        return;
    }

    // Fallback: if array-like payload is sent directly
    if (Array.isArray(payload)) {
        applyGoals(payload);
    }
}

function setupDemoMode() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('demo') || params.get('demo') !== 'true') {
        return;
    }

    const sample = [
        {id: 'subs', title: 'New Subscribers', current: 12, target: 25, unit: '', order: 1},
        {id: 'bits', title: 'Bits', current: 1800, target: 5000, unit: 'bit', order: 2},
        {id: 'donations', title: 'Donations', current: 65, target: 100, unit: '$', order: 3},
        {id: 'gifted', title: 'Gifted Subs', current: 10, target: 20, unit: '', order: 4},
    ];
    applyGoals(sample);

    // Animate for flair
    setInterval(() => {
        const g = Array.from(state.goals.values());
        if (g.length === 0) return;
        const i = Math.floor(Math.random() * g.length);
        const goal = g[i];
        const delta = Math.max(1, Math.round((goal.target / 25) * Math.random()));
        handleGoalUpdate({
            id: goal.id,
            title: goal.title,
            current: Math.min(goal.target, goal.current + delta),
            target: goal.target,
            unit: goal.unit,
            order: goal.order,
        });
    }, 2500);
}

async function init() {
    // Cache jQuery elements after DOM is ready
    $connDot = $('#conn-dot');
    $connText = $('#conn-text');
    $goalsList = $('#goals-list');

    setupDemoMode();

    const client = new Client({
        onConnect: () => setConnectionState(true),
        onDisconnect: () => setConnectionState(false),
        immediate: false,
        retries: 1,
        autoReconnect: false
    });

    await client.connect();
    await client.on('Misc.GlobalVariableCreated', handleGlobalUpdated);
    await client.on('Misc.GlobalVariableUpdated', handleGlobalUpdated);
    await client.on('Misc.GlobalVariableDeleted', handleGlobalUpdated);
    initGoals(await client.getGlobals());
}

$(init);