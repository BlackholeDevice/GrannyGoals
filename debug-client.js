import {StreamerbotClient} from "@streamerbot/client";
import $ from 'jquery';
import {result, random} from 'lodash/fp';

class DemoStreamerbotClient extends StreamerbotClient {
    intervals = []
    constructor(options) {
        super(options);
        if (options.immediate) {
            result('connect', this);
        }
    }

    async connect(_) {
        result('options.onConnect', this);
        return new Promise($.noop)
    }

    async on(event, callback) {
        const [source, type] = event.split('.');

        const mkPayload = (name, newValue, oldValue = null) => ({
            timeStamp: new Date().toISOString(),
            event: {source, type},
            data: {
                name,
                persisted: true,
                oldValue,
                newValue,
                lastWrite: new Date().toISOString(),
                timestamp: new Date().toISOString()
            }
        });

        const tick = () => {
            [
                mkPayload('goal-follow-title', `New ${Math.random().toString(36).slice(2, 6)}`, 'New Followers'),
                mkPayload('goal-follow-value', random(1, 100), '1'),
            ].forEach(callback);
        };

        this.intervals.push(setInterval(tick, 1000));
    }

    async getGlobals() {
        return {
            event: {source: 'Request', type: 'GetGlobals'},
            status: 'ok',
            id: '1234567890',
            count: 4,
            variables: {
                'goal-subs-value': {
                    name: 'goal-subs-value',
                    value: 12,
                    lastWrite: '2024-11-21T19:42:03.299-06:00'
                },
                'goal-bits-value': {
                    name: 'goal-bits-value',
                    value: 1800,
                    lastWrite: '2024-11-21T19:42:03.299-06:00'
                },
                'goal-donations-value': {
                    name: 'goal-donations-value',
                    value: 65,
                    lastWrite: '2024-11-21T19:42:03.299-06:00'
                },
                'goal-gifted-value': {
                    name: 'goal-gifted',
                    value: 10,
                    lastWrite: '2024-11-21T19:42:03.299-06:00'
                },
            }
        };
    }

    async disconnect(code, timeout) {
        this.intervals.forEach(clearInterval);
    }
}

export {DemoStreamerbotClient as StreamerbotClient}