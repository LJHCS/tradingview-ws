"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIndicator = exports.getCandles = exports.connect = void 0;
const axios_1 = __importDefault(require("axios"));
const ws_1 = __importDefault(require("ws"));
const randomstring_1 = __importDefault(require("randomstring"));
const MAX_BATCH_SIZE = 5000; // 경험적으로 찾은 최대 배치
// --- 메시지 파싱 ---
function parseMessage(message) {
    if (!message)
        return [];
    const events = message.toString().split(/~m~\d+~m~/).slice(1);
    return events.map(event => {
        if (event.substring(0, 3) === "~h~")
            return { type: 'ping', data: `~m~${event.length}~m~${event}` };
        const parsed = JSON.parse(event);
        if (parsed['session_id'])
            return { type: 'session', data: parsed };
        return { type: 'event', data: parsed };
    });
}
// --- 서버 연결 ---
function connect(options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        let token = 'unauthorized_user_token';
        if (options.sessionId) {
            const resp = yield axios_1.default.get('https://www.tradingview.com/disclaimer/', {
                headers: { "Cookie": `sessionid=${options.sessionId}` }
            });
            token = resp.data.match(/"auth_token":"(.+?)"/)[1];
        }
        const ws = new ws_1.default("wss://prodata.tradingview.com/socket.io/websocket", { origin: "https://prodata.tradingview.com" });
        const subscribers = new Set();
        const subscribe = (handler) => {
            subscribers.add(handler);
            return () => subscribers.delete(handler);
        };
        const send = (name, params) => {
            const data = JSON.stringify({ m: name, p: params });
            ws.send("~m~" + data.length + "~m~" + data);
        };
        const close = () => __awaiter(this, void 0, void 0, function* () { return new Promise((res, rej) => { ws.on('close', res); ws.on('error', rej); ws.close(); }); });
        return new Promise((resolve, reject) => {
            ws.on('error', reject);
            ws.on('message', message => {
                const payloads = parseMessage(message.toString());
                for (const payload of payloads) {
                    switch (payload.type) {
                        case 'ping':
                            ws.send(payload.data);
                            break;
                        case 'session':
                            send('set_auth_token', [token]);
                            resolve({ subscribe, send, close });
                            break;
                        case 'event':
                            subscribers.forEach(h => h({ name: payload.data.m, params: payload.data.p }));
                            break;
                    }
                }
            });
        });
    });
}
exports.connect = connect;
function getCandles({ connection, symbols, amount, timeframe = 60 }) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!symbols.length)
            return [];
        const chartSession = "cs_" + randomstring_1.default.generate(12);
        const batchSize = amount && amount < MAX_BATCH_SIZE ? amount : MAX_BATCH_SIZE;
        return new Promise(resolve => {
            const allCandles = [];
            let idx = 0, symbol = symbols[idx], currentCandles = [];
            const unsubscribe = connection.subscribe(event => {
                if (event.name === 'timescale_update') {
                    let newCandles = event.params[1]['sds_1']['s'];
                    if (newCandles.length > batchSize)
                        newCandles = newCandles.slice(0, -currentCandles.length);
                    currentCandles = newCandles.concat(currentCandles);
                    return;
                }
                if (['series_completed', 'symbol_error'].includes(event.name)) {
                    if (amount)
                        currentCandles = currentCandles.slice(0, amount);
                    const candles = currentCandles.map(c => ({
                        timestamp: c.v[0], open: c.v[1], high: c.v[2], low: c.v[3], close: c.v[4], volume: c.v[5]
                    }));
                    allCandles.push(candles);
                    if (idx + 1 < symbols.length) {
                        idx++;
                        symbol = symbols[idx];
                        currentCandles = [];
                        connection.send('resolve_symbol', [chartSession, `sds_sym_${idx}`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })]);
                        connection.send('modify_series', [chartSession, 'sds_1', `s${idx}`, `sds_sym_${idx}`, timeframe.toString(), '']);
                        return;
                    }
                    unsubscribe();
                    resolve(allCandles);
                }
            });
            connection.send('chart_create_session', [chartSession, '']);
            connection.send('resolve_symbol', [chartSession, `sds_sym_0`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })]);
            connection.send('create_series', [chartSession, 'sds_1', 's0', 'sds_sym_0', timeframe.toString(), batchSize, '']);
        });
    });
}
exports.getCandles = getCandles;
// --- 보조지표 가져오기 ---
function getIndicator({ connection, symbols, amount, timeframe = 60 }) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!symbols.length)
            return [];
        const chartSession = "cs_" + randomstring_1.default.generate(12);
        const batchSize = amount && amount < MAX_BATCH_SIZE ? amount : MAX_BATCH_SIZE;
        return new Promise(resolve => {
            const allIndicators = [];
            let idx = 0, symbol = symbols[idx], currentIndicators = [];
            const unsubscribe = connection.subscribe(event => {
                if (event.name === 'study_update') {
                    let newData = event.params[1]['sds_1']['s'];
                    if (newData.length > batchSize)
                        newData = newData.slice(0, -currentIndicators.length);
                    currentIndicators = newData.concat(currentIndicators);
                    return;
                }
                if (['series_completed', 'symbol_error'].includes(event.name)) {
                    if (amount)
                        currentIndicators = currentIndicators.slice(0, amount);
                    allIndicators.push(currentIndicators);
                    if (idx + 1 < symbols.length) {
                        idx++;
                        symbol = symbols[idx];
                        currentIndicators = [];
                        connection.send('resolve_symbol', [chartSession, `sds_sym_${idx}`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })]);
                        connection.send('modify_series', [chartSession, 'sds_1', `s${idx}`, `sds_sym_${idx}`, timeframe.toString(), '']);
                        return;
                    }
                    unsubscribe();
                    resolve(allIndicators);
                }
            });
            connection.send('chart_create_session', [chartSession, '']);
            connection.send('resolve_symbol', [chartSession, `sds_sym_0`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })]);
            connection.send('create_series', [chartSession, 'sds_1', 's0', 'sds_sym_0', timeframe.toString(), batchSize, '']);
        });
    });
}
exports.getIndicator = getIndicator;
//# sourceMappingURL=index.js.map